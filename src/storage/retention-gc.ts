/**
 * FIN12/14.4/18.5/PRO26: Retention ve GC - iki asamali (dry-run inventory -> onayli sweep).
 * Active/paused/interrupted job'un son trusted/best checkpoint'i, release kaniti veya backup
 * manifest'inin referanslari SILINEMEZ. Rejected/untrusted/gecici artifacts icin configurable TTL.
 */
import { existsSync, lstatSync, rmSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep as pathSep } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { acquireMaintenanceLock } from "./maintenance-lock.js";
import { AppError } from "../domain/errors.js";

export interface RetentionPolicy {
  /** Rejected/untrusted artifact TTL (ms) */
  rejected_ttl_ms: number;
  /** Gecici artifact TTL (ms) */
  temp_ttl_ms: number;
  /** Maksimum store byte butcesi; asimda en eski silinebilir aday */
  max_store_bytes: number;
}

export function defaultRetentionPolicy(): RetentionPolicy {
  return {
    rejected_ttl_ms: 7 * 24 * 60 * 60 * 1000,
    temp_ttl_ms: 24 * 60 * 60 * 1000,
    max_store_bytes: 10 * 1024 * 1024 * 1024,
  };
}

export interface GcCandidate {
  artifact_id: string;
  kind: string;
  relative_store_path: string;
  sha256: string;
  created_at: number;
  reason: string;
  pinned: boolean;
  snapshot?: { job_id: string | null; status: string; pin_reason: string | null; bytes: number };
}

export interface GcDryRunResult {
  candidates: GcCandidate[];
  pinned_count: number;
  total_bytes: number;
  policy?: RetentionPolicy;
}

/**
 * GC iki asamali: dry-run inventory -> refs/lease/pin kontrolu -> onayli sweep (14.4).
 * Active/paused/interrupted job'un son trusted/best checkpoint referanslari silinemez.
 */
export function gcDryRun(db: BetterSqlite3.Database, policy: RetentionPolicy): GcDryRunResult {
  const now = Date.now();
  const rows = db
    .prepare<[], { id: string; job_id: string | null; kind: string; relative_store_path: string; sha256: string; bytes: number; created_at: number; status: string; pin_reason: string | null }>(
      "SELECT id, job_id, kind, relative_store_path, sha256, bytes, created_at, status, pin_reason FROM artifacts",
    )
    .all();

  // best checkpoint manifest artifact'leri pin:
  const pinnedArtifactIds = new Set<string>(
    db
      .prepare<[], { manifest_artifact_id: string }>("SELECT manifest_artifact_id FROM checkpoints")
      .all()
      .map((r) => r.manifest_artifact_id),
  );
  for (const row of db.prepare<[], { artifact_id: string }>("SELECT artifact_id FROM checkpoint_blobs").all()) {
    pinnedArtifactIds.add(row.artifact_id);
  }
  // aktif job'larin tum artifact'leri pin:
  const activeJobIds = new Set<string>(
    db
      .prepare<[], { id: string }>("SELECT id FROM test_jobs WHERE lifecycle IN ('QUEUED', 'RUNNING', 'WAITING_INPUT', 'PAUSED', 'INTERRUPTED') OR apply_state = 'APPLYING'")
      .all()
      .map((r) => r.id),
  );

  const candidates: GcCandidate[] = [];
  let pinnedCount = 0;
  let totalBytes = 0;
  for (const row of rows) {
    totalBytes += row.bytes;
    const isPinned = row.pin_reason !== null || pinnedArtifactIds.has(row.id) || (row.job_id !== null && activeJobIds.has(row.job_id));
    if (isPinned) {
      pinnedCount++;
      continue;
    }
    if (row.status !== "READY" && row.status !== "QUARANTINED") continue;
    const age = now - row.created_at;
    const reason =
      row.kind === "temp" ? (age > policy.temp_ttl_ms ? "TEMP_TTL_EXPIRED" : null) : age > policy.rejected_ttl_ms ? "REJECTED_TTL_EXPIRED" : null;
    if (reason === null) {
      continue;
    }
    candidates.push({ artifact_id: row.id, kind: row.kind, relative_store_path: row.relative_store_path, sha256: row.sha256,
      created_at: row.created_at, reason, pinned: false,
      snapshot: { job_id: row.job_id, status: row.status, pin_reason: row.pin_reason, bytes: row.bytes } });
  }
  return { candidates, pinned_count: pinnedCount, total_bytes: totalBytes, policy: { ...policy } };
}

