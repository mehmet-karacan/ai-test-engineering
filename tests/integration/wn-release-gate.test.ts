/**
 * WN67-WN69: 006 scope-aware release gate'in gercek CLI sinirlari.
 *
 * Bu testler repository'ye evidence manifesti yazmaz. Partial manifestler
 * gecici/private bir store'da revision + onceki hash bagiyla tutulabilir;
 * full verifier bunlari okur ama full GO'ya donusturmez.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const verifier = join(repoRoot, "scripts", "release-verify.mjs");

interface GateResult {
  status: number | null;
  stdout: string;
  stderr: string;
  json: {
    decision?: string;
    reasons?: Array<{ code: string }>;
    run_manifest?: {
      manifest_status?: string | null;
      revision?: number | null;
      previous_manifest_sha256?: string | null;
    };
  } | null;
}

function runGate(args: string[]): GateResult {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  const marker = result.stdout.indexOf("RESULT_JSON:");
  let json: GateResult["json"] = null;
  if (marker >= 0) {
    json = JSON.parse(result.stdout.slice(marker + "RESULT_JSON:".length)) as GateResult["json"];
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

function reasonCodes(result: GateResult): string[] {
  return (result.json?.reasons ?? []).map((reason) => reason.code);
}

function sourceBuildIdentity(): {
  source: { commit: string | null; tree_digest: string; dirty: boolean };
  build: { lockfile_sha256: string | null; build_input_digest: string; dist_artifacts: unknown[] };
} {
  const result = runGate(["--print-identity"]);
  expect(result.status).toBe(0);
  const marker = result.stdout.indexOf("RESULT_JSON:");
  expect(marker).toBeGreaterThanOrEqual(0);
  return JSON.parse(result.stdout.slice(marker + "RESULT_JSON:".length)) as ReturnType<typeof sourceBuildIdentity>;
}

function writePartialManifest(path: string, revision: number, previous: string | null): void {
  const identity = sourceBuildIdentity();
  const run = { job_id: "job-wn-release-gate", run_id: `run-wn-release-gate-${revision}`, exit_code: 0, started_at: 1, ended_at: 2 };
  writeFileSync(path, JSON.stringify({
    schema_version: 1,
    kind: "acceptance_evidence",
    manifest_id: `manifest-wn-release-gate-${revision}`,
    manifest_status: "PARTIAL",
    revision,
    previous_manifest_sha256: previous,
    task: "AITE-WINDOWS-SUBAGENT-PILOT-006",
    scope_id: "windows-native-v1",
    source: identity.source,
    build: identity.build,
    run,
    live_pilot: { status: "NOT_RUN", reason: "pilot evidence not yet collected" },
    platform_evidence: { status: "NOT_RUN", reason: "platform evidence not yet collected" },
    obligations: [{
      requirement_id: "WN69",
      predicate: "WN69",
      evidence_level: "CONTRACT",
      scope: "AFFECTED_SCOPE",
      status: "NOT_RUN",
      passed: false,
      job_id: run.job_id,
      run_id: run.run_id,
      reason: "full required predicate evidence is pending",
    }],
  }, null, 2), "utf8");
}

describe("WN67-WN69 scope-aware release gate", () => {
  it("valid scope accepts a stored partial revision but full gate remains NO_GO", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-wn-release-gate-"));
    const manifest = join(dir, "evidence-manifest.json");
    try {
      writePartialManifest(manifest, 1, null);
      const result = runGate(["--scope", "windows-native-v1", "--manifest", manifest]);
      expect(result.status).toBe(1);
      expect(result.json?.decision).toBe("NO_GO");
      expect(result.json?.run_manifest?.manifest_status).toBe("PARTIAL");
      expect(result.json?.run_manifest?.revision).toBe(1);
      expect(reasonCodes(result)).toContain("EVIDENCE_PARTIAL_MANIFEST");
      expect(reasonCodes(result)).toContain("EVIDENCE_NOT_PASSED");
      expect(reasonCodes(result)).toContain("LIVE_PILOT_NOT_RUN");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("ikinci partial revision onceki manifest hash bagini tasir; bag bozuksa red edilir", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-wn-release-revision-"));
    const manifest = join(dir, "evidence-manifest.json");
    try {
      writePartialManifest(manifest, 1, null);
      const previousHash = createHash("sha256").update(readFileSync(manifest)).digest("hex");
      writePartialManifest(manifest, 2, previousHash);
      const linked = runGate(["--scope", "windows-native-v1", "--manifest", manifest]);
      expect(linked.status).toBe(1);
      expect(linked.json?.run_manifest?.revision).toBe(2);
      expect(linked.json?.run_manifest?.previous_manifest_sha256).toBe(previousHash);
      expect(reasonCodes(linked)).not.toContain("EVIDENCE_PREVIOUS_HASH_EKSIK");

      writePartialManifest(manifest, 2, null);
      const broken = runGate(["--scope", "windows-native-v1", "--manifest", manifest]);
      expect(broken.status).toBe(1);
      expect(reasonCodes(broken)).toContain("EVIDENCE_PREVIOUS_HASH_EKSIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("bilinmeyen flag/scope ve eksik manifest degeri sessizce yok sayilmaz", () => {
    const unknownFlag = runGate(["--surprise"]);
    expect(unknownFlag.status).toBe(1);
    expect(reasonCodes(unknownFlag)).toContain("BILINMEYEN_ARGUMAN");

    const unknownScope = runGate(["--scope", "linux-native-v1"]);
    expect(unknownScope.status).toBe(1);
    expect(reasonCodes(unknownScope)).toContain("BILINMEYEN_SCOPE");

    const missingManifestValue = runGate(["--manifest"]);
    expect(missingManifestValue.status).toBe(1);
    expect(reasonCodes(missingManifestValue)).toContain("ARGUMAN_DEGERI_EKSIK");
  });
});
