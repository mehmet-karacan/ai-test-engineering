/**
 * SQLite storage adapter: WAL, foreign_keys, bounded busy_timeout.
 * Tek kullaniciya ozel yerel DB; network share uzerinde kullanilmaz.
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate, currentSchemaVersion } from "./migrations.js";

export interface StorageOptions {
  dbPath: string;
}

export class Storage {
  readonly db: Database.Database;
  private readonly dbPath: string;

  constructor(options: StorageOptions) {
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
  }

  migrate(): void {
    migrate(this.db);
  }

  schemaVersion(): number {
    return currentSchemaVersion(this.db);
  }

  close(): void {
    this.db.close();
  }
}
