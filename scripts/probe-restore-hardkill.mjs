/** Windows WN11 probe. Run after `npm run build`; use --native --expect-recovery for 15-cut acceptance. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { createBackup, restoreBackup, sha256Data } from "../dist/storage/lifecycle-ops.js";
import { journalPathForDb, prepareRestorePhaseLine, readRestoreJournal } from "../dist/storage/restore-journal.js";
import { captureExpectedWindowsRestoreFile } from "../dist/storage/windows-restore-session.js";
import { startWindowsRestoreRecoverySession } from "../dist/storage/windows-restore-recovery-session.js";
import { faultFixtureWindowsFileHelper } from "./windows-file-helper-fault-fixture.mjs";
import { acquireMaintenanceLock, acquireRestoreDbLock } from "../dist/storage/maintenance-lock.js";
import { Storage } from "../dist/storage/storage.js";

assert.equal(process.platform, "win32", "This probe requires native Windows taskkill");
const root = mkdtempSync(join(tmpdir(), "aitest-wn11-hardkill-"));
assert.ok(resolve(root).startsWith(resolve(tmpdir())));
const expectRecovery = process.argv.includes("--expect-recovery");
const expectPreparedOld = process.argv.includes("--expect-prepared-old");
const preparedNegative = process.argv.find((arg) => arg.startsWith("--prepared-negative="))?.slice("--prepared-negative=".length);
const preparedNativeCut = process.argv.find((arg) => arg.startsWith("--prepared-native-cut="))?.slice("--prepared-native-cut=".length);
const native = process.argv.includes("--native");
assert.equal(native, true, "Production Windows restore is native-only; run this probe with --native");
const timeoutArgs = process.argv.filter((arg) => arg.startsWith("--cut-timeout-ms="));
assert.ok(timeoutArgs.length <= 1, "Specify --cut-timeout-ms once");
const timeoutText = timeoutArgs[0]?.slice("--cut-timeout-ms=".length);
assert.ok(timeoutText === undefined || /^[1-9]\d*$/u.test(timeoutText), "Invalid --cut-timeout-ms");
const cutTimeoutMs = timeoutText === undefined ? 45_000 : Number(timeoutText);
assert.ok(Number.isSafeInteger(cutTimeoutMs) && cutTimeoutMs >= 1_000 && cutTimeoutMs <= 180_000,
  "--cut-timeout-ms must be between 1000 and 180000");
const allModes = ["PREPARED", "LINK", "BLOBS_READY", "MOVE_DB", "OLD_DB_MOVED", "MOVE_WAL", "OLD_WAL_MOVED",
  "MOVE_SHM", "OLD_SHM_MOVED", "OLD_DB_PRESERVED", "PUBLISH_DB", "NEW_DB_MOVED",
  "NEW_DB_PUBLISHED", "VERIFIED", "COMMITTED"];
const selected = process.argv.find((arg) => arg.startsWith("--mode="))?.slice("--mode=".length);
assert.ok(!selected || allModes.includes(selected) || selected === "ROLLBACK_TERMINAL", "Unknown probe mode");
const modes = selected ? [selected] : allModes;
assert.ok(!expectPreparedOld || selected === "PREPARED", "--expect-prepared-old requires --mode=PREPARED");
assert.ok(!preparedNegative || selected === "PREPARED" && expectPreparedOld &&
  ["occupied", "parent-swap", "stage-occupied", "pending-occupied"].includes(preparedNegative),
"--prepared-negative requires --mode=PREPARED --expect-prepared-old");
assert.ok(!preparedNativeCut || selected === "PREPARED" && expectPreparedOld && !preparedNegative &&
  ["guard", "terminal-flush"].includes(preparedNativeCut),
"--prepared-native-cut requires --mode=PREPARED --expect-prepared-old");
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
const mode = process.argv[1], moduleUrl = process.argv[2], backupDir = process.argv[3], targetDb = process.argv[4], artifacts = process.argv[5], native = process.argv[6] === "native";
let lastPhase = "";
function halt() { process.stdout.write("HALT:" + mode + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); }
const write = fs.writeFileSync;
fs.writeFileSync = (...args) => { const result = write(...args); if (typeof args[1] === "string") {
  try { lastPhase = JSON.parse(JSON.parse(args[1]).json).phase ?? lastPhase; } catch { /* other write */ }
} return result; };
const sync = fs.fsyncSync;
fs.fsyncSync = (fd) => { const result = sync(fd);
  if (lastPhase === mode || mode === "ROLLBACK_TERMINAL" && lastPhase === "ROLLED_BACK") halt();
  return result; };
