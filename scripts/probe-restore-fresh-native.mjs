/** Fresh-target native restore acceptance probe; owned Windows Temp fixture only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";
import { createBackup, restoreBackup } from "../dist/storage/lifecycle-ops.js";
import { journalPathForDb } from "../dist/storage/restore-journal.js";

assert.equal(process.platform, "win32");
const root = mkdtempSync(join(tmpdir(), "aitest-fresh-native-"));
const sourcePath = join(root, "source", "state.db");
const targetPath = join(root, "runtime", "state.db");
const targetArtifacts = join(root, "runtime", "artifacts");
const expectedBlock = process.argv.includes("--expect-blocked");
try {
  mkdirSync(dirname(sourcePath), { recursive: true });
  const source = new Database(sourcePath);
  source.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
    INSERT INTO schema_migrations VALUES(7);
    CREATE TABLE test_jobs(id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
      relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);`);
  source.prepare("INSERT INTO test_jobs VALUES (?, 'COMPLETED')").run(randomUUID());
  const backup = await createBackup(source, sourcePath, join(root, "source", "artifacts"), join(root, "backups"));
  source.close();
  assert.equal(existsSync(targetPath), false, "fixture target must be fresh");
  try {
    await restoreBackup(backup.backup_dir, targetPath, targetArtifacts,
      { nativeHelper: packagedWindowsFileHelper() });
  } catch (error) {
    if (expectedBlock) {
      assert.equal(error?.details?.reason_code, "WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED");
      assert.equal(existsSync(targetPath), false);
      assert.equal(existsSync(journalPathForDb(targetPath)), false);
      process.stdout.write("KNOWN_BLOCK: fresh native restore stopped before mutation\n");
      process.exit(0);
    }
    throw new Error(`RED: fresh native restore rejected: ${error?.details?.reason_code ?? error}`, { cause: error });
  }
  const restored = new Database(targetPath, { readonly: true });
  try { assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM test_jobs").get().n, 1); }
  finally { restored.close(); }
  process.stdout.write("PASS: fresh native restore published verified SQLite generation\n");
} finally {
  assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
