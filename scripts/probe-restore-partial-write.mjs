/** Windows native partial-write fault: old orphan RED, delete-on-close stage GREEN. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { inspectWindowsPath, packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";
import { createBackup, restoreBackup, sha256Data } from "../dist/storage/lifecycle-ops.js";
import { journalPathForDb, readRestoreJournal } from "../dist/storage/restore-journal.js";
import { faultFixtureWindowsFileHelper } from "./windows-file-helper-fault-fixture.mjs";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-stage-hardkill-"));
assert.ok(resolve(top).startsWith(resolve(tmpdir())));
const sourceRoot = join(top, "source"), targetRoot = join(top, "target");
const payload = Buffer.alloc(2 * 1024 * 1024 + 17, 0x5a);
let running;
try {
  mkdirSync(join(sourceRoot, "blobs"), { recursive: true });
  mkdirSync(join(targetRoot, "blobs"), { recursive: true });
  writeFileSync(join(sourceRoot, "blobs", "large.bin"), payload);
  const helper = faultFixtureWindowsFileHelper();
  const productionHelper = packagedWindowsFileHelper();
  assert.notEqual(helper.sha256, productionHelper.sha256, "fault fixture and product binary must differ");
  const sourceId = inspectWindowsPath(helper, sourceRoot);
  const targetId = inspectWindowsPath(helper, targetRoot);
  async function start(name, fault, command) {
    const stage = join(targetRoot, "blobs", name);
    const child = spawn(helper.path, [command, sourceRoot, "blobs\\large.bin", targetRoot,
      `blobs\\${name}`, sourceId.volumeSerial, sourceId.fileId, targetId.volumeSerial, targetId.fileId], {
      stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true,
      env: { ...process.env, [fault]: "1" },
    });
    running = child;
    const closed = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
    child.stdin.on("error", () => {});
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const next = async () => {
      let timer;
      try {
        const result = await Promise.race([lines.next(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Native partial-write response timeout")), 10_000);
        })]);
        return result.value;
      } finally { clearTimeout(timer); }
    };
    assert.equal(await next(), "COPY_READY");
    child.stdin.write("COPY\n");
    return { child, closed, next, stage, pending: `${stage}.pending` };
  }
  async function stop(session) {
    let killStatus = null;
    if (session.child.exitCode === null && session.child.pid) {
      const stopped = spawnSync("taskkill", ["/F", "/PID", String(session.child.pid)], { encoding: "utf8" });
      killStatus = stopped.status;
    }
    const result = await session.closed;
    assert.ok(killStatus === null || killStatus === 0 || result.code === 0, "Native child must close or be killed");
    running = undefined;
    return killStatus;
  }
  {
    const s = await start("old-partial.tmp", "AITEST_NATIVE_OLD_COPY_HALT_AFTER_PARTIAL_WRITE", "copy-owned");
    try {
      assert.equal(await s.next(), "PARTIAL_WRITTEN\t1048576");
      assert.equal(await stop(s), 0);
      assert.equal(readFileSync(s.stage).byteLength, 1024 * 1024);
      process.stdout.write("RED: old partial write hardkill left unreceipted stage\n");
    } finally { if (running) await stop(s); }
  }
  {
    const s = await start("new-partial.tmp", "AITEST_NATIVE_STAGE_HALT_AFTER_PARTIAL_WRITE", "copy-stage-session");
    try {
      assert.equal(await s.next(), "PARTIAL_WRITTEN\t1048576");
      assert.equal(existsSync(s.pending), true);
      assert.equal(await stop(s), 0);
      assert.equal(existsSync(s.pending), false);
      assert.equal(existsSync(s.stage), false);
      process.stdout.write("GREEN: native partial-write hardkill removed pending stage\n");
    } finally { if (running) await stop(s); }
  }
  {
    const s = await start("failed-partial.tmp", "AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE", "copy-stage-session");
    try {
      assert.equal(await s.next(), "PARTIAL_FAILURE\t1048576");
      const result = await s.closed;
      running = undefined;
      assert.equal(result.code, 2);
      assert.equal(existsSync(s.pending), false);
      assert.equal(existsSync(s.stage), false);
      process.stdout.write("GREEN: native partial-write failure removed pending stage\n");
    } finally { if (running) await stop(s); }
  }
  {
    const outsideFaultScope = join(top, "not-target");
    mkdirSync(join(outsideFaultScope, "blobs"), { recursive: true });
    const outsideId = inspectWindowsPath(helper, outsideFaultScope);
    const run = spawnSync(helper.path, ["copy-stage-session", sourceRoot, "blobs\\large.bin",
      outsideFaultScope, "blobs\\ordinary.tmp", sourceId.volumeSerial, sourceId.fileId,
      outsideId.volumeSerial, outsideId.fileId], {
      input: "COPY\n", shell: false, windowsHide: true, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE: "1" },
    });
    assert.equal(run.status, 2, "EOF before LINK must close the pending file");
    assert.match(run.stdout, /COPIED\t/u, "fault must be ignored outside owned fixture target");
    assert.equal(existsSync(join(outsideFaultScope, "blobs", "ordinary.tmp.pending")), false);
  }
  {
    const schema = `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
      INSERT INTO schema_migrations VALUES (7);
      CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
      CREATE TABLE artifacts (id TEXT PRIMARY KEY, job_id TEXT, relative_store_path TEXT NOT NULL,
        sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);`;
    const sourceDbPath = join(sourceRoot, "state.db");
    const source = new Database(sourceDbPath);
    source.exec(schema);
    source.prepare("INSERT INTO test_jobs VALUES ('new', 'COMPLETED')").run();
    const sha = createHash("sha256").update(payload).digest("hex");
    source.prepare("INSERT INTO artifacts VALUES ('large', 'new', 'blobs/large.bin', ?, ?, 'READY')")
      .run(sha, payload.byteLength);
    const backup = await createBackup(source, sourceDbPath, sourceRoot, join(top, "backups"));
    source.close();
    const targetDbPath = join(top, "runtime", "state.db");
    mkdirSync(join(top, "runtime"), { recursive: true });
    const target = new Database(targetDbPath);
    target.exec(schema);
    target.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
    target.close();
    const oldHash = sha256Data(readFileSync(targetDbPath));
    const previousFault = process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE;
    process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE = "1";
    try {
      await assert.rejects(restoreBackup(backup.backup_dir, targetDbPath, targetRoot,
        { nativeHelper: helper }));
    } finally {
      if (previousFault === undefined) delete process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE;
      else process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE = previousFault;
    }
    assert.equal(sha256Data(readFileSync(targetDbPath)), oldHash, "old DB bytes must survive partial native write");
    assert.equal(readRestoreJournal(journalPathForDb(targetDbPath))?.phase, "PREPARED",
      "uncertain native stage failure must not claim terminal rollback");
    assert.equal(existsSync(join(targetRoot, "blobs", "large.bin")), false);
    assert.ok(readdirSync(targetRoot, { recursive: true }).every((name) =>
      !name.endsWith(".pending") && !/\.restore-[0-9a-f-]{36}$/u.test(name)), "no unowned partial stage remains");
    process.stdout.write("GREEN: restore kept old DB and nonterminal journal without partial-stage orphan\n");

    const productDbPath = join(top, "runtime", "state-product.db");
    const product = new Database(productDbPath);
    product.exec(schema);
    product.prepare("INSERT INTO test_jobs VALUES ('old', 'COMPLETED')").run();
    product.close();
    const priorProductFault = process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE;
    process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE = "1";
    try {
      await restoreBackup(backup.backup_dir, productDbPath, targetRoot);
    } finally {
      if (priorProductFault === undefined) delete process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE;
      else process.env.AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE = priorProductFault;
    }
    assert.equal(readRestoreJournal(journalPathForDb(productDbPath))?.phase, "COMMITTED");
    const published = new Database(productDbPath, { readonly: true });
    try { assert.deepEqual(published.prepare("SELECT id FROM test_jobs").all(), [{ id: "new" }]); }
    finally { published.close(); }
    assert.deepEqual(readFileSync(join(targetRoot, "blobs", "large.bin")), payload);
    process.stdout.write("GREEN: public default restore used fault-free product helper\n");
  }
} finally {
  if (running?.exitCode === null && running.pid) spawnSync("taskkill", ["/F", "/PID", String(running.pid)], { stdio: "ignore" });
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
