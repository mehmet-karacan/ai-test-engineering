/**
 * SQLite storage adapter: WAL, foreign_keys, bounded busy_timeout.
 * Tek kullaniciya ozel yerel DB; network share uzerinde kullanilmaz.
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrate, currentSchemaVersion } from "./migrations.js";
import { assertRestoreReadyBeforeOpen, recoverIntactOldRestoreBeforeOpen } from "./restore-journal.js";

export interface StorageOptions {
  dbPath: string;
}

const openStorageHandles = new Map<string, Set<Database.Database>>();
const storagePathKey = (path: string): string => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);

export function hasOpenStorageHandle(path: string): boolean {
  const key = storagePathKey(path);
  const handles = openStorageHandles.get(key);
  if (!handles) return false;
  for (const handle of handles) if (handle.open) return true;
  openStorageHandles.delete(key);
  return false;
}

export class Storage {
  readonly db: Database.Database;
  private readonly dbPath: string;

  constructor(options: StorageOptions) {
    recoverIntactOldRestoreBeforeOpen(options.dbPath);
    assertRestoreReadyBeforeOpen(options.dbPath);
    this.dbPath = options.dbPath;
    const parent = dirname(options.dbPath);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = FULL");
    const key = storagePathKey(this.dbPath);
    const handles = openStorageHandles.get(key) ?? new Set<Database.Database>();
    handles.add(this.db);
    openStorageHandles.set(key, handles);
  }

  migrate(): void {
    migrate(this.db);
  }

  schemaVersion(): number {
    return currentSchemaVersion(this.db);
  }

  close(): void {
    this.db.close();
    const key = storagePathKey(this.dbPath);
    const handles = openStorageHandles.get(key);
    handles?.delete(this.db);
    if (handles?.size === 0) openStorageHandles.delete(key);
  }
}
