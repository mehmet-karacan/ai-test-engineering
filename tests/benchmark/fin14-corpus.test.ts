/**
 * FIN14/20.2/20.4: Benchmark corpus kurallari ve trial kaydi testleri.
 * - Corpus BM01-BM12 tanimli; BM01-BM08 baseline %90 alti; BM09-BM12 negatif kontrol.
 * - Gercek model denemeleri yetkili iki profil ayni corpus/esik/butce ile (20.3).
 * - Basarisiz denemeler denominator'dan cikartilmaz; en iyi sonuc secilmez.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";

interface CorpusFixture {
  id: string;
  group: string;
  baseline_below_90: boolean;
  negative_control?: boolean;
}

interface Corpus {
  schema_version: number;
  corpus_version: string;
  thresholds: { independent_repeats_per_model: number; reachable_total_min: number; negative_total: number };
  fixtures: CorpusFixture[];
  rules: string[];
}

describe("FIN14: benchmark corpus (20.2)", () => {
  let corpus: Corpus;

  beforeEach(() => {
    const corpusPath = join(process.cwd(), "tests", "benchmark", "corpus.json");
    expect(existsSync(corpusPath)).toBe(true);
    corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus;
  });

  it("en az 12 scenario tanimli (BM01-BM12)", () => {
    expect(corpus.fixtures.length).toBeGreaterThanOrEqual(12);
    expect(corpus.fixtures.map((f) => f.id)).toContain("BM01");
    expect(corpus.fixtures.map((f) => f.id)).toContain("BM12");
  });

  it("BM01-BM08 baseline %90 alti; BM09-BM12 negatif kontrol", () => {
    const reachable = corpus.fixtures.filter((f) => f.baseline_below_90);
    const negative = corpus.fixtures.filter((f) => f.negative_control);
    expect(reachable.length).toBeGreaterThanOrEqual(8);
    expect(negative.length).toBeGreaterThanOrEqual(4);
  });

  it("olcum plani: her modelde en az 3 bagimsiz tekrar; toplam 48 reachable + 8 negatif (20.3)", () => {
    expect(corpus.thresholds.independent_repeats_per_model).toBeGreaterThanOrEqual(3);
    expect(corpus.thresholds.reachable_total_min).toBeGreaterThanOrEqual(48);
    expect(corpus.thresholds.negative_total).toBeGreaterThanOrEqual(8);
  });

  it("reference/golden testler modele verilmez kurali sabit", () => {
    expect(corpus.rules.some((r) => r.includes("Reference/golden"))).toBe(true);
    expect(corpus.rules.some((r) => r.includes("denominator"))).toBe(true);
  });
});

describe("FIN14: benchmark trial kaydi (14.2/20.3)", () => {
  let dir: string;
  let storage: Storage;
  let artifacts: ArtifactStore;
  let locationId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-fin14-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    artifacts = new ArtifactStore({ root: join(dir, "artifacts") });
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/fin14", "fin14", null);
    locationId = location.id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("trial sonuclari benchmark_trials tablosuna yazilir; failure/blocked dahil", () => {
    const jobs = new JobRepository(storage.db);
    const job = jobs.createJob({ locationId, requestDigest: "digest-bm-1" });
    const insert = storage.db.prepare(
      "INSERT INTO benchmark_trials (id, job_id, fixture_id, model_profile, trial_ordinal, outcome, reachable, coverage_gain_line_bps, coverage_gain_branch_bps, duration_ms, cost_available, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(crypto.randomUUID(), job.id, "BM01", "litellm/glm-4.7", 1, "TARGET_REACHED", 1, 2500, 1800, 60000, 0, Date.now());
    insert.run(crypto.randomUUID(), job.id, "BM01", "litellm/glm-4.7", 2, "TARGET_REACHED", 1, 2500, 1800, 55000, 0, Date.now());
    insert.run(crypto.randomUUID(), job.id, "BM01", "litellm/glm-4.7", 3, "TARGET_NOT_MET_BUDGET", 1, 800, null, 120000, 0, Date.now());
    // basarisiz deneme silinmez/gizlenmez:
    const rows = storage.db
      .prepare<[string], { outcome: string; trial_ordinal: number }>("SELECT outcome, trial_ordinal FROM benchmark_trials WHERE fixture_id = 'BM01' AND model_profile = 'litellm/glm-4.7' ORDER BY trial_ordinal")
      .all();
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.outcome !== "TARGET_REACHED")).toBe(true);
  });

  it("negatif kontrol trial: dusuk coverage hedef basarisi olarak sayilmaz", () => {
    const insert = storage.db.prepare(
      "INSERT INTO benchmark_trials (id, fixture_id, model_profile, trial_ordinal, outcome, reachable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(crypto.randomUUID(), "BM09", "qwen/qwen-max", 1, "BLOCKED_DEPENDENCIES", 0, Date.now());
    const rows = storage.db
      .prepare<[], { outcome: string; reachable: number }>("SELECT outcome, reachable FROM benchmark_trials WHERE fixture_id = 'BM09'")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("BLOCKED_DEPENDENCIES");
    expect(rows[0]!.reachable).toBe(0);
  });
});
