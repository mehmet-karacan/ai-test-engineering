/**
 * P01/PR01/PP01-PP03: release gate fail-closed davranis testleri.
 * - Bare/default release-verify FULL mod, fail-closed: evidence manifesti yoksa/eksikse
 *   non-zero; eski fixture yesil mesaji production onayi olarak yazilmaz.
 * - --local yalniz yapisal/fixture kontrolu; local pass'ten full pass uretilmez.
 * - PP02: eksik/mukerrer obligation, yanlis predicate veya yalniz passed:true olan evidence reddedilir.
 * - PP03: yanlis commit/tree/lockfile/build digest, corrupt hash, baska job/run evidence'i reddedilir.
 * - P09/PR01: dagitilacak build (dist), dosya mtime'i degil build stamp + digest zinciriyle
 *   kanitla baglanir; kabul run exit_code 0 degilse kanit sayilmaz; tanimli evidence level
 *   kumesi kabul ledger'inden (catalog) turetilir; kabul ledger'i (ai/acceptance) kaynak
 *   kimligina girer. 005'in tutarli 274-ID sentetik manifesti 006 full kabulune yetmez;
 *   yeni Windows kanit zinciri tamamlanana kadar gate NO_GO kalir.
 * Testler yalniz gecici kopya ustunde negatif varyant kosar; gercek repo agacina yazmaz.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface DistArtifact {
  relative_path: string;
  sha256: string;
  bytes: number;
}

interface Identity {
  source: { commit: string | null; dirty: boolean; tree_digest: string; file_count: number };
  build: { lockfile_sha256: string | null; build_input_digest: string; dist_artifacts: DistArtifact[] };
  build_stamp: Record<string, unknown> | null;
}

interface GateResult {
  status: number | null;
  stdout: string;
  stderr: string;
  resultJson: {
    mode: string;
    decision: string;
    exit_code: number;
    reasons: Array<{ code: string; detail: string }>;
    run_manifest: { present: boolean; id: string | null; run: { job_id: string; run_id: string; exit_code: number | null } | null };
    obligations: { mandatory: number; verified: number; missing: number; invalid: number; duplicate: number } | null;
    live_pilot: string | null;
    platform_evidence: string | null;
    full_acceptance_pending: boolean;
    source: { commit: string | null; tree_digest: string };
    scope: { structural_checks: string[]; build_stamp_path: string; evidence_levels: string[] };
  } | null;
}

function runGate(cwd: string, extraArgs: string[] = [], timeout = 30000): GateResult {
  const verifierPath = join(cwd, "scripts", "release-verify.mjs");
  const result = spawnSync(process.execPath, [verifierPath, ...extraArgs], { cwd, encoding: "utf8", timeout, windowsHide: true });
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

// Gate'in gerek oldugu en kucuk agac kumesi: tree digest girdileri (src, scripts, tests,
// docs, ai/acceptance), zorunlu dosyalar, dist + build stamp, git kimligi (.git).
// Kopya, verifier'in kendi agacinda yalnizca bu dosyalari gozlemesini saglar; kimlik
// (--print-identity) kopyanin kendinden alindigi icin self-consistent olur.
const COPY_DIRS = ["src", "scripts", "docs", "dist", "ai/acceptance", "tests/benchmark"];
const COPY_ROOT_FILES = ["package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "eslint.config.mjs", "AKTIF_GOREV.md", "README.md", ".git"];

/**
 * Gecici kopya uretir ve build stamp'i kopya agacin kendi kaynak kimligina yeniler.
 * Gercek repo agaci DEGISTIRILMEZ.
 */
function copyRepoForNegative(): string {
  const dir = mkdtempSync(join(tmpdir(), "aitest-p01-gate-"));
  const copyDir = (src: string, dst: string) => {
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) {
      const s = join(src, name);
      const t = join(dst, name);
      const st = statSync(s);
      if (st.isDirectory()) {
        copyDir(s, t);
      } else {
        copyFileSync(s, t);
      }
    }
  };
  for (const rel of COPY_DIRS) {
    const s = join(repoRoot, rel);
    if (existsSync(s)) {
      copyDir(s, join(dir, rel));
    }
  }
  for (const rel of COPY_ROOT_FILES) {
    const s = join(repoRoot, rel);
    if (!existsSync(s)) {
      continue;
    }
    const st = statSync(s);
    if (st.isDirectory()) {
      copyDir(s, join(dir, rel));
    } else {
      copyFileSync(s, join(dir, rel));
    }
  }
  const stamp = spawnSync(process.execPath, [join(dir, "scripts", "write-build-stamp.mjs")], { cwd: dir, encoding: "utf8", timeout: 60000, windowsHide: true });
  if (stamp.status !== 0) {
    throw new Error(`write-build-stamp kopyada basarisiz: exit=${stamp.status} stderr=${stamp.stderr.slice(0, 500)}`);
  }
  return dir;
}

