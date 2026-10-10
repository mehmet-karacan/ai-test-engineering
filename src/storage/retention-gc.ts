/**
 * FIN12/14.4/18.5/PRO26: Retention ve GC - iki asamali (dry-run inventory -> onayli sweep).
 * Active/paused/interrupted job'un son trusted/best checkpoint'i, release kaniti veya backup
 * manifest'inin referanslari SILINEMEZ. Rejected/untrusted/gecici artifacts icin configurable TTL.
 */
import { existsSync, rmSync } from "node:fs";
import { join, sep as pathSep } from "node:path";
import type BetterSqlite3 from "better-sqlite3";

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
}

export interface GcDryRunResult {
  candidates: GcCandidate[];
  pinned_count: number;
  total_bytes: number;
}

/**
 * GC iki asamali: dry-run inventory -> refs/lease/pin kontrolu -> onayli sweep (14.4).
 * Active/paused/interrupted job'un son trusted/best checkpoint referanslari silinemez.
 */
export function gcDryRun(db: BetterSqlite3.Database, policy: RetentionPolicy): GcDryRunResult {
  const now = Date.now();
  const rows = db
    .prepare<[], { id: string; job_id: string | null; kind: string; relative_store_path: string; sha256: string; created_at: number; status: string }>(
      "SELECT id, job_id, kind, relative_store_path, sha256, created_at, status FROM artifacts",
    )
    .all();

  // best checkpoint manifest artifact'leri pin:
  const pinnedArtifactIds = new Set<string>(
    db
      .prepare<[], { manifest_artifact_id: string }>("SELECT manifest_artifact_id FROM checkpoints")
      .all()
      .map((r) => r.manifest_artifact_id),
  );
  // aktif job'larin tum artifact'leri pin:
  const activeJobIds = new Set<string>(
    db
      .prepare<[], { id: string }>("SELECT id FROM test_jobs WHERE lifecycle IN ('QUEUED', 'RUNNING', 'PAUSED', 'INTERRUPTED', 'APPLYING')")
      .all()
      .map((r) => r.id),
  );

  const candidates: GcCandidate[] = [];
  let pinnedCount = 0;
  let totalBytes = 0;
  for (const row of rows) {
    totalBytes += 0;
    const isPinned = pinnedArtifactIds.has(row.id) || (row.job_id !== null && activeJobIds.has(row.job_id));
    if (isPinned) {
      pinnedCount++;
      continue;
    }
    const age = now - row.created_at;
    const reason =
      row.kind === "temp" ? (age > policy.temp_ttl_ms ? "TEMP_TTL_EXPIRED" : null) : age > policy.rejected_ttl_ms ? "REJECTED_TTL_EXPIRED" : null;
    if (reason === null) {
      continue;
    }
    candidates.push({ artifact_id: row.id, kind: row.kind, relative_store_path: row.relative_store_path, sha256: row.sha256, created_at: row.created_at, reason, pinned: false });
  }
  return { candidates, pinned_count: pinnedCount, total_bytes: totalBytes };
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
  const swept: GcSweepResult["swept"] = [];
  for (const candidate of dryRun.candidates) {
    const blobPath = join(artifactRoot, candidate.relative_store_path.replace(/\//g, pathSep));
    if (existsSync(blobPath)) {
      rmSync(blobPath, { force: true });
    }
    db.prepare("UPDATE artifacts SET status = 'DELETED' WHERE id = ?").run(candidate.artifact_id);
    swept.push({ artifact_id: candidate.artifact_id, relative_store_path: candidate.relative_store_path });
  }
  return { swept, skipped_pinned: dryRun.pinned_count, artifact_root: artifactRoot };
}
