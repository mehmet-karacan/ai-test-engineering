/**
 * Job repository: test_jobs, job_events, job_leases ve checkpoints uzerinde kalici is yonetimi.
 * Is mantigi burada; transport ve storage adapter'lerinden bagimsiz.
 */
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import {
  LIFECYCLE_VALUES,
  PHASE_VALUES,
  VERIFICATION_VALUES,
  APPLY_STATE_VALUES,
  type Lifecycle,
  type Phase,
  type Outcome,
  type VerificationLevel,
  type ApplyState,
} from "../domain/job-state.js";
import { AppError } from "../domain/errors.js";

export interface JobRow {
  id: string;
  location_id: string;
  source_snapshot_id: string | null;
  best_checkpoint_id: string | null;
  policy_digest: string | null;
  profile_digest: string | null;
  lifecycle: Lifecycle;
  phase: Phase;
  outcome: Outcome | null;
  verification_level: VerificationLevel;
  apply_state: ApplyState;
  request_digest: string | null;
  created_at: number;
  updated_at: number;
  row_version: number;
}

export interface CreateJobInput {
  locationId: string;
  requestDigest: string;
  policyDigest?: string;
  profileDigest?: string;
  phase?: Phase;
}

export interface JobEventInput {
  job_id: string;
  event_type: string;
  phase?: Phase;
  origin: string;
  payload_artifact_id?: string;
  occurred_at?: number;
}

export class JobRepository {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  createJob(input: CreateJobInput): JobRow {
    if (input.phase !== undefined && !PHASE_VALUES.includes(input.phase)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz phase: ${String(input.phase)}`);
    }
    const now = Date.now();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO test_jobs (id, location_id, source_snapshot_id, best_checkpoint_id, policy_digest, profile_digest,
         lifecycle, phase, outcome, verification_level, apply_state, request_digest, created_at, updated_at, row_version)
         VALUES (?, ?, NULL, NULL, ?, ?, 'QUEUED', ?, NULL, 'UNVERIFIED', 'NOT_REQUESTED', ?, ?, ?, 0)`,
      )
      .run(
        id,
        input.locationId,
        input.policyDigest ?? null,
        input.profileDigest ?? null,
        input.phase ?? "discovery",
        input.requestDigest,
        now,
        now,
      );
    this.appendEvent({ job_id: id, event_type: "job_created", phase: input.phase ?? "discovery", origin: "JobRepository" });
    return this.getJob(id);
  }

  getJob(id: string): JobRow {
    const row = this.db.prepare<[string], JobRow>("SELECT * FROM test_jobs WHERE id = ?").get(id);
    if (!row) {
      throw new AppError("INVALID_PARAMETERS", `Job bulunamadi: ${id}`);
    }
    return row;
  }

  findJobByRequestDigest(locationId: string, requestDigest: string): JobRow | undefined {
    return this.db
      .prepare<[string, string], JobRow>(
        "SELECT * FROM test_jobs WHERE location_id = ? AND request_digest = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(locationId, requestDigest);
  }

  findResumableJobs(locationId: string): JobRow[] {
    return this.db
      .prepare<[string], JobRow>(
        `SELECT * FROM test_jobs WHERE location_id = ? AND lifecycle IN ('INTERRUPTED', 'PAUSED', 'RUNNING', 'QUEUED')
         ORDER BY created_at DESC`,
      )
      .all(locationId);
  }

  findResumableJobsByLocations(locationIds: string[]): JobRow[] {
    if (locationIds.length === 0) {
      return [];
    }
    const placeholders = locationIds.map(() => "?").join(", ");
    return this.db
      .prepare<string[], JobRow>(
        `SELECT * FROM test_jobs WHERE location_id IN (${placeholders}) AND lifecycle IN ('INTERRUPTED', 'PAUSED', 'RUNNING', 'QUEUED')
         ORDER BY created_at DESC`,
      )
      .all(...locationIds);
  }

  updateLifecycle(id: string, lifecycle: Lifecycle, expectedRowVersion: number): JobRow {
    if (!LIFECYCLE_VALUES.includes(lifecycle)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz lifecycle: ${String(lifecycle)}`);
    }
    const result = this.db
      .prepare(
        "UPDATE test_jobs SET lifecycle = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
      )
      .run(lifecycle, Date.now(), id, expectedRowVersion);
    if (result.changes === 0) {
      throw new AppError("STORAGE_ERROR", `Lifecycle guncelleme basarisiz (row_version cakismasi): ${id}`);
    }
    return this.getJob(id);
  }

  updatePhase(id: string, phase: Phase, expectedRowVersion: number): JobRow {
    if (!PHASE_VALUES.includes(phase)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz phase: ${String(phase)}`);
    }
    const result = this.db
      .prepare(
        "UPDATE test_jobs SET phase = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
      )
      .run(phase, Date.now(), id, expectedRowVersion);
    if (result.changes === 0) {
      throw new AppError("STORAGE_ERROR", `Phase guncelleme basarisiz (row_version cakismasi): ${id}`);
    }
    return this.getJob(id);
  }

