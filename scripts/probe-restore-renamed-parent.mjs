/** Real Windows PREPARED N=2 guard negative: parent directory renamed after the cut. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { packagedWindowsFileHelper, inspectWindowsPath } from "../dist/discovery/windows-file-bridge.js";
import { createBackup, sha256Data } from "../dist/storage/lifecycle-ops.js";
import { journalPathForDb, readRestoreJournal } from "../dist/storage/restore-journal.js";
import { Storage } from "../dist/storage/storage.js";

assert.equal(process.platform, "win32");
const root = mkdtempSync(join(tmpdir(), "aitest-wn11-renamed-parent-"));
const shaFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const hex = (value) => Buffer.from(value, "utf16le").toString("hex");
const schema = `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);`;
const childCode = `
const cp=require("node:child_process");
const {syncBuiltinESMExports}=require("node:module");
const original=cp.spawnSync;
cp.spawnSync=(...args)=>{const result=original(...args);
  if(args[1]?.[0]==="rename-owned" && result.status===0){
    process.stdout.write("HALT:PUBLISH_1\\n");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);
  }
  return result;};
syncBuiltinESMExports();
import(process.argv[1]).then((module)=>module.restoreBackup(process.argv[2],process.argv[3],process.argv[4]))
  .then(()=>{process.exitCode=43;})
  .catch((error)=>{process.stderr.write(String(error?.stack??error));process.exitCode=44;});`;

async function waitForCut(child, label) {
  let output = "", error = "";
  child.stderr.on("data", (bytes) => { error += bytes.toString(); });
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`${label}: cut timeout ${output.slice(-200)} ${error.slice(-300)}`)), 120_000);
    child.stdout.on("data", (bytes) => {
      output += bytes.toString();
      if (output.includes("HALT:PUBLISH_1\n")) { clearTimeout(timer); done(); }
    });
    child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`${label}: restore exited ${code} ${error}`)); });
  });
  const killed = spawnSync("taskkill", ["/F", "/PID", String(child.pid)], { encoding: "utf8" });
  assert.equal(killed.status, 0, killed.stderr);
  if (child.exitCode === null) await new Promise((done) => child.once("exit", done));
}

function sameId(a, b) {
  return a.volumeSerial === b.volumeSerial && a.fileId === b.fileId;
}

try {
  const helper = packagedWindowsFileHelper();
  const fixture = join(root, "case");
  const sourceDb = join(fixture, "source", "state.db");
  const sourceArtifacts = join(fixture, "source", "artifacts");
  mkdirSync(dirname(sourceDb), { recursive: true });
  const source = new Database(sourceDb);
  source.exec(schema);
  const relatives = [];
  for (const [index, parent] of ["first", "second"].entries()) {
    const bytes = `renamed-parent-${index}`;
    const digest = sha256Data(bytes);
    const rel = `blobs/${parent}/${digest}`;
    const path = join(sourceArtifacts, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    source.prepare("INSERT INTO artifacts (id,relative_store_path,sha256,bytes,status) VALUES (?,?,?,?, 'READY')")
      .run(`new-${index}`, rel, digest, Buffer.byteLength(bytes));
    relatives.push(rel);
  }
  const backup = await createBackup(source, sourceDb, sourceArtifacts, join(fixture, "backup"));
  source.close();
  const targetDb = join(fixture, "runtime", "state.db");
  const artifacts = join(fixture, "runtime", "artifacts");
  mkdirSync(dirname(targetDb), { recursive: true });
  for (const rel of relatives) mkdirSync(dirname(join(artifacts, rel)), { recursive: true });
  const old = new Database(targetDb);
  old.pragma("journal_mode = WAL");
  old.exec(schema);
  old.prepare("INSERT INTO test_jobs VALUES ('old','COMPLETED')").run();
  const mainBeforeSentinel = readFileSync(targetDb);
  old.prepare("INSERT INTO test_jobs VALUES ('wal-sentinel','COMPLETED')").run();
  assert.deepEqual(readFileSync(targetDb), mainBeforeSentinel, "sentinel must stay in WAL");
  const mainBytes = readFileSync(targetDb);
  const walBytes = readFileSync(`${targetDb}-wal`);
  const shmBytes = readFileSync(`${targetDb}-shm`);
  assert.ok(walBytes.length > 32);
  old.close();
  writeFileSync(targetDb, mainBytes);
  writeFileSync(`${targetDb}-wal`, walBytes);
  writeFileSync(`${targetDb}-shm`, shmBytes);
  const oldDbHash = shaFile(targetDb), oldWalHash = shaFile(`${targetDb}-wal`);
  const child = spawn(process.execPath,
    ["-e", childCode, pathToFileURL(resolve("dist/storage/lifecycle-ops.js")).href,
      backup.backup_dir, targetDb, artifacts],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  try { await waitForCut(child, "renamed-parent"); }
  finally {
    if (child.exitCode === null && child.pid) spawnSync("taskkill", ["/F", "/PID", String(child.pid)]);
  }
  const journalPath = journalPathForDb(targetDb);
  const journal = readRestoreJournal(journalPath);
  const journalBytes = readFileSync(journalPath);
  assert.equal(journal.phase, "PREPARED");
  assert.equal(journal.stageIntents.length, 2);
  assert.equal(journal.stageIntents.filter((item) => item.identity !== null).length, 2);
  assert.equal(journal.moveReceipts.length, 0);
  const first = journal.publishedBlobs[0].path;
  const second = journal.stageIntents[1].path;
  for (let attempt = 0; attempt < 100 && existsSync(`${second}.pending`); attempt++) {
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.equal(existsSync(first), true);
  assert.equal(existsSync(second), true);
  assert.equal(existsSync(`${second}.pending`), false);
  const secondParentOld = dirname(second);
  assert.equal(basename(secondParentOld), "second");
  const secondHash = shaFile(second);
  const stagedName = basename(second);
  // Historical parent identity is still observable under the new name.
  const renamedParent = `${secondParentOld}-old`;
  renameSync(secondParentOld, renamedParent);
  const renamedParentId = inspectWindowsPath(helper, renamedParent);
  assert.ok(sameId(renamedParentId, journal.emptyBlobGuard.parents[1]),
    "renamed parent must keep the journal-recorded identity");
  assert.equal(shaFile(join(renamedParent, stagedName)), secondHash);
  mkdirSync(secondParentOld, { recursive: true });
  const replacementId = inspectWindowsPath(helper, secondParentOld);
  assert.equal(sameId(replacementId, journal.emptyBlobGuard.parents[1]), false,
    "same-name replacement parent must carry a different FileId");
  assert.equal(readdirSync(secondParentOld).length, 0);
  const native = spawn(helper.path, ["recover-session", dirname(targetDb), hex(basename(targetDb)),
    hex(basename(journal.stagedDbPath)), hex(basename(journal.preservedDbPath)), journal.generation],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  native.stdin.on("error", () => {});
  const lines = createInterface({ input: native.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  const next = async () => {
    const result = await lines.next();
    assert.equal(result.done, false, "helper closed before guard receipt");
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
      const identity = stage.identity;
      const parentId = journal.emptyBlobGuard.parents[index];
      assert.ok(parentId);
      native.stdin.write(["GUARD_ITEM", index, hex(journal.artifactRoot), hex(parentRelative),
        hex(basename(destination)), hex(basename(stage.path)),
        journal.emptyBlobGuard.root.volumeSerial, journal.emptyBlobGuard.root.fileId,
        parentId.volumeSerial, parentId.fileId, index === 0 ? "destination" : "stage",
        identity.volumeSerial, identity.fileId, identity.bytes, identity.sha256].join("\t") + "\n");
      if (index === 0) assert.equal(await next(), "GUARD_ITEM_OK\t0");
    }
    const exitCode = native.exitCode === null ? await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error("stale-parent GUARD_ITEM did not fail")), 10_000);
      native.once("exit", (code) => { clearTimeout(timer); done(code); });
    }) : native.exitCode;
    assert.equal(exitCode, 2, "stale parent identity must fail closed");
  } finally {
    if (native.exitCode === null && native.pid) {
      const killed = spawnSync("taskkill", ["/F", "/PID", String(native.pid)], { encoding: "utf8" });
      assert.equal(killed.status, 0, killed.stderr);
      await new Promise((done) => native.once("exit", done));
    }
  }
  assert.ok(sameId(inspectWindowsPath(helper, first),
    journal.stageIntents[0].identity));
  assert.equal(shaFile(first), journal.stageIntents[0].sha256);
  assert.ok(sameId(inspectWindowsPath(helper, renamedParent),
    journal.emptyBlobGuard.parents[1]), "renamed parent identity must survive the guard");
  assert.equal(shaFile(join(renamedParent, stagedName)), secondHash,
    "owned staged blob must survive untouched under the renamed parent");
  assert.equal(readdirSync(secondParentOld).length, 0,
    "replacement parent must stay empty; guard must not write into it");
  assert.equal(existsSync(join(secondParentOld, stagedName)), false);
  for (const path of [journal.stageIntents[0].path, `${journal.stageIntents[0].path}.pending`,
    journal.publishedBlobs[1].path, `${second}.pending`]) assert.equal(existsSync(path), false);
  assert.equal(readFileSync(journalPath).equals(journalBytes), true);
  assert.equal(readRestoreJournal(journalPath).phase, "PREPARED");
  assert.equal(shaFile(targetDb), oldDbHash);
  assert.equal(shaFile(`${targetDb}-wal`), oldWalHash);
  assert.equal(existsSync(`${targetDb}-shm`), true);
  const oracleDir = join(fixture, "wal-oracle");
  mkdirSync(oracleDir);
  for (const suffix of ["", "-wal", "-shm"]) copyFileSync(`${targetDb}${suffix}`, `${join(oracleDir, "state.db")}${suffix}`);
  const oracle = new Database(join(oracleDir, "state.db"), { readonly: true, fileMustExist: true });
  try {
    assert.equal(oracle.prepare("SELECT id FROM test_jobs WHERE id = 'old'").get()?.id, "old");
    assert.equal(oracle.prepare("SELECT id FROM test_jobs WHERE id = 'wal-sentinel'").get()?.id, "wal-sentinel");
  } finally { oracle.close(); }
  let blocked = false;
  try { const storage = new Storage({ dbPath: targetDb }); storage.close(); }
  catch (error) { blocked = error?.details?.reason_code === "RESTORE_RECOVERY_REQUIRED"; if (!blocked) throw error; }
  assert.equal(blocked, true);
  process.stdout.write(`${JSON.stringify([{ negative: "renamed-parent", firstGuardAccepted: true,
    staleParentGuardExit: 2, renamedParentIdentityPreserved: true, ownedBlobPreserved: true,
    oldDbUnchanged: true, oldWalUnchanged: true, journalPhase: "PREPARED", startupBlocked: true }], null, 2)}\n`);
} finally {
  const ownedRoot = resolve(root);
  assert.equal(dirname(ownedRoot).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert.ok(basename(ownedRoot).startsWith("aitest-wn11-renamed-parent-"));
  rmSync(ownedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
