/** Real Windows taskkill cuts for a journal-proven fresh native publish. Owned Temp only. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";
import { appendRestorePhase, captureRestoreEvidence, fileIdentity, journalPathForDb,
  readRestoreJournal } from "../dist/storage/restore-journal.js";
import { captureExpectedWindowsRestoreFile, hexName } from "../dist/storage/windows-restore-session.js";

assert.equal(process.platform, "win32");
const worker = fileURLToPath(new URL("restore-recovery-worker.mjs", import.meta.url));
const helper = packagedWindowsFileHelper();
const cuts = ["ready", "moved-unreceipted", "moved-receipted", "verify-ready", "committed-guarded"];

async function run(cut) {
  const root = mkdtempSync(join(tmpdir(), `aitest-fresh-kill-${cut}-`));
  const target = join(root, "state.db");
  const staged = `${target}.restore-${randomUUID()}`;
  const preserved = `${target}.restore-old-${randomUUID()}`;
  const manifest = join(root, "manifest.json");
  const artifactRoot = join(root, "artifacts");
  const generation = randomUUID();
  let child;
  try {
    mkdirSync(artifactRoot);
    writeFileSync(manifest, "{}");
    const db = new Database(staged);
    db.exec("CREATE TABLE test_jobs(id TEXT PRIMARY KEY); INSERT INTO test_jobs VALUES ('new')");
    db.close();
    const initial = captureExpectedWindowsRestoreFile(helper, staged);
    const evidence = captureRestoreEvidence(target, staged, manifest, []);
    const base = { formatVersion: 2, generation, targetDbPath: target, artifactRoot,
      stagedDbPath: staged, preservedDbPath: preserved, publishedBlobs: [],
      nativeInitial: { oldDb: null, oldWal: null, oldShm: null, stagedDb: initial }, moveReceipts: [], evidence };
    const path = journalPathForDb(target);
    appendRestorePhase(path, { ...base, phase: "PREPARED" });
    appendRestorePhase(path, { ...base, phase: "BLOBS_READY" });
    appendRestorePhase(path, { ...base, phase: "FRESH_TARGET_CONFIRMED" });
    child = spawn(helper.path, ["session-fresh", root, hexName("state.db"), hexName(basename(staged)), generation],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let buffer = "";
    const pending = [];
    let waiter;
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n");
        const line = buffer.slice(0, end).replace(/\r$/u, "");
        buffer = buffer.slice(end + 1);
        if (waiter) { const resolve = waiter; waiter = undefined; resolve(line); }
        else pending.push(line);
      }
    });
    const next = () => pending.length ? Promise.resolve(pending.shift()) : Promise.race([
      new Promise((resolve) => { waiter = resolve; }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("helper response timeout")), 10_000)),
    ]);
    const ready = (await next()).split("\t");
    assert.equal(ready[0], "READY");
    assert.deepEqual(ready.slice(2, 5), ["oldDb=-", "oldWal=-", "oldShm=-"]);
    if (cut !== "ready") {
      const [vol, id, bytes, sha] = ready[5].slice("stagedDb=".length).split(":");
      child.stdin.write(`MOVE\tstagedDb\t${hexName(basename(staged))}\t${hexName("state.db")}\t${vol}\t${id}\t${bytes}\t${sha}\n`);
      const moved = (await next()).split("\t");
      assert.equal(moved[0], "MOVED");
      assert.equal(moved[6], moved[7]);
      if (cut !== "moved-unreceipted") {
        const receipt = { generation, sequence: 1, operation: "rename", slot: "stagedDb",
          fromName: basename(staged), toName: "state.db", before: initial, after: initial };
        base.moveReceipts.push(receipt);
        appendRestorePhase(path, { ...base, phase: "NEW_DB_MOVED" });
        if (cut === "verify-ready" || cut === "committed-guarded") {
          appendRestorePhase(path, { ...base, phase: "NEW_DB_PUBLISHED" });
          child.stdin.write("VERIFY\n");
          assert.equal((await next()).split("\t")[0], "VERIFY_READY");
          appendRestorePhase(path, { ...base, phase: "VERIFIED" });
          if (cut === "committed-guarded") appendRestorePhase(path, { ...base, phase: "COMMITTED" });
        }
      }
    }
    const killed = spawnSync("taskkill", ["/PID", String(child.pid), "/F"], { encoding: "utf8", timeout: 10_000 });
    assert.equal(killed.status, 0, killed.stderr);
    await new Promise((resolve) => child.once("close", resolve));
    child = undefined;
    if (cut === "committed-guarded") {
      assert.equal(readRestoreJournal(path)?.phase, "COMMITTED");
      assert.equal(existsSync(staged), false);
      assert.equal(fileIdentity(target).sha256, evidence.sourceDbSha256);
      const published = new Database(target, { readonly: true });
      try { assert.deepEqual(published.prepare("SELECT id FROM test_jobs").all(), [{ id: "new" }]); }
      finally { published.close(); }
      process.stdout.write(`PASS: ${cut} => committed new generation opens\n`);
      return;
    }
    const recovered = spawnSync(process.execPath, [worker, target], { encoding: "utf8", timeout: 30_000 });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(recovered.stdout, "RECOVERED_EMPTY\n");
    assert.equal(readRestoreJournal(path)?.phase, "ROLLED_BACK");
    assert.equal(existsSync(target), false);
    assert.equal(fileIdentity(staged).sha256, evidence.sourceDbSha256);
    assert.equal(existsSync(`${target}-wal`), false);
    assert.equal(existsSync(`${target}-shm`), false);
    process.stdout.write(`PASS: ${cut} => empty generation with staged FileId\n`);
  } finally {
    child?.kill();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

for (const cut of cuts) await run(cut);
