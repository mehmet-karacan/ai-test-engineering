/** Cross-process exclusion for backup, restore and GC sweep via OS-managed SQLite locks. */
import { lstatSync, mkdirSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import Database from "better-sqlite3";
import { AppError } from "../domain/errors.js";

export type MaintenanceOperation = "backup" | "restore" | "gc" | "publish" | "delete";

function existingEntry(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function assertSafeControlPath(path: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components: string[] = [];
  for (let cursor = absolute; cursor !== root; cursor = dirname(cursor)) components.push(cursor);
  components.push(root);
  components.reverse();
  for (const [index, component] of components.entries()) {
    const entry = existingEntry(component);
    if (!entry) continue;
    if (entry.isSymbolicLink() || (index === components.length - 1 ? !entry.isFile() : !entry.isDirectory())) {
      throw new AppError("POLICY_VIOLATION", "Maintenance control path is unsafe", {
        reason_code: "MAINTENANCE_UNSAFE_PATH", path: component,
      });
    }
  }
}

export function acquireMaintenanceLock(artifactRoot: string, operation: MaintenanceOperation): () => void {
  const root = resolve(artifactRoot);
  const legacyPath = join(root, ".aitest-maintenance.lock");
  const controlPath = `${legacyPath}.sqlite`;
  assertSafeControlPath(controlPath);
  mkdirSync(root, { recursive: true });
  return acquireExclusiveLock(controlPath, legacyPath, operation);
}

/** A restore owns its DB path even when callers supply different artifact roots. */
export function acquireRestoreDbLock(dbPath: string): () => void {
  const legacyPath = `${resolve(dbPath)}.restore.lock`;
  const controlPath = `${legacyPath}.sqlite`;
  assertSafeControlPath(controlPath);
  mkdirSync(dirname(controlPath), { recursive: true });
  return acquireExclusiveLock(controlPath, legacyPath, "restore");
}

function acquireExclusiveLock(controlPath: string, legacyPath: string, operation: MaintenanceOperation): () => void {
  // A pre-upgrade wx owner or its stale file cannot silently lose exclusion.
  if (existingEntry(legacyPath)) {
    throw new AppError("STORAGE_ERROR", "Legacy maintenance lock requires review", {
      reason_code: "MAINTENANCE_BUSY_OR_STALE", lock_path: legacyPath,
    });
  }
  assertSafeControlPath(controlPath);
  let db: Database.Database | undefined;
  try {
    db = new Database(controlPath, { timeout: 0 });
    db.pragma("busy_timeout = 0");
    // BEGIN EXCLUSIVE is a real file lock only in rollback journal mode.
    db.pragma("journal_mode = DELETE");
    db.exec("BEGIN EXCLUSIVE");
  } catch (error) {
    db?.close();
    if ((error as { code?: unknown }).code === "SQLITE_BUSY") {
      throw new AppError("STORAGE_ERROR", "Maintenance operation already active", {
        reason_code: "MAINTENANCE_BUSY_OR_STALE", lock_path: controlPath, operation,
      });
    }
    throw error;
  }
  const owner = db;
  let released = false;
  return () => {
    if (released) return;
    try { owner.exec("ROLLBACK"); }
    finally { owner.close(); released = true; }
  };
}
