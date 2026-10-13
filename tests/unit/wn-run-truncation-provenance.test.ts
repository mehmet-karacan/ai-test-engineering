import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { InventoryRepository, type RunOutputTruncation } from "../../src/storage/inventory-repository.js";

describe("WN21 durable run output truncation", () => {
  let root: string;
  let storage: Storage;
  let artifacts: ArtifactStore;
  let inventory: InventoryRepository;
  let jobId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-wn21-provenance-"));
    storage = new Storage({ dbPath: join(root, "state.db") });
    storage.migrate();
    artifacts = new ArtifactStore({ root });
    inventory = new InventoryRepository(storage.db, artifacts);
    const { location } = new ProjectRepository(storage.db).ensureLocation(root, "wn21-provenance", null);
    jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "wn21" }).id;
  });

  afterEach(() => {
    storage.close();
    const target = resolve(root);
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`) || !target.split(sep).at(-1)?.startsWith("aitest-wn21-provenance-")) throw new Error("Unsafe fixture cleanup path");
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  const truncation: RunOutputTruncation = {
    stdout_raw_dropped_bytes: 0,
    stderr_raw_dropped_bytes: 3,
    stdout_rendered_dropped_bytes: 16777216,
    stderr_rendered_dropped_bytes: 0,
    stdout_reason: "BYTE_BUDGET_EXCEEDED",
    stderr_reason: "BYTE_BUDGET_EXCEEDED",
  };

  function input(job_id = jobId, output_truncation = truncation) {
    return {
      job_id, stage: "baseline" as const, attempt_ordinal: null, iteration_ordinal: null,
      execution_root: root, command: ["mvn", "test"],
      stdout_log_path: join(root, "stdout.log"), stderr_log_path: join(root, "stderr.log"),
      exit_code: 0, timed_out: false, test_inventory: [], coverage_report_path: join(root, "jacoco.xml"),
      coverage_report_sha256: null, coverage_report_paths: [], started_at: 1000, finished_at: 1100,
      output_truncation,
    };
  }

  it("commits run and immutable pinned artifact, then rejects changed retry", () => {
    const runId = inventory.writeTestRunProvenance(input());
    const row = storage.db.prepare<[string], { sha256: string; bytes: number; relative_store_path: string; pin_reason: string }>(
      "SELECT sha256, bytes, relative_store_path, pin_reason FROM artifacts WHERE job_id = ? AND kind = 'run_output_truncation'",
    ).get(jobId)!;
    expect(row.pin_reason).toBe(`run_output_truncation:${runId}`);
    const bytes = readFileSync(join(root, row.relative_store_path));
    expect(bytes.length).toBe(row.bytes);
    expect(JSON.parse(bytes.toString("utf8"))).toMatchObject({ run_id: runId, job_id: jobId, ...truncation });
    expect(inventory.writeTestRunProvenance(input())).toBe(runId);
    expect(storage.db.prepare("SELECT id FROM artifacts WHERE job_id = ? AND kind = 'run_output_truncation'").all(jobId)).toHaveLength(1);
    expect(() => inventory.writeTestRunProvenance(input(jobId, { ...truncation, stderr_raw_dropped_bytes: 4 }))).toThrow();
    expect(storage.db.prepare<[string], { sha256: string }>("SELECT sha256 FROM artifacts WHERE job_id = ? AND kind = 'run_output_truncation'").get(jobId)!.sha256).toBe(row.sha256);
    storage.db.prepare("UPDATE artifacts SET status = 'QUARANTINED' WHERE job_id = ? AND kind = 'run_output_truncation'").run(jobId);
    expect(() => inventory.writeTestRunProvenance(input())).toThrow();
  });

  it("leaves no trusted rows when SQLite rejects after blob publication", () => {
    const absentJob = randomUUID();
    let publishedHash: string | undefined;
    const original = artifacts.publish.bind(artifacts);
    artifacts.publish = (...args) => {
      const row = original(...args);
      publishedHash = row.sha256;
      return row;
    };
    expect(() => inventory.writeTestRunProvenance(input(absentJob))).toThrow();
    expect(storage.db.prepare("SELECT id FROM test_run_provenance WHERE job_id = ?").all(absentJob)).toHaveLength(0);
    expect(storage.db.prepare("SELECT id FROM artifacts WHERE job_id = ?").all(absentJob)).toHaveLength(0);
    expect(publishedHash && artifacts.verify(publishedHash)).toBe(true);
  });

  it("rolls back the run row when artifact insertion fails after publish", () => {
    storage.db.exec("CREATE TRIGGER reject_truncation BEFORE INSERT ON artifacts WHEN NEW.kind = 'run_output_truncation' BEGIN SELECT RAISE(ABORT, 'fixture artifact insert failure'); END");
    expect(() => inventory.writeTestRunProvenance(input())).toThrow();
    expect(storage.db.prepare("SELECT id FROM test_run_provenance WHERE job_id = ?").all(jobId)).toHaveLength(0);
    expect(storage.db.prepare("SELECT id FROM artifacts WHERE job_id = ?").all(jobId)).toHaveLength(0);
  });

  it("does not backfill truncation into a pre-existing run without evidence", () => {
    const oldId = new InventoryRepository(storage.db).writeTestRunProvenance({ ...input(), output_truncation: undefined });
    expect(() => inventory.writeTestRunProvenance(input())).toThrow();
    expect(storage.db.prepare<[string], { id: string }>("SELECT id FROM test_run_provenance WHERE job_id = ?").get(jobId)!.id).toBe(oldId);
    expect(storage.db.prepare("SELECT id FROM artifacts WHERE job_id = ? AND kind = 'run_output_truncation'").all(jobId)).toHaveLength(0);
  });
});
