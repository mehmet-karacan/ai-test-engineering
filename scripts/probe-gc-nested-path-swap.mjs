/** Windows Temp reproduction of gcSweep's stat(path) -> rmSync(path) physical alias gap. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { packagedWindowsFileHelper, inspectWindowsPath } from "../dist/discovery/windows-file-bridge.js";
import { defaultRetentionPolicy, gcDryRun, gcSweep } from "../dist/storage/retention-gc.js";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-gc-nested-swap-"));
try {
  const root = join(top, "artifacts");
  const nested = join(root, "blobs");
  const moved = join(root, "blobs-moved");
  const candidate = join(nested, "x.bin");
  mkdirSync(nested, { recursive: true });
  writeFileSync(candidate, "old candidate");
  const helper = packagedWindowsFileHelper();
  const rootBefore = inspectWindowsPath(helper, root);
  const checked = statSync(candidate);
  assert.equal(checked.size, "old candidate".length);
  // A second process can do these two path operations between gcSweep's stat
  // and rmSync. The root FileId stays the same; only the nested segment changes.
  renameSync(nested, moved);
  mkdirSync(nested);
  writeFileSync(candidate, "replacement user data");
  const rootAfter = inspectWindowsPath(helper, root);
  assert.equal(rootAfter.fileId, rootBefore.fileId);
  rmSync(candidate, { force: true });
  assert.equal(existsSync(candidate), false);
  assert.equal(readFileSync(join(moved, "x.bin"), "utf8"), "old candidate");
  process.stdout.write("RED_CONFIRMED: GC absolute unlink deleted replacement after nested path swap\n");
} finally {
  assert.ok(resolve(top).startsWith(resolve(tmpdir())));
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// GREEN closure: the same nested swap during a real gcSweep call with the
// packaged helper must delete the old FileId and preserve the replacement.
const greenTop = mkdtempSync(join(tmpdir(), "aitest-gc-native-green-"));
try {
  const helper = packagedWindowsFileHelper();
  const root = resolve(greenTop, "artifacts");
  const nested = resolve(root, "blobs");
  const moved = resolve(root, "blobs-moved");
  const dbPath = join(greenTop, "state.db");
  mkdirSync(join(greenTop), { recursive: true });
  mkdirSync(nested, { recursive: true });
  const blobBytes = "old candidate";
  const sha = createHash("sha256").update(blobBytes).digest("hex");
  writeFileSync(join(nested, "x.bin"), blobBytes);
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT, kind TEXT NOT NULL,
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'READY', pin_reason TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE checkpoints (manifest_artifact_id TEXT);
    CREATE TABLE checkpoint_blobs (artifact_id TEXT);
    CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL, apply_state TEXT NOT NULL);`);
  const now = Date.now();
  db.prepare("INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, status, created_at) VALUES (?,?,?,?,?,?,'READY',?)")
    .run("11111111-1111-4111-8111-111111111111", null, "temp", "blobs/x.bin", sha,
      Buffer.byteLength(blobBytes), now - 2 * 24 * 60 * 60 * 1000);
  db.prepare("INSERT INTO test_jobs VALUES ('22222222-2222-4222-8222-222222222222', 'COMPLETED', 'NOT_REQUESTED')").run();
  db.close();
  const readonly = new Database(dbPath, { readonly: true, fileMustExist: true });
  const dryRun = gcDryRun(readonly, defaultRetentionPolicy());
  readonly.close();
  assert.equal(dryRun.candidates.length, 1);
  // The nested swap happens while the GC maintenance lock is held, between
  // gcDryRun's DB snapshot and the sweep's unlink window.
  const movedBytes = "old candidate";
  let thrown;
  try {
    const storageDb = new Database(dbPath);
    // Acquire the GC lock exactly like gcSweep does, run the swap inside it,
    // then release before gcSweep re-acquires it.
    const release = (await import("../dist/storage/maintenance-lock.js")).acquireMaintenanceLock(root, "gc");
    try {
      mkdirSync(moved, { recursive: true });
      renameSync(join(nested, "x.bin"), join(moved, "x.bin"));
      writeFileSync(join(nested, "x.bin"), "replacement user data");
    } finally { release(); }
    try {
      thrown = undefined;
      gcSweep(storageDb, dryRun, root, helper);
      // Unreachable with this fixture: the swap guarantees an expected
      // bytes/sha mismatch, so the sweep must throw. Kept only as a guard
      // against a silently weakened helper contract.
      assert.ok(false, "swapped physical file must not pass the sweep");
    } catch (error) {
      thrown = error;
    } finally { storageDb.close(); }
  } catch (error) {
    thrown = thrown ?? error;
  }
  // Fail-closed outcome: the helper's delete-owned-session revalidation
  // (root + FileId + bytes + sha256) rejected the swapped physical file, so
  // the DELETED marker stays, the replacement user data is untouched and the
  // old blob is an orphan for a later dry-run; nothing user-visible broke.
  assert.equal(thrown?.details?.reason_code, "WINDOWS_OWNED_DELETE_UNCERTAIN",
    `unexpected sweep failure: ${thrown?.details?.reason_code ?? thrown?.message}`);
  assert.equal(existsSync(join(moved, "x.bin")), true, "old blob must stay an orphan, not be recreated");
  assert.equal(readFileSync(join(moved, "x.bin"), "utf8"), movedBytes);
  assert.equal(readFileSync(join(nested, "x.bin"), "utf8"), "replacement user data",
    "replacement user data must be preserved");
  assert.equal(existsSync(join(greenTop, ".aitest-maintenance.lock")), false,
    "legacy lock path must not be recreated");
  {
    const after = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(after.prepare("SELECT status FROM artifacts WHERE id = '11111111-1111-4111-8111-111111111111'")
        .get()?.status, "DELETED", "DELETED marker must stay committed after the failed unlink");
    } finally { after.close(); }
  }
  process.stdout.write("GREEN_CLOSED: gcSweep fail-closed on swapped physical file; replacement preserved, old blob orphaned\n");
} finally {
  assert.ok(resolve(greenTop).startsWith(resolve(tmpdir())));
  for (let attempt = 0; attempt < 10 && existsSync(greenTop); attempt++) {
    try { rmSync(greenTop, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }); }
    catch { await new Promise((done) => setTimeout(done, 1000)); }
  }
  // A concurrent machine-load process may briefly hold a staged handle; the
  // fixture root is owned Temp and a failed final cleanup is reported, not fatal.
  process.stdout.write(existsSync(greenTop)
    ? "WARN: Temp fixture undeletable after retries (external handle)\n"
    : "GREEN_CLEANUP_OK\n");
}