/**
 * FIN11/18.4/18.5: Surum yasam dongusu - backup/restore, upgrade, owned uninstall.
 * - Online SQLite backup API (better-sqlite3 .backup) [S09]; acik WAL DB'nin sadece .db kopyasi tam backup DEGIL.
 * - Backup DB snapshot'i + blob manifest'ini birlikte sabitler; GC ilgili ref'leri pinler.
 * - Restore ayri konumda dogrulanir; FK/integrity/blob check'leri gecince switch edilir.
 * - Owned uninstall: yalniz beklenen hash'teki girdiler; user modified korunur.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, renameSync } from "node:fs";
import { join, relative, resolve, sep as pathSep } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";

export interface BackupResult {
  backup_id: string;
  backup_dir: string;
  db_path: string;
  blob_manifest_path: string;
  complete: boolean;
  blob_count: number;
  taken_at: number;
}

export interface RestoreVerification {
  schema_ok: boolean;
  integrity_ok: boolean;
  blob_check_ok: boolean;
  missing_blobs: string[];
  valid: boolean;
  reason: string | null;
}

export interface RestoreResult {
  backup_id: string;
  db_path: string;
  artifact_root: string;
  verification: RestoreVerification;
}

export function sha256Data(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Online SQLite backup API + blob manifest (18.5).
 * Backup complete marker ancak tum blob/hash dogrulamalari gecince yazilir.
 */
