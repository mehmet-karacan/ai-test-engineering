import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const cut = vi.hoisted(() => ({ root: "", blocked: false, attempted: false }));
vi.mock("../../src/storage/restore-journal.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/storage/restore-journal.js")>();
  return { ...actual, appendRestorePhase: (path: string, record: Parameters<typeof actual.appendRestorePhase>[1]) => {
    if (record.phase === "VERIFIED" && cut.root) {
      cut.attempted = true;
      const nested = join(cut.root, "blobs");
      try {
        renameSync(nested, join(cut.root, "blobs-moved"));
        mkdirSync(nested);
        writeFileSync(join(nested, "x.bin"), "wrong replacement");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM" &&
            (error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
        cut.blocked = true;
      }
    }
    return actual.appendRestorePhase(path, record);
  } };
});

import { packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";
import { faultFixtureWindowsFileHelper } from "../../scripts/windows-file-helper-fault-fixture.mjs";
import { registerWindowsNativeTestLock } from "../support/windows-native-test-lock.js";

registerWindowsNativeTestLock("wn-restore-blob-terminal");
import { createBackup, restoreBackup } from "../../src/storage/lifecycle-ops.js";
import { journalPathForDb, readRestoreJournal } from "../../src/storage/restore-journal.js";

const SCHEMA = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);
`;

describe.skipIf(process.platform !== "win32")("WN13 terminal blob guard", () => {
  it("denies nested replacement at VERIFIED before COMMITTED fsync", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-blob-terminal-"));
    let source: Database.Database | undefined;
    try {
      const sourceDb = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(join(sourceArtifacts, "blobs"), { recursive: true });
      writeFileSync(join(sourceArtifacts, "blobs", "x.bin"), "expected bytes");
      source = new Database(sourceDb);
      source.exec(SCHEMA);
      source.prepare("INSERT INTO test_jobs VALUES ('new', 'COMPLETED')").run();
      source.prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?)")
        .run("artifact-1", "new", "blobs/x.bin", createHash("sha256").update("expected bytes").digest("hex"), 14, "READY");
      const backup = await createBackup(source, sourceDb, sourceArtifacts, join(root, "backups"));
      source.close(); source = undefined;
      const targetDb = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(targetArtifacts, { recursive: true });
      const old = new Database(targetDb);
      old.exec(SCHEMA);
      old.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
      old.close();
      cut.root = targetArtifacts;
      await restoreBackup(backup.backup_dir, targetDb, targetArtifacts,
        { nativeHelper: packagedWindowsFileHelper() });
      expect(cut.attempted).toBe(true);
      expect(cut.blocked).toBe(true);
      expect(readRestoreJournal(journalPathForDb(targetDb))?.phase).toBe("COMMITTED");
      expect(readFileSync(join(targetArtifacts, "blobs", "x.bin"), "utf8")).toBe("expected bytes");
    } finally {
      cut.root = ""; cut.blocked = false; cut.attempted = false;
      source?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it("reports typed uncertainty when native helper exits after flush before ACK", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-blob-ack-loss-"));
    let source: Database.Database | undefined;
    const priorFault = process.env.AITEST_NATIVE_BLOB_COMMIT_DROP_ACK;
    try {
      const sourceDb = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(join(sourceArtifacts, "blobs"), { recursive: true });
      writeFileSync(join(sourceArtifacts, "blobs", "x.bin"), "expected bytes");
      source = new Database(sourceDb);
      source.exec(SCHEMA);
      source.prepare("INSERT INTO test_jobs VALUES ('new', 'COMPLETED')").run();
      source.prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?)")
        .run("artifact-1", "new", "blobs/x.bin", createHash("sha256").update("expected bytes").digest("hex"), 14, "READY");
      const backup = await createBackup(source, sourceDb, sourceArtifacts, join(root, "backups"));
      source.close(); source = undefined;
      const targetDb = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(targetArtifacts, { recursive: true });
      const old = new Database(targetDb);
      old.exec(SCHEMA);
      old.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
      old.close();
      process.env.AITEST_NATIVE_BLOB_COMMIT_DROP_ACK = "1";
      await expect(restoreBackup(backup.backup_dir, targetDb, targetArtifacts,
        { nativeHelper: faultFixtureWindowsFileHelper() })).rejects.toMatchObject({
        code: "STORAGE_ERROR", details: { reason_code: "RESTORE_COMMIT_ACK_UNCERTAIN" },
      });
      expect(readRestoreJournal(journalPathForDb(targetDb))?.phase).toBe("COMMITTED");
      const published = new Database(targetDb, { readonly: true });
      try { expect(published.prepare("SELECT id FROM test_jobs").all()).toEqual([{ id: "new" }]); }
      finally { published.close(); }
      expect(readFileSync(join(targetArtifacts, "blobs", "x.bin"), "utf8")).toBe("expected bytes");
    } finally {
      if (priorFault === undefined) delete process.env.AITEST_NATIVE_BLOB_COMMIT_DROP_ACK;
      else process.env.AITEST_NATIVE_BLOB_COMMIT_DROP_ACK = priorFault;
      source?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