function getIdentity(cwd: string): Identity {
  const gate = runGate(cwd, ["--print-identity"]);
  if (gate.status !== 0 || !gate.resultJson) {
    throw new Error(`--print-identity calistirilamadi: exit=${gate.status} stderr=${gate.stderr.slice(0, 500)}`);
  }
  const identity = gate.resultJson as unknown as Identity;
  if (!identity.source?.tree_digest || !identity.build) {
    throw new Error("--print-identity cikti beklenen alani tasimiyor");
  }
  return identity;
}

function artifactFor(dir: string): DistArtifact {
  const rel = "package.json";
  const abs = join(dir, rel);
  const bytes = readFileSync(abs);
  return { relative_path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

/**
 * Kopyadaki gercek kaynak/build kimligi (--print-identity) ile tutarli bir kabul manifesti
 * yazar (varsayilan yol: kopyanin ai/acceptance/evidence-manifest.json). overrides ile tek
 * alan kirletilip fail-closed kapilar sinanir.
 */
function writeMinimalValidManifest(dir: string, overrides: Record<string, unknown> = {}): void {
  const identity = getIdentity(dir);
  const run = { job_id: "job-p01-test", run_id: "run-p01-test", exit_code: 0, started_at: 1, ended_at: 2 };
  const obligation = (id: string, level: string) => ({
    requirement_id: id,
    predicate: id,
    evidence_level: level,
    scope: "AFFECTED_SCOPE",
    command: "npm.cmd test -- --run",
    exit_code: 0,
    job_id: run.job_id,
    run_id: run.run_id,
    artifact: artifactFor(dir),
  });
  const manifest = {
    schema_version: 1,
    kind: "acceptance_evidence",
    manifest_id: "manifest-p01-test",
    task: "AITE-PRODUCTION-READINESS-005",
    source: { commit: identity.source.commit, tree_digest: identity.source.tree_digest, dirty: identity.source.dirty },
    build: {
      lockfile_sha256: identity.build.lockfile_sha256,
      build_input_digest: identity.build.build_input_digest,
      dist_artifacts: identity.build.dist_artifacts,
    },
    run,
    live_pilot: { status: "PASSED" },
    platform_evidence: { status: "PASSED" },
    obligations: [obligation("N01", "CONTRACT")],
  };
  const merged = { ...manifest, ...overrides };
  writeFileSync(join(dir, "ai", "acceptance", "evidence-manifest.json"), JSON.stringify(merged, null, 2), "utf8");
}

function mutateManifest(dir: string, mutate: (manifest: Record<string, unknown>) => void): void {
  const path = join(dir, "ai", "acceptance", "evidence-manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(manifest);
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf8");
}

function allObligationEntries(dir: string, job_id: string, run_id: string): Array<Record<string, unknown>> {
  const catalog = JSON.parse(readFileSync(join(dir, "ai", "acceptance", "catalog.json"), "utf8"));
  const levelById = new Map<string, string>();
  for (const row of [...(catalog.rt_obligations ?? []), ...(catalog.n_obligations ?? [])]) {
    if (row?.requirement_id && Array.isArray(row.evidence_levels) && row.evidence_levels.length > 0) {
      levelById.set(row.requirement_id, row.evidence_levels[0]);
    }
  }
  const ids = new Set<string>();
  for (const group of catalog.groups ?? []) {
    const match = /^([A-Za-z]+)(\d+)-([A-Za-z]+)(\d+)$/.exec(group?.ids ?? "");
    if (!match) {
      continue;
    }
    const [, p1, startText, , endText] = match;
    const start = Number.parseInt(startText, 10);
    const end = Number.parseInt(endText, 10);
    for (let i = start; i <= end; i++) {
      ids.add(p1 + String(i).padStart(startText.length, "0"));
    }
  }
  const artifact = artifactFor(dir);
  return [...ids].sort().map((id) => ({
    requirement_id: id,
    predicate: id,
    evidence_level: levelById.get(id) ?? "CONTRACT",
    scope: "AFFECTED_SCOPE",
    command: "npm.cmd test -- --run",
    exit_code: 0,
    job_id,
    run_id,
    artifact,
  }));
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
    expect(gate.stdout).toContain("build_stamp");
  });

  it("dist freshness mtime ile degil; build stamp + digest zinciri (P09/PR01)", () => {
    const gate = runGate(repoRoot, ["--local"]);
    expect(gate.resultJson?.scope?.structural_checks).toContain("build_stamp_dist_provenance");
    expect(gate.stdout + gate.stderr).not.toContain("DIST_ESKI");
    expect(gate.resultJson?.scope?.build_stamp_path).toBe("dist/build-stamp.json");
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
      writeMinimalValidManifest(dir);
      mutateManifest(dir, (manifest) => {
        const obligations = manifest.obligations as Array<Record<string, unknown>>;
        manifest.obligations = [obligations[0], { ...obligations[0] }];
      });
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
      writeMinimalValidManifest(dir, {
        obligations: [{ requirement_id: "N01", predicate: "N02", evidence_level: "MAGIC_LEVEL", scope: "AFFECTED_SCOPE", command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = reasonCodes(gate);
      expect(codes).toContain("EVIDENCE_PREDICATE_UYUSMAZ");
      expect(codes).toContain("EVIDENCE_SEVIYE_GECERSIZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yalniz passed:true (komut/artifactsiz) evidence kanit sayilmaz (PP02/N59)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, {
        obligations: [{ requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE", passed: true, command: "", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = reasonCodes(gate);
      expect(codes).toContain("EVIDENCE_YALNIZ_PASSED");
      expect(codes).toContain("EVIDENCE_KOMUT_EKSIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("evidence baska job/run'a aitse reddedilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, {
        obligations: [{ requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE", command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-BASKA", run_id: "run-BASKA", artifact: null }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      const codes = reasonCodes(gate);
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
      const identity = getIdentity(dir);
      writeMinimalValidManifest(dir, { source: { commit: "0".repeat(40), tree_digest: identity.source.tree_digest, dirty: identity.source.dirty } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      // kopyada git varsa commit uyusmazligi, yoksa kimlik yok:
      const codes = reasonCodes(gate);
      expect(codes.some((c) => c === "SOURCE_KIMLIK_YOK" || c === "EVIDENCE_COMMIT_UYUSMAZ")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis tree_digest non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      const identity = getIdentity(dir);
      writeMinimalValidManifest(dir, { source: { commit: identity.source.commit, tree_digest: "f".repeat(64), dirty: identity.source.dirty } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_TREE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis lockfile_sha256 non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      const identity = getIdentity(dir);
      writeMinimalValidManifest(dir, { build: { lockfile_sha256: "a".repeat(64), build_input_digest: identity.build.build_input_digest, dist_artifacts: identity.build.dist_artifacts } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_LOCKFILE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("yanlis build_input_digest non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      const identity = getIdentity(dir);
      writeMinimalValidManifest(dir, { build: { lockfile_sha256: identity.build.lockfile_sha256, build_input_digest: "b".repeat(64), dist_artifacts: identity.build.dist_artifacts } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_BUILD_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("corrupt (parse edilemeyen) manifest non-zero (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeFileSync(join(dir, "ai", "acceptance", "evidence-manifest.json"), "{ bozuk json", "utf8");
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_MANIFEST_PARSE");
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
      const codes = reasonCodes(gate);
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
      writeMinimalValidManifest(dir, {
        obligations: [{
          requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE",
          command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test",
          artifact: { relative_path: "package.json", sha256: createHash("sha256").update("farkli icerik").digest("hex"), bytes: 29 },
        }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_HASH_BOZUK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("evidence artifact repo disina cikiyorsa reddedilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, {
        obligations: [{
          requirement_id: "N01", predicate: "N01", evidence_level: "CONTRACT", scope: "AFFECTED_SCOPE",
          command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test",
          artifact: { relative_path: "../../disari.txt", sha256: "0".repeat(64), bytes: 1 },
        }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_ARTIFACT_YOL_GECERSIZ");
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
      expect(reasonCodes(gate)).toContain("LIVE_PILOT_PAUSED_BY_USER");
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
      expect(reasonCodes(gate)).toContain("LIVE_PILOT_NOT_PASSED");
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
      expect(reasonCodes(gate)).toContain("PLATFORM_KANIT_YOK");
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
      expect(reasonCodes(gate)).toContain("LIVE_PILOT_KANIT_EKSIK");
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
    const archive005 = readFileSync(join(repoRoot, "ai", "tasks", "archive", "AITE-PRODUCTION-READINESS-005-v1.0.md"), "utf8");
    expect(archive005).toContain("PAUSED_BY_USER");
    expect(archive005).toContain("NOT_PASSED");
  });

  it("bare full gate canli pilot onayini uydurmaz; NO_GO ile ayrilir", () => {
    const gate = runGate(repoRoot, []);
    expect(gate.resultJson?.live_pilot ?? null).toBeNull();
    expect(gate.resultJson?.decision).toBe("NO_GO");
    expect(existsSync(join(repoRoot, "ai", "acceptance", "evidence-manifest.json"))).toBe(false);
  });
});

describe("P09/PR01: build stamp ve dagitilacak build provenance (mtime degil digest)", () => {
  it("dist/build-stamp.json yoksa local gate non-zero (BUILD_STAMP_EKSIK)", () => {
    const dir = copyRepoForNegative();
    try {
      rmSync(join(dir, "dist", "build-stamp.json"), { force: true });
      const gate = runGate(dir, ["--local"]);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.decision).toBe("LOCAL_FAIL");
      expect(reasonCodes(gate)).toContain("BUILD_STAMP_EKSIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("kaynak degisince build stamp stale olur (local DIST_STALE_TREE)", () => {
    const dir = copyRepoForNegative();
    try {
      const src = join(dir, "src", "mcp", "stdio-entry.ts");
      writeFileSync(src, `${readFileSync(src, "utf8")}\n// p09-test-degisikligi\n`, "utf8");
      const gate = runGate(dir, ["--local"]);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("DIST_STALE_TREE");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("dist bayti stamp sonrasinda degisirse local gate non-zero (DIST_STAMP_UYUSMAZ)", () => {
    const dir = copyRepoForNegative();
    try {
      const distFile = join(dir, "dist", "mcp", "stdio-entry.js");
      writeFileSync(distFile, `${readFileSync(distFile, "utf8")}\n// p09-sonradan-degisik\n`, "utf8");
      const gate = runGate(dir, ["--local"]);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("DIST_STAMP_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("parse edilemeyen build stamp local gate'i non-zero yapar (BUILD_STAMP_PARSE)", () => {
    const dir = copyRepoForNegative();
    try {
      writeFileSync(join(dir, "dist", "build-stamp.json"), "{ bozuk", "utf8");
      const gate = runGate(dir, ["--local"]);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("BUILD_STAMP_PARSE");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("full gate: build stamp yoksa dagitilacak build kanitsiz sayilir (PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      rmSync(join(dir, "dist", "build-stamp.json"), { force: true });
      writeMinimalValidManifest(dir);
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate).some((c) => c === "EVIDENCE_BUILD_STAMP_EKSIK" || c === "BUILD_STAMP_EKSIK")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("full gate: kaynak degisince stamp zinciri bozulur (EVIDENCE_DIST_TREE_UYUSMAZ, PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir);
      const src = join(dir, "src", "mcp", "stdio-entry.ts");
      writeFileSync(src, `${readFileSync(src, "utf8")}\n// p09-test-degisikligi\n`, "utf8");
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_DIST_TREE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("full gate: dist bayti stamp'ten farkliysa reddedilir (EVIDENCE_DIST_STAMP_UYUSMAZ, PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir);
      const distFile = join(dir, "dist", "mcp", "stdio-entry.js");
      writeFileSync(distFile, `${readFileSync(distFile, "utf8")}\n// p09-sonradan-degisik\n`, "utf8");
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_DIST_STAMP_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe("P09/PR01: kabul run exit ve evidence level sozlesmesi", () => {
  it("run.exit_code 0 degilse kabul kaniti sayilmaz (EVIDENCE_RUN_EXIT_SIFIR_DEGIL)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { run: { job_id: "job-p01-test", run_id: "run-p01-test", exit_code: 2, started_at: 1, ended_at: 2 } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_RUN_EXIT_SIFIR_DEGIL");
      expect(gate.resultJson?.run_manifest?.run?.exit_code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("run.exit_code yoksa fail-closed (EVIDENCE_RUN_EXIT_EKSIK)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, { run: { job_id: "job-p01-test", run_id: "run-p01-test", started_at: 1, ended_at: 2 } });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_RUN_EXIT_EKSIK");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("katalogda tanimli seviye (SECURITY) tanimli seviye olarak kabul edilir (P09)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, {
        obligations: [{ requirement_id: "N46", predicate: "N46", evidence_level: "SECURITY", scope: "AFFECTED_SCOPE", command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null }],
      });
      const gate = runGate(dir, []);
      const codes = reasonCodes(gate);
      expect(codes).not.toContain("EVIDENCE_SEVIYE_GECERSIZ");
      expect(codes).not.toContain("EVIDENCE_SEVIYE_UYUSMAZ");
      expect(gate.resultJson?.scope?.evidence_levels).toContain("SECURITY");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("katalogda tanimsiz seviye (MAGIC_LEVEL) reddedilir (P09)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, {
        obligations: [{ requirement_id: "N46", predicate: "N46", evidence_level: "MAGIC_LEVEL", scope: "AFFECTED_SCOPE", command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_SEVIYE_GECERSIZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("id'nin katalog seviyeleri disinda seviye EVIDENCE_SEVIYE_UYUSMAZ verir (P09)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir, {
        obligations: [{ requirement_id: "N01", predicate: "N01", evidence_level: "UNIT", scope: "AFFECTED_SCOPE", command: "npm.cmd test -- --run", exit_code: 0, job_id: "job-p01-test", run_id: "run-p01-test", artifact: null }],
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_SEVIYE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe("P09/PR01: kabul ledger'i kaynak kimligina girer; manifest dairesel referans yapmaz", () => {
  it("catalog degisigi kayitli tree digest'i bozar (EVIDENCE_TREE_UYUSMAZ, PP03)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir);
      const catalogPath = join(dir, "ai", "acceptance", "catalog.json");
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      catalog.note = "p09-test-degisikligi";
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(reasonCodes(gate)).toContain("EVIDENCE_TREE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("evidence manifesti kendi tree digest'ine girmez (dairesel referans yok)", () => {
    const dir = copyRepoForNegative();
    try {
      writeMinimalValidManifest(dir);
      const gate = runGate(dir, ["--local"]);
      expect(gate.status).toBe(0);
      expect(gate.resultJson?.decision).toBe("LOCAL_PASS");
      expect(reasonCodes(gate)).not.toContain("EVIDENCE_TREE_UYUSMAZ");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe("P01/PP01: eski 274-ID manifest 006 full kabulune yetmez", () => {
  it("274 zorunlu id + tutarli kimlik zinciri + PASSED pilot/platform bile 006 gate'inde NO_GO", () => {
    const dir = copyRepoForNegative();
    try {
      const obligations = allObligationEntries(dir, "job-p01-go", "run-p01-go");
      expect(obligations.length).toBe(274);
      writeMinimalValidManifest(dir, {
        run: { job_id: "job-p01-go", run_id: "run-p01-go", exit_code: 0, started_at: 1, ended_at: 2 },
        obligations,
      });
      const gate = runGate(dir, []);
      expect(gate.status).not.toBe(0);
      expect(gate.resultJson?.decision).toBe("NO_GO");
      expect(gate.resultJson?.reasons?.some((reason: { code: string }) => reason.code === "WINDOWS_006_FULL_GATE_PENDING")).toBe(true);
      expect(gate.resultJson?.obligations?.mandatory).toBe(274);
      expect(gate.resultJson?.obligations?.verified).toBe(274);
      expect(gate.resultJson?.obligations?.missing).toBe(0);
      expect(gate.resultJson?.obligations?.invalid).toBe(0);
      expect(gate.resultJson?.live_pilot).toBe("PASSED");
      expect(gate.resultJson?.platform_evidence).toBe("PASSED");
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
