/**
 * FIN11/18.4/18.5: Surum yasam dongusu - backup/restore, upgrade, owned uninstall.
 * - Online SQLite backup API (better-sqlite3 .backup) [S09]; acik WAL DB'nin sadece .db kopyasi tam backup DEGIL.
 * - Backup DB snapshot'i + blob manifest'ini birlikte sabitler; GC ilgili ref'leri pinler.
 * - Restore ayri konumda dogrulanir; FK/integrity/blob check'leri gecince switch edilir.
 * - Owned uninstall: yalniz beklenen hash'teki girdiler; user modified korunur.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, renameSync, linkSync, lstatSync } from "node:fs";
import { basename, dirname, join, parse, relative, resolve, isAbsolute, sep as pathSep } from "node:path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import { acquireMaintenanceLock, acquireRestoreDbLock } from "./maintenance-lock.js";
import { appendRestorePhase, assertRestoreReadyBeforeOpen, captureRestoreEvidence, fileIdentity, journalPathForDb, type RestorePhase } from "./restore-journal.js";
import { hasOpenStorageHandle } from "./storage.js";
import { copyWindowsOwnedFile, deleteWindowsOwnedFile, inspectWindowsPath, renameWindowsOwnedFile, verifyWindowsOwnedFile,
  type WindowsCopyResult, type WindowsFileHelperSpec } from "../discovery/windows-file-bridge.js";
import { assertWindowsRestoreRootIdentity, captureExpectedWindowsRestoreFile, startWindowsRestoreMoveSession,
  type RestoreFileSlot, type RestoreMoveSession } from "./windows-restore-session.js";
import type { RestoreMoveReceipt, RestoreNativeInitial } from "./restore-journal.js";

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

interface BackupBlob {
  relative_path: string;
  sha256: string;
  bytes: number;
}

interface BackupManifest {
  schema_version: 1;
  backup_id: string;
  blobs: BackupBlob[];
}

interface SnapshotInspection {
  schema_ok: boolean;
  integrity_ok: boolean;
  rows: Array<{ relative_store_path: string; sha256: string; bytes: number }>;
  reason: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalRelativeBlobPath(path: string): boolean {
  if (!path || path.startsWith("/") || /[\\:<>"|?*]/.test(path) ||
      [...path].some((character) => character.charCodeAt(0) < 32)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."
    && !/[. ]$/.test(segment)
    && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment));
}

function isBackupBlob(value: unknown): value is BackupBlob {
  return isRecord(value)
    && typeof value["relative_path"] === "string" && value["relative_path"].length > 0
    && typeof value["sha256"] === "string" && /^[a-f0-9]{64}$/.test(value["sha256"])
    && typeof value["bytes"] === "number" && Number.isSafeInteger(value["bytes"]) && value["bytes"] >= 0;
}

function isBackupManifest(value: unknown): value is BackupManifest {
  return isRecord(value) && value["schema_version"] === 1
    && typeof value["backup_id"] === "string" && value["backup_id"].trim().length > 0
    && Array.isArray(value["blobs"]) && value["blobs"].every(isBackupBlob);
}

/** Reject reparse traversal and file/directory collisions before restore publication. */
function assertSafePathComponents(path: string, finalKind: "file" | "directory", operation: "BACKUP" | "RESTORE" = "RESTORE"): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components: string[] = [];
  for (let cursor = absolute; cursor !== root; cursor = dirname(cursor)) components.push(cursor);
  components.push(root);
  components.reverse();
  for (const [index, component] of components.entries()) {
    let entry: ReturnType<typeof lstatSync>;
    try { entry = lstatSync(component); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new AppError("POLICY_VIOLATION", `Path could not be inspected: ${component}`, {
        reason_code: `${operation}_PATH_UNREADABLE`, path: component,
      });
    }
    if (entry.isSymbolicLink()) {
      throw new AppError("POLICY_VIOLATION", `Path contains a reparse point: ${component}`, {
        reason_code: `${operation}_REPARSE_POINT`, path: component,
      });
    }
    const isFinal = index === components.length - 1;
    if ((!isFinal || finalKind === "directory") && !entry.isDirectory()) {
      throw new AppError("POLICY_VIOLATION", `Path parent is not a directory: ${component}`, {
        reason_code: `${operation}_PARENT_NOT_DIRECTORY`, path: component,
      });
    }
    if (isFinal && finalKind === "file" && !entry.isFile()) {
      throw new AppError("POLICY_VIOLATION", `Path target is not a file: ${component}`, {
        reason_code: `${operation}_PATH_COLLISION`, path: component,
      });
    }
  }
}

