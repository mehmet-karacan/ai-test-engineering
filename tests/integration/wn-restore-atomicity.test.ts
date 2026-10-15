/**
 * S01 kirmizi test (WN restore atomikligi): restoreBackup, blob kopyama asamasinda
 * cakismayla karsilastiginda (hedefte ayni relative_path'te FARKLI baytli mevcut
 * destination blob), onceki aktif state.db ve blob icerikleri byte-ayni kalmali.
 *
 * Yontem: gercek Windows better-sqlite3 fixture'i + gercek createBackup ile
 * uretilmis tam backup. Farkli baytli hedef preflight'ta reddedilir. Ayrica
 * staging kopyasi, blob yayini ve DB yayini hata noktalarina fault enjekte edilir.
 */
import { describe, it, vi } from "vitest";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createBackup, restoreBackup, verifyBackup, sha256Data } from "../../src/storage/lifecycle-ops.js";
import { journalPathForDb, readRestoreJournal } from "../../src/storage/restore-journal.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { acquireRestoreDbLock } from "../../src/storage/maintenance-lock.js";
import { Storage } from "../../src/storage/storage.js";
import { registerWindowsNativeTestLock } from "../support/windows-native-test-lock.js";

registerWindowsNativeTestLock("wn-restore-atomicity");

type BlobEntry = { relative_path: string; sha256: string; bytes: number };
const faults = vi.hoisted(() => ({ tamperStagedDb: false, afterDbStageCopy: null as null | (() => void),
  dbPublish: false, secondBlobPublish: false, linkCount: 0,
  afterFirstLink: null as null | (() => void) }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const copyFileSync: typeof actual.copyFileSync = (src, dest, mode) => {
    const copied = actual.copyFileSync(src, dest, mode);
    if (faults.tamperStagedDb && String(src).endsWith("state.db") && String(dest).includes(".restore-")) {
      const staged = new Database(String(dest));
      try { staged.prepare("INSERT INTO test_jobs VALUES ('untrusted-copy', 'COMPLETED')").run(); }
      finally { staged.close(); }
    }
    if (String(src).endsWith("state.db") && String(dest).includes(".restore-")) faults.afterDbStageCopy?.();
    return copied;
  };
  return { ...actual, copyFileSync };
});

vi.mock("../../src/discovery/windows-file-bridge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/discovery/windows-file-bridge.js")>();
  return { ...actual, renameWindowsOwnedFile: (...args: Parameters<typeof actual.renameWindowsOwnedFile>) => {
    if (faults.secondBlobPublish && ++faults.linkCount === 2) {
      const error: NodeJS.ErrnoException = new Error("EACCES: second native blob publish denied");
      error.code = "EACCES";
      throw error;
    }
    const receipt = actual.renameWindowsOwnedFile(...args);
    if (faults.secondBlobPublish && faults.linkCount === 1) faults.afterFirstLink?.();
    return receipt;
  } };
});

vi.mock("../../src/storage/windows-restore-session.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/storage/windows-restore-session.js")>();
  return { ...actual, startWindowsRestoreMoveSession: async (...args: Parameters<typeof actual.startWindowsRestoreMoveSession>) => {
    const session = await actual.startWindowsRestoreMoveSession(...args);
    return new Proxy(session, { get(target, key, receiver) {
      if (key !== "renameOwned") return Reflect.get(target, key, receiver);
      return async (...moveArgs: Parameters<typeof session.renameOwned>) => {
        if (faults.dbPublish && moveArgs[0] === "stagedDb") {
          const error: NodeJS.ErrnoException = new Error("EACCES: native database publish denied");
          error.code = "EACCES";
          throw error;
        }
        return session.renameOwned(...moveArgs);
      };
    } });
  } };
});

const SCHEMA = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (
    id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL,
    bytes INTEGER NOT NULL, status TEXT NOT NULL
  );
