/**
 * Checkpoint yonetimi: atomic publish protokolu.
 * 1. tmp dosyaya yaz + hash/schema dogrula  2. content-addressed konuma atomic rename
 * 3. manifest blob publish  4. kisa DB transaction ile lease fence + parent generation kontrolu, pointer commit.
 * Partial file READY olmaz.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";

export interface CheckpointManifest {
  schema_version: 1;
  job_id: string;
  project_id: string;
  location_id: string;
  target_ids: string[];
  user_goal: string;
  source_snapshot_id: string | null;
  head_commit: string | null;
  dirty_digest: string | null;
  build_digest: string | null;
  policy_digest: string | null;
  parser_version: string;
  toolchain: Record<string, string>;
  accepted_changes: Array<{ path: string; sha256: string; action: string }>;
  parent_checkpoint_id: string | null;
  baseline_run_id: string | null;
  last_trusted_run_id: string | null;
  active_phase: string;
  next_action: string;
  remaining_budget: Record<string, number>;
  requested_model: string | null;
  resolved_model: string | null;
  worker_session_ref: string | null;
  generation: number;
  created_at: number;
}

export class CheckpointStore {
  private readonly db: BetterSqlite3.Database;
  private readonly checkpointDir: string;
  private readonly blobDir: string;

  constructor(db: BetterSqlite3.Database, baseDir: string) {
    this.db = db;
    this.checkpointDir = join(baseDir, "checkpoints");
    this.blobDir = join(baseDir, "blobs", "sha256");
    mkdirSync(this.checkpointDir, { recursive: true });
    mkdirSync(this.blobDir, { recursive: true });
  }

  private blobPath(sha256: string): string {
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz sha256: ${sha256.slice(0, 8)}...`);
    }
    return join(this.blobDir, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  }

  private publishBlob(data: string): { sha256: string; bytes: number } {
    const hash = createHash("sha256").update(data, "utf8").digest("hex");
    const target = this.blobPath(hash);
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf8");
      if (createHash("sha256").update(existing).digest("hex") !== hash) {
        throw new AppError("STORAGE_ERROR", "Mevcut blob hash uyusmazligi");
      }
      return { sha256: hash, bytes: Buffer.byteLength(data, "utf8") };
    }
    mkdirSync(join(target, ".."), { recursive: true });
    const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmpPath, data, "utf8");
    try {
      renameSync(tmpPath, target);
    } catch {
      // Windows dosya kilidi/AV: bounded retry
      let renamed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          renameSync(tmpPath, target);
          renamed = true;
          break;
        } catch {
          // kisa bekle
        }
      }
      if (!renamed) {
        rmSync(tmpPath, { force: true });
        throw new AppError("STORAGE_ERROR", "Blob publish rename basarisiz (Windows kilidi)");
      }
    }
    return { sha256: hash, bytes: Buffer.byteLength(data, "utf8") };
  }

  publishCheckpoint(
    manifest: CheckpointManifest,
    lease: { owner_id: string; fencing_token: number } | null,
    expectedParentGeneration: number | null,
  ): { checkpoint_id: string; manifest_sha256: string } {
    if (manifest.schema_version !== 1) {
      throw new AppError("INVALID_PARAMETERS", `Manifest schema surumu desteklenmiyor: ${manifest.schema_version}`);
    }
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestBlob = this.publishBlob(manifestJson);
    const checkpointId = randomUUID();

    const tx = this.db.transaction((): { checkpoint_id: string; manifest_sha256: string } => {
      if (lease) {
        const leaseRow = this.db
          .prepare<[string, string], { fencing_token: number }>("SELECT fencing_token FROM job_leases WHERE job_id = ? AND owner_id = ?")
          .get(manifest.job_id, lease.owner_id);
        if (!leaseRow || leaseRow.fencing_token !== lease.fencing_token) {
          throw new AppError("POLICY_VIOLATION", "Lease fence gecersiz; checkpoint publish reddedildi", { reason_code: "STALE_FENCE" });
        }
      }

      if (expectedParentGeneration !== null) {
        const parentRow = manifest.parent_checkpoint_id
          ? this.db
              .prepare<[string], { generation: number }>("SELECT generation FROM checkpoints WHERE id = ?")
              .get(manifest.parent_checkpoint_id)
          : undefined;
        if (parentRow && parentRow.generation !== expectedParentGeneration) {
          throw new AppError("POLICY_VIOLATION", "Parent generation cakismasi; checkpoint publish reddedildi", { reason_code: "GENERATION_CONFLICT" });
        }
      }

      const artifactId = randomUUID();
      this.db
        .prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', 'checkpoint_manifest', ?)")
        .run(artifactId, manifest.job_id, "checkpoint_manifest", `blobs/sha256/${manifestBlob.sha256.slice(0, 2)}/${manifestBlob.sha256.slice(2, 4)}/${manifestBlob.sha256}`, manifestBlob.sha256, manifestBlob.bytes, manifest.created_at);

      this.db
        .prepare(
          "INSERT INTO checkpoints (id, job_id, parent_checkpoint_id, iteration_id, manifest_artifact_id, source_digest, verification_level, generation, kind, created_at) VALUES (?, ?, ?, NULL, ?, ?, 'UNVERIFIED', ?, 'tested', ?)",
        )
        .run(
          checkpointId,
          manifest.job_id,
          manifest.parent_checkpoint_id,
          artifactId,
          manifest.source_snapshot_id ?? "unknown",
          manifest.generation,
          manifest.created_at,
        );

      this.db
        .prepare("UPDATE test_jobs SET best_checkpoint_id = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?")
        .run(checkpointId, Date.now(), manifest.job_id);

      return { checkpoint_id: checkpointId, manifest_sha256: manifestBlob.sha256 };
    });

    return tx();
  }

  verifyCheckpoint(checkpointId: string): { valid: boolean; manifest: CheckpointManifest | null; reason?: string } {
    const row = this.db
      .prepare<[string], { manifest_artifact_id: string; manifest_sha256: string }>(
        `SELECT c.manifest_artifact_id, a.sha256 AS manifest_sha256 FROM checkpoints c JOIN artifacts a ON a.id = c.manifest_artifact_id WHERE c.id = ?`,
      )
      .get(checkpointId);
    if (!row) {
      return { valid: false, manifest: null, reason: "CHECKPOINT_YOK" };
    }
    const blobPath = this.blobPath(row.manifest_sha256);
    if (!existsSync(blobPath)) {
      return { valid: false, manifest: null, reason: "BLOB_EKSIK" };
    }
    const content = readFileSync(blobPath, "utf8");
    const actualHash = createHash("sha256").update(content).digest("hex");
    if (actualHash !== row.manifest_sha256) {
      return { valid: false, manifest: null, reason: "BLOB_BOZUK" };
    }
    let manifest: CheckpointManifest;
    try {
      manifest = JSON.parse(content) as CheckpointManifest;
    } catch {
      return { valid: false, manifest: null, reason: "MANIFEST_PARSE_HATASI" };
    }
    if (manifest.schema_version !== 1) {
      return { valid: false, manifest: null, reason: "SCHEMA_SURUM_UYUMSUZ" };
    }
    return { valid: true, manifest };
  }

  bestCheckpoint(jobId: string): string | null {
    const row = this.db
      .prepare<[string], { best_checkpoint_id: string | null }>("SELECT best_checkpoint_id FROM test_jobs WHERE id = ?")
      .get(jobId);
    return row?.best_checkpoint_id ?? null;
  }
}
