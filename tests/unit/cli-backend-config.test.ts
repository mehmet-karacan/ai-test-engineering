import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkerProfileSchema } from "../../src/configuration/config-schema.js";
import { defaultConfig } from "../../src/configuration/config-loader.js";
import { buildSecretFreeConfigSnapshot } from "../../src/configuration/config-security.js";
import { TestStartInputSchema, TestResumeInputSchema } from "../../src/domain/tool-schemas.js";
import { assertContractImmutable, buildJobContract, contractDigest, type JobContractInput } from "../../src/domain/job-contract.js";

const profile = { profile_name: "cli", provider_id: "openai", model_id: "gpt-test", secret_reference_names: [] };
const backend = { kind: "codex_cli" as const, executable: process.execPath };
const binding = { profile_name: "cli", provider_id: "openai", model_id: "gpt-test", backend };
function contractInput(): JobContractInput {
  return {
    job_id: "j", project_id: "p", location_id: "l", canonical_root: "C:/fixture",
    request_digest: "a".repeat(64), idempotency_key: null, source_snapshot_digest: null,
    resolved_targets: [{ selector: "Service", kind: "class", resolved_fqn: "a.Service", line_target_bps: 8000, branch_target_bps: 8000 }],
    runner_kind: "windows_native", model_profile: { provider_id: "openai", model_id: "gpt-test" },
    policy_digest: null, config_digest: "b".repeat(64), config_schema_version: 1,
    budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 1, no_progress_window: 1, total_job_minutes: 10 },
    parent_contract_digest: null, revision: 1,
  };
}

