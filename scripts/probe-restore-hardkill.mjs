/** Native Windows WN11 probe. Run after `npm run build`; only owned os.tmpdir fixtures are touched. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { createBackup, restoreBackup, sha256Data } from "../dist/storage/lifecycle-ops.js";
import { assertRestoreReadyBeforeOpen, journalPathForDb, readRestoreJournal, recoverPreparedRestoreBeforeOpen } from "../dist/storage/restore-journal.js";
import { acquireMaintenanceLock, acquireRestoreDbLock } from "../dist/storage/maintenance-lock.js";
import { Storage } from "../dist/storage/storage.js";

assert.equal(process.platform, "win32", "This probe requires native Windows taskkill");
const root = mkdtempSync(join(tmpdir(), "aitest-wn11-hardkill-"));
assert.ok(resolve(root).startsWith(resolve(tmpdir())));
const expectRecovery = process.argv.includes("--expect-recovery");
const modes = ["PREPARED", "LINK", "BLOBS_READY", "MOVE_DB", "MOVE_WAL", "MOVE_SHM", "OLD_DB_PRESERVED",
  "PUBLISH_DB", "NEW_DB_PUBLISHED", "VERIFIED", "COMMITTED"];
const schema = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);
`;
const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const childCode = `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const mode = process.argv[1], moduleUrl = process.argv[2], backupDir = process.argv[3], targetDb = process.argv[4], artifacts = process.argv[5];
let lastPhase = "";
function halt() { process.stdout.write("HALT:" + mode + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); }
const write = fs.writeFileSync;
fs.writeFileSync = (...args) => { const result = write(...args); if (typeof args[1] === "string") {
  try { lastPhase = JSON.parse(JSON.parse(args[1]).json).phase ?? lastPhase; } catch { /* other write */ }
} return result; };
const sync = fs.fsyncSync;
fs.fsyncSync = (fd) => { const result = sync(fd); if (lastPhase === mode) halt(); return result; };
const link = fs.linkSync;
fs.linkSync = (...args) => { const result = link(...args); if (mode === "LINK") halt(); return result; };
const rename = fs.renameSync;
fs.renameSync = (from, to) => { const result = rename(from, to);
  if (mode === "MOVE_DB" && from === targetDb && to.includes(".restore-old-")) halt();
  if (mode === "MOVE_WAL" && from === targetDb + "-wal" && to.includes(".restore-old-")) halt();
  if (mode === "MOVE_SHM" && from === targetDb + "-shm" && to.includes(".restore-old-")) halt();
  if (mode === "PUBLISH_DB" && to === targetDb && from.includes(".restore-") && !from.includes(".restore-old-")) halt();
  return result; };
syncBuiltinESMExports();
import(moduleUrl).then((module) => { module.restoreBackup(backupDir, targetDb, artifacts); process.exitCode = 43; })
  .catch((error) => { process.stderr.write(String(error?.stack ?? error)); process.exitCode = 44; });