function pathWithinOrEqual(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${pathSep}`));
}

function assertRestoreRootsDisjoint(backupDir: string, targetDbPath: string, targetArtifactRoot: string): void {
  const source = resolve(backupDir);
  if (pathWithinOrEqual(source, targetArtifactRoot) || pathWithinOrEqual(targetArtifactRoot, source) ||
      pathWithinOrEqual(source, targetDbPath)) {
    throw new AppError("POLICY_VIOLATION", "Backup and restore target paths overlap", {
      reason_code: "RESTORE_PATH_OVERLAP",
    });
  }
}

function assertTargetRestoreQuiesced(targetDbPath: string): void {
  if (hasOpenStorageHandle(targetDbPath)) {
    throw new AppError("POLICY_VIOLATION", "Target Storage handle remains open", { reason_code: "RESTORE_DB_OPEN" });
  }
  if (!existsSync(targetDbPath)) return;
  let target: BetterSqlite3.Database | undefined;
  try {
    target = new Database(targetDbPath, { readonly: true, fileMustExist: true });
    const columns = target.prepare<[], { name: string }>("PRAGMA table_info(test_jobs)").all().map((column) => column.name);
    if (!columns.includes("lifecycle")) throw new Error("Target test_jobs lifecycle unavailable");
    const applying = columns.includes("apply_state") ? " OR apply_state = 'APPLYING'" : "";
    const active = target.prepare<[], { id: string }>(
      `SELECT id FROM test_jobs WHERE lifecycle IS NULL OR lifecycle NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')${applying} LIMIT 1`,
    ).get();
    if (active) {
      throw new AppError("POLICY_VIOLATION", "Target DB contains a nonterminal job", {
        reason_code: "RESTORE_ACTIVE_JOBS", job_id: active.id,
      });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("STORAGE_ERROR", "Target DB could not be checked for active jobs", {
      reason_code: "RESTORE_TARGET_DB_UNREADABLE",
    });
  } finally {
    target?.close();
  }
}

/** Canli DB degil, restore edilecek snapshot tek otoritedir. */
function inspectBackupSnapshot(dbPath: string): SnapshotInspection {
  let checkDb: BetterSqlite3.Database | undefined;
  let schemaOk = false;
  let integrityOk = false;
  try {
    checkDb = new Database(dbPath, { readonly: true });
    const tables = checkDb.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    schemaOk = ["test_jobs", "schema_migrations", "artifacts"].every((name) => tables.some((table) => table.name === name));
    integrityOk = checkDb.pragma("integrity_check", { simple: true }) === "ok";
    if (!schemaOk || !integrityOk) {
      return { schema_ok: schemaOk, integrity_ok: integrityOk, rows: [], reason: "BACKUP_VERIFICATION_FAILED" };
    }
    // SQLite integrity_check FOREIGN KEY ihlallerini denetlemez.
    if ((checkDb.pragma("foreign_key_check") as unknown[]).length > 0) {
      return { schema_ok: true, integrity_ok: false, rows: [], reason: "BACKUP_FOREIGN_KEY_CHECK_FAILED" };
    }
    const rows = checkDb
      .prepare<[], { relative_store_path: string; sha256: string; bytes: number }>(
        "SELECT relative_store_path, sha256, bytes FROM artifacts WHERE status = 'READY'",
      ).all();
    if (rows.some((row) => !isCanonicalRelativeBlobPath(row.relative_store_path))) {
      return { schema_ok: true, integrity_ok: true, rows: [], reason: "BACKUP_BLOB_PATH_INVALID" };
    }
    const destinations = new Map<string, string>();
    for (const row of rows) {
      const key = row.relative_store_path.toLowerCase();
      const previous = destinations.get(key);
      if (previous !== undefined && previous !== row.relative_store_path) {
        return { schema_ok: true, integrity_ok: true, rows: [], reason: "BACKUP_BLOB_PATH_INVALID" };
      }
      destinations.set(key, row.relative_store_path);
    }
    if (rows.some((row) => !isBackupBlob({ relative_path: row.relative_store_path, sha256: row.sha256, bytes: row.bytes }))) {
      return { schema_ok: true, integrity_ok: true, rows: [], reason: "BACKUP_ARTIFACT_METADATA_INVALID" };
    }
    return { schema_ok: true, integrity_ok: true, rows, reason: null };
  } catch {
    return { schema_ok: schemaOk, integrity_ok: false, rows: [], reason: "BACKUP_DB_BOZUK" };
  } finally {
    checkDb?.close();
  }
}

/**
 * Online SQLite backup API + blob manifest (18.5).
 * Backup complete marker ancak tum blob/hash dogrulamalari gecince yazilir.
 */