const link = fs.linkSync;
fs.linkSync = (...args) => { const result = link(...args); if (mode === "LINK") halt(); return result; };
const read = fs.readFileSync;
fs.readFileSync = (path, ...args) => {
  if (mode === "ROLLBACK_TERMINAL" && lastPhase === "NEW_DB_PUBLISHED" &&
      typeof path === "string" && path.startsWith(artifacts)) throw new Error("fixture published blob read failure");
  return read(path, ...args);
};
const rename = fs.renameSync;
fs.renameSync = (from, to) => { const result = rename(from, to);
  if (mode === "MOVE_DB" && from === targetDb && to.includes(".restore-old-")) halt();
  if (mode === "MOVE_WAL" && from === targetDb + "-wal" && to.includes(".restore-old-")) halt();
  if (mode === "MOVE_SHM" && from === targetDb + "-shm" && to.includes(".restore-old-")) halt();
  if (mode === "PUBLISH_DB" && to === targetDb && from.includes(".restore-") && !from.includes(".restore-old-")) halt();
  return result; };
if (native) {
  const childProcess = require("node:child_process");
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = (...args) => {
    const child = originalSpawn(...args);
    if (["session", "copy-stage-session", "blob-verify-session"].includes(args[1]?.[0])) {
      let pending = "";
      child.stdout.on("data", (data) => {
        pending += data.toString();
        if (pending.length > 8192) throw new Error("native probe line too long");
        let end;
        while ((end = pending.indexOf("\\n")) >= 0) {
          const line = pending.slice(0, end).replace(/\\r$/, "");
          pending = pending.slice(end + 1);
          const slot = mode === "MOVE_DB" ? "oldDb" : mode === "MOVE_WAL" ? "oldWal" :
            mode === "MOVE_SHM" ? "oldShm" : mode === "PUBLISH_DB" ? "stagedDb" : "";
          const fields = line.split("\\t");
          if (mode === "LINK" && args[1]?.[0] === "copy-stage-session" && fields[0] === "LINKED") halt();
          if (mode === "COMMITTED" && args[1]?.[0] === "blob-verify-session" && fields[0] === "COMMITTED") halt();
          if (slot && fields[0] === "MOVED" && fields[3] === slot) halt();
        }
      });
    }
    return child;
  };
}
syncBuiltinESMExports();
import(moduleUrl).then(async (module) => {
  await module.restoreBackup(backupDir, targetDb, artifacts);
  process.exitCode = 43;
})
  .catch((error) => { process.stderr.write(String(error?.stack ?? error)); process.exitCode = 44; });
