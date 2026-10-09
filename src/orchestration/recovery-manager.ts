/**
 * Recovery algoritmasi: kesintiden sonra ayni job'dan devam.
 * 1. Uygun yarim isi bul  2. Lease/fence al  3. DB/checkpoint/blob dogrula
 * 4. Kaynak fingerprint kontrol  5. Degisiklik yoksa devam; degistiyse SOURCE_CHANGED.
 */
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import { LeaseManager } from "./lease-manager.js";
import { CheckpointStore } from "./checkpoint-store.js";
import type { JobRow } from "../storage/job-repository.js";

export interface RecoveryPlan {
  job: JobRow;
  action: "resume" | "rebaseline" | "fresh_start";
  checkpoint_id: string | null;
  source_changed: boolean;
  reason: string;
  stale_coverage_marked: boolean;
}

export interface RecoveryContext {
  current_source_digest: string | null;
  current_build_digest: string | null;
}

export class RecoveryManager {
  private readonly db: BetterSqlite3.Database;
  private readonly leases: LeaseManager;
  private readonly checkpoints: CheckpointStore;

  constructor(db: BetterSqlite3.Database, leases: LeaseManager, checkpoints: CheckpointStore) {
    this.db = db;
    this.leases = leases;
    this.checkpoints = checkpoints;
  }

  findResumableJob(locationIds: string[]): JobRow | undefined {
    if (locationIds.length === 0) {
      return undefined;
    }
    const placeholders = locationIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare<string[], JobRow>(
        `SELECT * FROM test_jobs WHERE location_id IN (${placeholders}) AND lifecycle IN ('INTERRUPTED', 'PAUSED', 'RUNNING', 'QUEUED')
         ORDER BY created_at DESC`,
      )
      .all(...locationIds);
    return rows[0];
  }

  planRecovery(job: JobRow, ownerId: string, context: RecoveryContext, ttlMs = 300000): RecoveryPlan {
    const leaseResult = this.leases.acquire(job.id, ownerId, ttlMs, `recovery-${process.pid}`);
    if (leaseResult.previous_owner_alive) {
      this.db
        .prepare("UPDATE test_jobs SET lifecycle = 'INTERRUPTED', updated_at = ?, row_version = row_version + 1 WHERE id = ? AND lifecycle = 'RUNNING'")
        .run(Date.now(), job.id);
    }

    const checkpointId = this.checkpoints.bestCheckpoint(job.id);
    let checkpointValid = false;
    let sourceChanged = false;

    if (checkpointId) {
      const verification = this.checkpoints.verifyCheckpoint(checkpointId);
      checkpointValid = verification.valid;
    }

    if (job.source_snapshot_id) {
      const snapshotRow = this.db
        .prepare<[string], { dirty_digest: string | null }>("SELECT dirty_digest FROM project_snapshots WHERE id = ?")
        .get(job.source_snapshot_id);
      const recordedDirty = snapshotRow?.dirty_digest ?? null;
      if (recordedDirty && context.current_source_digest && recordedDirty !== context.current_source_digest) {
        sourceChanged = true;
      }
    }

    if (sourceChanged) {
      this.db
        .prepare("UPDATE test_jobs SET lifecycle = 'INTERRUPTED', outcome = 'SOURCE_CHANGED', updated_at = ?, row_version = row_version + 1 WHERE id = ?")
        .run(Date.now(), job.id);
      return {
        job,
        action: "rebaseline",
        checkpoint_id: checkpointValid ? checkpointId : null,
        source_changed: true,
        reason: "Kaynak fingerprint degisti; stale olcum isaretlendi, kontrollu rebaseline icin yeni job revision gerekiyor",
        stale_coverage_marked: true,
      };
    }

    if (checkpointId && !checkpointValid) {
      return {
        job,
        action: "fresh_start",
        checkpoint_id: null,
        source_changed: false,
        reason: "Checkpoint manifest/blob dogrulanamadi; onceki guvenilir checkpoint kullanilamaz, acik recovery tani ile yeni baslangic",
        stale_coverage_marked: false,
      };
    }

    return {
      job,
      action: checkpointId ? "resume" : "fresh_start",
      checkpoint_id: checkpointValid ? checkpointId : null,
      source_changed: false,
      reason: checkpointId ? "Checkpoint dogrulandi; ayni job'dan devam" : "Dogrulanmis checkpoint yok; yeni baslangic",
      stale_coverage_marked: false,
    };
  }
}
