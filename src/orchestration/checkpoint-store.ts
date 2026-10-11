/**
 * Checkpoint yonetimi: atomic publish protokolu.
 * 1. tmp dosyaya yaz + hash/schema dogrula  2. content-addressed konuma atomic rename
 * 3. manifest + accepted blob publish  4. kisa DB transaction ile lease fence +
 *    GERCEK best pointer/generation CAS + lifecycle/row version, pointer commit.
 * Partial file READY olmaz.
 *
 * PR03/P03:
 * - Accepted dosyalar immutable content-addressed blob olarak yayinlanir; manifest
 *   her dosyayi action/byte/hash ile esler, blob kaydi checkpoint'le ayni
 *   transaction'da baglanir. verifyCheckpoint accepted blob varligi/hash/boyutunu
 *   dogrulamadan trusted kabul etmez (R03/PP10).
 * - Best pointer ilerlemesi GERCEK best pointer'in generation'ina yapilan CAS ile
 *   korunur: parent gercek best pointer olmali, baska job'a ait olamasi ve
 *   generation monotone artmali (R06/PP13). Stale parent publish head'i ezemez.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
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
  /** P03: TUM dosyalarin sirali canonical path+byte digest'i (null degil). */
  source_digest: string;
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

/** P03: immutable accepted content blob kaydi (manifest accepted_changes ile eslesir). */
export interface AcceptedBlob {
  path: string;
  sha256: string;
  bytes: number;
  action: string;
}

/** P03/PP15: checkpoint manifest'inden kalici resume butce/tursu. */
export interface ResumeBudget {
  remaining_iterations: number;
  remaining_repairs: number;
  no_progress_window: number;
  start_iteration: number;
}

function safeAcceptedParts(path: string): string[] {
  if (path.length === 0 || path.includes("\\") || path.includes("\0") || isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)) {
    throw new AppError("POLICY_VIOLATION", `Accepted yolu gecersiz: ${path}`, { reason_code: "PATH_ESCAPE" });
  }
  const parts = path.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new AppError("POLICY_VIOLATION", `Accepted yolu containment disi: ${path}`, { reason_code: "PATH_ESCAPE" });
  }
  return parts;
}

function safeJobId(jobId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new AppError("INVALID_PARAMETERS", `Gecersiz job kimligi: ${jobId}`, { reason_code: "INVALID_JOB_ID" });
  }
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * P03/PP15: butce checkpoint manifest'inden okunur; config butcesi resume'da
 * sifirlamaz. Eksik/gecersiz alan 0 olarak alinir (sessiz config fallback yok).
 */
export function resumeBudgetFromManifest(
  manifest: CheckpointManifest,
  _configBudgets: { max_candidate_iterations: number; max_repairs_per_candidate: number; no_progress_window: number },
): ResumeBudget {
  const rb = manifest.remaining_budget ?? {};
  const clamp = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
  return {
    remaining_iterations: clamp(rb["max_candidate_iterations"]),
    remaining_repairs: clamp(rb["max_repairs_per_candidate"]),
    no_progress_window: clamp(rb["no_progress_window"]),
    start_iteration: typeof manifest.generation === "number" && manifest.generation >= 1 ? manifest.generation + 1 : 1,
  };
}

export class CheckpointStore {
  private readonly db: BetterSqlite3.Database;
  private readonly checkpointDir: string;
  private readonly blobDir: string;
  private readonly acceptedBlobDir: string;

  constructor(db: BetterSqlite3.Database, baseDir: string) {
    this.db = db;
    this.checkpointDir = join(baseDir, "checkpoints");
    this.blobDir = join(baseDir, "blobs", "sha256");
    this.acceptedBlobDir = join(baseDir, "blobs", "accepted");
    mkdirSync(this.checkpointDir, { recursive: true });
    mkdirSync(this.blobDir, { recursive: true });
    mkdirSync(this.acceptedBlobDir, { recursive: true });
  }

