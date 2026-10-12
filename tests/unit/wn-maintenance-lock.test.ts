import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { acquireMaintenanceLock, acquireRestoreDbLock } from "../../src/storage/maintenance-lock.js";
import { gcSweep } from "../../src/storage/retention-gc.js";

describe("S01 backup/restore/GC maintenance lock", () => {
  it("serializes owners and blocks GC sweep while snapshot owner holds the lock", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-maintenance-"));
    const db = new Database(":memory:");
    try {
      const blob = join(root, "blob");
      writeFileSync(blob, "preserve");
      const release = acquireMaintenanceLock(root, "backup");
      expect(() => acquireMaintenanceLock(root, "restore")).toThrow();
      expect(() => gcSweep(db, { candidates: [{ artifact_id: "a", kind: "temp", relative_store_path: "blob",
        sha256: "0".repeat(64), created_at: 0, reason: "TEMP_TTL_EXPIRED", pinned: false }],
        pinned_count: 0, total_bytes: 8 }, root)).toThrow();
      expect(existsSync(blob)).toBe(true);
      release();
      const releaseAgain = acquireMaintenanceLock(root, "gc");
      releaseAgain();
    } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it("serializes restore ownership by DB path even with different artifact roots", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-restore-db-lock-"));
    try {
      const dbPath = join(root, "state.db");
      const releaseDb = acquireRestoreDbLock(dbPath);
      const releaseFirstRoot = acquireMaintenanceLock(join(root, "artifacts-a"), "restore");
      const releaseSecondRoot = acquireMaintenanceLock(join(root, "artifacts-b"), "restore");
      try {
        expect(() => acquireRestoreDbLock(dbPath)).toThrow();
      } finally {
        releaseSecondRoot();
        releaseFirstRoot();
        releaseDb();
      }
      const releaseAgain = acquireRestoreDbLock(dbPath);
      releaseAgain();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
