import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { acquireMaintenanceLock, acquireRestoreDbLock } from "../../src/storage/maintenance-lock.js";
import { gcSweep } from "../../src/storage/retention-gc.js";
import assert from "node:assert/strict";

describe("S01 backup/restore/GC maintenance lock", () => {
  it.each([".aitest-maintenance.lock.sqlite", ".aitest-maintenance.lock.sqlite.", "../outside"]) ("rejects GC path %s before removing control or outside files", (candidatePath) => {
    const root = mkdtempSync(join(tmpdir(), "wn-gc-control-path-"));
    const artifactRoot = join(root, "artifacts");
    const db = new Database(":memory:");
    try {
      const outside = join(root, "outside");
      writeFileSync(outside, "preserve");
      assert.throws(() => gcSweep(db, { candidates: [{ artifact_id: "a", kind: "temp", relative_store_path: candidatePath,
        sha256: "0".repeat(64), created_at: 0, reason: "TEMP_TTL_EXPIRED", pinned: false }],
        pinned_count: 0, total_bytes: 8 }, artifactRoot),
      (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "GC_UNSAFE_BLOB_PATH");
      expect(existsSync(join(artifactRoot, ".aitest-maintenance.lock.sqlite"))).toBe(true);
      expect(existsSync(outside)).toBe(true);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it.skipIf(process.platform !== "win32")("holds a cross-process SQLite owner and reacquires after native hard-kill", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-sqlite-owner-"));
    const controlPath = join(root, ".aitest-maintenance.lock.sqlite");
    const code = `const Database = require("better-sqlite3");
      const db = new Database(process.argv[1]);
      try { db.pragma("busy_timeout = 0"); db.pragma("journal_mode = DELETE"); db.exec("BEGIN EXCLUSIVE");
        process.stdout.write("LOCKED\\n"); if (process.argv[2] === "hold") setInterval(() => {}, 1000);
        else { db.exec("ROLLBACK"); db.close(); }
      } catch (error) { process.stderr.write(error.code ?? String(error)); process.exitCode = 42; }`;
    const owner = spawn(process.execPath, ["-e", code, controlPath, "hold"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SQLite owner did not start")), 5000);
        owner.stdout.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("LOCKED")) { clearTimeout(timer); resolve(); }
        });
        owner.once("exit", (status) => { clearTimeout(timer); reject(new Error(`SQLite owner exited ${status}`)); });
      });
      const contender = spawnSync(process.execPath, ["-e", code, controlPath, "probe"], { cwd: process.cwd(), encoding: "utf8" });
      expect(contender.status).toBe(42);
      expect(contender.stderr).toContain("SQLITE_BUSY");
      expect(() => acquireMaintenanceLock(root, "backup")).toThrow();
      const killed = spawnSync("taskkill", ["/F", "/PID", String(owner.pid)], { encoding: "utf8" });
      expect(killed.status).toBe(0);
      await new Promise<void>((resolve) => { if (owner.exitCode !== null) resolve(); else owner.once("exit", () => resolve()); });
      const release = acquireMaintenanceLock(root, "gc");
      release();
    } finally {
      if (owner.exitCode === null && owner.pid) spawnSync("taskkill", ["/F", "/PID", String(owner.pid)], { encoding: "utf8" });
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 15000);

  it("keeps an old wx lock fail-closed during the control DB migration", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-legacy-owner-"));
    try {
      writeFileSync(join(root, ".aitest-maintenance.lock"), "old owner or stale lock");
      assert.throws(() => acquireMaintenanceLock(root, "backup"),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "MAINTENANCE_BUSY_OR_STALE");
      expect(existsSync(join(root, ".aitest-maintenance.lock.sqlite"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform !== "win32")("rejects a GC junction before deleting an outside blob", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-gc-junction-"));
    const artifactRoot = join(root, "artifacts");
    const outside = join(root, "outside");
    const db = new Database(":memory:");
    try {
      mkdirSync(artifactRoot);
      mkdirSync(outside);
      writeFileSync(join(outside, "blob"), "preserve");
      symlinkSync(outside, join(artifactRoot, "escape"), "junction");
      assert.throws(() => gcSweep(db, { candidates: [{ artifact_id: "a", kind: "temp", relative_store_path: "escape/blob",
        sha256: "0".repeat(64), created_at: 0, reason: "TEMP_TTL_EXPIRED", pinned: false }],
        pinned_count: 0, total_bytes: 8 }, artifactRoot),
      (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "GC_UNSAFE_BLOB_PATH");
      expect(existsSync(join(outside, "blob"))).toBe(true);
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

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