export interface GcSweepResult {
  swept: Array<{ artifact_id: string; relative_store_path: string }>;
  skipped_pinned: number;
  artifact_root: string;
}

/**
 * Onayli sweep: dry-run candidates'tan blob dosyalarini kaldirir; DB satiri DELETED isaretlenir.
 * Active/pinned ref silinmez (14.4); silme islemi audit kaydi birakir (event).
 */
export function gcSweep(db: BetterSqlite3.Database, dryRun: GcDryRunResult, artifactRoot: string): GcSweepResult {
  const release = acquireMaintenanceLock(artifactRoot, "gc");
  try {
  const root = resolve(artifactRoot);
  const safeBlobPath = (relativePath: string): string => {
    const segments = relativePath.split("/");
    const path = resolve(root, relativePath.replace(/\//g, pathSep));
    const fromRoot = relative(root, path);
    const basename = segments.at(-1)?.toLowerCase() ?? "";
    const control = basename === ".aitest-maintenance.lock" ||
      /^\.aitest-maintenance\.lock\.sqlite(?:-journal|-wal|-shm)?$/.test(basename);
    if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[. ]$/.test(segment)) ||
        /[\\:<>"|?*]/.test(relativePath) || isAbsolute(fromRoot) ||
        fromRoot === ".." || fromRoot.startsWith(`..${pathSep}`) || control) {
      throw new AppError("POLICY_VIOLATION", "GC candidate path is unsafe", {
        reason_code: "GC_UNSAFE_BLOB_PATH", relative_store_path: relativePath,
      });
    }
    let cursor = root;
    for (const [index, segment] of segments.entries()) {
      cursor = resolve(cursor, segment);
      let entry: ReturnType<typeof lstatSync> | undefined;
      try { entry = lstatSync(cursor); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new AppError("POLICY_VIOLATION", "GC candidate path could not be inspected", {
            reason_code: "GC_UNSAFE_BLOB_PATH", relative_store_path: relativePath,
          });
        }
      }
      if (entry && (entry.isSymbolicLink() || (index < segments.length - 1 && !entry.isDirectory()) ||
          (index === segments.length - 1 && !entry.isFile()))) {
        throw new AppError("POLICY_VIOLATION", "GC candidate path contains a reparse point or collision", {
          reason_code: "GC_UNSAFE_BLOB_PATH", relative_store_path: relativePath,
        });
      }
    }
    return path;
  };
  const paths = dryRun.candidates.map((candidate) => safeBlobPath(candidate.relative_store_path));
  if (!dryRun.policy || dryRun.candidates.some((candidate) => !candidate.snapshot)) {
    throw new AppError("POLICY_VIOLATION", "GC dry-run lacks a current identity snapshot", { reason_code: "GC_STALE_DRY_RUN" });
  }
  const sweep = db.transaction((): GcSweepResult => {
    // BEGIN IMMEDIATE prevents another DB writer from pinning/reassigning an artifact
    // between this revalidation and file removal.
    const fresh = gcDryRun(db, dryRun.policy!);
    const current = new Map(fresh.candidates.map((candidate) => [candidate.artifact_id, candidate]));
    const liveReferences = db.prepare<[], { id: string; relative_store_path: string }>(
      "SELECT id, relative_store_path FROM artifacts WHERE status <> 'DELETED'",
    ).all();
    // NTFS can resolve case variants and hard links to the same physical blob.
    // Check every live reference under the write transaction, not SQL binary path equality.
    const referencedFiles = liveReferences.map((row) => {
      const path = safeBlobPath(row.relative_store_path);
      let identity: { dev: number; ino: number } | null = null;
      try {
        const entry = statSync(path);
        identity = { dev: entry.dev, ino: entry.ino };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return { ...row, path, identity };
    });
    const ownFiles = new Map(referencedFiles.map((entry) => [entry.id, entry]));
    for (const candidate of dryRun.candidates) {
      const now = current.get(candidate.artifact_id);
      const old = candidate.snapshot!;
      const next = now?.snapshot;
      const own = ownFiles.get(candidate.artifact_id);
      if (!now || !next || candidate.pinned || now.kind !== candidate.kind ||
          now.relative_store_path !== candidate.relative_store_path || now.sha256 !== candidate.sha256 ||
          now.created_at !== candidate.created_at || now.reason !== candidate.reason ||
          next.job_id !== old.job_id || next.status !== old.status || next.pin_reason !== old.pin_reason ||
          next.bytes !== old.bytes || !own || referencedFiles.some((other) => {
            if (other.id === candidate.artifact_id) return false;
            return other.path.toLowerCase() === own.path.toLowerCase() ||
              (own.identity !== null && other.identity !== null &&
                own.identity.dev === other.identity.dev && own.identity.ino === other.identity.ino);
          })) {
        throw new AppError("POLICY_VIOLATION", "GC dry-run candidate changed or became pinned", {
          reason_code: "GC_STALE_DRY_RUN", artifact_id: candidate.artifact_id,
        });
      }
    }
    const update = db.prepare<[string, string]>("UPDATE artifacts SET status = 'DELETED' WHERE id = ? AND status = ?");
    const swept: GcSweepResult["swept"] = [];
    for (const candidate of dryRun.candidates) {
      if (update.run(candidate.artifact_id, candidate.snapshot!.status).changes !== 1) {
        throw new AppError("POLICY_VIOLATION", "GC artifact status changed", {
          reason_code: "GC_STALE_DRY_RUN", artifact_id: candidate.artifact_id,
        });
      }
      swept.push({ artifact_id: candidate.artifact_id, relative_store_path: candidate.relative_store_path });
    }
    return { swept, skipped_pinned: fresh.pinned_count, artifact_root: artifactRoot };
  });
  // Commit all DELETED markers before unlinking any blob. A later unlink error
  // leaves an orphan, rather than rolling a missing blob back to READY.
  const result = sweep.immediate();
  const unlink = db.transaction(() => {
    // A raw SQLite writer may have added a new reference after the DELETED commit.
    // Recheck under a fresh write lock, then hold it through every unlink.
    const liveReferences = db.prepare<[], { relative_store_path: string }>(
      "SELECT relative_store_path FROM artifacts WHERE status <> 'DELETED'",
    ).all().map((row) => {
      const path = safeBlobPath(row.relative_store_path);
      const entry = existsSync(path) ? statSync(path) : null;
      return { path, identity: entry ? { dev: entry.dev, ino: entry.ino } : null };
    });
    const current = db.prepare<[string], { relative_store_path: string; sha256: string; bytes: number; status: string }>(
      "SELECT relative_store_path, sha256, bytes, status FROM artifacts WHERE id = ?",
    );
    for (const [index, candidate] of dryRun.candidates.entries()) {
      const row = current.get(candidate.artifact_id);
      const path = safeBlobPath(candidate.relative_store_path);
      const entry = existsSync(path) ? statSync(path) : null;
      if (!row || row.status !== "DELETED" || row.relative_store_path !== candidate.relative_store_path ||
          row.sha256 !== candidate.sha256 || row.bytes !== candidate.snapshot!.bytes || path !== paths[index] ||
          liveReferences.some((other) => other.path.toLowerCase() === path.toLowerCase() ||
            (entry && other.identity && entry.dev === other.identity.dev && entry.ino === other.identity.ino))) {
        throw new AppError("POLICY_VIOLATION", "GC reference changed before unlink", {
          reason_code: "GC_STALE_DRY_RUN", artifact_id: candidate.artifact_id,
        });
      }
    }
    for (const blobPath of paths) {
      if (existsSync(blobPath)) rmSync(blobPath, { force: true });
    }
  });
  unlink.immediate();
  return result;
  } finally {
    release();
  }
}