  updateOutcome(id: string, outcome: Outcome, expectedRowVersion: number): JobRow {
    const result = this.db
      .prepare(
        "UPDATE test_jobs SET outcome = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
      )
      .run(outcome, Date.now(), id, expectedRowVersion);
    if (result.changes === 0) {
      throw new AppError("STORAGE_ERROR", `Outcome guncelleme basarisiz (row_version cakismasi): ${id}`);
    }
    return this.getJob(id);
  }

  updateVerificationLevel(id: string, verification: VerificationLevel, expectedRowVersion: number): JobRow {
    if (!VERIFICATION_VALUES.includes(verification)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz verification_level: ${String(verification)}`);
    }
    const result = this.db
      .prepare(
        "UPDATE test_jobs SET verification_level = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
      )
      .run(verification, Date.now(), id, expectedRowVersion);
    if (result.changes === 0) {
      throw new AppError("STORAGE_ERROR", `Verification guncelleme basarisiz (row_version cakismasi): ${id}`);
    }
    return this.getJob(id);
  }

  updateApplyState(id: string, applyState: ApplyState, expectedRowVersion: number): JobRow {
    if (!APPLY_STATE_VALUES.includes(applyState)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz apply_state: ${String(applyState)}`);
    }
    const result = this.db
      .prepare(
        "UPDATE test_jobs SET apply_state = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
      )
      .run(applyState, Date.now(), id, expectedRowVersion);
    if (result.changes === 0) {
      throw new AppError("STORAGE_ERROR", `Apply state guncelleme basarisiz (row_version cakismasi): ${id}`);
    }
    return this.getJob(id);
  }

  /**
   * FIN01/K02: Immutable contract referanslari job'a yazilir.
   * policy_digest = contract digest; profile_digest = secretsiz config snapshot digest'i.
   */
  updatePolicyDigest(id: string, policyDigest: string, profileDigest: string | null, expectedRowVersion: number): JobRow {
    const result = this.db
      .prepare(
        "UPDATE test_jobs SET policy_digest = ?, profile_digest = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
      )
      .run(policyDigest, profileDigest, Date.now(), id, expectedRowVersion);
    if (result.changes === 0) {
      throw new AppError("STORAGE_ERROR", `Policy digest guncelleme basarisiz (row_version cakismasi): ${id}`);
    }
    return this.getJob(id);
  }

  appendEvent(input: JobEventInput): number {
    const tx = this.db.transaction((): number => {
      const row = this.db
        .prepare<[string], { max_seq: number | null }>("SELECT MAX(sequence) AS max_seq FROM job_events WHERE job_id = ?")
        .get(input.job_id);
      const sequence = (row?.max_seq ?? -1) + 1;
      this.db
        .prepare(
          "INSERT INTO job_events (job_id, sequence, event_type, phase, origin, payload_artifact_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          input.job_id,
          sequence,
          input.event_type,
          input.phase ?? null,
          input.origin,
          input.payload_artifact_id ?? null,
          input.occurred_at ?? Date.now(),
        );
      return sequence;
    });
    return tx();
  }

  listEvents(jobId: string, fromSequence?: number, limit = 100): Array<{ sequence: number; event_type: string; phase: string | null; origin: string; occurred_at: number }> {
    if (fromSequence !== undefined) {
      return this.db
        .prepare<
          [string, number, number],
          { sequence: number; event_type: string; phase: string | null; origin: string; occurred_at: number }
        >(
          "SELECT sequence, event_type, phase, origin, occurred_at FROM job_events WHERE job_id = ? AND sequence >= ? ORDER BY sequence LIMIT ?",
        )
        .all(jobId, fromSequence, limit);
    }
    return this.db
      .prepare<[string, number], { sequence: number; event_type: string; phase: string | null; origin: string; occurred_at: number }>(
        "SELECT sequence, event_type, phase, origin, occurred_at FROM job_events WHERE job_id = ? ORDER BY sequence LIMIT ?",
      )
      .all(jobId, limit);
  }
}
