import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { AppError } from "../../src/domain/errors.js";
import { recordTerminalRunOutput, terminalOutputFromError } from "../../src/orchestration/terminal-run-output.js";

describe("WN21 terminal output record", () => {
  let root: string;
  let storage: Storage;
  let artifacts: ArtifactStore;
  let jobId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-wn21-terminal-"));
    storage = new Storage({ dbPath: join(root, "state.db") });
    storage.migrate();
    artifacts = new ArtifactStore({ root });
    const { location } = new ProjectRepository(storage.db).ensureLocation(root, "terminal", null);
    jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "terminal" }).id;
  });

  afterEach(() => {
    storage.close();
    const target = resolve(root);
    if (target.startsWith(`${resolve(tmpdir())}${sep}`) && target.split(sep).at(-1)?.startsWith("aitest-wn21-terminal-")) {
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  function output(reason = "NATIVE_MAVEN_CANCELLED") {
    return terminalOutputFromError(new AppError("BLOCKED_ISOLATION", "terminal", {
      reason_code: reason, stdout_log_path: join(root, "jobs", jobId, "stdout.log"),
      stderr_log_path: join(root, "jobs", jobId, "stderr.log"),
      stdout_truncated_bytes: 5, stderr_truncated_bytes: 0,
      stdout_rendered_truncated_bytes: 0, stderr_rendered_truncated_bytes: 0,
      stdout_truncation_reason: "BYTE_BUDGET_EXCEEDED",
    }), root)!;
  }

  it("links one immutable artifact to one event and rejects a conflicting retry", () => {
    const first = output();
    recordTerminalRunOutput({ db: storage.db, artifacts, jobId, phase: "baseline", output: first });
    recordTerminalRunOutput({ db: storage.db, artifacts, jobId, phase: "baseline", output: first });
    expect(storage.db.prepare("SELECT id FROM artifacts WHERE job_id = ? AND kind = 'run_output_terminal'").all(jobId)).toHaveLength(1);
    expect(storage.db.prepare("SELECT id FROM job_events WHERE job_id = ? AND event_type = 'run_output_truncated_terminal'").all(jobId)).toHaveLength(1);
    expect(() => recordTerminalRunOutput({ db: storage.db, artifacts, jobId, phase: "baseline",
      output: { ...first, stdout_raw_dropped_bytes: 6 } })).toThrow();
  });

  it("accepts all three terminal kinds and excludes zero-loss errors", () => {
    for (const reason of ["NATIVE_MAVEN_TIMEOUT", "NATIVE_MAVEN_CANCELLED", "NATIVE_MAVEN_SPAWN_ERROR"]) {
      expect(output(reason).reason_code).toBe(reason);
    }
    expect(terminalOutputFromError(new AppError("BLOCKED_ISOLATION", "terminal", {
      reason_code: "NATIVE_MAVEN_TIMEOUT", stdout_log_path: join(root, "stdout.log"), stderr_log_path: join(root, "stderr.log"),
      stdout_truncated_bytes: 0, stderr_truncated_bytes: 0, stdout_rendered_truncated_bytes: 0, stderr_rendered_truncated_bytes: 0,
    }), root)).toBeNull();
  });

  it("keeps only a PENDING receipt when event linking fails", () => {
    storage.db.exec("CREATE TRIGGER reject_terminal_event BEFORE INSERT ON job_events WHEN NEW.event_type = 'run_output_truncated_terminal' BEGIN SELECT RAISE(ABORT, 'fixture event failure'); END");
    expect(() => recordTerminalRunOutput({ db: storage.db, artifacts, jobId, phase: "baseline", output: output() })).toThrow();
    const rows = storage.db.prepare<[string], { status: string }>(
      "SELECT status FROM artifacts WHERE job_id = ? AND kind = 'run_output_terminal'",
    ).all(jobId);
    expect(rows).toEqual([{ status: "PENDING" }]);
    expect(() => recordTerminalRunOutput({ db: storage.db, artifacts, jobId, phase: "baseline", output: output() }))
      .toThrowError(/pending reconciliation/i);
    expect(storage.db.prepare("SELECT id FROM job_events WHERE job_id = ? AND event_type = 'run_output_truncated_terminal'").all(jobId)).toHaveLength(0);
  });
});