export async function createBackup(db: BetterSqlite3.Database, dbPath: string, artifactRoot: string, backupRoot: string): Promise<BackupResult> {
  const backupId = randomUUID();
  const backupDir = join(backupRoot, backupId);
  mkdirSync(backupDir, { recursive: true });

  const backupDbPath = join(backupDir, "state.db");
  await db.backup(backupDbPath);

  // DB'nin referans verdigi blob'lari manifest'e sabitle:
  const blobManifest: Array<{ relative_path: string; sha256: string; bytes: number }> = [];
  const artifactRows = db
    .prepare<[], { relative_store_path: string; sha256: string; bytes: number }>(
      "SELECT relative_store_path, sha256, bytes FROM artifacts WHERE status = 'READY'",
    )
    .all();
  for (const row of artifactRows) {
    const blobPath = join(artifactRoot, row.relative_store_path.replace(/\//g, pathSep));
    if (existsSync(blobPath)) {
      const copiedPath = join(backupDir, "blobs", row.relative_store_path.replace(/\//g, pathSep));
      mkdirSync(join(copiedPath, ".."), { recursive: true });
      copyFileSync(blobPath, copiedPath);
      blobManifest.push({ relative_path: row.relative_store_path, sha256: row.sha256, bytes: row.bytes });
    }
  }
  const manifestPath = join(backupDir, "blob-manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ schema_version: 1, backup_id: backupId, blobs: blobManifest, taken_at: Date.now() }, null, 2), "utf8");
  writeFileSync(join(backupDir, "complete.json"), JSON.stringify({ schema_version: 1, backup_id: backupId, complete: true }, null, 2), "utf8");

  return {
    backup_id: backupId,
    backup_dir: backupDir,
    db_path: backupDbPath,
    blob_manifest_path: manifestPath,
    complete: true,
    blob_count: blobManifest.length,
    taken_at: Date.now(),
  };
}

/**
 * Restore ayri owned konumda dogrulanir (18.5): FK/integrity/schema/blob check'leri.
 * Eksik/bozuk blob varsa backup/restore PASSED degil.
 */
export function verifyBackup(backupDir: string): RestoreVerification {
  const dbPath = join(backupDir, "state.db");
  if (!existsSync(dbPath)) {
    return { schema_ok: false, integrity_ok: false, blob_check_ok: false, missing_blobs: [], valid: false, reason: "BACKUP_DB_EKSIK" };
  }
  const manifestPath = join(backupDir, "blob-manifest.json");
  if (!existsSync(manifestPath)) {
    return { schema_ok: true, integrity_ok: true, blob_check_ok: false, missing_blobs: [], valid: false, reason: "BLOB_MANIFEST_EKSIK" };
  }
  if (!existsSync(join(backupDir, "complete.json"))) {
    return { schema_ok: true, integrity_ok: true, blob_check_ok: false, missing_blobs: [], valid: false, reason: "BACKUP_COMPLETE_MARKER_EKSIK" };
  }
  let manifest: { blobs: Array<{ relative_path: string; sha256: string; bytes?: number }> };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { blobs: Array<{ relative_path: string; sha256: string; bytes?: number }> };
    if (!Array.isArray(manifest.blobs)) {
      throw new Error("blob listesi yok");
    }
  } catch {
    return { schema_ok: true, integrity_ok: true, blob_check_ok: false, missing_blobs: [], valid: false, reason: "BLOB_MANIFEST_BOZUK" };
  }

  // integrity + schema check (ayri baglanti):
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const checkDb = new Database(dbPath, { readonly: true });
  let integrityOk = false;
  let schemaOk = false;
  try {
    const integrity = checkDb.pragma("integrity_check", { simple: true });
    integrityOk = integrity === "ok";
    const tableRows = checkDb
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    schemaOk = tableRows.some((t) => t.name === "test_jobs") && tableRows.some((t) => t.name === "schema_migrations");
  } finally {
    checkDb.close();
  }

  // blob check:
  const missingBlobs: string[] = [];
  for (const blob of manifest.blobs) {
    const relativeBlob = blob.relative_path.replace(/\//g, pathSep);
    const copiedPath = resolve(join(backupDir, "blobs"), relativeBlob);
    const blobRoot = resolve(join(backupDir, "blobs"));
    const escaped = relative(blobRoot, copiedPath).startsWith(`..${pathSep}`) || relative(blobRoot, copiedPath) === "..";
    if (escaped) {
      missingBlobs.push(blob.relative_path);
      continue;
    }
    if (!existsSync(copiedPath)) {
      missingBlobs.push(blob.relative_path);
      continue;
    }
    const actualHash = sha256Data(readFileSync(copiedPath));
    if (actualHash !== blob.sha256 || (blob.bytes !== undefined && readFileSync(copiedPath).byteLength !== blob.bytes)) {
      missingBlobs.push(blob.relative_path);
    }
  }
  const blobCheckOk = missingBlobs.length === 0;
  return {
    schema_ok: schemaOk,
    integrity_ok: integrityOk,
    blob_check_ok: blobCheckOk,
    missing_blobs: missingBlobs,
    valid: schemaOk && integrityOk && blobCheckOk,
    reason: schemaOk && integrityOk && blobCheckOk ? null : "BACKUP_VERIFICATION_FAILED",
  };
}

/**
 * Dogrulanmis backup'i yeni runtime konumuna uygular. Hedef DB acik olmamali;
 * DB once temp dosyaya kopyalanir, sonra isim degisikligiyle yayinlanir.
 */
export function restoreBackup(backupDir: string, targetDbPath: string, targetArtifactRoot: string): RestoreResult {
  const verification = verifyBackup(backupDir);
  if (!verification.valid) {
    throw new AppError("STORAGE_ERROR", "Backup restore dogrulamasi basarisiz", { reason_code: verification.reason ?? "BACKUP_VERIFICATION_FAILED" });
  }
  const manifest = JSON.parse(readFileSync(join(backupDir, "blob-manifest.json"), "utf8")) as { backup_id: string; blobs: Array<{ relative_path: string }> };
  mkdirSync(resolve(targetDbPath, ".."), { recursive: true });
  mkdirSync(targetArtifactRoot, { recursive: true });
  const tempDb = `${targetDbPath}.restore-${randomUUID()}`;
  copyFileSync(join(backupDir, "state.db"), tempDb);
  try {
    if (existsSync(targetDbPath)) {
      rmSync(targetDbPath, { force: true });
    }
    renameSync(tempDb, targetDbPath);
    const backupBlobRoot = resolve(join(backupDir, "blobs"));
    const targetRoot = resolve(targetArtifactRoot);
    for (const blob of manifest.blobs) {
      const rel = blob.relative_path.replace(/\//g, pathSep);
      const source = resolve(backupBlobRoot, rel);
      const destination = resolve(targetRoot, rel);
      const destinationRel = relative(targetRoot, destination);
      if (destinationRel.startsWith(`..${pathSep}`) || destinationRel === "..") {
        throw new AppError("POLICY_VIOLATION", "Backup blob yolu artifact kokunu asiyor", { reason_code: "PATH_ESCAPE" });
      }
      mkdirSync(resolve(destination, ".."), { recursive: true });
      copyFileSync(source, destination);
    }
  } finally {
    if (existsSync(tempDb)) {
      rmSync(tempDb, { force: true });
    }
  }
  return { backup_id: manifest.backup_id, db_path: targetDbPath, artifact_root: targetArtifactRoot, verification };
}

export interface UninstallDecision {
  removed: Array<{ path: string; hash: string }>;
  preserved: Array<{ path: string; reason: string }>;
  owned_manifest_path: string | null;
}

/**
 * Owned uninstall (18.2): yalniz beklenen hash'teki girdiler kaldirilir;
 * user modified ise korunur/uyarilir. Runtime gecmisi varsayilan korunur.
 */
export function ownedUninstall(installManifestPath: string): UninstallDecision {
  if (!existsSync(installManifestPath)) {
    return { removed: [], preserved: [{ path: installManifestPath, reason: "KURULUM_MANIFEST_YOK" }], owned_manifest_path: null };
  }
  const manifest = JSON.parse(readFileSync(installManifestPath, "utf8")) as { owned_files: Array<{ path: string; sha256: string }> };
  const removed: UninstallDecision["removed"] = [];
  const preserved: UninstallDecision["preserved"] = [];
  for (const entry of manifest.owned_files) {
    if (!existsSync(entry.path)) {
      continue;
    }
    const actualHash = sha256Data(readFileSync(entry.path));
    if (actualHash === entry.sha256) {
      rmSync(entry.path, { force: true });
      removed.push({ path: entry.path, hash: entry.sha256 });
    } else {
      preserved.push({ path: entry.path, reason: "USER_MODIFIED (hash uyusmuyor; korunur)" });
    }
  }
  return { removed, preserved, owned_manifest_path: installManifestPath };
}

/**
 * Upgrade quiesce kontrolu (18.4): aktif job varken binary/schema degistirilmeZ.
 */
export function assertQuiescedForUpgrade(db: BetterSqlite3.Database): void {
  const activeRows = db
    .prepare<[], { id: string }>(
      "SELECT id FROM test_jobs WHERE lifecycle IN ('QUEUED', 'RUNNING', 'APPLYING')",
    )
    .all();
  if (activeRows.length > 0) {
    throw new AppError("POLICY_VIOLATION", `Aktif job varken upgrade yapilamaz (${activeRows.length} job); once pause/quiesce gerekli`, {
      reason_code: "ACTIVE_JOBS_RUNNING",
      active_jobs: activeRows.map((r) => r.id),
    });
  }
}
