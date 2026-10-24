import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import * as readiness from "../../src/configuration/readiness.js";

const roots: string[] = [];
const temporary = () => { const root = mkdtempSync(join(tmpdir(), "aitest-cli-install-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });

describe("client-neutral worker readiness", () => {
  it("rejects ambiguous CLI profile names instead of advertising READY", () => {
    const profile = { profile_name: "cli", provider_id: "p", model_id: "m", backend: { kind: "codex_cli", executable: process.execPath } };
    expect(readiness.evaluateWorkerReadiness({ enabled: true, profiles: [profile, { ...profile, model_id: "other" }], default_profile: "cli", configured_model: undefined, configured_providers: {} }))
      .toMatchObject({ status: "NOT_READY", reason_code: "WORKER_PROFILE_AMBIGUOUS" });
  });
  const evaluate = (backend: unknown, options: Record<string, unknown> = {}) => readiness.evaluateWorkerReadiness({
    enabled: true, profiles: [{ profile_name: "cli", provider_id: "cli", model_id: "chosen", backend }],
    default_profile: "cli", configured_model: "other/chat", configured_providers: {}, ...options,
  });
  it.each(["cli_json", "codex_cli"])("accepts configured %s without OpenCode provider/model or auth claims", kind => {
    const backend = kind === "cli_json" ? { kind, command: [process.execPath, "fixture.js"] } : { kind, executable: process.execPath };
    const result = evaluate(backend);
    expect(result).toMatchObject({ status: "READY", evidence_level: "CONFIGURED", reason_code: null });
    expect(result.detail).not.toMatch(/auth|login|OpenCode/);
  });
  it("does not claim readiness for a missing CLI executable", () => {
    expect(evaluate({ kind: "codex_cli", executable: join(temporary(), "absent.exe") }))
      .toMatchObject({ status: "NOT_READY", reason_code: "WORKER_EXECUTABLE_MISSING" });
  });
  it.skipIf(process.platform !== "win32")("rejects an existing root-relative CLI executable", () => {
    expect(evaluate({ kind: "codex_cli", executable: process.execPath.replace(/^[a-z]:/i, "") }))
      .toMatchObject({ status: "NOT_READY", reason_code: "WORKER_BACKEND_INVALID" });
  });
  it("does not implicitly select a CLI profile without a configured default", () => {
    expect(evaluate({ kind: "cli_json", command: [process.execPath] }, { default_profile: undefined }))
      .toMatchObject({ status: "NOT_READY", reason_code: "CLI_PROFILE_SELECTION_REQUIRED" });
  });
  it.each([{ kind: "cli_json", command: [] }, { kind: "codex_cli", executable: "" }, { kind: "unknown" }])("rejects invalid CLI bindings %j", backend => {
    expect(evaluate(backend)).toMatchObject({ status: "NOT_READY", reason_code: "WORKER_BACKEND_INVALID" });
  });
  it("requires the worker switch even for a configured CLI", () => {
    expect(evaluate({ kind: "codex_cli", executable: process.execPath }, { enabled: false }))
      .toMatchObject({ status: "NOT_READY", reason_code: "WORKER_DISABLED" });
  });
});

describe("generic MCP server definition", () => {
  it("validates actual command/argv and paths, with registered environment overriding ambient flags", () => {
    const root = temporary(), entry = join(root, "entry.js"), config = join(root, "config.json"), db = join(root, "state.db");
    const definition = { schema_version: 1, transport: "stdio", command: process.execPath, args: [entry],
      env: { AITEST_CONFIG: config, AITEST_DB_PATH: db, AITEST_WORKER_ENABLED: "0" } };
    const evaluate = (value: unknown) => readiness.evaluateMcpServerDefinition({ definition: value, entry_js: entry, config_path: config, db_path: db,
      ambient: { AITEST_WORKER_ENABLED: "1", SENTINEL: "keep" } });
    expect(evaluate(definition)).toMatchObject({ valid: true, command: [process.execPath, entry], worker_enabled: false, environment: { SENTINEL: "keep" } });
    for (const changed of [{ transport: "http" }, { schema_version: 2 }, { command: "foreign.exe" }, { args: [entry, "extra"] },
      { args: [join(root, "foreign.js")] }, { env: { ...definition.env, AITEST_CONFIG: "relative.json" } }, { env: { ...definition.env, EXTRA: 3 } }]) {
      expect(evaluate({ ...definition, ...changed }).valid).toBe(false);
    }
  });
});

describe("installer argument validation", () => {
  it("keeps OpenCode as default and accepts only one explicit known client", async () => {
    const { parseInstallClient } = await import("../../scripts/install-options.mjs");
    expect(parseInstallClient([])).toBe("opencode");
    expect(parseInstallClient(["--client", "opencode"])).toBe("opencode");
    expect(parseInstallClient(["--client", "none"])).toBe("none");
    for (const args of [["--client"], ["--client", "unknown"], ["--client", "none", "--client", "none"], ["--unknown"], ["none"]]) {
      expect(() => parseInstallClient(args)).toThrow(/client|arguman/i);
    }
  });
  it.each(["install.mjs", "verify-install.mjs"])("rejects invalid %s arguments before bootstrap or runtime access", script => {
    const root = temporary();
    const run = spawnSync(process.execPath, [join(process.cwd(), "scripts", script), "--client", "foreign"], {
      encoding: "utf8", windowsHide: true, env: { ...process.env, LOCALAPPDATA: root, USERPROFILE: root }, timeout: 10000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Gecersiz arguman");
    expect(run.stdout).toBe("");
  });
});
