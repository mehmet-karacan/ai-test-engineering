/**
 * Recovery algoritmasi: kesintiden sonra ayni job'dan devam.
 * 1. Uygun yarim isi bul  2. Lease/fence al  3. DB/checkpoint/blob dogrula
 * 4. Kaynak identity kontrol (R04/PP11: null/bilinmeyen degismeyen kaynak degil)
 * 5. Degisiklik yoksa devam; degistiyse SOURCE_CHANGED.
 *
 * PR03/P03: recorded kaynak identity son trusted checkpoint manifest'inden gelir
 * (source_digest/head_commit/build_digest/dirty_digest). Checkpoint blob'suz veya
 * manifest kabul digest'lerinden eksik ise resume verilmez.
 */
import type BetterSqlite3 from "better-sqlite3";
import { LeaseManager } from "./lease-manager.js";
import { CheckpointStore, type CheckpointManifest } from "./checkpoint-store.js";
import type { JobRow } from "../storage/job-repository.js";
import { computeSourceChange, type SourceIdentity } from "../discovery/source-snapshot.js";

export interface RecoveryPlan {
  job: JobRow;
  action: "resume" | "rebaseline" | "fresh_start";
  checkpoint_id: string | null;
  source_changed: boolean;
  reason: string;
  stale_coverage_marked: boolean;
  /** P03/PP15: dogrulanmis checkpoint manifest'i (butce/iteration/kontrat kaynagi). */
  checkpoint_manifest: CheckpointManifest | null;
}

export interface RecoveryContext {
  /** P03: guncel source identity (computeSourceIdentity sonucu). */
  current_identity: SourceIdentity;
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
    // R01/R05/PP04-PP06: saglikli baska owner varken acquire typed olarak ATTA'da
    // reddedilir (lesse-manager). Mevcut is INTERRUPTED/FAILED yapilmaz; owner/
    // token/pointer degismez ve bu yontem atilir.
    this.leases.acquire(job.id, ownerId, ttlMs, `recovery-${process.pid}`);

    const checkpointId = this.checkpoints.bestCheckpoint(job.id);
    let checkpointValid = false;
    let manifest: CheckpointManifest | null = null;

    if (checkpointId) {
      const verification = this.checkpoints.verifyCheckpoint(checkpointId);
      checkpointValid = verification.valid;
      manifest = verification.manifest;
    }

    // P03/PP11: kaynak degisim kontrolu recorded identity ile yapilir. Kayit sirasi:
    // 1) dogrulanmis checkpoint manifest (trusted resume yolu),
    // 2) job.source_snapshot_id -> source_identities (P03 tam identity),
    // 3) job.source_snapshot_id -> project_snapshots (legacy; source_digest bilinmez
    //    sayilir). Null/bilinmeyen recorded alan "degismeyen kaynak" sayilmaz (R04).
    let recordedIdentity: SourceIdentity | null = null;
    if (checkpointValid && manifest) {
      recordedIdentity = {
        head_commit: manifest.head_commit,
        dirty: manifest.dirty_digest !== null,
        dirty_digest: manifest.dirty_digest,
        source_digest: manifest.source_digest ?? "",
        build_digest: manifest.build_digest ?? "",
      };
    } else if (job.source_snapshot_id) {
      const identityRow = this.db
        .prepare<[string], { head_commit: string | null; dirty_digest: string | null; source_digest: string; build_digest: string }>(
          "SELECT head_commit, dirty_digest, source_digest, build_digest FROM source_identities WHERE snapshot_id = ?",
        )
        .get(job.source_snapshot_id);
      if (identityRow) {
        recordedIdentity = {
          head_commit: identityRow.head_commit,
          dirty: identityRow.dirty_digest !== null,
          dirty_digest: identityRow.dirty_digest,
          source_digest: identityRow.source_digest,
          build_digest: identityRow.build_digest,
        };
      } else {
        const legacy = this.db
          .prepare<[string], { head_commit: string | null; dirty_digest: string | null; build_digest: string | null }>(
            "SELECT head_commit, dirty_digest, build_digest FROM project_snapshots WHERE id = ?",
          )
          .get(job.source_snapshot_id);
        if (legacy) {
          // Legacy kayit tam source identity tasimaz: source_digest bilinmiyor ->
          // fail-closed (computeSourceChange degisim sayar).
          recordedIdentity = {
            head_commit: legacy.head_commit,
            dirty: legacy.dirty_digest !== null,
            dirty_digest: legacy.dirty_digest,
            source_digest: "",
            build_digest: legacy.build_digest ?? "",
          };
        }
      }
    }

    let sourceChanged = false;
    let sourceReasons: string[] = [];
    if (recordedIdentity) {
      const change = computeSourceChange(recordedIdentity, context.current_identity);
      sourceChanged = change.changed;
      sourceReasons = change.reasons;
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
        reason: `Kaynak identity degisti (${sourceReasons.join(",")}); stale olcum isaretlendi, kontrollu rebaseline icin yeni job revision gerekiyor`,
        stale_coverage_marked: true,
        checkpoint_manifest: manifest,
      };
    }

    if (checkpointId && !checkpointValid) {
      return {
        job,
        action: "fresh_start",
        checkpoint_id: null,
        source_changed: false,
        reason: "Checkpoint manifest/accepted blob dogrulanamadi; onceki guvenilir checkpoint kullanilamaz, acik recovery tani ile yeni baslangic",
        stale_coverage_marked: false,
        checkpoint_manifest: null,
      };
    }

    return {
      job,
      action: checkpointId ? "resume" : "fresh_start",
      checkpoint_id: checkpointValid ? checkpointId : null,
      source_changed: false,
      reason: checkpointId
        ? "Checkpoint + accepted blob + source identity dogrulandi; ayni job'dan devam"
        : "Dogrulanmis checkpoint yok; yeni baslangic",
      stale_coverage_marked: false,
      checkpoint_manifest: manifest,
    };
  }
}
