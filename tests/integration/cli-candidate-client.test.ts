import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { CandidateChangeSetSchema } from "../../src/workers/opencode/model-schemas.js";
import { processPinPaths, type NativeProcessPlan } from "../../src/runners/windows-process-supervisor.js";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CliCandidateClient } from "../../src/workers/cli/cli-candidate-client.js";
import { registerWindowsNativeTestLock } from "../support/windows-native-test-lock.js";
registerWindowsNativeTestLock("cli-candidate-client");
const fixture = resolve("tests/fixtures/cli-candidate-stub.mjs");
const roots: string[] = [];
const clients: CliCandidateClient[] = [];
function make(mode = "valid", lifecycle?: ConstructorParameters<typeof CliCandidateClient>[0]["lifecycle"]) {
  const root = mkdtempSync(join(tmpdir(), "aitest-cli-fixture-")); roots.push(root);
  const probe = join(root, "probe.json");
  const client = new CliCandidateClient({ backend: { kind: "cli_json", command: [process.execPath, fixture, mode, probe] }, workRoot: join(root, "private"), envReferenceNames: ["AITE_CLI_SECRET"], ...(lifecycle ? { lifecycle } : {}) }); clients.push(client);
  return { client, probe, root };
}
async function request(client: CliCandidateClient, extra: Record<string, unknown> = {}) {
  const session = await client.createSession();
  return client.generate({ ...session, prompt: 'private prompt & % ! " unicode: \u00e7', model: { providerID: "fixture", modelID: "fixture-model" }, timeout_ms: 8000, max_output_bytes: 4096, ...extra });
}
afterEach(async () => { await Promise.all(clients.splice(0).map((client) => client.stopOwnedServer())); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); delete process.env.AITE_CLI_SECRET; delete process.env.AITE_UNREFERENCED_SECRET; delete process.env.AITE_CLI_PROBE; delete process.env.AITE_CLI_MODE; });
describe.skipIf(process.platform !== "win32")("owned CLI candidate client", () => {
  it("sends bounded envelope by stdin with exact static argv and only referenced secret env", async () => {
    process.env.AITE_CLI_SECRET = "retained-secret"; process.env.AITE_UNREFERENCED_SECRET = "must-not-pass";
    const { client, probe, root } = make(); const result = await request(client);
    expect(result.value).toMatchObject({ schema_version: 1, changes: [{ action: "create", new_content: 'private prompt & % ! " unicode: \u00e7' }] });
    const observed = JSON.parse(readFileSync(probe, "utf8"));
    expect(observed.argv.slice(2)).toEqual(["valid", probe]);
    expect(observed.env.AITE_CLI_SECRET).toBe("retained-secret"); expect(observed.env.AITE_UNREFERENCED_SECRET).toBeUndefined();
    expect(observed.envelope).toMatchObject({ schema_version: 1, model: { providerID: "fixture", modelID: "fixture-model" }, json_schema: { type: "object" } });
    expect(observed.cwd.startsWith(join(root, "private"))).toBe(true);
  });
  it.each([["nonzero", "PROVIDER_ERROR"], ["malformed", "TRUNCATED_JSON"], ["oversize", "TRUNCATED_JSON"], ["stderr-oversize", "TRUNCATED_JSON"], ["empty", "EMPTY_FINAL"]])("rejects %s without leaking stderr", async (mode, kind) => {
    const { client } = make(mode); const error = await request(client).catch((value: unknown) => value);
    expect(error).toMatchObject({ kind }); expect(String(error)).not.toContain("PRIVATE-SECRET");
  });
  it("times out the whole owned tree and returns lifecycle drain proof", async () => {
    const terminal: unknown[] = [];
    const { client } = make("tree", { beforeSpawn: () => {}, afterSpawn: () => {}, afterTerminal: (result) => terminal.push(result) });
    await expect(request(client, { timeout_ms: 900 })).rejects.toMatchObject({ kind: "TIMEOUT" });
    expect(terminal).toEqual([expect.objectContaining({ status: "timeout", ownedTreeDrained: true })]);
  });
  it("cancels an active invocation through the session and waits for tree drain", async () => {
    const { client, probe } = make("tree"); const session = await client.createSession();
    const pending = client.generate({ ...session, prompt: "private", model: { providerID: "fixture", modelID: "fixture" }, timeout_ms: 8000, max_output_bytes: 4096 }).catch((error: unknown) => error);
    for (let i = 0; i < 100 && !existsSync(probe + ".pid"); i++) await delay(40);
    await client.abortSession(session.session_id);
    expect(await pending).toMatchObject({ kind: "CANCELLED" });
    const childPid = Number(readFileSync(probe + ".pid", "utf8"));
    expect(() => process.kill(childPid, 0)).toThrow();
  });
  it("closes CLI descendants after the owning Node process is hard killed", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-cli-parentkill-")); roots.push(root); const probe = join(root, "probe.json");
    const driver = spawn(process.execPath, [resolve("tests/fixtures/cli-candidate-owner.mjs"), resolve("dist/workers/cli/cli-candidate-client.js"), join(root, "private"), fixture, probe], { stdio: "ignore", windowsHide: true });
    const closed = once(driver, "close");
    try {
      for (let i = 0; i < 200 && !existsSync(probe + ".pid"); i++) await delay(30);
      expect(existsSync(probe + ".pid")).toBe(true);
      const childPid = Number(readFileSync(probe + ".pid", "utf8")); driver.kill(); await closed;
      let alive = true;
      for (let i = 0; i < 100 && alive; i++) { try { process.kill(childPid, 0); await delay(40); } catch { alive = false; } }
      expect(alive).toBe(false);
    } finally { driver.kill(); }
  });
  it.each(["signal", "stop"])("cancels and drains an active invocation via %s", async (method) => {
    const { client, probe } = make("tree"); const controller = new AbortController();
    const pending = request(client, { signal: controller.signal }).catch((error: unknown) => error);
    for (let i = 0; i < 100 && !existsSync(probe + ".pid"); i++) await delay(30);
    expect(existsSync(probe + ".pid")).toBe(true);
    if (method === "signal") controller.abort(); else await client.stopOwnedServer();
    expect(await pending).toMatchObject({ kind: "CANCELLED" });
    expect(() => process.kill(Number(readFileSync(probe + ".pid", "utf8")), 0)).toThrow();
    if (method === "stop") await expect(client.createSession()).rejects.toMatchObject({ kind: "CANCELLED" });
  });
  it("rejects already cancelled signals before creating backend work", async () => {
    const { client, probe } = make(); const controller = new AbortController(); controller.abort();
    await expect(request(client, { signal: controller.signal })).rejects.toMatchObject({ kind: "CANCELLED" }); expect(existsSync(probe)).toBe(false);
  });
  it("preserves earlier executable pins and refuses changed script before spawn", async () => {
    const { root, probe } = make(); const script = join(root, "mutable.mjs"); writeFileSync(script, "process.stdout.write('{}')");
    const sha256 = createHash("sha256").update(readFileSync(script)).digest("hex");
    const client = new CliCandidateClient({ backend: { kind: "cli_json", command: [process.execPath, script] }, workRoot: join(root, "pinned"), pinnedInputs: [{ path: script, sha256 }] }); clients.push(client);
    writeFileSync(script, "process.stdout.write('changed')"); await expect(request(client)).rejects.toMatchObject({ kind: "PROVIDER_ERROR" }); expect(existsSync(probe)).toBe(false);
  });
});

