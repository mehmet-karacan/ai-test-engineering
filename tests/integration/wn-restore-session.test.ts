import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { inspectWindowsPath, packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";
import { captureExpectedWindowsRestoreFile, startWindowsFreshRestoreMoveSession,
  startWindowsRestoreMoveSession } from "../../src/storage/windows-restore-session.js";
import { createBackup, restoreBackup } from "../../src/storage/lifecycle-ops.js";
import { captureRestoreEvidence, journalPathForDb, readRestoreJournal,
  type RestoreJournalRecord } from "../../src/storage/restore-journal.js";
import { startWindowsRestoreRecoverySession } from "../../src/storage/windows-restore-recovery-session.js";

const SCHEMA = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);
`;

describe("S01 native restore session adapter", () => {
  it("stages and publishes a manifest blob with owned native FileIds", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-native-blob-"));
    let source: Database.Database | undefined;
    try {
      const sourcePath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(join(sourceArtifacts, "blobs"), { recursive: true });
      writeFileSync(join(sourceArtifacts, "blobs", "x.bin"), "new blob bytes");
      const sha = createHash("sha256").update("new blob bytes").digest("hex");
      source = new Database(sourcePath);
      source.exec(SCHEMA);
      source.prepare("INSERT INTO test_jobs VALUES ('new', 'COMPLETED')").run();
      source.prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?)")
        .run("artifact-1", "new", "blobs/x.bin", sha, 14, "READY");
      const backup = await createBackup(source, sourcePath, sourceArtifacts, join(root, "backups"));
      source.close(); source = undefined;
      const target = join(root, "runtime", "state.db");
      mkdirSync(join(root, "runtime"), { recursive: true });
      const old = new Database(target);
      old.exec(SCHEMA);
      old.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
      old.close();
      const targetArtifacts = join(root, "runtime", "artifacts");
      await expect(restoreBackup(backup.backup_dir, target, targetArtifacts)).rejects.toMatchObject({
        details: { reason_code: "RESTORE_ARTIFACT_ROOT_REQUIRED" },
      });
      expect(existsSync(journalPathForDb(target))).toBe(false);
      mkdirSync(targetArtifacts, { recursive: true });
      await restoreBackup(backup.backup_dir, target, targetArtifacts);
      expect(readFileSync(join(targetArtifacts, "blobs", "x.bin"), "utf8")).toBe("new blob bytes");
      const firstJournal = readRestoreJournal(journalPathForDb(target));
      expect(firstJournal?.phase).toBe("COMMITTED");
      const journalLines = readFileSync(journalPathForDb(target), "utf8").trimEnd().split("\n")
        .map((line) => JSON.parse(JSON.parse(line).json) as RestoreJournalRecord);
      expect(journalLines.slice(0, 3).map((record) => record.phase))
        .toEqual(["PREPARED", "PREPARED", "BLOBS_READY"]);
      expect(journalLines[0]?.stageIntents?.[0]?.identity).toBeNull();
      expect(journalLines[1]?.stageIntents?.[0]?.identity?.fileId).toMatch(/^[a-f0-9]{32}$/u);
      expect(firstJournal?.stageIntents).toHaveLength(1);
      expect(firstJournal?.stageIntents?.[0]?.sha256).toBe(sha);
      expect(firstJournal?.stageIntents?.[0]?.identity?.fileId).toMatch(/^[a-f0-9]{32}$/u);
      const originalBlobId = inspectWindowsPath(packagedWindowsFileHelper(), join(targetArtifacts, "blobs", "x.bin")).fileId;
      expect(firstJournal?.stageIntents?.[0]?.identity?.fileId).toBe(originalBlobId);
      await restoreBackup(backup.backup_dir, target, targetArtifacts,
        { nativeHelper: packagedWindowsFileHelper() });
      expect(inspectWindowsPath(packagedWindowsFileHelper(), join(targetArtifacts, "blobs", "x.bin")).fileId)
        .toBe(originalBlobId);
    } finally {
      source?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 120_000);
  it("accepts a journal-proven fresh physical publish and reverses only its staged FileId", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-native-fresh-recover-"));
    const helper = packagedWindowsFileHelper();
    const name = "state.db";
    const stagedName = `${name}.restore-${randomUUID()}`;
    const staged = join(root, stagedName);
    const target = join(root, name);
    const manifest = join(root, "manifest.json");
    const generation = randomUUID();
    const preservedSuffix = `.restore-old-${randomUUID()}`;
    let session: Awaited<ReturnType<typeof startWindowsFreshRestoreMoveSession>> | undefined;
    try {
      const source = new Database(staged);
      source.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (43)");
      source.close();
      writeFileSync(manifest, "manifest");
      const evidence = captureRestoreEvidence(target, staged, manifest, []);
      const initial = captureExpectedWindowsRestoreFile(helper, staged);
      session = await startWindowsFreshRestoreMoveSession(helper, { dbDirectory: root, dbName: name,
        stagedName, preservedSuffix, generation,
        expected: { oldDb: null, oldWal: null, oldShm: null, stagedDb: initial } });
      const published = await session.renameOwned("stagedDb", name);
      await session.enterReadVerify();
      await session.close();
      session = undefined;
      const journal: RestoreJournalRecord = { formatVersion: 2, generation, phase: "NEW_DB_MOVED",
        targetDbPath: target, artifactRoot: join(root, "artifacts"), stagedDbPath: staged,
        preservedDbPath: join(root, `${name}${preservedSuffix}`), publishedBlobs: [],
        nativeInitial: { oldDb: null, oldWal: null, oldShm: null, stagedDb: initial },
        moveReceipts: [published], evidence };
      const recovering = await startWindowsRestoreRecoverySession(helper, journal);
      expect(recovering.remaining()).toBe(1);
      const reversed = await recovering.rollbackOne();
      expect(reversed.before).toEqual(initial);
      await recovering.close();
      expect(existsSync(target)).toBe(false);
      expect(existsSync(staged)).toBe(true);
    } finally {
      await session?.close().catch(() => undefined);
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("uses the separate fresh session while retaining native identity and reverse receipts", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-native-fresh-session-"));
    const helper = packagedWindowsFileHelper();
    const name = "state.db";
    const stagedName = `${name}.restore-${randomUUID()}`;
    const staged = join(root, stagedName);
    const target = join(root, name);
    let session: Awaited<ReturnType<typeof startWindowsFreshRestoreMoveSession>> | undefined;
    try {
      const source = new Database(staged);
      source.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (42)");
      source.close();
      const initial = captureExpectedWindowsRestoreFile(helper, staged);
      session = await startWindowsFreshRestoreMoveSession(helper, {
        dbDirectory: root, dbName: name, stagedName,
        preservedSuffix: `.restore-old-${randomUUID()}`, generation: randomUUID(),
        expected: { oldDb: null, oldWal: null, oldShm: null, stagedDb: initial },
      });
      const published = await session.renameOwned("stagedDb", name);
      expect(published.sequence).toBe(1);
      expect(published.before).toEqual(initial);
      await session.enterReadVerify();
      const reader = new Database(target, { readonly: true });
      try { expect(reader.prepare("SELECT x FROM t").get()).toEqual({ x: 42 }); }
      finally { reader.close(); }
      const rawWriter = spawnSync(process.execPath, ["-e",
        "const D=require('better-sqlite3');const db=new D(process.argv[1]);db.exec('INSERT INTO t VALUES (99)');db.close()", target],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });
      expect(rawWriter.status).not.toBe(0);
      expect(rawWriter.stderr).toMatch(/SqliteError|database is locked|unable to open database/iu);
      const reversed = await session.renameOwned("stagedDb", stagedName);
      expect(reversed.before).toEqual(initial);
      expect(reversed.sequence).toBe(2);
      await session.close();
      session = undefined;
      expect(existsSync(target)).toBe(false);
      expect(existsSync(staged)).toBe(true);
    } finally {
      await session?.close().catch(() => undefined);
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

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
      await expect(restoreBackup(backup.backup_dir, target, join(root, "runtime", "artifacts"))).rejects.toMatchObject({
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
      mkdirSync(join(root, "runtime", "artifacts"), { recursive: true });
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