`;

async function killAt(mode, backupDir, targetDb, artifacts) {
  const moduleUrl = pathToFileURL(resolve("dist/storage/lifecycle-ops.js")).href;
  const child = spawn(process.execPath, ["-e", childCode, mode, moduleUrl, backupDir, targetDb, artifacts],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error(`Timeout at ${mode}: ${stderr}`)), 10000);
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes(`HALT:${mode}`)) { clearTimeout(timer); ok(); }
      });
      child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`Child exited ${code} before ${mode}: ${stderr}`)); });
    });
    const killed = spawnSync("taskkill", ["/F", "/PID", String(child.pid)], { encoding: "utf8" });
    assert.equal(killed.status, 0, killed.stderr);
    await new Promise((ok) => { if (child.exitCode !== null) ok(); else child.once("exit", ok); });
  } finally {
    if (child.exitCode === null && child.pid) spawnSync("taskkill", ["/F", "/PID", String(child.pid)], { encoding: "utf8" });
  }
}

try {
  const results = [];
  const blockedRecoveries = [];
  for (const mode of modes) {
    const fixture = join(root, mode.toLowerCase());
    const sourceDbPath = join(fixture, "source", "state.db");
    const sourceArtifacts = join(fixture, "source", "artifacts");
    mkdirSync(dirname(sourceDbPath), { recursive: true });
    const source = new Database(sourceDbPath);
    source.exec(schema);
    const content = `new-blob-${mode}`;
    const sha = sha256Data(content);
    const rel = `blobs/sha256/${sha}`;
    const sourceBlob = join(sourceArtifacts, rel);
    mkdirSync(dirname(sourceBlob), { recursive: true });
    writeFileSync(sourceBlob, content);
    source.prepare("INSERT INTO artifacts (id, relative_store_path, sha256, bytes, status) VALUES ('new', ?, ?, ?, 'READY')")
      .run(rel, sha, Buffer.byteLength(content));
    const backup = await createBackup(source, sourceDbPath, sourceArtifacts, join(fixture, "backups"));
    source.close();
    const targetDb = join(fixture, "runtime", "state.db");
    const targetArtifacts = join(fixture, "runtime", "artifacts");
    mkdirSync(dirname(targetDb), { recursive: true });
    const old = new Database(targetDb);
    if (mode === "MOVE_WAL" || mode === "MOVE_SHM") old.pragma("journal_mode = WAL");
    old.exec(schema);
    old.prepare("INSERT INTO test_jobs (id, lifecycle) VALUES ('old', 'COMPLETED')").run();
    old.close();
    if (mode === "MOVE_WAL" || mode === "MOVE_SHM") {
      const wal = Buffer.alloc(32, 0);
      Buffer.from("377f0682", "hex").copy(wal, 0);
      writeFileSync(`${targetDb}-wal`, wal);
      writeFileSync(`${targetDb}-shm`, Buffer.alloc(32768, 0));
    }
    const oldHash = hashFile(targetDb);
    // SQLite may rewrite -shm while readonly preflight opens the WAL DB; it is an ephemeral index.
    const oldSidecarHashes = ["-wal"].filter((suffix) => existsSync(`${targetDb}${suffix}`))
      .map((suffix) => ({ suffix, hash: hashFile(`${targetDb}${suffix}`) }));
    const hadShm = existsSync(`${targetDb}-shm`);
    await killAt(mode, backup.backup_dir, targetDb, targetArtifacts);
    const journal = readRestoreJournal(journalPathForDb(targetDb));
    const oldCopies = [targetDb, ...readdirSync(dirname(targetDb)).filter((name) => name.startsWith("state.db.restore-old-"))
      .map((name) => join(dirname(targetDb), name))].filter((path) => existsSync(path) && hashFile(path) === oldHash);
    assert.ok(oldCopies.length >= 1, `${mode}: old DB bytes lost`);
    for (const sidecar of oldSidecarHashes) {
      const copies = [`${targetDb}${sidecar.suffix}`, ...readdirSync(dirname(targetDb))
        .filter((name) => name.startsWith(`state.db${sidecar.suffix}.restore-old-`))
        .map((name) => join(dirname(targetDb), name))];
      assert.ok(copies.some((path) => existsSync(path) && hashFile(path) === sidecar.hash), `${mode}: old ${sidecar.suffix} bytes lost`);
    }
    if (hadShm) {
      const shmCopies = [`${targetDb}-shm`, ...readdirSync(dirname(targetDb))
        .filter((name) => name.startsWith("state.db-shm.restore-old-"))
        .map((name) => join(dirname(targetDb), name))];
      assert.ok(shmCopies.some(existsSync), `${mode}: old -shm path lost`);
    }
    if (mode === "PREPARED" || mode === "LINK") {
      const reopened = new Storage({ dbPath: targetDb });
      assert.equal(reopened.db.prepare("SELECT id FROM test_jobs WHERE id = 'old'").get()?.id, "old");
      reopened.close();
    } else recoverPreparedRestoreBeforeOpen(targetDb);
    let startupBlocked = false;
    try { assertRestoreReadyBeforeOpen(targetDb); }
    catch (error) { startupBlocked = error?.details?.reason_code === "RESTORE_RECOVERY_REQUIRED"; }
    assert.equal(startupBlocked, mode !== "COMMITTED" && mode !== "PREPARED" && mode !== "LINK", `${mode}: startup gate mismatch`);
    if (mode === "PREPARED" || mode === "LINK") {
      assert.equal(readRestoreJournal(journalPathForDb(targetDb))?.phase, "ROLLED_BACK");
    }
    if (expectRecovery && startupBlocked) blockedRecoveries.push(mode);
    const releaseDb = acquireRestoreDbLock(targetDb); releaseDb();
    const releaseArtifact = acquireMaintenanceLock(targetArtifacts, "restore"); releaseArtifact();
    results.push({ mode, journal_phase: journal?.phase, startup_blocked: startupBlocked,
      old_db_copies: oldCopies.map((path) => path === targetDb ? "target" : "preserved"),
      new_blob_exists: existsSync(join(targetArtifacts, rel)) });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

  const rawRoot = join(root, "raw-open");
  const rawSourcePath = join(rawRoot, "source", "state.db");
  mkdirSync(dirname(rawSourcePath), { recursive: true });
  const rawSource = new Database(rawSourcePath);
  rawSource.exec(schema);
  const rawBackup = await createBackup(rawSource, rawSourcePath, join(rawRoot, "source", "artifacts"), join(rawRoot, "backups"));
  rawSource.close();
  const rawTargetPath = join(rawRoot, "runtime", "state.db");
  mkdirSync(dirname(rawTargetPath), { recursive: true });
  const rawTarget = new Database(rawTargetPath);
  rawTarget.pragma("journal_mode = WAL");
  rawTarget.exec(schema);
  rawTarget.prepare("INSERT INTO test_jobs (id, lifecycle) VALUES ('old-raw', 'COMPLETED')").run();
  rawTarget.close();
  const rawCode = `const Database = require("better-sqlite3"); const db = new Database(process.argv[1]);
    db.pragma("journal_mode = WAL"); db.prepare("SELECT id FROM test_jobs").get();
    process.stdout.write("READY\\n"); setInterval(() => {}, 1000);`;
  const rawOwner = spawn(process.execPath, ["-e", rawCode, rawTargetPath],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error("Raw SQLite owner timeout")), 10000);
      rawOwner.stdout.on("data", (chunk) => { if (chunk.toString().includes("READY")) { clearTimeout(timer); ok(); } });
      rawOwner.once("exit", (code) => { clearTimeout(timer); fail(new Error(`Raw SQLite owner exited ${code}`)); });
    });
    const before = ["", "-wal", "-shm"].map((suffix) => existsSync(`${rawTargetPath}${suffix}`)
      ? hashFile(`${rawTargetPath}${suffix}`) : null);
    let outcome = "RESTORED";
    try { restoreBackup(rawBackup.backup_dir, rawTargetPath, join(rawRoot, "runtime", "artifacts")); }
    catch (error) { outcome = error?.details?.reason_code ?? error?.code ?? String(error); }
    const after = ["", "-wal", "-shm"].map((suffix) => existsSync(`${rawTargetPath}${suffix}`)
      ? hashFile(`${rawTargetPath}${suffix}`) : null);
    process.stdout.write(`${JSON.stringify({ raw_open_outcome: outcome, db_wal_shm_unchanged: before.map((value, index) => value === after[index]),
      journal_phase: readRestoreJournal(journalPathForDb(rawTargetPath))?.phase })}\n`);
  } finally {
    if (rawOwner.exitCode === null && rawOwner.pid) spawnSync("taskkill", ["/F", "/PID", String(rawOwner.pid)], { encoding: "utf8" });
    await new Promise((ok) => { if (rawOwner.exitCode !== null) ok(); else rawOwner.once("exit", ok); });
  }
  if (expectRecovery && blockedRecoveries.length > 0) {
    process.stderr.write(`WN11 recovery RED: ${blockedRecoveries.length} nonterminal cut points remain blocked: ${blockedRecoveries.join(", ")}\n`);
    process.exitCode = 1;
  }
} finally {
  assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