describe("CLI backend config and immutable domain", () => {
  it("preserves an explicit backend when parsing a worker profile", () => {
    expect(WorkerProfileSchema.parse({ ...profile, backend }).backend).toEqual(backend);
  });
  it("rejects backend raw secrets and extra shell arguments", () => {
    expect(WorkerProfileSchema.safeParse({ ...profile, backend: { ...backend, api_key: "fixture-value" } }).success).toBe(false);
    expect(WorkerProfileSchema.safeParse({ ...profile, backend: { ...backend, args: ["--unsafe"] } }).success).toBe(false);
  });
  it("keeps worker_profile independently from legacy provider/model on both tools", () => {
    expect(TestStartInputSchema.parse({ project_root: "C:/fixture", targets: [{ selector: "A", kind: "class" }], coverage: { percent: 80 }, worker_profile: "cli", model_profile: "openai/gpt-test" }).worker_profile).toBe("cli");
    expect(TestResumeInputSchema.parse({ worker_profile: "cli" }).worker_profile).toBe("cli");
    expect(TestResumeInputSchema.safeParse({ worker_profile: " " }).success).toBe(false);
  });
  it("freezes backend and executable hashes as immutable contract fields", () => {
    const first = buildJobContract({ ...contractInput(), worker_binding: binding });
    const changed = buildJobContract({ ...contractInput(), worker_binding: { ...binding, backend: { kind: "opencode" } } });
    expect(() => assertContractImmutable(first, changed)).toThrow(/worker_binding/);
    expect(() => assertContractImmutable(first, buildJobContract(contractInput()))).toThrow(/worker_binding/);
    expect(contractDigest(first)).not.toBe(contractDigest(changed));
  });
  it("preserves the legacy config snapshot digest exactly without injecting a backend", () => {
    const config = defaultConfig();
    config.worker_profiles = [profile];
    const result = buildSecretFreeConfigSnapshot(config);
    const legacy = { schema_version: 1, budgets: { ...config.budgets }, coverage_defaults: { ...config.coverage_defaults }, discovery: { ...config.discovery }, worker_profiles: [profile], allowed_root_count: 0 };
    expect(result.digest).toBe(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"));
    expect(result.snapshot.worker_profiles).toEqual([profile]);
    expect(buildJobContract(contractInput())).not.toHaveProperty("worker_binding");
  });
  it("includes only validated explicit backend fields and detaches snapshot values", () => {
    const config = defaultConfig();
    config.worker_profiles = [{ ...profile, backend }];
    const result = buildSecretFreeConfigSnapshot(config);
    expect(result.snapshot.worker_profiles).toEqual([{ ...profile, backend }]);
    const originalDigest = result.digest;
    config.worker_profiles[0]!.backend = { kind: "opencode" };
    expect(result.snapshot.worker_profiles).toEqual([{ ...profile, backend }]);
    expect(buildSecretFreeConfigSnapshot(config).digest).not.toBe(originalDigest);
  });
  it("rejects unexpected backend secrets rather than copying them into a snapshot", () => {
    const config = defaultConfig();
    config.worker_profiles = [{ ...profile, backend: { ...backend, token: "fixture-secret" } } as never];
    expect(() => buildSecretFreeConfigSnapshot(config)).toThrow();
  });
  it("detaches a frozen contract binding from its caller", () => {
    const mutableBinding = structuredClone(binding);
    const contract = buildJobContract({ ...contractInput(), worker_binding: mutableBinding });
    mutableBinding.backend.executable = "C:/changed.exe";
    expect(contract.worker_binding?.backend).toEqual(backend);
  });
});

const temporaryRoots: string[] = [];
afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function scriptFixture() {
  const root = mkdtempSync(join(tmpdir(), "aitest-cli-binding-"));
  temporaryRoots.push(root);
  const script = join(root, "worker.mjs");
  writeFileSync(script, "fixture-content");
  return { root, script };
}

describe("exact backend selection", () => {
  it("selects an explicit CLI and hashes its executable and absolute script", async () => {
    const { resolveWorkerBinding } = await import("../../src/workers/backend-config.js");
    const { script } = scriptFixture();
    const config = defaultConfig();
    config.worker_profiles = [{ ...profile, backend: { kind: "cli_json", command: [process.execPath, script, "--json"] } }];
    const result = resolveWorkerBinding(config, { worker_profile: "cli", model_profile: "openai/gpt-test" });
    expect(result?.profile_name).toBe("cli");
    expect(result?.command_inputs?.map(input => input.path)).toEqual([process.execPath, script]);
    expect(result?.command_inputs?.[1]?.sha256).toBe("2b0651992ab2137dafbfbf37f6d5358419c0917b9833465a89bba63b49e2fe51");
  });
  it("preserves legacy defaults but binds CLI defaults and exact model selection", async () => {
    const { resolveWorkerBinding } = await import("../../src/workers/backend-config.js");
    const config = defaultConfig();
    config.worker_profiles = [profile]; config.default_worker_profile = "cli";
    expect(resolveWorkerBinding(config, {})).toBeUndefined();
    expect(resolveWorkerBinding(config, { model_profile: "openai/gpt-test" })).toBeUndefined();
    expect(resolveWorkerBinding(config, { worker_profile: "cli" })).toMatchObject({ ...binding, backend: { kind: "opencode" } });
    config.worker_profiles = [{ ...profile, backend }];
    expect(resolveWorkerBinding(config, {})?.backend.kind).toBe("codex_cli");
    expect(resolveWorkerBinding(config, { model_profile: "openai/gpt-test" })?.backend.kind).toBe("codex_cli");
  });
  it("rejects unknown profiles, exact model mismatch, malformed identity and ambiguous matches", async () => {
    const { resolveWorkerBinding } = await import("../../src/workers/backend-config.js");
    const config = defaultConfig(); config.worker_profiles = [{ ...profile, backend }]; config.default_worker_profile = "cli";
    expect(() => resolveWorkerBinding(config, { worker_profile: "missing" })).toThrow();
    expect(() => resolveWorkerBinding(config, { worker_profile: "cli", model_profile: "openai/other" })).toThrow();
    expect(() => resolveWorkerBinding(config, { model_profile: "openai/other" })).toThrow();
    expect(() => resolveWorkerBinding(config, { model_profile: " cli " })).toThrow();
    config.worker_profiles.push({ ...profile, profile_name: "second", backend });
    expect(() => resolveWorkerBinding(config, { model_profile: "openai/gpt-test" })).toThrow(/ambig|birden/i);
    config.worker_profiles.push({ ...profile, backend });
    expect(() => resolveWorkerBinding(config, { worker_profile: "cli" })).toThrow();
  });
  it("rejects duplicate selected names even when a model matches only one profile", async () => {
    const { resolveWorkerBinding } = await import("../../src/workers/backend-config.js");
    const config = defaultConfig();
    config.worker_profiles = [{ ...profile, backend }, { ...profile, model_id: "another-model", backend }];
    expect(() => resolveWorkerBinding(config, { model_profile: "openai/gpt-test" })).toThrow(/birden|ambig/i);
  });
  it("rejects profile IDs with hidden whitespace and unknown defaults", async () => {
    const { resolveWorkerBinding } = await import("../../src/workers/backend-config.js");
    const config = defaultConfig();
    config.worker_profiles = [{ ...profile, model_id: "gpt\ttest", backend }];
    expect(() => resolveWorkerBinding(config, { model_profile: "openai/gpt\ttest" })).toThrow();
    config.worker_profiles = [];
    expect(() => resolveWorkerBinding(config, { model_profile: "openai/gpt\ttest" })).toThrow();
    config.default_worker_profile = "missing";
    expect(() => resolveWorkerBinding(config, {})).toThrow();
  });
  it("retains provider/model slashes exactly without treating profile names as model specs", async () => {
    const { resolveWorkerBinding } = await import("../../src/workers/backend-config.js");
    const config = defaultConfig();
    config.worker_profiles = [{ ...profile, model_id: "org/model-exact", backend }];
    expect(resolveWorkerBinding(config, { model_profile: "openai/org/model-exact" })?.model_id).toBe("org/model-exact");
    expect(() => resolveWorkerBinding(config, { model_profile: "cli" })).toThrow();
  });
  it("rejects relative executables, directories and missing CLI without fallback", async () => {
    const { resolveWorkerBinding, WorkerBackendSchema } = await import("../../src/workers/backend-config.js");
    const { root } = scriptFixture(); const config = defaultConfig();
    expect(WorkerBackendSchema.safeParse({ kind: "cli_json", command: ["node"] }).success).toBe(false);
    for (const executable of [root, join(root, "missing.exe")]) {
      config.worker_profiles = [{ ...profile, backend: { kind: "codex_cli", executable } }];
      expect(() => resolveWorkerBinding(config, { worker_profile: "cli" })).toThrow();
    }
    expect(WorkerBackendSchema.safeParse({ kind: "codex_cli", executable: "C:relative.exe" }).success).toBe(false);
    expect(WorkerBackendSchema.safeParse({ kind: "codex_cli", executable: "\\drive-missing.exe" }).success).toBe(false);
    expect(WorkerBackendSchema.safeParse({ kind: "codex_cli", executable: join(root, "wrapper.cmd") }).success).toBe(false);
    expect(WorkerBackendSchema.safeParse({ kind: "cli_json", command: [] }).success).toBe(false);
  });
  it("captures content changes in a fresh binding and leaves a prior binding untouched", async () => {
    const { resolveWorkerBinding, WorkerBindingSchema } = await import("../../src/workers/backend-config.js");
    const { script } = scriptFixture(); const config = defaultConfig();
    config.worker_profiles = [{ ...profile, backend: { kind: "cli_json", command: [process.execPath, script] } }];
    const first = resolveWorkerBinding(config, { worker_profile: "cli" })!;
    writeFileSync(script, "changed-fixture");
    const second = resolveWorkerBinding(config, { worker_profile: "cli" })!;
    expect(second.command_inputs).not.toEqual(first.command_inputs);
    config.worker_profiles[0]!.backend = { kind: "opencode" };
    expect(first.backend.kind).toBe("cli_json");
    expect(WorkerBindingSchema.safeParse(first).success).toBe(true);
    const original = buildJobContract({ ...contractInput(), worker_binding: first });
    expect(() => assertContractImmutable(original, buildJobContract({ ...contractInput(), worker_binding: second }))).toThrow(/worker_binding/);
  });
});