function makeCodex(mode = "valid") {
  const root = mkdtempSync(join(tmpdir(), "aitest-cli-codex-")); roots.push(root);
  const executable = join(root, "codex-fixture.exe");
  const compiled = spawnSync("C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe", ["/nologo", "/reference:System.Web.Extensions.dll", `/out:${executable}`, resolve("tests/fixtures/cli-codex-stub.cs")], { encoding: "utf8", windowsHide: true });
  expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
  const probe = join(root, "probe.json"); process.env.AITE_CLI_PROBE = probe; process.env.AITE_CLI_MODE = mode;
  const client = new CliCandidateClient({ backend: { kind: "codex_cli", executable, auth_home: join(root, "existing-auth-reference") }, workRoot: join(root, "private"), envReferenceNames: ["AITE_CLI_PROBE", "AITE_CLI_MODE"] }); clients.push(client);
  return { client, probe };
}
describe.skipIf(process.platform !== "win32")("Codex CLI restricted invocation", () => {
  it("uses strict schema/stdin/read-only policy without bypassing managed rules or copying auth", async () => {
    const { client, probe } = makeCodex(); const result = await request(client);
    expect(CandidateChangeSetSchema.safeParse(result.value).success).toBe(true);
    expect(result.value).toEqual({ schema_version: 1, changes: [{ path: "src/test/java/DemoTest.java", action: "create", new_content: "test", scenario_ids: [] }] });
    const observed = JSON.parse(readFileSync(probe, "utf8"));
    expect(observed.input).toBe('private prompt & % ! " unicode: \u00e7');
    for (const flag of ["exec", "--json", "--ephemeral", "--ignore-user-config", "read-only", "--output-schema", "--output-last-message", "shell_tool", "multi_agent", "apps", 'web_search="disabled"', "mcp_servers={}", 'approval_policy="never"']) expect(observed.argv).toContain(flag);
    expect(observed.argv).not.toContain(observed.input); expect(observed.argv).not.toContain("--ignore-rules"); expect(observed.argv).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    const schema = JSON.parse(observed.schema);
    expect(schema.required).toContain("base_checkpoint"); expect(schema.properties.base_checkpoint.anyOf).toContainEqual({ type: "null" });
    expect(schema.properties.schema_version.anyOf).toBeUndefined();
    expect(observed.auth_home.endsWith("existing-auth-reference")).toBe(true); expect(existsSync(observed.auth_home)).toBe(false);
  });
  it("retains required null for the unchanged engine validator to reject", async () => {
    const { client } = makeCodex("requirednull"); const result = await request(client);
    expect(result.value).toMatchObject({ changes: [{ path: null }] }); expect(CandidateChangeSetSchema.safeParse(result.value).success).toBe(false);
  });
  it.each([["oversize", "TRUNCATED_JSON"], ["nonzero", "PROVIDER_ERROR"]])("rejects Codex %s output", async (mode, kind) => {
    const { client } = makeCodex(mode); await expect(request(client)).rejects.toMatchObject({ kind });
  });
  it("CLI pin coverage excludes all implicit Maven files while legacy Maven coverage is unchanged", () => {
    const { root } = make(); const plan: NativeProcessPlan = { invocationKind: "cli", executable: process.execPath, cwd: root, pinRoot: root, argv: [fixture], env: process.env, timeoutMs: 1000, pinnedInputs: [] };
    const paths = processPinPaths(plan);
    expect(paths).toContain(fixture); expect(paths.some((path) => path.includes(".m2") || path.includes(".mvn"))).toBe(false);
    const legacy = processPinPaths({ ...plan, invocationKind: "maven_cmd" });
    expect(legacy.some((path) => path.endsWith("settings.xml"))).toBe(true); expect(legacy.some((path) => path.endsWith("jvm.config"))).toBe(true);
    expect(() => processPinPaths({ ...plan, pinnedInputs: undefined } as unknown as NativeProcessPlan)).toThrow();
  });
});