`;

async function killAt(mode, backupDir, targetDb, artifacts) {
  const moduleUrl = pathToFileURL(resolve("dist/storage/lifecycle-ops.js")).href;
  const child = spawn(process.execPath, ["-e", childCode, mode, moduleUrl, backupDir, targetDb, artifacts,
    native ? "native" : "legacy"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        let journalPhase;
        try { journalPhase = readRestoreJournal(journalPathForDb(targetDb))?.phase ?? "absent"; }
        catch (error) { journalPhase = `unreadable:${String(error?.message)}`; }
        fail(new Error(`Timeout at ${mode} after ${cutTimeoutMs}ms; journal=${journalPhase}; ` +
          `last_stdout=${JSON.stringify(stdout.slice(-1024))}; last_stderr=${JSON.stringify(stderr.slice(-1024))}`));
      }, cutTimeoutMs);
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 8192) { clearTimeout(timer); fail(new Error(`Probe output too long at ${mode}`)); }
        if (stdout.includes(`HALT:${mode}\n`)) { clearTimeout(timer); ok(); }
      });
      child.once("exit", (code) => { clearTimeout(timer);
        const phase = readRestoreJournal(journalPathForDb(targetDb))?.phase;
        fail(new Error(`Child exited ${code} before ${mode}, journal ${phase}: ${stderr}`)); });
    });
    if (native && (mode === "COMMITTED" || mode === "ROLLBACK_TERMINAL")) {
      const writer = spawnSync(process.execPath, ["-e", `const Database=require("better-sqlite3");
        const db=new Database(process.argv[1]); db.pragma("busy_timeout=0");
        db.prepare("INSERT INTO test_jobs VALUES ('racing-writer','COMPLETED')").run(); db.close();`, targetDb],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });
      assert.notEqual(writer.status, 0, `native guard must deny raw writer during ${mode} fsync`);
    }
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
  const walModes = new Set(["MOVE_WAL", "OLD_WAL_MOVED", "MOVE_SHM", "OLD_SHM_MOVED"]);
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
    mkdirSync(targetArtifacts, { recursive: true });
    if (expectPreparedOld) mkdirSync(dirname(join(targetArtifacts, rel)), { recursive: true });
    const old = new Database(targetDb);
    if (walModes.has(mode)) old.pragma("journal_mode = WAL");
    old.exec(schema);
    old.prepare("INSERT INTO test_jobs (id, lifecycle) VALUES ('old', 'COMPLETED')").run();
    if (walModes.has(mode)) {
      const dbBeforeSentinel = readFileSync(targetDb);
      old.prepare("INSERT INTO test_jobs (id, lifecycle) VALUES ('wal-sentinel', 'COMPLETED')").run();
      assert.ok(existsSync(`${targetDb}-wal`) && existsSync(`${targetDb}-shm`));
      const dbBytes = readFileSync(targetDb);
      assert.deepEqual(dbBytes, dbBeforeSentinel, `${mode}: sentinel must exist only in WAL`);
      const walBytes = readFileSync(`${targetDb}-wal`);
      const shmBytes = readFileSync(`${targetDb}-shm`);
      assert.ok(walBytes.length > 32, `${mode}: real SQLite WAL frames required`);
      old.close();
      // SQLite's final close checkpoints/deletes WAL. Restore the captured
      // coherent main+WAL+SHM snapshot so the row remains uncheckpointed.
      writeFileSync(targetDb, dbBytes);
      writeFileSync(`${targetDb}-wal`, walBytes);
      writeFileSync(`${targetDb}-shm`, shmBytes);
    } else {
      old.close();
    }
    const oldHash = hashFile(targetDb);
    // SQLite may rewrite -shm while readonly preflight opens the WAL DB; it is an ephemeral index.
    const oldSidecarHashes = ["-wal"].filter((suffix) => existsSync(`${targetDb}${suffix}`))
      .map((suffix) => ({ suffix, hash: hashFile(`${targetDb}${suffix}`) }));
    const hadShm = existsSync(`${targetDb}-shm`);
    await killAt(mode, backup.backup_dir, targetDb, targetArtifacts);
    const journal = readRestoreJournal(journalPathForDb(targetDb));
    if (preparedNativeCut) {
      const helper = faultFixtureWindowsFileHelper();
      const previousCut = process.env.AITEST_NATIVE_EMPTY_ROLLBACK_HALT_AFTER_FLUSH;
      const previousMarker = process.env.AITEST_NATIVE_EMPTY_ROLLBACK_FLUSH_MARKER;
      const flushMarker = join(root, `${mode}-rollback-flushed.marker`);
      if (preparedNativeCut === "terminal-flush") {
        process.env.AITEST_NATIVE_EMPTY_ROLLBACK_HALT_AFTER_FLUSH = "1";
        process.env.AITEST_NATIVE_EMPTY_ROLLBACK_FLUSH_MARKER = flushMarker;
      }
      let recovery;
      try {
        recovery = await startWindowsRestoreRecoverySession(helper, journal);
      } finally {
        if (previousCut === undefined) delete process.env.AITEST_NATIVE_EMPTY_ROLLBACK_HALT_AFTER_FLUSH;
        else process.env.AITEST_NATIVE_EMPTY_ROLLBACK_HALT_AFTER_FLUSH = previousCut;
        if (previousMarker === undefined) delete process.env.AITEST_NATIVE_EMPTY_ROLLBACK_FLUSH_MARKER;
        else process.env.AITEST_NATIVE_EMPTY_ROLLBACK_FLUSH_MARKER = previousMarker;
      }
      try {
        assert.equal(recovery.remaining(), 0);
        await recovery.guardEmptyBlob();
        const journalPath = journalPathForDb(targetDb);
        const line = prepareRestorePhaseLine(journalPath, { ...journal, phase: "ROLLED_BACK" });
        const journalIdentity = captureExpectedWindowsRestoreFile(helper, journalPath);
        if (preparedNativeCut === "guard") {
          const killed = spawnSync("taskkill", ["/F", "/PID", String(recovery.pid)], { encoding: "utf8" });
          assert.equal(killed.status, 0, killed.stderr);
          await assert.rejects(recovery.commitEmptyRollback(journalPath, journalIdentity, line));
          assert.equal(readRestoreJournal(journalPath).phase, "PREPARED");
        } else {
          const commit = recovery.commitEmptyRollback(journalPath, journalIdentity, line);
          let flushed = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            if (existsSync(flushMarker)) { flushed = true; break; }
            await new Promise((done) => setTimeout(done, 50));
          }
          assert.equal(flushed, true, "fixture marker must follow native journal FlushFileBuffers");
          assert.equal(readRestoreJournal(journalPath).phase, "ROLLED_BACK");
          const killed = spawnSync("taskkill", ["/F", "/PID", String(recovery.pid)], { encoding: "utf8" });
          assert.equal(killed.status, 0, killed.stderr);
          await assert.rejects(commit);
          assert.equal(readRestoreJournal(journalPath).phase, "ROLLED_BACK");
        }
      } finally { recovery.abort(); }
      assert.equal(existsSync(journal.stageIntents[0].path), false);
      assert.equal(existsSync(`${journal.stageIntents[0].path}.pending`), false);
      assert.equal(existsSync(journal.publishedBlobs[0].path), false);
    }
    if (preparedNegative) {
      assert.equal(journal.phase, "PREPARED");
      assert.equal(journal.stageIntents?.[0]?.identity, null);
      const parent = dirname(join(targetArtifacts, rel));
      if (preparedNegative === "parent-swap") {
        renameSync(parent, `${parent}-moved`);
        mkdirSync(parent);
      } else {
        const occupied = preparedNegative === "occupied" ? join(targetArtifacts, rel) :
          preparedNegative === "stage-occupied" ? journal.stageIntents[0].path :
            `${journal.stageIntents[0].path}.pending`;
        writeFileSync(occupied, "foreign name");
      }
    }
    const oldCopies = [targetDb, ...readdirSync(dirname(targetDb)).filter((name) => name.startsWith("state.db.restore-old-"))
      .map((name) => join(dirname(targetDb), name))].filter((path) => existsSync(path) && hashFile(path) === oldHash);
    assert.ok(oldCopies.length >= 1, `${mode}: old DB bytes lost`);
    const newAtTarget = ["PUBLISH_DB", "NEW_DB_MOVED", "NEW_DB_PUBLISHED", "VERIFIED", "COMMITTED"].includes(mode);
    const oldAtTarget = ["PREPARED", "LINK", "BLOBS_READY"].includes(mode);
    assert.equal(existsSync(targetDb), newAtTarget || oldAtTarget, `${mode}: target DB physical layout`);
    assert.equal(existsSync(journal.stagedDbPath), !newAtTarget, `${mode}: staged DB physical layout`);
    assert.equal(hashFile(newAtTarget ? targetDb : journal.stagedDbPath), journal.evidence.sourceDbSha256,
      `${mode}: physical new DB hash`);
    if (oldAtTarget) assert.equal(hashFile(targetDb), oldHash, `${mode}: old target DB hash`);
    if (["MOVE_DB", "OLD_DB_MOVED", "MOVE_WAL", "OLD_WAL_MOVED", "MOVE_SHM", "OLD_SHM_MOVED"].includes(mode)) {
      const expectedPhase = mode.startsWith("OLD_") ? mode : mode === "MOVE_DB" ? "BLOBS_READY" :
        mode === "MOVE_WAL" ? "OLD_DB_MOVED" : "OLD_WAL_MOVED";
      assert.equal(journal?.phase, expectedPhase);
      assert.equal(existsSync(targetDb), false, `${mode}: target DB must be absent after old DB move`);
      assert.equal(hashFile(journal.preservedDbPath), oldHash, `${mode}: preserved old DB hash`);
      assert.equal(hashFile(journal.stagedDbPath), journal.evidence.sourceDbSha256, `${mode}: staged new DB hash`);
      if (["MOVE_WAL", "OLD_WAL_MOVED", "MOVE_SHM", "OLD_SHM_MOVED"].includes(mode)) {
        const oldWalHash = oldSidecarHashes.find((item) => item.suffix === "-wal")?.hash;
        assert.ok(oldWalHash, `${mode}: fixture old WAL identity missing`);
        assert.equal(existsSync(`${targetDb}-wal`), false);
        assert.equal(hashFile(`${targetDb}-wal${journal.preservedDbPath.slice(targetDb.length)}`), oldWalHash);
        assert.equal(existsSync(`${targetDb}-shm`), mode === "MOVE_WAL" || mode === "OLD_WAL_MOVED");
        assert.equal(existsSync(`${targetDb}-shm${journal.preservedDbPath.slice(targetDb.length)}`), mode === "MOVE_SHM" || mode === "OLD_SHM_MOVED");
      }
    }
    if (mode === "NEW_DB_MOVED") {
      assert.equal(journal?.phase, "NEW_DB_MOVED");
      assert.equal(hashFile(targetDb), journal.evidence.sourceDbSha256);
      assert.equal(hashFile(journal.preservedDbPath), oldHash);
    }
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
    let startupBlocked = false;
    let openedGeneration = null;
    try {
      const reopened = new Storage({ dbPath: targetDb });
      try {
        if ((!native && (mode === "PREPARED" || mode === "LINK" || mode === "BLOBS_READY")) ||
            expectPreparedOld && !preparedNegative && mode === "PREPARED") {
          assert.equal(reopened.db.prepare("SELECT id FROM test_jobs WHERE id = 'old'").get()?.id, "old");
          if (walModes.has(mode)) {
            assert.equal(reopened.db.prepare("SELECT id FROM test_jobs WHERE id = 'wal-sentinel'").get()?.id,
              "wal-sentinel", `${mode}: uncheckpointed WAL row must survive`);
          }
          assert.equal(reopened.db.prepare("SELECT id FROM artifacts WHERE id = 'new'").get(), undefined);
          openedGeneration = "old";
        } else if (mode === "COMMITTED") {
          assert.equal(reopened.db.prepare("SELECT id FROM artifacts WHERE id = 'new'").get()?.id, "new");
          assert.equal(reopened.db.prepare("SELECT id FROM test_jobs WHERE id = 'old'").get(), undefined);
          openedGeneration = "new";
        }
      } finally {
        reopened.close();
      }
    } catch (error) {
      startupBlocked = error?.details?.reason_code === "RESTORE_RECOVERY_REQUIRED";
      if (!startupBlocked) throw error;
    }
    assert.equal(startupBlocked, (!expectPreparedOld || !!preparedNegative) && mode !== "COMMITTED" && (native ||
      mode !== "PREPARED" && mode !== "LINK" && mode !== "BLOBS_READY"), `${mode}: startup gate mismatch`);
    if (!native && (mode === "PREPARED" || mode === "LINK" || mode === "BLOBS_READY") ||
        expectPreparedOld && !preparedNegative) {
      assert.equal(readRestoreJournal(journalPathForDb(targetDb))?.phase, "ROLLED_BACK");
    }
    if (expectRecovery && startupBlocked) blockedRecoveries.push(mode);
    assert.equal(existsSync(join(targetArtifacts, rel)), preparedNegative === "occupied" ||
      mode !== "PREPARED" && mode !== "LINK",
      `${mode}: blob ownership/layout changed`);
    const releaseDb = acquireRestoreDbLock(targetDb); releaseDb();
    const releaseArtifact = acquireMaintenanceLock(targetArtifacts, "restore"); releaseArtifact();
    results.push({ mode, journal_phase: journal?.phase, startup_blocked: startupBlocked, opened_generation: openedGeneration,
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
  mkdirSync(join(rawRoot, "runtime", "artifacts"), { recursive: true });
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
    try { await restoreBackup(rawBackup.backup_dir, rawTargetPath, join(rawRoot, "runtime", "artifacts")); }
    catch (error) { outcome = error?.details?.reason_code ?? error?.code ?? String(error); }
    const after = ["", "-wal", "-shm"].map((suffix) => existsSync(`${rawTargetPath}${suffix}`)
      ? hashFile(`${rawTargetPath}${suffix}`) : null);
    assert.notEqual(outcome, "RESTORED", "active raw SQLite owner must block restore");
    assert.deepEqual(after, before, "active raw SQLite DB/WAL/SHM must remain unchanged");
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
