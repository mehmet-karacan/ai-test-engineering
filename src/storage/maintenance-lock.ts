/** Cross-process exclusion for backup, restore and GC sweep. A stale lock fails closed. */
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AppError } from "../domain/errors.js";

export type MaintenanceOperation = "backup" | "restore" | "gc" | "publish" | "delete";

export function acquireMaintenanceLock(artifactRoot: string, operation: MaintenanceOperation): () => void {
  const root = resolve(artifactRoot);
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new AppError("POLICY_VIOLATION", "Maintenance root is a reparse point");
  }
  mkdirSync(root, { recursive: true });
  return acquireExclusiveLock(join(root, ".aitest-maintenance.lock"), operation);
}

/** A restore owns its DB path even when callers supply different artifact roots. */
export function acquireRestoreDbLock(dbPath: string): () => void {
  const path = `${resolve(dbPath)}.restore.lock`;
  mkdirSync(dirname(path), { recursive: true });
  return acquireExclusiveLock(path, "restore");
}

function acquireExclusiveLock(path: string, operation: MaintenanceOperation): () => void {
  const token = randomUUID();
  const content = JSON.stringify({ token, operation, pid: process.pid, created_at: Date.now() });
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new AppError("STORAGE_ERROR", "Maintenance operation already active or recovery required", {
        reason_code: "MAINTENANCE_BUSY_OR_STALE", lock_path: path,
      });
    }
    throw error;
  }
  try {
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  let released = false;
  return () => {
    if (released) return;
    const current = JSON.parse(readFileSync(path, "utf8")) as { token?: unknown };
    if (current.token !== token) {
      throw new AppError("STORAGE_ERROR", "Maintenance lock ownership changed", { reason_code: "MAINTENANCE_OWNER_MISMATCH" });
    }
    rmSync(path);
    released = true;
  };
}
