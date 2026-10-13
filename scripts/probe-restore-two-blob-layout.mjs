/** Windows hard-kill layout matrix for two new blobs in distinct parents. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { createBackup, sha256Data } from "../dist/storage/lifecycle-ops.js";
import { prepareRestorePhaseLine, readRestoreJournal, journalPathForDb } from "../dist/storage/restore-journal.js";
import { Storage } from "../dist/storage/storage.js";
import { packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";
import { captureExpectedWindowsRestoreFile } from "../dist/storage/windows-restore-session.js";
import { faultFixtureWindowsFileHelper } from "./windows-file-helper-fault-fixture.mjs";

assert.equal(process.platform, "win32");
const cuts = ["PREPARED", "RECEIPT_1", "LINK_1", "RECEIPT_2", "LINK_2", "PUBLISH_1", "PUBLISH_2"];
const selected = process.argv.find((value) => value.startsWith("--cut="))?.slice(6);
assert.ok(!selected || cuts.includes(selected));
const expectOld = process.argv.includes("--expect-old");
assert.ok(!expectOld || !!selected, "--expect-old needs a single cut");
const reverseLayout = process.argv.includes("--reverse-layout");
assert.ok(!reverseLayout || selected === "PUBLISH_1", "--reverse-layout needs PUBLISH_1");
const trace = process.argv.includes("--trace");
const guardAfterCut = process.argv.includes("--guard-after-cut");
assert.ok(!guardAfterCut || selected === "PUBLISH_1", "--guard-after-cut needs PUBLISH_1");
const armCut = process.argv.find((value) => value.startsWith("--arm-cut="))?.slice(10);
assert.ok(!armCut || ["first", "second"].includes(armCut));
assert.ok(!armCut || guardAfterCut, "--arm-cut needs --guard-after-cut");
const walSentinel = process.argv.includes("--wal-sentinel");
assert.ok(!walSentinel || !!armCut, "--wal-sentinel needs a partial ARM cut");
const terminalCut = process.argv.find((value) => value.startsWith("--terminal-cut="))?.slice(15);
assert.ok(!terminalCut || ["before", "partial", "flush-fail", "after", "ack"].includes(terminalCut));
assert.ok(!terminalCut || !!armCut, "--terminal-cut needs a partial ARM cut");
const root = mkdtempSync(join(tmpdir(), "aitest-wn11-two-blob-"));
const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const assertDispositionReceipt = (path, journal, index, mode) => {
  const line = readFileSync(path, "utf8");
  assert.equal(line.endsWith("\n"), true, "receipt needs a complete line");
  const fields = line.slice(0, -1).split("\t");
  assert.equal(fields.length, 13);
  const item = journal.stageIntents[index];
  const root = journal.emptyBlobGuard.root;
  const parent = journal.emptyBlobGuard.parents[index];
  assert.deepEqual(fields.slice(0, 4), ["AITE6_DISPOSITION_RECEIPT_V1", journal.generation, String(index), mode]);
  assert.deepEqual(fields.slice(4, 12), [root.volumeSerial, root.fileId, parent.volumeSerial,
    parent.fileId, item.identity.volumeSerial, item.identity.fileId, String(item.identity.bytes), item.identity.sha256]);
  assert.equal(fields[12], Buffer.from(basename(mode === "stage" ? item.path :
    journal.publishedBlobs[index].path), "utf16le").toString("hex"));
};
const schema = `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);`;
const childCode = `
const fs=require("node:fs"), cp=require("node:child_process");
const {syncBuiltinESMExports}=require("node:module");
const cut=process.argv[1], moduleUrl=process.argv[2], backup=process.argv[3], db=process.argv[4], artifacts=process.argv[5];
const trace=process.argv[6]==="trace";
function mark(value){if(trace) process.stderr.write("TRACE:"+value+"\\n");}
let phase="", receipts=0, links=0, publishes=0;
function halt(){process.stdout.write("HALT:"+cut+"\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);}
const write=fs.writeFileSync;
fs.writeFileSync=(...args)=>{const result=write(...args); if(typeof args[1]==="string") try {
  const record=JSON.parse(JSON.parse(args[1]).json); phase=record.phase??phase;
  receipts=record.stageIntents?.filter((entry)=>entry.identity!==null).length??receipts;
  mark("journal:"+phase+":"+receipts);
} catch {} return result;};
const fsync=fs.fsyncSync;
fs.fsyncSync=(fd)=>{const result=fsync(fd);
  if(phase==="PREPARED" && (cut==="PREPARED" && receipts===0 || cut==="RECEIPT_1" && receipts===1 ||
      cut==="RECEIPT_2" && receipts===2)) halt();
  return result;};
const spawn=cp.spawn;
cp.spawn=(...args)=>{const child=spawn(...args); if(args[1]?.[0]==="copy-stage-session"){
  let pending=""; child.stdout.on("data",(data)=>{pending+=data.toString(); let end;
    while((end=pending.indexOf("\\n"))>=0){const line=pending.slice(0,end).replace(/\\r$/,"");pending=pending.slice(end+1);
      if(line==="LINKED") { mark("linked:"+(++links));
        if(links===(cut==="LINK_1"?1:cut==="LINK_2"?2:-1)) halt(); }
    }
  });
} return child;};
const spawnSync=cp.spawnSync;
cp.spawnSync=(...args)=>{const result=spawnSync(...args);
  if(args[1]?.[0]==="rename-owned") mark("rename:"+result.status);
  if(args[1]?.[0]==="rename-owned" && result.status===0 &&
      ++publishes===(cut==="PUBLISH_1"?1:cut==="PUBLISH_2"?2:-1)) halt();
  return result;};
syncBuiltinESMExports();
import(moduleUrl).then((module)=>module.restoreBackup(backup,db,artifacts)).then(()=>{process.exitCode=43;})
  .catch((error)=>{process.stderr.write(String(error?.stack??error));process.exitCode=44;});
`;

try {
  const results = [];
  for (const cut of selected ? [selected] : cuts) {
    const fixture = join(root, cut.toLowerCase());
    const sourceDb = join(fixture, "source", "state.db");
    const sourceArtifacts = join(fixture, "source", "artifacts");
    mkdirSync(dirname(sourceDb), { recursive: true });
    const source = new Database(sourceDb);
    source.exec(schema);
    const relatives = [];
    for (const [index, parent] of ["first", "second"].entries()) {
      const bytes = `two-blob-${index}-${cut}`;
      const sha = sha256Data(bytes);
      const relativePath = `blobs/${parent}/${sha}`;
      const path = join(sourceArtifacts, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      source.prepare("INSERT INTO artifacts (id, relative_store_path, sha256, bytes, status) VALUES (?, ?, ?, ?, 'READY')")
        .run(`new-${index}`, relativePath, sha, Buffer.byteLength(bytes));
      relatives.push(relativePath);
    }
    const backup = await createBackup(source, sourceDb, sourceArtifacts, join(fixture, "backup"));
    source.close();
    const targetDb = join(fixture, "runtime", "state.db");
    const targetArtifacts = join(fixture, "runtime", "artifacts");
    mkdirSync(dirname(targetDb), { recursive: true });
    for (const rel of relatives) mkdirSync(dirname(join(targetArtifacts, rel)), { recursive: true });
    const old = new Database(targetDb);
    if (walSentinel) old.pragma("journal_mode = WAL");
    old.exec(schema);
    old.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
    if (walSentinel) {
      const mainBeforeSentinel = readFileSync(targetDb);
      old.prepare("INSERT INTO test_jobs VALUES ('wal-sentinel', 'COMPLETED')").run();
      assert.deepEqual(readFileSync(targetDb), mainBeforeSentinel,
        "sentinel must be in real uncheckpointed WAL");
      const mainBytes = readFileSync(targetDb);
      const walBytes = readFileSync(`${targetDb}-wal`);
      const shmBytes = readFileSync(`${targetDb}-shm`);
      assert.ok(walBytes.length > 32, "real WAL frame required");
      old.close();
      writeFileSync(targetDb, mainBytes);
      writeFileSync(`${targetDb}-wal`, walBytes);
      writeFileSync(`${targetDb}-shm`, shmBytes);
    } else old.close();
    const oldHash = hashFile(targetDb);
    const oldWalHash = walSentinel ? hashFile(`${targetDb}-wal`) : null;
    const child = spawn(process.execPath,
      ["-e", childCode, cut, pathToFileURL(resolve("dist/storage/lifecycle-ops.js")).href,
        backup.backup_dir, targetDb, targetArtifacts, trace ? "trace" : ""],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stderr.on("data", (bytes) => { stderr += bytes.toString(); });
    try {
      await new Promise((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`${cut} timeout: ${stdout.slice(-300)} ${stderr.slice(-300)}`)), 120_000);
        child.stdout.on("data", (bytes) => {
          stdout += bytes.toString();
          if (stdout.includes(`HALT:${cut}\n`)) { clearTimeout(timer); done(); }
        });
        child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`${cut} exited ${code}: ${stderr}`)); });
      });
      const killed = spawnSync("taskkill", ["/F", "/PID", String(child.pid)], { encoding: "utf8" });
      assert.equal(killed.status, 0, killed.stderr);
      if (child.exitCode === null) await new Promise((done) => child.once("exit", done));
    } finally {
      if (child.exitCode === null && child.pid) spawnSync("taskkill", ["/F", "/PID", String(child.pid)], { encoding: "utf8" });
    }
    const journal = readRestoreJournal(journalPathForDb(targetDb));
    assert.equal(journal.phase, "PREPARED");
    assert.equal(journal.stageIntents.length, 2);
    assert.equal(journal.emptyBlobGuard.parents.length, 2);
    assert.notDeepEqual(journal.emptyBlobGuard.parents[0], journal.emptyBlobGuard.parents[1]);
    assert.equal(hashFile(targetDb), oldHash);
    if (walSentinel) assert.equal(hashFile(`${targetDb}-wal`), oldWalHash);
    if (reverseLayout) {
      renameSync(journal.publishedBlobs[0].path, journal.stageIntents[0].path);
      renameSync(journal.stageIntents[1].path, journal.publishedBlobs[1].path);
    }
    const expected = {
      PREPARED: [0, ["none", "none"]], RECEIPT_1: [1, ["none", "none"]],
      LINK_1: [1, ["stage", "none"]], RECEIPT_2: [2, ["stage", "none"]],
      LINK_2: [2, ["stage", "stage"]], PUBLISH_1: [2, ["destination", "stage"]],
      PUBLISH_2: [2, ["destination", "destination"]],
    }[cut];
    if (reverseLayout) expected[1] = ["stage", "destination"];
    assert.equal(journal.stageIntents.filter((item) => item.identity !== null).length, expected[0]);
    for (let index = 0; index < 2; index++) {
      const stage = journal.stageIntents[index].path;
      const destination = journal.publishedBlobs[index].path;
      for (let attempt = 0; attempt < 100 && existsSync(`${stage}.pending`); attempt++) {
        await new Promise((done) => setTimeout(done, 50));
      }
      assert.equal(existsSync(`${stage}.pending`), false);
      assert.equal(existsSync(stage), expected[1][index] === "stage");
      assert.equal(existsSync(destination), expected[1][index] === "destination");
      if (existsSync(stage)) assert.equal(hashFile(stage), journal.stageIntents[index].sha256);
      if (existsSync(destination)) assert.equal(hashFile(destination), journal.stageIntents[index].sha256);
    }
    if (guardAfterCut) {
      const journalPath = journalPathForDb(targetDb);
      const journalBeforeGuard = readFileSync(journalPath);
      const helper = armCut ? faultFixtureWindowsFileHelper() : packagedWindowsFileHelper();
      const hex = (value) => Buffer.from(value, "utf16le").toString("hex");
      const armMarker = join(fixture, `arm-${armCut}.marker`);
      const native = spawn(helper.path, ["recover-session", dirname(targetDb), hex(basename(targetDb)),
        hex(basename(journal.stagedDbPath)), hex(basename(journal.preservedDbPath)), journal.generation],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
          env: armCut ? {
            ...process.env, AITEST_NATIVE_TWO_BLOB_ARM_HALT_INDEX: armCut === "first" ? "0" : "1",
            AITEST_NATIVE_TWO_BLOB_ARM_MARKER: armMarker,
          } : process.env });
      const lines = createInterface({ input: native.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
      const next = async () => {
        const result = await lines.next();
        assert.equal(result.done, false, "native guard closed before receipt");
        return result.value;
      };
      try {
        const ready = (await next()).split("\t");
        assert.deepEqual(ready.slice(0, 3), ["RECOVERY_READY", journal.generation, "0"]);
        native.stdin.write(["ACCEPT", journal.generation, "0", ...ready.slice(3)].join("\t") + "\n");
        assert.equal(await next(), `ACCEPTED\t${journal.generation}\t0`);
        native.stdin.write("GUARD_BEGIN\t2\n");
        assert.equal(await next(), "GUARD_BEGIN_OK\t2");
        for (let index = 0; index < 2; index++) {
          const stage = journal.stageIntents[index];
          const destination = journal.publishedBlobs[index].path;
          const parent = dirname(destination);
          const parentRelative = parent.slice(journal.artifactRoot.length).replace(/^[/\\]/u, "");
          const mode = existsSync(stage.path) ? "stage" : "destination";
          const owned = stage.identity;
          assert.ok(owned, "published blob needs durable stage receipt");
          const rootId = journal.emptyBlobGuard.root;
          const parentId = journal.emptyBlobGuard.parents[index];
          assert.ok(parentId, "existing parent identity required");
          native.stdin.write(["GUARD_ITEM", index, hex(journal.artifactRoot), hex(parentRelative),
            hex(basename(destination)), hex(basename(stage.path)), rootId.volumeSerial, rootId.fileId,
            parentId.volumeSerial, parentId.fileId, mode, owned.volumeSerial, owned.fileId,
            owned.bytes, owned.sha256].join("\t") + "\n");
          assert.equal(await next(), `GUARD_ITEM_OK\t${index}`);
        }
        native.stdin.write("GUARD_FINAL\n");
        assert.equal(await next(), "GUARD_READY\t2");
        if (armCut) {
          native.stdin.write("GUARD_ARM\n");
          for (let attempt = 0; attempt < 200 && !existsSync(armMarker); attempt++) {
            if (native.exitCode !== null) break;
            await new Promise((done) => setTimeout(done, 50));
          }
          assert.equal(existsSync(armMarker), true, `${armCut}: native disposition marker missing`);
        }
        const killed = spawnSync("taskkill", ["/F", "/PID", String(native.pid)], { encoding: "utf8" });
        assert.equal(killed.status, 0, killed.stderr);
        if (native.exitCode === null) await new Promise((done) => native.once("exit", done));
      } finally {
        if (native.exitCode === null && native.pid) spawnSync("taskkill", ["/F", "/PID", String(native.pid)]);
      }
      if (armCut) for (let index = 0; index < (armCut === "first" ? 1 : 2); index++) {
        assertDispositionReceipt(`${armMarker}.receipt-${index}`, journal, index, expected[1][index]);
      }
      for (let index = 0; index < 2; index++) {
        const stage = journal.stageIntents[index].path;
        const destination = journal.publishedBlobs[index].path;
        const disposed = armCut === "second" || armCut === "first" && index === 0;
        assert.equal(existsSync(stage), !disposed && expected[1][index] === "stage");
        assert.equal(existsSync(destination), !disposed && expected[1][index] === "destination");
      }
      assert.equal(hashFile(targetDb), oldHash);
      if (walSentinel) assert.equal(hashFile(`${targetDb}-wal`), oldWalHash);
      if (armCut) {
        assert.equal(readFileSync(journalPath).equals(journalBeforeGuard), true,
          "partial ARM changed durable journal");
        // A new production helper must pin the partial layout without trusting
        // the previous killed child's in-memory handles or a path-only read.
        const replayHelper = terminalCut ? faultFixtureWindowsFileHelper() : packagedWindowsFileHelper();
        const terminalMarker = join(fixture, `terminal-${terminalCut}.marker`);
        const replayArmMarker = join(fixture, `replay-arm-${terminalCut}.marker`);
        const replay = spawn(replayHelper.path, ["recover-session", dirname(targetDb), hex(basename(targetDb)),
          hex(basename(journal.stagedDbPath)), hex(basename(journal.preservedDbPath)), journal.generation],
          { stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
            env: terminalCut ? { ...process.env, AITEST_NATIVE_TWO_BLOB_TERMINAL_CUT: terminalCut,
              AITEST_NATIVE_TWO_BLOB_TERMINAL_MARKER: terminalMarker,
              AITEST_NATIVE_TWO_BLOB_ARM_MARKER: replayArmMarker } : process.env });
        const replayLines = createInterface({ input: replay.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
        const replayNext = async () => {
          const result = await replayLines.next();
          assert.equal(result.done, false, "partial layout replay helper closed");
          return result.value;
        };
        try {
          const ready = (await replayNext()).split("\t");
          assert.deepEqual(ready.slice(0, 3), ["RECOVERY_READY", journal.generation, "0"]);
          replay.stdin.write(["ACCEPT", journal.generation, "0", ...ready.slice(3)].join("\t") + "\n");
          assert.equal(await replayNext(), `ACCEPTED\t${journal.generation}\t0`);
          replay.stdin.write("GUARD_BEGIN\t2\n");
          assert.equal(await replayNext(), "GUARD_BEGIN_OK\t2");
          for (let index = 0; index < 2; index++) {
            const intent = journal.stageIntents[index];
            const destination = journal.publishedBlobs[index].path;
            const parent = dirname(destination);
            const parentRelative = parent.slice(journal.artifactRoot.length).replace(/^[/\\]/u, "");
            const mode = existsSync(intent.path) ? "stage" : existsSync(destination) ? "destination" : "none";
            const owned = intent.identity;
            assert.ok(owned);
            const rootId = journal.emptyBlobGuard.root;
            const parentId = journal.emptyBlobGuard.parents[index];
            assert.ok(parentId);
            replay.stdin.write(["GUARD_ITEM", index, hex(journal.artifactRoot), hex(parentRelative),
              hex(basename(destination)), hex(basename(intent.path)), rootId.volumeSerial, rootId.fileId,
              parentId.volumeSerial, parentId.fileId, mode,
              ...(mode === "none" ? ["-", "-", "-", "-"] :
                [owned.volumeSerial, owned.fileId, owned.bytes, owned.sha256])].join("\t") + "\n");
            assert.equal(await replayNext(), `GUARD_ITEM_OK\t${index}`);
          }
          replay.stdin.write("GUARD_FINAL\n");
          assert.equal(await replayNext(), "GUARD_READY\t2");
          if (terminalCut) {
            replay.stdin.write("GUARD_ARM\n");
            assert.equal(await replayNext(), "GUARD_ARMED\t2");
          }
          const expectedJournal = captureExpectedWindowsRestoreFile(replayHelper, journalPath);
          const terminalLine = prepareRestorePhaseLine(journalPath, { ...journal, phase: "ROLLED_BACK" });
          replay.stdin.write(["ROLLBACK_COMMIT", hex(journalPath), expectedJournal.volumeSerial,
            expectedJournal.fileId, expectedJournal.bytes, expectedJournal.sha256,
            Buffer.from(terminalLine, "utf8").toString("hex")].join("\t") + "\n");
          if (terminalCut && terminalCut !== "ack") {
            for (let attempt = 0; attempt < 200 && !existsSync(terminalMarker); attempt++) {
              if (replay.exitCode !== null) break;
              await new Promise((done) => setTimeout(done, 50));
            }
            assert.equal(existsSync(terminalMarker), true, `${terminalCut}: terminal cut marker missing`);
            const killed = spawnSync("taskkill", ["/F", "/PID", String(replay.pid)], { encoding: "utf8" });
            assert.equal(killed.status, 0, killed.stderr);
          }
          const exitCode = replay.exitCode === null ? await new Promise((done, fail) => {
            const timer = setTimeout(() => { replay.kill(); fail(new Error("N=2 terminal command hung")); }, 10_000);
            replay.once("exit", (code) => { clearTimeout(timer); done(code); });
          }) : replay.exitCode;
          if (terminalCut && terminalCut !== "ack") assert.notEqual(exitCode, 0);
          else assert.equal(exitCode, 2, "N=2 terminal command must fail closed or lose ACK");
          if (terminalCut === "ack") {
            const response = await replayLines.next();
            assert.equal(response.done, true, `ACK loss fixture emitted ${response.value}`);
          }
        } finally {
          if (replay.exitCode === null && replay.pid) {
            const killed = spawnSync("taskkill", ["/F", "/PID", String(replay.pid)], { encoding: "utf8" });
            assert.equal(killed.status, 0, killed.stderr);
          }
          if (replay.exitCode === null) await new Promise((done) => replay.once("exit", done));
        }
        if (terminalCut) assertDispositionReceipt(`${replayArmMarker}.receipt-1`, journal, 1, expected[1][1]);
        assert.equal(hashFile(targetDb), oldHash);
        if (walSentinel) {
          assert.equal(hashFile(`${targetDb}-wal`), oldWalHash, "old WAL bytes changed");
          assert.equal(existsSync(`${targetDb}-shm`), true, "old SHM path lost");
          const oracleDir = join(fixture, "wal-oracle");
          const oracleDb = join(oracleDir, "state.db");
          mkdirSync(oracleDir);
          for (const suffix of ["", "-wal", "-shm"]) {
            copyFileSync(`${targetDb}${suffix}`, `${oracleDb}${suffix}`);
          }
          const oracle = new Database(oracleDb, { readonly: true, fileMustExist: true });
          try {
            assert.equal(oracle.prepare("SELECT id FROM test_jobs WHERE id = 'old'").get()?.id, "old");
            assert.equal(oracle.prepare("SELECT id FROM test_jobs WHERE id = 'wal-sentinel'").get()?.id,
              "wal-sentinel", "uncheckpointed WAL row lost");
          } finally { oracle.close(); }
        }
        assert.equal(readFileSync(journalPath).equals(journalBeforeGuard),
          !terminalCut || terminalCut === "before", "N=2 terminal journal boundary mismatch");
        let after;
        if (terminalCut === "partial") {
          assert.throws(() => readRestoreJournal(journalPath), "truncated terminal line must not parse");
        } else {
          after = readRestoreJournal(journalPath);
          assert.equal(after.phase, ["after", "ack", "flush-fail"].includes(terminalCut) ? "ROLLED_BACK" : "PREPARED");
          assert.equal(after.moveReceipts.length, 0);
          assert.equal(after.recoveryReceipts, undefined);
          assert.equal(after.stageIntents.filter((item) => item.identity !== null).length, 2);
        }
        if (terminalCut) {
          for (let index = 0; index < 2; index++) {
            const stage = journal.stageIntents[index].path;
            const destination = journal.publishedBlobs[index].path;
            for (const path of [stage, destination, `${stage}.pending`]) {
              assert.equal(existsSync(path), false, `${terminalCut}: owned blob name remained after helper exit`);
            }
          }
        }
      }
    }
    let blocked = false;
    try {
      const storage = new Storage({ dbPath: targetDb });
      try {
        if (["after", "ack", "flush-fail"].includes(terminalCut)) {
          assert.equal(storage.db.prepare("SELECT id FROM test_jobs WHERE id = 'old'").get()?.id, "old");
          if (walSentinel) assert.equal(storage.db.prepare("SELECT id FROM test_jobs WHERE id = 'wal-sentinel'").get()?.id,
            "wal-sentinel");
        }
      } finally { storage.close(); }
    }
    catch (error) { blocked = error?.details?.reason_code === "RESTORE_RECOVERY_REQUIRED" ||
      terminalCut === "partial" && /journal|checksum|JSON|parse/iu.test(String(error)); if (!blocked) throw error; }
    assert.equal(blocked, !(expectOld || ["after", "ack", "flush-fail"].includes(terminalCut)),
      `${cut}: startup generation outcome`);
    results.push({ cut, receipts: expected[0], physical: expected[1],
      ...(armCut ? { armCut, postArmPhysical: [0, 1].map((index) => armCut === "second" ||
        armCut === "first" && index === 0 ? "none" : expected[1][index]),
        terminalCut: terminalCut ?? null, terminalRejected: !terminalCut,
        ...(terminalCut === "flush-fail" ? { redConfirmed: true, durableSealObserved: false } : {}),
        ...(terminalCut ? { finalPhysical: ["none", "none"] } : {}) } : {}), blocked });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`PROBE_ASSERTION: ${error?.stack ?? error}\n`);
  throw error;
} finally {
  const ownedRoot = resolve(root);
  assert.equal(dirname(ownedRoot).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert.ok(basename(ownedRoot).startsWith("aitest-wn11-two-blob-"));
  rmSync(ownedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
