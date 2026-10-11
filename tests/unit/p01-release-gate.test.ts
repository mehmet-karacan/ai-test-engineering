/**
 * P01/PR01/PP01-PP03: release gate fail-closed davranis testleri.
 * - Bare/default release-verify FULL mod, fail-closed: evidence manifesti yoksa/eksikse
 *   non-zero; eski fixture yesil mesaji production onayi olarak yazilmaz.
 * - --local yalniz yapisal/fixture kontrolu; local pass'ten full pass uretilmez.
 * - PP02: eksik/mukerrer obligation, yanlis predicate veya yalniz passed:true olan evidence reddedilir.
 * - PP03: yanlis commit/tree/lockfile/build digest, corrupt hash, baska job/run evidence'i reddedilir.
 * Testler yalniz gecici kopya ustunde negatif varyant kosar; gercek repo agacina yazmaz.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface GateResult {
  status: number | null;
  stdout: string;
  stderr: string;
  resultJson: {
    mode: string;
    decision: string;
    exit_code: number;
    reasons: Array<{ code: string; detail: string }>;
    run_manifest: { present: boolean; id: string | null };
    obligations: { mandatory: number; verified: number; missing: number; invalid: number; duplicate: number } | null;
    live_pilot: string | null;
    platform_evidence: string | null;
    full_acceptance_pending: boolean;
    source: { commit: string | null; tree_digest: string };
  } | null;
}

function runGate(repoDir: string, extraArgs: string[] = [], timeout = 15000): GateResult {
  const manifestArgs = repoDir === repoRoot ? [] : ["--manifest", join(repoDir, "evidence-manifest.json")];
  const verifierPath = join(repoRoot, "scripts", "release-verify.mjs");
  const result = spawnSync(process.execPath, [verifierPath, ...manifestArgs, ...extraArgs], { cwd: repoRoot, encoding: "utf8", timeout, windowsHide: true });
  const marker = result.stdout.indexOf("RESULT_JSON:");
  let parsed: GateResult["resultJson"] = null;
  if (marker >= 0) {
    parsed = JSON.parse(result.stdout.slice(marker + "RESULT_JSON:".length));
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, resultJson: parsed };
}

function reasonCodes(gate: GateResult): string[] {
  return (gate.resultJson?.reasons ?? []).map((r) => r.code);
}

/**
 * Negatif varyant manifestini gercek repo agacina yazmadan gecici klasorde uretir.
 * Verifier gercek kaynak agacina --manifest ile bakar; yuzlerce dosya kopyalanmaz.
 */
function copyRepoForNegative(): string {
  return mkdtempSync(join(tmpdir(), "aitest-p01-gate-"));
}

function writeMinimalValidManifest(repoDir: string, overrides: Record<string, unknown> = {}, identityOverride: Record<string, unknown> = {}): void {
  // Gercek kosmadan kaynak kimligi: kopya agacta git yok; identity override ile bilinen degerler.
  const identity = {
    commit: null,
    tree_digest: "0".repeat(64),
    dirty: false,
    file_count: 1,
    lockfile_sha256: null,
    build_input_digest: "0".repeat(64),
    dist_artifacts: [],
    ...identityOverride,
  };
  const obligation = (id: string, level: string) => ({
    requirement_id: id,
    predicate: id,
    evidence_level: level,
    scope: "CONTRACT",
    command: "node tests/fixture-run.mjs",
    exit_code: 0,
    job_id: "job-p01-test",
    run_id: "run-p01-test",
    artifact: null,
    ...((overrides as { _obligation_overrides?: Record<string, Record<string, unknown>> })._obligation_overrides?.[id] ?? {}),
  });
  const manifest = {
    schema_version: 1,
    kind: "acceptance_evidence",
    manifest_id: "manifest-p01-test",
    task: "AITE-PRODUCTION-READINESS-005",
    source: { commit: identity.commit, tree_digest: identity.tree_digest, dirty: identity.dirty },
    build: { lockfile_sha256: identity.lockfile_sha256, build_input_digest: identity.build_input_digest, dist_artifacts: [] },
    run: { job_id: "job-p01-test", run_id: "run-p01-test", exit_code: 0, started_at: 1, ended_at: 2 },
    live_pilot: { status: "PASSED" },
    platform_evidence: { status: "PASSED" },
    obligations: [] as Array<Record<string, unknown>>,
  };
  const merged = { ...manifest, ...overrides } as Record<string, unknown> & { obligations?: unknown };
  if (!("obligations" in overrides)) {
    (merged as { obligations: unknown[] }).obligations = [obligation("N01", "CONTRACT")];
  }
  mkdirSync(repoDir, { recursive: true });
  writeFileSync(join(repoDir, "evidence-manifest.json"), JSON.stringify(merged, null, 2), "utf8");
}