`;

function makeBlob(artifactsRoot: string, text: string): BlobEntry {
  const sha256 = sha256Data(text);
  const relative_path = `blobs/sha256/${sha256}`;
  const destination = join(artifactsRoot, relative_path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, text);
  return { relative_path, sha256, bytes: Buffer.byteLength(text) };
}

function seedTarget(dbPath: string, artifactsRoot: string): string {
  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(artifactsRoot, { recursive: true });
  const db = new Database(dbPath);
  try { db.exec(SCHEMA); }
  finally { db.close(); }
  return sha256Data(readFileSync(dbPath));
}

describe("WN restore atomikligi", () => {
  it.each(["./", "a/../", "a//", "a\\", "a:", "a. /"])("rejects noncanonical blob segment %s before backup publication", async (segment) => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-path-canonical-"));
    let db: Database.Database | undefined;
    try {
      const dbPath = join(root, "source", "state.db");
      mkdirSync(dirname(dbPath), { recursive: true });
      db = new Database(dbPath);
      db.exec(SCHEMA);
      const blob = makeBlob(join(root, "source", "artifacts"), "canonical payload");
      const alias = `blobs/sha256/${segment}${blob.sha256}`;
      db.prepare("INSERT INTO artifacts (id, relative_store_path, sha256, bytes, status) VALUES ('alias', ?, ?, ?, 'READY')")
        .run(alias, blob.sha256, blob.bytes);
      await assert.rejects(createBackup(db, dbPath, join(root, "source", "artifacts"), join(root, "backups")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "BACKUP_BLOB_PATH_INVALID");
    } finally {
      db?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a crafted manifest and snapshot with two aliases of one physical destination", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-duplicate-destination-"));
    let db: Database.Database | undefined;
    try {
      const dbPath = join(root, "source", "state.db");
      mkdirSync(dirname(dbPath), { recursive: true });
      db = new Database(dbPath);
      db.exec(SCHEMA);
      const blob = makeBlob(join(root, "source", "artifacts"), "duplicate payload");
      db.prepare("INSERT INTO artifacts (id, relative_store_path, sha256, bytes, status) VALUES ('first', ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(db, dbPath, join(root, "source", "artifacts"), join(root, "backups"));
      db.close(); db = undefined;
      const alias = `blobs/sha256/a/../${blob.sha256}`;
      const snapshot = new Database(join(saved.backup_dir, "state.db"));
      snapshot.prepare("INSERT INTO artifacts (id, relative_store_path, sha256, bytes, status) VALUES ('second', ?, ?, ?, 'READY')")
        .run(alias, blob.sha256, blob.bytes);
      snapshot.close();
      const manifestPath = join(saved.backup_dir, "blob-manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { blobs: BlobEntry[] };
      manifest.blobs.push({ ...blob, relative_path: alias });
      writeFileSync(manifestPath, JSON.stringify(manifest));
      assert.equal(verifyBackup(saved.backup_dir).valid, false);
      const targetDbPath = join(root, "runtime", "state.db");
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")));
      assert.equal(existsSync(targetDbPath), false);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      db?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a nonterminal target job before changing DB or journal", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-active-restore-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const saved = await createBackup(sourceDb, sourceDbPath, join(root, "source", "artifacts"), join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      mkdirSync(join(root, "runtime", "artifacts"), { recursive: true });
      const target = new Database(targetDbPath);
      target.exec(SCHEMA);
      target.prepare("INSERT INTO test_jobs VALUES ('active-job', 'RUNNING')").run();
      target.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_ACTIVE_JOBS");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects an open same-process Storage before moving live WAL or SHM", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-open-storage-"));
    let sourceDb: Database.Database | undefined;
    let live: Storage | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const saved = await createBackup(sourceDb, sourceDbPath, join(root, "source", "artifacts"), join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      mkdirSync(join(root, "runtime", "artifacts"), { recursive: true });
      live = new Storage({ dbPath: targetDbPath });
      live.db.exec(SCHEMA);
      const baseline = sha256Data(readFileSync(targetDbPath));
      const walPath = `${targetDbPath}-wal`;
      const shmPath = `${targetDbPath}-shm`;
      const walBaseline = existsSync(walPath) ? sha256Data(readFileSync(walPath)) : null;
      const shmBaseline = existsSync(shmPath) ? sha256Data(readFileSync(shmPath)) : null;
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_DB_OPEN");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(walPath), walBaseline !== null);
      assert.equal(existsSync(shmPath), shmBaseline !== null);
      if (walBaseline !== null) assert.equal(sha256Data(readFileSync(walPath)), walBaseline);
      if (shmBaseline !== null) assert.equal(sha256Data(readFileSync(shmPath)), shmBaseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      live?.close();
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("backup refuses a source blob junction instead of following it", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-create-backup-junction-"));
    const dbPath = join(root, "state.db");
    const artifacts = join(root, "artifacts");
    const db = new Database(dbPath);
    try {
      db.exec(SCHEMA);
      const blob = makeBlob(artifacts, "source junction payload");
      db.prepare("INSERT INTO artifacts VALUES ('a', NULL, ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const segment = join(artifacts, "blobs", "sha256");
      const outside = join(root, "outside-source");
      renameSync(segment, outside);
      symlinkSync(outside, segment, "junction");
      await assert.rejects(createBackup(db, dbPath, artifacts, join(root, "backups")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "BACKUP_REPARSE_POINT");
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a backup tree nested inside the target artifact root before restore mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-overlap-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "shared-artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(sourceArtifacts, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, sourceArtifacts),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_PATH_OVERLAP");
      assert.equal(existsSync(targetDbPath), false);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a nested junction before a blob can be written outside the artifact root", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-junction-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const blob = makeBlob(sourceArtifacts, "junction payload");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('a', NULL, ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      const baseline = seedTarget(targetDbPath, targetArtifacts);
      const outside = join(root, "outside");
      mkdirSync(outside, { recursive: true });
      mkdirSync(targetArtifacts, { recursive: true });
      symlinkSync(outside, join(targetArtifacts, "blobs"), "junction");
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_REPARSE_POINT");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
      assert.equal(existsSync(join(outside, "sha256", blob.sha256)), false);
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a junction in the backup blob tree before reading it", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-backup-junction-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const blob = makeBlob(sourceArtifacts, "backup junction payload");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('a', NULL, ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const backupSegment = join(saved.backup_dir, "blobs", "blobs", "sha256");
      const outside = join(root, "outside-backup-segment");
      renameSync(backupSegment, outside);
      symlinkSync(outside, backupSegment, "junction");
      assert.equal(verifyBackup(saved.backup_dir).valid, false);
      const targetDbPath = join(root, "runtime", "state.db");
      const baseline = seedTarget(targetDbPath, join(root, "runtime", "artifacts"));
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_REPARSE_POINT");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a blob destination that aliases the target DB", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-db-blob-collision-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const content = "blob at future db path";
      const sha256 = sha256Data(content);
      mkdirSync(sourceArtifacts, { recursive: true });
      writeFileSync(join(sourceArtifacts, "state.db"), content);
      sourceDb.prepare("INSERT INTO artifacts VALUES ('a', NULL, 'state.db', ?, ?, 'READY')")
        .run(sha256, Buffer.byteLength(content));
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      const baseline = seedTarget(targetDbPath, dirname(targetDbPath));
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, dirname(targetDbPath)),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_PATH_COLLISION");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a manifest blob path on another drive before target mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-cross-drive-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const blob = makeBlob(sourceArtifacts, "cross drive payload");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('a', NULL, ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const manifestPath = join(saved.backup_dir, "blob-manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { blobs: Array<{ relative_path: string }> };
      const otherDrive = root[0]?.toUpperCase() === "C" ? "D" : "C";
      manifest.blobs[0]!.relative_path = `${otherDrive}:\\outside\\blob`;
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const targetDbPath = join(root, "runtime", "state.db");
      const baseline = seedTarget(targetDbPath, join(root, "runtime", "artifacts"));
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "PATH_ESCAPE");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a file used as a blob parent before the journal starts", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-parent-file-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const blob = makeBlob(sourceArtifacts, "parent file payload");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('a', NULL, ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      const baseline = seedTarget(targetDbPath, targetArtifacts);
      writeFileSync(join(targetArtifacts, "blobs"), "keep me");
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_PARENT_NOT_DIRECTORY");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
      assert.equal(readFileSync(join(targetArtifacts, "blobs"), "utf8"), "keep me");
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("DB owner lock blocks restore before journal or active DB changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-db-owner-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const saved = await createBackup(sourceDb, sourceDbPath, join(root, "source", "artifacts"), join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      const releaseDb = acquireRestoreDbLock(targetDbPath);
      mkdirSync(join(root, "other-artifacts"), { recursive: true });
      try {
        await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "other-artifacts")),
          (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "MAINTENANCE_BUSY_OR_STALE");
        assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
        assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
      } finally { releaseDb(); }
    } finally {
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("restoreBackup EEXIST'te onceki aktif state.db ve blob'lari byte-ayni birakir", async () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "aitest-wn-restore-src-"));
    const runtimeRoot = mkdtempSync(join(tmpdir(), "aitest-wn-restore-run-"));
    let sourceDb: Database.Database | undefined;
    try {
      // Gercek better-sqlite3 fixture: yedegin alindigi canli runtime.
      const sourceDbPath = join(sourceRoot, "state.db");
      const sourceArtifacts = join(sourceRoot, "artifacts");
      sourceDb = new Database(sourceDbPath);
      sourceDb.pragma("foreign_keys = ON");
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const backupBlob = makeBlob(sourceArtifacts, "yedek icerigi");
      sourceDb
        .prepare("INSERT INTO artifacts VALUES ('backup-art', 'backup-job', ?, ?, ?, 'READY')")
        .run(backupBlob.relative_path, backupBlob.sha256, backupBlob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(sourceRoot, "backups"));
      sourceDb.close();
      sourceDb = undefined;

      // Onceki aktif runtime: gercek state.db + kendi READY blob'u + carpisan hedef.
      const runtimeDbPath = join(runtimeRoot, "state.db");
      const runtimeArtifacts = join(runtimeRoot, "artifacts");
      const runtimeDb = new Database(runtimeDbPath);
      runtimeDb.pragma("foreign_keys = ON");
      runtimeDb.exec(SCHEMA);
      runtimeDb.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      const activeBlob = makeBlob(runtimeArtifacts, "onceki aktif icerik");
      runtimeDb
        .prepare("INSERT INTO artifacts VALUES ('active-art', 'active-job', ?, ?, ?, 'READY')")
        .run(activeBlob.relative_path, activeBlob.sha256, activeBlob.bytes);
      runtimeDb.close();

      // EEXIST kaynagi: hedefte ayni relative_path'te FARKLI baytli mevcut destination blob.
      const destinationBlobPath = join(runtimeArtifacts, backupBlob.relative_path);
      mkdirSync(dirname(destinationBlobPath), { recursive: true });
      writeFileSync(destinationBlobPath, "hedefteki farkli eski baytlar");

      // Baseline: restore oncesi byte goruntusu (DB kapali; baytlar stabil).
      const dbBaselineHash = sha256Data(readFileSync(runtimeDbPath));
      const activeBlobBaselineHash = sha256Data(readFileSync(join(runtimeArtifacts, activeBlob.relative_path)));
      const destinationBaselineHash = sha256Data(readFileSync(destinationBlobPath));

      let thrown: unknown;
      try {
        await restoreBackup(saved.backup_dir, runtimeDbPath, runtimeArtifacts);
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown, "restoreBackup farkli baytli mevcut hedef blob'da EEXIST ile durmali");
      assert.equal((thrown as { code?: unknown }).code, "STORAGE_ERROR");
      assert.equal((thrown as { details?: { reason_code?: unknown } }).details?.reason_code, "RESTORE_BLOB_EXISTS_MISMATCH");

      // Atomiklik iddiasi: onceki aktif state.db byte-ayni kalmali.
      assert.equal(
        sha256Data(readFileSync(runtimeDbPath)),
        dbBaselineHash,
        "restoreBackup EEXIST'te onceki aktif state.db'i byte olarak degistirmemeli",
      );

      // Blob icerikleri de byte-ayni kalmali.
      assert.equal(
        sha256Data(readFileSync(join(runtimeArtifacts, activeBlob.relative_path))),
        activeBlobBaselineHash,
        "onceki aktif READY blob byte-ayni kalmali",
      );
      assert.equal(
        sha256Data(readFileSync(destinationBlobPath)),
        destinationBaselineHash,
        "farkli baytli mevcut hedef blob EEXIST'te ezilmemeli",
      );
    } finally {
      sourceDb?.close();
      rmSync(sourceRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      rmSync(runtimeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("native staged blob copy fails when the verified source disappears", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-io-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const blob = makeBlob(sourceArtifacts, "backup payload");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('backup-art', 'backup-job', ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;

      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      mkdirSync(targetArtifacts, { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));

      faults.afterDbStageCopy = () => { rmSync(join(saved.backup_dir, "blobs", blob.relative_path), { force: true }); };
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts));
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline, "copy failure must preserve active DB bytes");
      assert.equal(readRestoreJournal(journalPathForDb(targetDbPath))?.phase, "PREPARED");
      assert.equal(existsSync(join(targetArtifacts, blob.relative_path)), false);
    } finally {
      faults.afterDbStageCopy = null;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a changed staged DB before moving the old generation", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-stage-identity-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const saved = await createBackup(sourceDb, sourceDbPath, join(root, "source", "artifacts"), join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      mkdirSync(join(root, "runtime", "artifacts"), { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      faults.tamperStagedDb = true;
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_STAGED_DB_CHANGED");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(journalPathForDb(targetDbPath)), false);
    } finally {
      faults.tamperStagedDb = false;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects a changed native staged blob before publishing any target blob", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-stage-blob-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      const blob = makeBlob(sourceArtifacts, "verified backup blob");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('backup-art', NULL, ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      mkdirSync(targetArtifacts, { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      faults.afterDbStageCopy = () => { writeFileSync(join(saved.backup_dir, "blobs", blob.relative_path), "tampered backup blob"); };
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts),
        (error: unknown) => (error as { details?: { reason_code?: unknown } })?.details?.reason_code === "RESTORE_STAGED_BLOB_CHANGED");
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(existsSync(join(targetArtifacts, blob.relative_path)), false);
    } finally {
      faults.afterDbStageCopy = null;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("database publish failure preserves the active database", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-db-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const saved = await createBackup(sourceDb, sourceDbPath, join(root, "source", "artifacts"), join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      mkdirSync(join(root, "runtime", "artifacts"), { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      faults.dbPublish = true;
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")), /EACCES/);
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline, "publish failure must preserve old DB bytes");
      assert.equal(readRestoreJournal(journalPathForDb(targetDbPath))?.phase, "ROLLED_BACK");
    } finally {
      faults.dbPublish = false;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("second native blob publish denial preserves old DB and retains first blob under journal", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-link-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const blobs = [makeBlob(sourceArtifacts, "new payload one"), makeBlob(sourceArtifacts, "new payload two")];
      for (const [index, blob] of blobs.entries()) {
        sourceDb.prepare("INSERT INTO artifacts VALUES (?, 'backup-job', ?, ?, ?, 'READY')")
          .run(`backup-art-${index}`, blob.relative_path, blob.sha256, blob.bytes);
      }
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      mkdirSync(targetArtifacts, { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      faults.secondBlobPublish = true;
      faults.linkCount = 0;
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts), /EACCES/);
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline);
      assert.equal(readFileSync(join(targetArtifacts, blobs[0]!.relative_path), "utf8"), "new payload one");
      assert.equal(existsSync(join(targetArtifacts, blobs[1]!.relative_path)), false);
      assert.equal(readRestoreJournal(journalPathForDb(targetDbPath))?.phase, "PREPARED");
    } finally {
      faults.secondBlobPublish = false;
      faults.linkCount = 0;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rollback cannot delete a blob newly referenced by a concurrent normal publish", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-publish-race-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const sourceStore = new ArtifactStore({ root: sourceArtifacts });
      const firstRecord = sourceStore.publish("report", "shared payload");
      const first: BlobEntry = { relative_path: firstRecord.relativeStorePath, sha256: firstRecord.sha256, bytes: Buffer.byteLength("shared payload") };
      const second = makeBlob(sourceArtifacts, "second payload");
      for (const [index, blob] of [first, second].entries()) {
        sourceDb.prepare("INSERT INTO artifacts VALUES (?, 'backup-job', ?, ?, ?, 'READY')")
          .run(`backup-art-${index}`, blob.relative_path, blob.sha256, blob.bytes);
      }
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      const runtimeStore = new ArtifactStore({ root: targetArtifacts });
      seedTarget(targetDbPath, targetArtifacts);
      let publishSucceeded = false;
      let publishError: unknown;
      faults.secondBlobPublish = true;
      faults.linkCount = 0;
      faults.afterFirstLink = () => {
        try { runtimeStore.publish("report", "shared payload"); publishSucceeded = true; }
        catch (error) { publishError = error; }
      };
      await assert.rejects(restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts), /EACCES/);
      const firstPath = join(targetArtifacts, first.relative_path);
      if (publishSucceeded) {
        assert.equal(existsSync(firstPath), true, "normal publisher's referenced blob must survive restore rollback");
      } else {
        assert.equal((publishError as { details?: { reason_code?: unknown } })?.details?.reason_code,
          "MAINTENANCE_BUSY_OR_STALE", "publisher must be blocked by restore ownership");
      }
    } finally {
      faults.secondBlobPublish = false;
      faults.linkCount = 0;
      faults.afterFirstLink = null;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
