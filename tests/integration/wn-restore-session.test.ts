import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";
import { captureExpectedWindowsRestoreFile, startWindowsRestoreMoveSession } from "../../src/storage/windows-restore-session.js";
import { createBackup, restoreBackup } from "../../src/storage/lifecycle-ops.js";
import { journalPathForDb, readRestoreJournal } from "../../src/storage/restore-journal.js";

const SCHEMA = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);
`;

describe("S01 native restore session adapter", () => {
  it("rejects a fresh target before native restore mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-native-fresh-block-"));
    let source: Database.Database | undefined;
    try {
      const sourcePath = join(root, "source", "state.db");
      mkdirSync(join(root, "source"), { recursive: true });
      source = new Database(sourcePath);
      source.exec(SCHEMA);
      const backup = await createBackup(source, sourcePath, join(root, "source", "artifacts"), join(root, "backups"));
      source.close(); source = undefined;
      const target = join(root, "runtime", "state.db");
      await expect(restoreBackup(backup.backup_dir, target, join(root, "runtime", "artifacts"),
        { nativeHelper: packagedWindowsFileHelper() })).rejects.toMatchObject({
        details: { reason_code: "WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED" },
      });
      expect(existsSync(target)).toBe(false);
      expect(existsSync(journalPathForDb(target))).toBe(false);
    } finally {
      source?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("fsyncs initial FileIds and native move receipts before committing", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-native-restore-journal-"));
    let source: Database.Database | undefined;
    try {
      const sourcePath = join(root, "source", "state.db");
      mkdirSync(join(root, "source"), { recursive: true });
      source = new Database(sourcePath);
      source.exec(SCHEMA);
      source.prepare("INSERT INTO test_jobs VALUES ('new', 'COMPLETED')").run();
      const backup = await createBackup(source, sourcePath, join(root, "source", "artifacts"), join(root, "backups"));
      source.close(); source = undefined;
      const target = join(root, "runtime", "state.db");
      mkdirSync(join(root, "runtime"), { recursive: true });
      const old = new Database(target);
      old.exec(SCHEMA);
      old.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
      old.close();
      await restoreBackup(backup.backup_dir, target, join(root, "runtime", "artifacts"),
        { nativeHelper: packagedWindowsFileHelper() });
      const journal = readRestoreJournal(journalPathForDb(target));
      expect(journal?.phase).toBe("COMMITTED");
      expect(journal?.nativeInitial?.oldDb.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(journal?.nativeInitial?.oldWal).toBeNull();
      expect(journal?.nativeInitial?.oldShm).toBeNull();
      expect(journal?.nativeInitial?.stagedDb.sha256).toBe(journal?.evidence?.sourceDbSha256);
      expect(journal?.moveReceipts?.[0]?.before).toEqual(journal?.nativeInitial?.oldDb);
      expect(journal?.moveReceipts?.map((receipt) => receipt.slot)).toEqual(["oldDb", "stagedDb"]);
      const restored = new Database(target, { readonly: true });
      try { expect(restored.prepare("SELECT id FROM test_jobs").all()).toEqual([{ id: "new" }]); }
      finally { restored.close(); }
    } finally {
      source?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("pins old and staged SQLite files through rename and read verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-adapter-"));
    const helper = packagedWindowsFileHelper();
    const name = "state.db";
    const stagedName = `${name}.restore-${randomUUID()}`;
    const preservedSuffix = `.restore-old-${randomUUID()}`;
    const target = join(root, name);
    const staged = join(root, stagedName);
    let session: Awaited<ReturnType<typeof startWindowsRestoreMoveSession>> | undefined;
    try {
      mkdirSync(root, { recursive: true });
      const old = new Database(target);
      old.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1)");
      old.close();
      const next = new Database(staged);
      next.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (2)");
      next.close();
      session = await startWindowsRestoreMoveSession(helper, { dbDirectory: root, dbName: name, stagedName,
        preservedSuffix, generation: randomUUID(), expected: {
          oldDb: captureExpectedWindowsRestoreFile(helper, target),
          stagedDb: captureExpectedWindowsRestoreFile(helper, staged),
        } });
      const oldReceipt = await session.renameOwned("oldDb", `${name}${preservedSuffix}`);
      expect(oldReceipt.before.fileId).toBe(oldReceipt.after.fileId);
      const newReceipt = await session.renameOwned("stagedDb", name);
      expect(newReceipt.sequence).toBe(2);
      await session.enterReadVerify();
      const readonly = new Database(target, { readonly: true });
      try { expect(readonly.prepare("SELECT x FROM t").get()).toMatchObject({ x: 2 }); }
      finally { readonly.close(); }
      await session.close();
      session = undefined;
      expect(existsSync(staged)).toBe(false);
      const preserved = new Database(`${target}${preservedSuffix}`, { readonly: true });
      try { expect(preserved.prepare("SELECT x FROM t").get()).toMatchObject({ x: 1 }); }
      finally { preserved.close(); }
    } finally {
      await session?.close().catch(() => undefined);
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