  private blobPath(sha256: string): string {
    return join(this.blobDir, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  }

  /**
   * P03: accepted blob dosya yolu job'a ozeldir (blobs/accepted/<job_id>/...).
   * Content-addressed isimleme korunur; job sahiplig yolu ile kanitlanir (GC sweep
   * yalniz o job'un kendi kopyasini kaldirabilir; job A job B blob'unu bozamaz).
   */
  private acceptedBlobPath(jobId: string, sha256: string): string {
    safeJobId(jobId);
    return join(this.acceptedBlobDir, jobId, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  }

  private publishBlobTo(dir: string, data: string): { sha256: string; bytes: number } {
    const hash = sha256Hex(data);
    const target = join(dir, hash.slice(0, 2), hash.slice(2, 4), hash);
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf8");
      if (sha256Hex(existing) !== hash) {
        throw new AppError("STORAGE_ERROR", "Mevcut blob hash uyusmazligi", { reason_code: "BLOB_CORRUPT" });
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

  private publishBlob(data: string): { sha256: string; bytes: number } {
    return this.publishBlobTo(this.blobDir, data);
  }

  /**
   * P03/R03: accepted dosyalari immutable content-addressed blob olarak yayinlar.
   * content/hash uyusmazligi publish oncesi reddedilir; hash'li dosya yalniz bir kez
   * yazilir (idempotent). delete action icin bos icerik sha256'si kullanilir.
   */
  publishAcceptedBlobs(jobId: string, files: Array<{ path: string; sha256: string; action: string; content?: string }>): AcceptedBlob[] {
    safeJobId(jobId);
    const published: AcceptedBlob[] = [];
    for (const file of files) {
      safeAcceptedParts(file.path);
      const isDelete = file.action === "delete";
      if (!isDelete && typeof file.content !== "string") {
        throw new AppError("INVALID_PARAMETERS", `Accepted dosya icerigi eksik: ${file.path}`, { reason_code: "ACCEPTED_CONTENT_MISSING" });
      }
      const content = isDelete ? "" : (file.content as string);
      const hash = sha256Hex(content);
      if (hash !== file.sha256) {
        throw new AppError("STORAGE_ERROR", `Accepted content hash uyusmazligi: ${file.path}`, { reason_code: "ACCEPTED_HASH_MISMATCH" });
      }
      this.publishBlobTo(join(this.acceptedBlobDir, jobId), content);
      published.push({ path: file.path, sha256: hash, bytes: Buffer.byteLength(content, "utf8"), action: file.action });
    }
    return published.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * P03: checkpoint'e bagli accepted blob envanteri (checkpoint_blobs baglantisi).
   * verifyCheckpoint manifest accepted_changes'i bu envanterle eslestirir.
   */
  private listAcceptedBlobArtifacts(checkpointId: string): Array<{ path: string; sha256: string; bytes: number; action: string }> {
    return this.db
      .prepare<[string], { blob_path: string; blob_sha256: string; bytes: number; action: string }>(
        "SELECT blob_path, blob_sha256, bytes, action FROM checkpoint_blobs WHERE checkpoint_id = ? ORDER BY blob_path",
      )
      .all(checkpointId)
      .map((row) => ({ path: row.blob_path, sha256: row.blob_sha256, bytes: row.bytes, action: row.action }));
  }

  publishCheckpoint(
    manifest: CheckpointManifest,
    lease: { owner_id: string; fencing_token: number } | null,
    expectedParentGeneration: number | null,
    acceptedBlobs: AcceptedBlob[] = [],
  ): { checkpoint_id: string; manifest_sha256: string } {
    if (manifest.schema_version !== 1) {
      throw new AppError("INVALID_PARAMETERS", `Manifest schema surumu desteklenmiyor: ${manifest.schema_version}`);
    }

    // P03/R03: manifest accepted_changes ile yayinlanan blob seti birebir eslesmeli.
    // Eksik accepted content sessiz sifirlanmaz; fazla/eksik/uyusmaz blob publish'i reddeder.
    const manifestByPath = new Map(manifest.accepted_changes.map((entry) => [entry.path, entry]));
    if (manifestByPath.size !== manifest.accepted_changes.length) {
      throw new AppError("INVALID_PARAMETERS", "Accepted manifest icinde mukerrer path var", { reason_code: "ACCEPTED_MANIFEST_DUPLICATE" });
    }
    for (const entry of manifest.accepted_changes) {
      safeAcceptedParts(entry.path);
    }
    const blobPaths = new Set<string>();
    for (const blob of acceptedBlobs) {
      safeAcceptedParts(blob.path);
      if (blobPaths.has(blob.path)) {
        throw new AppError("INVALID_PARAMETERS", `Mukerrer accepted blob: ${blob.path}`, { reason_code: "ACCEPTED_BLOB_DUPLICATE" });
      }
      blobPaths.add(blob.path);
      const entry = manifestByPath.get(blob.path);
      if (!entry) {
        throw new AppError("INVALID_PARAMETERS", `Accepted blob manifest kaydi yok: ${blob.path}`, { reason_code: "ACCEPTED_BLOB_UNMANIFESTED" });
      }
      if (entry.sha256 !== blob.sha256 || entry.action !== blob.action) {
        throw new AppError("INVALID_PARAMETERS", `Accepted blob/manifest uyusmazligi: ${blob.path}`, { reason_code: "ACCEPTED_BLOB_MISMATCH" });
      }
    }
    if (blobPaths.size !== manifestByPath.size) {
      throw new AppError("INVALID_PARAMETERS", "Accepted content eksik; manifest ile blob seti eslesmiyor", { reason_code: "ACCEPTED_CONTENT_MISSING" });
    }

    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestBlob = this.publishBlob(manifestJson);
    const checkpointId = randomUUID();

    const tx = this.db.transaction((): { checkpoint_id: string; manifest_sha256: string } => {
      const now = Date.now();
      if (lease) {
        // R02/PP05: fence = owner + token + gecerlilik (expires_at). Stale VEYA
        // expired lease accepted pointer'i ilerletemez.
        const leaseRow = this.db
          .prepare<[string, string], { fencing_token: number; expires_at: number }>("SELECT fencing_token, expires_at FROM job_leases WHERE job_id = ? AND owner_id = ?")
          .get(manifest.job_id, lease.owner_id);
        if (!leaseRow || leaseRow.fencing_token !== lease.fencing_token) {
          throw new AppError("POLICY_VIOLATION", "Lease fence gecersiz; checkpoint publish reddedildi", { reason_code: "STALE_FENCE" });
        }
        if (leaseRow.expires_at <= now) {
          throw new AppError("POLICY_VIOLATION", "Lease suresi doldu; checkpoint publish reddedildi", { reason_code: "LEASE_EXPIRED" });
        }
      }

      const jobRow = this.db
        .prepare<[string], { best_checkpoint_id: string | null; row_version: number }>(
          "SELECT best_checkpoint_id, row_version FROM test_jobs WHERE id = ?",
        )
        .get(manifest.job_id);

      // P03/R06: parent checkpoint var ise ayni job'a ait olmalidir.
      if (manifest.parent_checkpoint_id) {
        const parentRow = this.db
          .prepare<[string], { job_id: string; generation: number }>("SELECT job_id, generation FROM checkpoints WHERE id = ?")
          .get(manifest.parent_checkpoint_id);
        if (!parentRow) {
          throw new AppError("INVALID_PARAMETERS", "Parent checkpoint bulunamadi", { reason_code: "PARENT_NOT_FOUND" });
        }
        if (parentRow.job_id !== manifest.job_id) {
          throw new AppError("POLICY_VIOLATION", "Parent checkpoint baska job'a ait", { reason_code: "PARENT_FOREIGN_JOB" });
        }
        if (expectedParentGeneration !== null && parentRow.generation !== expectedParentGeneration) {
          throw new AppError("POLICY_VIOLATION", "Parent generation cakismasi; checkpoint publish reddedildi", { reason_code: "GENERATION_CONFLICT" });
        }
      }

      // P03/R06/PP13: expected generation/row CAS - pointer, bildirim degil GERCEK
      // best pointer'dan gelir. Parent gercek best pointer olmali (stale zincir
      // kabul edilmez), best varken generation monotone artmali.
      if (jobRow?.best_checkpoint_id) {
        const bestRow = this.db
          .prepare<[string], { job_id: string; generation: number }>("SELECT job_id, generation FROM checkpoints WHERE id = ?")
          .get(jobRow.best_checkpoint_id);
        if (!bestRow || bestRow.job_id !== manifest.job_id) {
          throw new AppError("STORAGE_ERROR", "Best pointer gecersiz checkpoint'e bakiyor", { reason_code: "BEST_POINTER_INVALID" });
        }
        if (manifest.parent_checkpoint_id !== jobRow.best_checkpoint_id) {
          throw new AppError("POLICY_VIOLATION", "Parent gercek best pointer degil; stale publish reddedildi", { reason_code: "STALE_PARENT" });
        }
        if (expectedParentGeneration !== null && bestRow.generation !== expectedParentGeneration) {
          throw new AppError("POLICY_VIOLATION", "Best pointer generation cakismasi; stale publish reddedildi", { reason_code: "GENERATION_CONFLICT" });
        }
        if (manifest.generation <= bestRow.generation) {
          throw new AppError("POLICY_VIOLATION", "Checkpoint generation best pointer'in gerisinde; pointer geri alinamaz", { reason_code: "GENERATION_CONFLICT" });
        }
      } else if (manifest.parent_checkpoint_id) {
        throw new AppError("POLICY_VIOLATION", "Best pointer yokken parent beyani; zincir bozuk", { reason_code: "STALE_PARENT" });
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

      // P03: accepted content blob'lar DB registry'ye + checkpoint baglantisiyla
      // manifest'le ayni transaction'da girer (crash atomicligi: partial blob
      // referansi DB'de kalamaz).
      for (const blob of acceptedBlobs) {
        const blobArtifactId = randomUUID();
        this.db
          .prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', ?, ?)")
          .run(blobArtifactId, manifest.job_id, "accepted_blob", `blobs/accepted/${manifest.job_id}/${blob.sha256.slice(0, 2)}/${blob.sha256.slice(2, 4)}/${blob.sha256}`, blob.sha256, blob.bytes, blob.action, manifest.created_at);
        this.db
          .prepare("INSERT INTO checkpoint_blobs (checkpoint_id, artifact_id, blob_path, blob_sha256, bytes, action) VALUES (?, ?, ?, ?, ?, ?)")
          .run(checkpointId, blobArtifactId, blob.path, blob.sha256, blob.bytes, blob.action);
      }

      // R02/PP05: pointer, beklenen row version ile CAS yapilir; uyusmazsa
      // stale/expired yazim accepted pointer'i ilerletemez (transaction rollback).
      const pointerUpdate = jobRow
        ? this.db
            .prepare("UPDATE test_jobs SET best_checkpoint_id = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?")
            .run(checkpointId, Date.now(), manifest.job_id, jobRow.row_version)
        : null;
      if (jobRow && pointerUpdate && pointerUpdate.changes === 0) {
        throw new AppError("POLICY_VIOLATION", "Job row version cakismasi; pointer ilerletilemedi", { reason_code: "ROW_VERSION_CONFLICT" });
      }

      return { checkpoint_id: checkpointId, manifest_sha256: manifestBlob.sha256 };
    });

    return tx();
  }

  verifyCheckpoint(checkpointId: string): { valid: boolean; manifest: CheckpointManifest | null; reason?: string } {
    const row = this.db
      .prepare<[string], { manifest_artifact_id: string; manifest_sha256: string; job_id: string }>(
        `SELECT c.manifest_artifact_id, a.sha256 AS manifest_sha256, c.job_id FROM checkpoints c JOIN artifacts a ON a.id = c.manifest_artifact_id WHERE c.id = ?`,
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
    if (manifest.job_id !== row.job_id) {
      return { valid: false, manifest, reason: "CHECKPOINT_JOB_UYUSMAZ" };
    }
    const manifestPaths = new Set<string>();
    for (const entry of manifest.accepted_changes) {
      if (manifestPaths.has(entry.path)) {
        return { valid: false, manifest, reason: "ACCEPTED_MANIFEST_DUPLICATE" };
      }
      manifestPaths.add(entry.path);
    }

    // P03/R03/PP10: accepted content-addressed blob'lar dogrulanmadan checkpoint
    // trusted/READY sayilmaz. Eksik/bozuk/boyut uyusmuzu blob -> invalid.
    const acceptedArtifacts = this.listAcceptedBlobArtifacts(checkpointId);
    const expectedByPath = new Map(manifest.accepted_changes.map((entry) => [entry.path, entry]));
    const seenPaths = new Set<string>();
    for (const artifact of acceptedArtifacts) {
      const entry = expectedByPath.get(artifact.path);
      if (!entry) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_UNKNOWN" };
      }
      seenPaths.add(artifact.path);
      if (artifact.sha256 !== entry.sha256) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_HASH" };
      }
      if (artifact.action !== entry.action) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_ACTION" };
      }
      const blobFile = this.acceptedBlobPath(row.job_id, artifact.sha256);
      if (!existsSync(blobFile)) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_EKSIK" };
      }
      const blobData = readFileSync(blobFile, "utf8");
      if (createHash("sha256").update(blobData).digest("hex") !== artifact.sha256) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_BOZUK" };
      }
      if (Buffer.byteLength(blobData, "utf8") !== artifact.bytes) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_BYTES" };
      }
    }
    for (const path of expectedByPath.keys()) {
      if (!seenPaths.has(path)) {
        return { valid: false, manifest, reason: "ACCEPTED_BLOB_EKSIK" };
      }
    }

    return { valid: true, manifest };
  }

  /**
   * P03: content-addressed accepted blob'lardan calisma alani'na geri yukler.
   * Eksik/bozuk blob hata verir; partial durum sessizce bos set kabul edilmez.
   */
  restoreAcceptedFiles(jobId: string, files: Array<{ path: string; sha256: string; action: string }>, targetDir: string): void {
    const absTarget = resolve(targetDir);
    for (const file of files) {
      const parts = safeAcceptedParts(file.path);
      const target = resolve(absTarget, ...parts);
      const rel = relative(absTarget, target);
      if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) {
        throw new AppError("POLICY_VIOLATION", `Accepted geri yukleme hedefi kok disina cikiyor: ${file.path}`, { reason_code: "PATH_ESCAPE" });
      }
      const blobFile = this.acceptedBlobPath(jobId, file.sha256);
      if (!existsSync(blobFile)) {
        throw new AppError("STORAGE_ERROR", `Accepted blob eksik: ${file.path}`, { reason_code: "ACCEPTED_BLOB_EKSIK" });
      }
      const data = readFileSync(blobFile, "utf8");
      if (createHash("sha256").update(data).digest("hex") !== file.sha256) {
        throw new AppError("STORAGE_ERROR", `Accepted blob bozuk: ${file.path}`, { reason_code: "ACCEPTED_BLOB_BOZUK" });
      }
      if (file.action === "delete") {
        rmSync(target, { force: true });
        continue;
      }
      mkdirSync(join(target, ".."), { recursive: true });
      const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmpPath, data, "utf8");
      try {
        renameSync(tmpPath, target);
      } catch {
        rmSync(tmpPath, { force: true });
        throw new AppError("STORAGE_ERROR", `Accepted geri yukleme rename basarisiz: ${file.path}`);
      }
    }
  }

  bestCheckpoint(jobId: string): string | null {
    const row = this.db
      .prepare<[string], { best_checkpoint_id: string | null }>("SELECT best_checkpoint_id FROM test_jobs WHERE id = ?")
      .get(jobId);
    return row?.best_checkpoint_id ?? null;
  }
}
