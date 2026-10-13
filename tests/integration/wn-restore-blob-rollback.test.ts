import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const hook = vi.hoisted(() => ({ obstructDelete: false }));
vi.mock("../../src/discovery/windows-file-bridge.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/discovery/windows-file-bridge.js")>();
  return { ...actual, verifyWindowsOwnedFile: (...args: Parameters<typeof actual.verifyWindowsOwnedFile>) => {
    if (hook.obstructDelete && args[1].includes("artifacts")) {
      hook.obstructDelete = false;
      const published = join(args[1], args[2]);
      linkSync(published, join(args[1], "blobs", "alias.bin"));
      throw new Error("forced final blob verification failure after physical publish");
    }
    return actual.verifyWindowsOwnedFile(...args);
  } };
});

import { packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";
import { createBackup, restoreBackup } from "../../src/storage/lifecycle-ops.js";
import { assertRestoreReadyBeforeOpen, journalPathForDb, readRestoreJournal,
  recoverIntactOldRestoreBeforeOpen } from "../../src/storage/restore-journal.js";

const SCHEMA = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);
`;

describe.skipIf(process.platform !== "win32")("WN13 native blob rollback order", () => {
  it("keeps journal nonterminal when a published blob cannot be deleted", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-restore-blob-rb-"));
    let source: Database.Database | undefined;
    try {
      const sourceDb = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(join(sourceArtifacts, "blobs"), { recursive: true });
      writeFileSync(join(sourceArtifacts, "blobs", "x.bin"), "new blob bytes");
      const sha = createHash("sha256").update("new blob bytes").digest("hex");
      source = new Database(sourceDb);
      source.exec(SCHEMA);
      source.prepare("INSERT INTO test_jobs VALUES ('new', 'COMPLETED')").run();
      source.prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?)")
        .run("artifact-1", "new", "blobs/x.bin", sha, 14, "READY");
      const backup = await createBackup(source, sourceDb, sourceArtifacts, join(root, "backups"));
      source.close(); source = undefined;
      const targetDb = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(targetArtifacts, { recursive: true });
      const old = new Database(targetDb);
      old.exec(SCHEMA);
      old.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
      old.close();
      hook.obstructDelete = true;
      await expect(restoreBackup(backup.backup_dir, targetDb, targetArtifacts,
        { nativeHelper: packagedWindowsFileHelper() })).rejects.toThrow();
      const journal = readRestoreJournal(journalPathForDb(targetDb));
      expect(journal?.phase).not.toBe("ROLLED_BACK");
      expect(journal?.phase).not.toBe("COMMITTED");
      expect(() => assertRestoreReadyBeforeOpen(targetDb)).toThrow();
      expect(() => recoverIntactOldRestoreBeforeOpen(targetDb)).toThrow();
      expect(readFileSync(join(targetArtifacts, "blobs", "x.bin"), "utf8")).toBe("new blob bytes");
      expect(existsSync(join(targetArtifacts, "blobs", "alias.bin"))).toBe(true);
      const reopened = new Database(targetDb, { readonly: true });
      try { expect(reopened.prepare("SELECT id FROM test_jobs").all()).toEqual([{ id: "old" }]); }
      finally { reopened.close(); }
    } finally {
      hook.obstructDelete = false;
      source?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