export async function createBackup(db: BetterSqlite3.Database, dbPath: string, artifactRoot: string, backupRoot: string): Promise<BackupResult> {
  const backupId = randomUUID();
  const backupDir = join(backupRoot, backupId);
  assertSafePathComponents(dbPath, "file", "BACKUP");
  assertSafePathComponents(artifactRoot, "directory", "BACKUP");
  assertSafePathComponents(backupDir, "directory", "BACKUP");
  const release = acquireMaintenanceLock(artifactRoot, "backup");
  try {
    mkdirSync(backupDir, { recursive: true });
    const backupDbPath = join(backupDir, "state.db");
    await db.backup(backupDbPath);

    // DB'nin referans verdigi blob'lari manifest'e sabitle. READY kaydi eksik,
    // bozuk veya artifact kokunun disindaysa backup sessizce eksik olamaz.
    const blobManifest: BackupBlob[] = [];
    // await sonrasi canli db degismis olabilir; satirlari kopyalanan state.db'den oku.
    const snapshot = inspectBackupSnapshot(backupDbPath);
    if (snapshot.reason !== null) {
      throw new AppError("STORAGE_ERROR", "Backup DB snapshot dogrulanamadi", { reason_code: snapshot.reason });
    }
    const artifactRows = snapshot.rows;
    const artifactRootPath = resolve(artifactRoot);
    for (const row of artifactRows) {
      const relativeBlob = row.relative_store_path.replace(/\//g, pathSep);
      const blobPath = resolve(artifactRootPath, relativeBlob);
      const blobRelative = relative(artifactRootPath, blobPath);
      // PP39/PP42: relative() ortak kok bulamazsa (capraz surucu) mutlak yol dondurur;
      // ".." ile baslamaz. Escape kontrolu isAbsolute ekiyle kok disi her durumu yakalar.
      const escapedOrMissing =
        isAbsolute(blobRelative) || blobRelative.startsWith(`..${pathSep}`) || blobRelative === ".." || !existsSync(blobPath);
      if (escapedOrMissing) {
        throw new AppError("STORAGE_ERROR", `Backup blob eksik veya artifact kokunun disinda: ${row.relative_store_path}`, {
          reason_code: "BACKUP_BLOB_MISSING",
          relative_path: row.relative_store_path,
        });
      }
      assertSafePathComponents(blobPath, "file", "BACKUP");
      const blobData = readFileSync(blobPath);
      const actualHash = sha256Data(blobData);
      if (actualHash !== row.sha256 || blobData.byteLength !== row.bytes) {
        throw new AppError("STORAGE_ERROR", `Backup blob hash/byte dogrulamasi basarisiz: ${row.relative_store_path}`, {
          reason_code: "BACKUP_BLOB_HASH_MISMATCH",
          relative_path: row.relative_store_path,
        });
      }
      const copiedPath = join(backupDir, "blobs", relativeBlob);
      assertSafePathComponents(copiedPath, "file", "BACKUP");
      mkdirSync(join(copiedPath, ".."), { recursive: true });
      // Hash'i olculen baytlar yazilir; kaynak ikinci kez okunup degisik bayt kopyalanmaz.
      writeFileSync(copiedPath, blobData);
      blobManifest.push({ relative_path: row.relative_store_path, sha256: row.sha256, bytes: row.bytes });
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
  } catch (error) {
    // Incomplete snapshots cannot later be mistaken for a restorable backup.
    rmSync(backupDir, { recursive: true, force: true });
    throw error;
  } finally {
    release();
  }
}

/**
 * Restore ayri owned konumda dogrulanir (18.5): FK/integrity/schema/blob check'leri.
 * Eksik/bozuk blob varsa backup/restore PASSED degil.
 */
export function verifyBackup(backupDir: string): RestoreVerification {
  const invalid = (reason: string): RestoreVerification => ({
    schema_ok: false, integrity_ok: false, blob_check_ok: false,
    missing_blobs: [], valid: false, reason,
  });
  const dbPath = join(backupDir, "state.db");
  try {
    assertSafePathComponents(backupDir, "directory", "BACKUP");
    assertSafePathComponents(dbPath, "file", "BACKUP");
    assertSafePathComponents(join(backupDir, "blob-manifest.json"), "file", "BACKUP");
    assertSafePathComponents(join(backupDir, "complete.json"), "file", "BACKUP");
    assertSafePathComponents(join(backupDir, "blobs"), "directory", "BACKUP");
  } catch { return invalid("BACKUP_UNSAFE_PATH"); }
  if (!existsSync(dbPath)) {
    return invalid("BACKUP_DB_EKSIK");
  }
  const manifestPath = join(backupDir, "blob-manifest.json");
  if (!existsSync(manifestPath)) {
    return invalid("BLOB_MANIFEST_EKSIK");
  }
  const completePath = join(backupDir, "complete.json");
  if (!existsSync(completePath)) {
    return invalid("BACKUP_COMPLETE_MARKER_EKSIK");
  }
  let manifest: BackupManifest;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!isBackupManifest(parsed)) {
      return invalid("BLOB_MANIFEST_BOZUK");
    }
    manifest = parsed;
  } catch {
    return invalid("BLOB_MANIFEST_BOZUK");
  }
  const invalidPaths = manifest.blobs.filter((blob) => !isCanonicalRelativeBlobPath(blob.relative_path)).map((blob) => blob.relative_path);
  if (invalidPaths.length > 0) return { ...invalid("BACKUP_BLOB_PATH_INVALID"), missing_blobs: invalidPaths };
  try {
    const marker: unknown = JSON.parse(readFileSync(completePath, "utf8"));
    if (!isRecord(marker) || marker["schema_version"] !== 1 || marker["complete"] !== true
        || marker["backup_id"] !== manifest.backup_id) {
      return invalid("BACKUP_COMPLETE_MARKER_BOZUK");
    }
  } catch {
    return invalid("BACKUP_COMPLETE_MARKER_BOZUK");
  }

  const snapshot = inspectBackupSnapshot(dbPath);
  if (snapshot.reason !== null) {
    return { ...invalid(snapshot.reason), schema_ok: snapshot.schema_ok, integrity_ok: snapshot.integrity_ok };
  }

  // Manifest kendi kendisini dogrulayamaz: READY satirlari ile iki yonlu eslesme.
  // Ayni content-addressed blob'a ait esit tekrarlar eski v1 backup'larda gecerlidir.
  const expected = new Map<string, BackupBlob>();
  const declared = new Map<string, BackupBlob>();
  const missingBlobs = new Set<string>();
  const physicalDestinations = new Map<string, string>();
  const indexBlob = (index: Map<string, BackupBlob>, blob: BackupBlob): void => {
    const previous = index.get(blob.relative_path);
    if (previous && (previous.sha256 !== blob.sha256 || previous.bytes !== blob.bytes)) {
      missingBlobs.add(blob.relative_path);
    }
    index.set(blob.relative_path, blob);
  };
  for (const row of snapshot.rows) {
    indexBlob(expected, { relative_path: row.relative_store_path, sha256: row.sha256, bytes: row.bytes });
  }
  for (const blob of manifest.blobs) {
    const key = blob.relative_path.toLowerCase();
    const previous = physicalDestinations.get(key);
    if (previous !== undefined && previous !== blob.relative_path) missingBlobs.add(blob.relative_path);
    physicalDestinations.set(key, blob.relative_path);
    indexBlob(declared, blob);
  }
  for (const [path, blob] of expected) {
    const entry = declared.get(path);
    if (!entry || entry.sha256 !== blob.sha256 || entry.bytes !== blob.bytes) {
      missingBlobs.add(path);
    }
  }
  for (const [path, blob] of declared) {
    if (!expected.has(path)) {
      missingBlobs.add(path);
    }
    const blobRoot = resolve(backupDir, "blobs");
    const copiedPath = resolve(blobRoot, path.replace(/\//g, pathSep));
    const relFromRoot = relative(blobRoot, copiedPath);
    const escaped = isAbsolute(relFromRoot) || relFromRoot.startsWith(`..${pathSep}`) || relFromRoot === "..";
    if (escaped) {
      missingBlobs.add(path);
      continue;
    }
    try {
      assertSafePathComponents(copiedPath, "file", "BACKUP");
      const data = readFileSync(copiedPath);
      if (sha256Data(data) !== blob.sha256 || data.byteLength !== blob.bytes) {
        missingBlobs.add(path);
      }
    } catch {
      missingBlobs.add(path);
    }
  }
  const blobCheckOk = missingBlobs.size === 0;
  return {
    schema_ok: snapshot.schema_ok,
    integrity_ok: snapshot.integrity_ok,
    blob_check_ok: blobCheckOk,
    missing_blobs: [...missingBlobs].sort(),
    valid: blobCheckOk,
    reason: blobCheckOk ? null : "BACKUP_VERIFICATION_FAILED",
  };
}

function verifyPublishedRestore(dbPath: string, artifactRoot: string, manifest: BackupManifest,
  verifyBlob?: (blob: BackupBlob) => void): void {
  const snapshot = inspectBackupSnapshot(dbPath);
  if (snapshot.reason !== null || snapshot.rows.length !== manifest.blobs.length) {
    throw new AppError("STORAGE_ERROR", "Published restore DB verification failed", { reason_code: "RESTORE_PUBLISHED_DB_INVALID" });
  }
  const rows = new Map(snapshot.rows.map((row) => [row.relative_store_path, row]));
  for (const blob of manifest.blobs) {
    const row = rows.get(blob.relative_path);
    if (!row || row.sha256 !== blob.sha256 || row.bytes !== blob.bytes) {
      throw new AppError("STORAGE_ERROR", "Published restore manifest mismatch", { reason_code: "RESTORE_PUBLISHED_SET_MISMATCH" });
    }
    if (verifyBlob) { verifyBlob(blob); continue; }
    const bytes = readFileSync(resolve(artifactRoot, blob.relative_path.replace(/\//g, pathSep)));
    if (bytes.byteLength !== blob.bytes || sha256Data(bytes) !== blob.sha256) {
      throw new AppError("STORAGE_ERROR", "Published restore blob mismatch", { reason_code: "RESTORE_PUBLISHED_BLOB_INVALID" });
    }
  }
}

/**
 * Dogrulanmis backup'i yeni runtime konumuna uygular. Hedef DB acik olmamali;
 * DB once temp dosyaya kopyalanir, sonra isim degisikligiyle yayinlanir.
 * S01/WN restore preflight'u: blob hedefi HICBIR sey degistirilmeden
 * once calisir; farkli baytli mevcut hedef blob'da restore durur (EEXIST benzeri),
 * esit hash'li mevcut hedef blob yeniden kullanilir. Blob'lar staging dosyasina
 * kopyalanip DB yayini oncesinde rename ile yayinlanir; yarim blob yazisi
 * hedefi ezmez. Journal yarim restore'u acilista engeller; hard-kill recovery
 * dogrulanmadan crash-safe kabul verilmez.
 */
export async function restoreBackup(backupDir: string, targetDbPath: string, targetArtifactRoot: string,
  options?: { nativeHelper?: WindowsFileHelperSpec }): Promise<RestoreResult> {
  targetDbPath = resolve(targetDbPath);
  targetArtifactRoot = resolve(targetArtifactRoot);
  backupDir = resolve(backupDir);
  assertRestoreRootsDisjoint(backupDir, targetDbPath, targetArtifactRoot);
  assertSafePathComponents(backupDir, "directory");
  assertSafePathComponents(join(backupDir, "state.db"), "file");
  assertSafePathComponents(join(backupDir, "blob-manifest.json"), "file");
  assertSafePathComponents(join(backupDir, "complete.json"), "file");
  assertSafePathComponents(join(backupDir, "blobs"), "directory");
  assertSafePathComponents(targetDbPath, "file");
  assertSafePathComponents(targetArtifactRoot, "directory");
  if (options?.nativeHelper && !existsSync(targetDbPath)) {
    throw new AppError("BLOCKED_ISOLATION", "Native restore session requires an existing target database", {
      reason_code: "WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED",
    });
  }
  if (options?.nativeHelper && !existsSync(targetArtifactRoot)) {
    throw new AppError("BLOCKED_ISOLATION", "Native blob restore requires an existing artifact root", {
      reason_code: "RESTORE_ARTIFACT_ROOT_REQUIRED",
    });
  }
  const releaseDb = acquireRestoreDbLock(targetDbPath);
  try {
  assertRestoreReadyBeforeOpen(targetDbPath);
  assertTargetRestoreQuiesced(targetDbPath);
  if (options?.nativeHelper && !existsSync(targetDbPath)) {
    throw new AppError("BLOCKED_ISOLATION", "Native restore session requires an existing target database", {
      reason_code: "WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED",
    });
  }
  const release = acquireMaintenanceLock(targetArtifactRoot, "restore");
  try {
  let manifestParsed: unknown;
  try { manifestParsed = JSON.parse(readFileSync(join(backupDir, "blob-manifest.json"), "utf8")); }
  catch { throw new AppError("STORAGE_ERROR", "Backup blob manifesti okunamadi", { reason_code: "BLOB_MANIFEST_BOZUK" }); }
  if (!isBackupManifest(manifestParsed)) {
    throw new AppError("STORAGE_ERROR", "Backup restore dogrulamasi basarisiz", { reason_code: "BLOB_MANIFEST_BOZUK" });
  }
  const manifest = manifestParsed;
  for (const blob of manifest.blobs) {
    if (!isCanonicalRelativeBlobPath(blob.relative_path)) {
      throw new AppError("POLICY_VIOLATION", "Restore blob path is not canonical", {
        reason_code: /[:\\]/.test(blob.relative_path) || blob.relative_path.startsWith("/") || blob.relative_path.includes("..")
          ? "PATH_ESCAPE" : "RESTORE_BLOB_PATH_INVALID",
        relative_path: blob.relative_path,
      });
    }
  }
  const backupBlobRoot = resolve(join(backupDir, "blobs"));
  const targetRoot = resolve(targetArtifactRoot);
  for (const blob of manifest.blobs) {
    const source = resolve(backupBlobRoot, blob.relative_path.replace(/\//g, pathSep));
    if (!pathWithinOrEqual(backupBlobRoot, source)) {
      throw new AppError("POLICY_VIOLATION", "Backup blob path escapes its root", { reason_code: "PATH_ESCAPE" });
    }
    assertSafePathComponents(source, "file");
  }
  const verification = verifyBackup(backupDir);
  if (!verification.valid) {
    throw new AppError("STORAGE_ERROR", "Backup restore dogrulamasi basarisiz", { reason_code: verification.reason ?? "BACKUP_VERIFICATION_FAILED" });
  }

  // Preflight: tum hedef blob yollari, aktif DB veya mevcut blob'lar
  // degistirilmeden once cozulur ve dogrulanir.
  const preflightArtifactRoot = options?.nativeHelper && existsSync(targetArtifactRoot)
    ? inspectWindowsPath(options.nativeHelper, targetArtifactRoot) : null;
  if (options?.nativeHelper && manifest.blobs.length > 0 && !preflightArtifactRoot) {
    throw new AppError("BLOCKED_ISOLATION", "Native blob restore requires an existing artifact root", {
      reason_code: "RESTORE_ARTIFACT_ROOT_REQUIRED",
    });
  }
  const reusedBlobs = new Map<string, WindowsCopyResult>();
  const plan: Array<{ source: string; destination: string; stage: string; sha256: string; skip: boolean }> = [];
  for (const blob of manifest.blobs) {
    const rel = blob.relative_path.replace(/\//g, pathSep);
    const source = resolve(backupBlobRoot, rel);
    const destination = resolve(targetRoot, rel);
    assertSafePathComponents(destination, "file");
    if ([targetDbPath, `${targetDbPath}-wal`, `${targetDbPath}-shm`, `${targetDbPath}-journal`,
      journalPathForDb(targetDbPath), `${targetDbPath}.restore.lock`, `${targetDbPath}.restore.lock.sqlite`,
      `${targetDbPath}.restore.lock.sqlite-journal`, join(targetRoot, ".aitest-maintenance.lock"),
      join(targetRoot, ".aitest-maintenance.lock.sqlite"), join(targetRoot, ".aitest-maintenance.lock.sqlite-journal")]
      .some((protectedPath) => relative(protectedPath, destination) === "") ||
      destination.toLowerCase().startsWith(`${targetDbPath}.restore-`.toLowerCase())) {
      throw new AppError("POLICY_VIOLATION", "Restore blob path collides with runtime control data", {
        reason_code: "RESTORE_PATH_COLLISION", relative_path: blob.relative_path,
      });
    }
    const destinationRel = relative(targetRoot, destination);
    // PP39/PP42: capraz surucu hedefte relative() mutlak yol dondurur; isAbsolute eki zorunlu.
    if (isAbsolute(destinationRel) || destinationRel.startsWith(`..${pathSep}`) || destinationRel === "..") {
      throw new AppError("POLICY_VIOLATION", "Backup blob yolu artifact kokunu asiyor", { reason_code: "PATH_ESCAPE" });
    }
    let skip = false;
    if (existsSync(destination)) {
      let conflict = true;
      try {
        if (options?.nativeHelper && preflightArtifactRoot) {
          reusedBlobs.set(destination, verifyWindowsOwnedFile(options.nativeHelper, targetArtifactRoot, rel,
            preflightArtifactRoot, { bytes: blob.bytes, sha256: blob.sha256 }));
          conflict = false;
        } else {
          const existing = readFileSync(destination);
          // Esit hash + esit byte: mevcut hedef blob yeniden kullanilir (idempotent restore).
          conflict = !(sha256Data(existing) === blob.sha256 && existing.byteLength === blob.bytes);
        }
      } catch {
        // Okunamayan hedef (orn. dizin): fail-closed cakisma.
        conflict = true;
      }
      if (conflict) {
        throw new AppError("STORAGE_ERROR", `Restore hedef blob cakismasi: ${blob.relative_path} mevcut ve baytlari farkli`, {
          reason_code: "RESTORE_BLOB_EXISTS_MISMATCH",
          relative_path: blob.relative_path,
        });
      }
      skip = true;
    }
    plan.push({ source, destination, stage: `${destination}.restore-${randomUUID()}.tmp`, sha256: blob.sha256, skip });
  }

  mkdirSync(resolve(targetDbPath, ".."), { recursive: true });
  if (!options?.nativeHelper || manifest.blobs.length === 0) mkdirSync(targetArtifactRoot, { recursive: true });
  const initialArtifactRoot = options?.nativeHelper ? inspectWindowsPath(options.nativeHelper, targetArtifactRoot) : null;
  if (preflightArtifactRoot && initialArtifactRoot &&
      (preflightArtifactRoot.volumeSerial !== initialArtifactRoot.volumeSerial ||
       preflightArtifactRoot.fileId !== initialArtifactRoot.fileId)) {
    throw new AppError("BLOCKED_ISOLATION", "Artifact root changed after blob preflight", {
      reason_code: "RESTORE_ARTIFACT_ROOT_CHANGED",
    });
  }
  const initialBackupBlobRoot = options?.nativeHelper && manifest.blobs.length > 0
    ? inspectWindowsPath(options.nativeHelper, backupBlobRoot) : null;
  let artifactRootChanged = false;
  const assertArtifactRoot = (): void => {
    if (!options?.nativeHelper || !initialArtifactRoot) return;
    try { assertWindowsRestoreRootIdentity(options.nativeHelper, targetArtifactRoot, initialArtifactRoot); }
    catch (error) { artifactRootChanged = true; throw error; }
  };
  const tempDb = `${targetDbPath}.restore-${randomUUID()}`;
  const oldSuffix = `.restore-old-${randomUUID()}`;
  const journalPath = journalPathForDb(targetDbPath);
  const moveReceipts: RestoreMoveReceipt[] | undefined = options?.nativeHelper ? [] : undefined;
  let nativeInitial: RestoreNativeInitial | undefined;
  const journalBase = {
    formatVersion: 2 as const, generation: randomUUID(), targetDbPath, artifactRoot: targetArtifactRoot,
    stagedDbPath: tempDb, preservedDbPath: `${targetDbPath}${oldSuffix}`,
    publishedBlobs: plan.filter((item) => !item.skip).map((item) => ({ path: item.destination, sha256: item.sha256 })),
    ...(moveReceipts ? { moveReceipts } : {}),
    evidence: captureRestoreEvidence(targetDbPath, join(backupDir, "state.db"), join(backupDir, "blob-manifest.json"),
      manifest.blobs.map((blob) => ({ path: resolve(targetRoot, blob.relative_path.replace(/\//g, pathSep)),
        sha256: blob.sha256, bytes: blob.bytes,
        existedBefore: plan.find((item) => item.destination === resolve(targetRoot, blob.relative_path.replace(/\//g, pathSep)))!.skip }))),
  };
  let journalStarted = false;
  let journalTerminal = false;
  const phase = (value: RestorePhase): void => {
    appendRestorePhase(journalPath, { ...journalBase, ...(nativeInitial ? { nativeInitial } : {}), phase: value });
    journalStarted = true;
    if (value === "COMMITTED" || value === "ROLLED_BACK") journalTerminal = true;
  };
  try {
    copyFileSync(join(backupDir, "state.db"), tempDb);
    if (fileIdentity(tempDb).sha256 !== journalBase.evidence.sourceDbSha256) {
      throw new AppError("STORAGE_ERROR", "Staged restore DB differs from verified backup", {
        reason_code: "RESTORE_STAGED_DB_CHANGED",
      });
    }
  } catch (error) {
    // PREPARED henuz yazilmadi; yarim staging DB'si yeni restore sanilamaz.
    rmSync(tempDb, { force: true });
    throw error;
  }
  let nativeSession: RestoreMoveSession | undefined;
  if (options?.nativeHelper) {
    try {
      const helper = options.nativeHelper;
      const expected: RestoreNativeInitial & { oldDb: NonNullable<RestoreNativeInitial["oldDb"]> } = {
        oldDb: captureExpectedWindowsRestoreFile(helper, targetDbPath),
        oldWal: existsSync(`${targetDbPath}-wal`) ? captureExpectedWindowsRestoreFile(helper, `${targetDbPath}-wal`) : null,
        oldShm: existsSync(`${targetDbPath}-shm`) ? captureExpectedWindowsRestoreFile(helper, `${targetDbPath}-shm`) : null,
        stagedDb: captureExpectedWindowsRestoreFile(helper, tempDb),
      };
      nativeSession = await startWindowsRestoreMoveSession(helper, {
        dbDirectory: dirname(targetDbPath), dbName: basename(targetDbPath), stagedName: basename(tempDb),
        preservedSuffix: oldSuffix, generation: journalBase.generation, expected,
      });
      nativeInitial = expected;
    } catch (error) {
      rmSync(tempDb, { force: true });
      throw error;
    }
  }
  const publishedNew: string[] = [];
  const ownedBlobs = new Map<string, { identity: WindowsCopyResult; published: boolean }>();
  const cleanupOwnedBlobs = (): void => {
    if (!options?.nativeHelper || !initialArtifactRoot) return;
    for (const item of [...plan].reverse()) {
      const owned = ownedBlobs.get(item.destination);
      if (!owned) continue;
      deleteWindowsOwnedFile(options.nativeHelper, targetArtifactRoot,
        relative(targetRoot, owned.published ? item.destination : item.stage),
        initialArtifactRoot, owned.identity);
      ownedBlobs.delete(item.destination);
    }
    publishedNew.length = 0;
  };
  let dbPublished = false;
  let safeRollback = true;
  try {
    phase("PREPARED");
    // Tum blob kopyalari ve olasi IO hatalari DB yayini oncesinde tamamlanir.
    for (const item of plan) {
      if (item.skip) continue;
      assertArtifactRoot();
      if (!options?.nativeHelper) mkdirSync(resolve(item.destination, ".."), { recursive: true });
      assertArtifactRoot();
      if (options?.nativeHelper && initialArtifactRoot && initialBackupBlobRoot) {
        const identity = copyWindowsOwnedFile(options.nativeHelper, backupBlobRoot,
          relative(backupBlobRoot, item.source), targetArtifactRoot, relative(targetRoot, item.stage),
          initialBackupBlobRoot, initialArtifactRoot);
        if (identity.sha256 !== item.sha256) {
          ownedBlobs.set(item.destination, { identity, published: false });
          throw new AppError("STORAGE_ERROR", "Staged restore blob differs from verified backup", {
            reason_code: "RESTORE_STAGED_BLOB_CHANGED",
          });
        }
        ownedBlobs.set(item.destination, { identity, published: false });
      } else copyFileSync(item.source, item.stage);
      assertArtifactRoot();
    }
    for (const item of plan) {
      if (item.skip) continue;
      assertArtifactRoot();
      if ((options?.nativeHelper ? ownedBlobs.get(item.destination)?.identity.sha256 : fileIdentity(item.stage).sha256) !== item.sha256) {
        throw new AppError("STORAGE_ERROR", "Staged restore blob differs from verified backup", {
          reason_code: "RESTORE_STAGED_BLOB_CHANGED",
        });
      }
    }
    for (const item of plan) {
      if (item.skip) continue;
      assertArtifactRoot();
      // Stage ve hedef ayni dizindedir. Hard link atomik olarak yeni isim
      // olusturur; yarista ortaya cikan mevcut dosyayi rename gibi ezmez.
      if (options?.nativeHelper && initialArtifactRoot) {
        const owned = ownedBlobs.get(item.destination);
        if (!owned) throw new AppError("BLOCKED_ISOLATION", "Owned staged blob missing", { reason_code: "RESTORE_OWNED_BLOB_MISSING" });
        try {
          renameWindowsOwnedFile(options.nativeHelper, targetArtifactRoot,
            relative(targetRoot, item.stage), relative(targetRoot, item.destination),
            initialArtifactRoot, owned.identity);
        } catch (error) {
          // A lost native acknowledgement can mean the destination exists.
          // Leave the journal nonterminal; a path-based rollback could delete unrelated data.
          safeRollback = false;
          throw error;
        }
        owned.published = true;
      } else linkSync(item.stage, item.destination);
      assertArtifactRoot();
      publishedNew.push(item.destination);
    }
    phase("BLOBS_READY");
    assertArtifactRoot();
    // Eski DB ve WAL/SHM, yeni DB yayini basarisiz olursa geri konmak uzere
    // ayni volume'de tutulur. Crash-safe recovery journal sonraki asamadir.
    const staleWal = `${targetDbPath}-wal`;
    const staleShm = `${targetDbPath}-shm`;
    const preserved: Array<{ original: string; saved: string }> = [];
    try {
      for (const original of [targetDbPath, staleWal, staleShm]) {
        if (!existsSync(original)) continue;
        const saved = `${original}${oldSuffix}`;
        const slot: RestoreFileSlot = original === targetDbPath ? "oldDb" : original === staleWal ? "oldWal" : "oldShm";
        if (nativeSession) moveReceipts!.push(await nativeSession.renameOwned(slot, basename(saved)));
        else renameSync(original, saved);
        preserved.push({ original, saved });
        phase(slot === "oldDb" ? "OLD_DB_MOVED" : slot === "oldWal" ? "OLD_WAL_MOVED" : "OLD_SHM_MOVED");
      }
      phase("OLD_DB_PRESERVED");
      if (nativeSession) moveReceipts!.push(await nativeSession.renameOwned("stagedDb", basename(targetDbPath)));
      else renameSync(tempDb, targetDbPath);
      dbPublished = true;
      phase("NEW_DB_MOVED");
      phase("NEW_DB_PUBLISHED");
      assertArtifactRoot();
      if (nativeSession) await nativeSession.enterReadVerify();
      verifyPublishedRestore(targetDbPath, targetArtifactRoot, manifest,
        options?.nativeHelper && initialArtifactRoot ? (blob) => {
          const destination = resolve(targetRoot, blob.relative_path.replace(/\//g, pathSep));
          const expected = ownedBlobs.get(destination)?.identity ?? reusedBlobs.get(destination);
          if (!expected) throw new AppError("BLOCKED_ISOLATION", "Published blob identity missing", {
            reason_code: "RESTORE_OWNED_BLOB_MISSING",
          });
          verifyWindowsOwnedFile(options.nativeHelper!, targetArtifactRoot,
            relative(targetRoot, destination), initialArtifactRoot,
            { bytes: blob.bytes, sha256: blob.sha256, identity: expected });
        } : undefined);
      // Read-only SQLite dogrulamasi WAL/SHM yan dosyasi olusturabilir;
      // baglanti kapandiktan sonra yeni generation yan dosyalari kaldirilir.
      for (const sidecar of [staleWal, staleShm]) {
        if (existsSync(sidecar)) rmSync(sidecar, { force: true });
      }
      phase("VERIFIED");
      assertArtifactRoot();
      // Publish the terminal decision while the native read guard still denies
      // raw SQLite writers. CLOSE acknowledges release only after this fsync.
      phase("COMMITTED");
      if (nativeSession) {
        try { await nativeSession.close(); }
        catch {
          nativeSession = undefined;
          safeRollback = false;
          throw new AppError("STORAGE_ERROR", "Committed restore close acknowledgement uncertain", {
            reason_code: "RESTORE_COMMITTED_CLOSE_UNCERTAIN",
          });
        }
        nativeSession = undefined;
      }
    } catch (error) {
      if (journalTerminal) throw error;
      try {
        if (options?.nativeHelper && !nativeSession) throw error;
        if (dbPublished && existsSync(targetDbPath)) {
          for (const sidecar of [staleWal, staleShm]) {
            if (existsSync(sidecar)) rmSync(sidecar, { force: true });
          }
          if (nativeSession) await nativeSession.renameOwned("stagedDb", basename(tempDb));
          else renameSync(targetDbPath, tempDb);
          dbPublished = false;
        }
        for (const item of [...preserved].reverse()) {
          if (!existsSync(item.saved)) continue;
          if (nativeSession) {
            const slot: RestoreFileSlot = item.original === targetDbPath ? "oldDb" :
              item.original === staleWal ? "oldWal" : "oldShm";
            await nativeSession.renameOwned(slot, basename(item.original));
          } else renameSync(item.saved, item.original);
        }
        if (nativeSession) {
          // The final reverse MOVE receipt is still held by the native owner.
          // Remove captured new blob FileIds before sealing the old generation.
          // A delete failure leaves the journal nonterminal and startup blocked.
          cleanupOwnedBlobs();
          phase("ROLLED_BACK");
          await nativeSession.close();
          nativeSession = undefined;
        }
      } catch {
        safeRollback = false;
      }
      throw error;
    }
    // Eski generation, journal/retention karari olmadan otomatik silinmez.
  } catch (error) {
    if (artifactRootChanged) safeRollback = false;
    if (nativeSession) {
      try { await nativeSession.close(); nativeSession = undefined; }
      catch { safeRollback = false; }
    }
    if (safeRollback && !dbPublished) {
      assertArtifactRoot();
      if (options?.nativeHelper) cleanupOwnedBlobs();
      else for (const path of publishedNew.reverse()) if (existsSync(path)) rmSync(path, { force: true });
      if (journalStarted && !journalTerminal) phase("ROLLED_BACK");
    }
    throw error;
  } finally {
    if (safeRollback && !artifactRootChanged) {
      assertArtifactRoot();
      if (!options?.nativeHelper) for (const item of plan) {
        if (existsSync(item.stage)) rmSync(item.stage, { force: true });
      }
      if (existsSync(tempDb)) rmSync(tempDb, { force: true });
    }
  }
  return { backup_id: manifest.backup_id, db_path: targetDbPath, artifact_root: targetArtifactRoot, verification };
  } finally {
    release();
  }
  } finally {
    releaseDb();
  }
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