describe("P01/PR01/PP01: bare full gate fail-closed; local/full ayrimi", () => {
  it("bare komut (mod belirtilmemis) FULL mod; evidence manifesti yokken non-zero NO_GO (PP01)", () => {
    const gate = runGate(repoRoot, []);
    expect(gate.status).not.toBe(0);
    expect(gate.resultJson?.mode).toBe("full");
    expect(gate.resultJson?.decision).toBe("NO_GO");
    expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_MANIFEST_EKSIK");
    // Eski fixture yesil mesaji bare komutta production onayi gibi yazilmaz:
    expect(gate.stdout).not.toContain("DOGRULAMA BASARILI: tum zorunlu kontroller gecti");
    expect(gate.stderr).toContain("NO_GO");
  });

  it("--local yalniz yapisal/fixture kontrolu; local pass full pass uretmez (PP01)", () => {
    const gate = runGate(repoRoot, ["--local"]);
    expect(gate.status).toBe(0);
    expect(gate.resultJson?.mode).toBe("local");
    expect(gate.resultJson?.decision).toBe("LOCAL_PASS");
    expect(gate.resultJson?.full_acceptance_pending).toBe(true);
    expect(gate.stdout).toContain("production onayi DEGIL");
    expect(gate.resultJson?.obligations).toBeNull();
  });

  it("makine-okunur sonuc: scope + source commit/tree + lockfile/build digest tasir", () => {
    const gate = runGate(repoRoot, ["--local"]);
    expect(gate.resultJson?.scope?.structural_checks).toContain("source_tree_digest");
    expect(gate.resultJson?.source?.tree_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(gate.resultJson?.source?.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("--print-identity kaynak/build kimlik digeslerini JSON verir; manifest uretimi icin", () => {
    const gate = runGate(repoRoot, ["--print-identity"]);
    expect(gate.status).toBe(0);
    expect(gate.stdout).toContain("source_build_identity");
    expect(gate.stdout).toContain("build_input_digest");
    expect(gate.stdout).toContain("lockfile_sha256");
  });

  it("dist freshness mtime ile degil; build input digest dist artifact hash'iyle bagli", () => {
    const gate = runGate(repoRoot, ["--local"]);
    expect(gate.resultJson?.scope?.structural_checks).toContain("dist_freshness");
    expect(gate.stdout + gate.stderr).not.toContain("DIST_ESKI");
  });
});

describe("P01/PP02: eksik/mukerrer/yanlis evidence reddedilir", () => {
  it("bos obligations listesi gecmez (PP02)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { obligations: [] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("OBLIGATION_BOS");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("mukerrer obligation id non-zero (PP02)", () => {
    const dir = copyRepoForNegative();
    try {
      const ob = { requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE", command: "node x.mjs", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null };
      writeMinimalValidManifest(dir, { obligations: [ob, { ...ob }] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("OBLIGATION_DUPLICATE");
      expect(gate.resultJson?.obligations?.duplicate).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("eksik obligation (bazi zorunlu id'ler yok) non-zero (PP02)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir);
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("OBLIGATION_EKSIK");
      expect(gate.resultJson?.obligations?.missing).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis predicate ve tanimsiz evidence level reddedilir (PP02)", () => {
    const dir = copyRepoForNegative();
    try {
      const ob = { requirement_id: "N01", predicate: "N02", evidence_level: "MAGIC_LEVEL", scope: "AFFECTED_SCOPE", command: "node x.mjs", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null };
      writeMinimalValidManifest(dir, { obligations: [ob] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = gate.resultJson?.reasons.map((r) => r.code) ?? [];
      expect(codes).toContain("EVIDENCE_PREDICATE_UYUSMAZ");
      expect(codes).toContain("EVIDENCE_SEVIYE_GECERSIZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yalniz passed:true (komut/artifactsiz) evidence kanit sayilmaz (PP02/N59)", () => {
    const dir = copyRepoForNegative();
    try {
      const ob = { requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE", passed: true, command: "", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null };
      writeMinimalValidManifest(dir, { obligations: [ob] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = gate.resultJson?.reasons.map((r) => r.code) ?? [];
      expect(codes).toContain("EVIDENCE_YALNIZ_PASSED");
      expect(codes).toContain("EVIDENCE_KOMUT_EKSIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("evidence baska job/run'a aitse reddedilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      const ob = { requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE", command: "node x.mjs", exit_code: 0, job_id: "job-BASKA", run_id: "run-BASKA", artifact: null };
      writeMinimalValidManifest(dir, { obligations: [ob] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = gate.resultJson?.reasons.map((r) => r.code) ?? [];
      expect(codes).toContain("EVIDENCE_JOB_UYUSMAZ");
      expect(codes).toContain("EVIDENCE_RUN_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe("P01/PP03: yanlis kimlik/corrupt manifest reddedilir", () => {
  it("yanlis source commit full gate'i gecmez (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { source: { commit: "0".repeat(40), tree_digest: "0".repeat(64), dirty: false } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      // kopyada git yok -> SOURCE_KIMLIK_YOK; veya commit uyusmazligi:
      const codes = gate.resultJson?.reasons.map((r) => r.code) ?? [];
      expect(codes.some((c) => c === "SOURCE_KIMLIK_YOK" || c === "EVIDENCE_COMMIT_UYUSMAZ")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis tree_digest non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { source: { commit: null, tree_digest: "f".repeat(64), dirty: false } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_TREE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis lockfile_sha256 non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { build: { lockfile_sha256: "a".repeat(64), build_input_digest: "0".repeat(64), dist_artifacts: [] } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_LOCKFILE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis build_input_digest non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { build: { lockfile_sha256: null, build_input_digest: "b".repeat(64), dist_artifacts: [] } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_BUILD_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("corrupt (parse edilemeyen) manifest non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeFileSync(join(dir, "evidence-manifest.json"), "{ bozuk json", "utf8");
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_MANIFEST_PARSE");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis schema_version/kind ve manifest_id'siz manifest reddedilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { schema_version: 2, kind: "baska_sey", manifest_id: "" });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = gate.resultJson?.reasons.map((r) => r.code) ?? [];
      expect(codes).toContain("EVIDENCE_MANIFEST_SCHEMA");
      expect(codes).toContain("EVIDENCE_MANIFEST_KIND");
      expect(codes).toContain("EVIDENCE_MANIFEST_KIMLIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("evidence artifact hash bozuksa reddedilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      const artifactRel = "package.json";
      const ob = {
        requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE",
        command: "node tests/fixture.mjs", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test",
        artifact: { relative_path: artifactRel, sha256: createHash("sha256").update("farkli icerik").digest("hex"), bytes: 29 },
      };
      writeMinimalValidManifest(dir, { obligations: [ob] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_HASH_BOZUK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("evidence artifact repo disina cikiyorsa reddedilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      const ob = {
        requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE",
        command: "node tests/fixture.mjs", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test",
        artifact: { relative_path: "../../disari.txt", sha256: "0".repeat(64), bytes: 1 },
      };
      writeMinimalValidManifest(dir, { obligations: [ob] });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("EVIDENCE_ARTIFACT_YOL_GECERSIZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe("P01/PP01/PP46: canli pilot ve platform kanit ayrisimi", () => {
  it("live_pilot PAUSED_BY_USER iken full gate non-zero (PP01/PP46)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { live_pilot: { status: "PAUSED_BY_USER" } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("LIVE_PILOT_PAUSED_BY_USER");
      expect(gate.resultJson?.live_pilot).toBe("PAUSED_BY_USER");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("live_pilot NOT_PASSED iken full gate non-zero (PP01)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { live_pilot: { status: "NOT_PASSED" } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("LIVE_PILOT_NOT_PASSED");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("platform_evidence NOT_RUN iken full gate non-zero (PP01)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { platform_evidence: { status: "NOT_RUN" } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("PLATFORM_KANIT_YOK");
      expect(gate.resultJson?.platform_evidence).toBe("NOT_RUN");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("live_pilot kaydi tamamen yoksa non-zero (PP01)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { live_pilot: undefined });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.reasons.map((r) => r.code)).toContain("LIVE_PILOT_KANIT_EKSIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe("P01/N60: pilot pause kabul ayrisimi korunur", () => {
  it("katalog ve aktif gorev pause ayrisimini tasir; local tam kabul iddia etmez", () => {
    const catalog = JSON.parse(readFileSync(join(repoRoot, "ai", "acceptance", "catalog.json"), "utf8"));
    const n60 = (catalog.n_obligations as Array<{ requirement_id: string; behavior: string }>).find((n) => n.requirement_id === "N60");
    expect(n60?.behavior).toContain("full non-zero");
    const aktif = readFileSync(join(repoRoot, "AKTIF_GOREV.md"), "utf8");
    expect(aktif).toContain("PAUSED_BY_USER");
    expect(aktif).toContain("NOT_PASSED");
  });

  it("bare full gate canli pilot onayini uydurmaz; NO_GO ile ayrilir", () => {
    const gate = runGate(repoRoot, []);
    expect(gate.resultJson?.live_pilot ?? null).toBeNull();
    expect(gate.resultJson?.decision).toBe("NO_GO");
    expect(existsSync(join(repoRoot, "ai", "acceptance", "evidence-manifest.json"))).toBe(false);
  });
});
