/** Demonstrates absolute TS path drift while native session retains its original directory handle. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { packagedWindowsFileHelper, inspectWindowsPath } from "../dist/discovery/windows-file-bridge.js";
import { appendRestorePhase, captureRestoreEvidence, journalPathForDb } from "../dist/storage/restore-journal.js";
import { assertWindowsRestoreRootIdentity, captureExpectedWindowsRestoreFile, hexName } from
  "../dist/storage/windows-restore-session.js";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-restore-root-alias-"));
const root = join(top, "runtime");
const artifactRoot = join(root, "artifacts");
const movedArtifactRoot = join(root, "artifacts-moved");
const replacementArtifactRoot = join(root, "artifacts-replacement");
const target = join(root, "state.db");
const staged = `${target}.restore-${randomUUID()}`;
const preserved = `${target}.restore-old-${randomUUID()}`;
const generation = randomUUID();
const helper = packagedWindowsFileHelper();
const expectGuard = process.argv.includes("--expect-guard");
const transientSwap = process.argv.includes("--transient-swap");
let child;
try {
  mkdirSync(artifactRoot, { recursive: true });
  const sourceBlob = join(top, "backup-blob");
  const manifest = join(top, "manifest.json");
  writeFileSync(sourceBlob, "new blob");
  writeFileSync(manifest, "{}");
  writeFileSync(staged, "new database");
  const oldArtifactRoot = inspectWindowsPath(helper, artifactRoot);
  const initial = captureExpectedWindowsRestoreFile(helper, staged);
  const evidence = captureRestoreEvidence(target, staged, manifest, []);
  const base = { formatVersion: 2, generation, targetDbPath: target, artifactRoot,
    stagedDbPath: staged, preservedDbPath: preserved, publishedBlobs: [], moveReceipts: [],
    nativeInitial: { oldDb: null, oldWal: null, oldShm: null, stagedDb: initial }, evidence };
  appendRestorePhase(journalPathForDb(target), { ...base, phase: "PREPARED" });
  child = spawn(helper.path, ["session-fresh", root, hexName("state.db"), hexName(basename(staged)), generation],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let buffer = "";
  let resolveLine;
  const lines = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n");
      const line = buffer.slice(0, end).replace(/\r$/u, "");
      buffer = buffer.slice(end + 1);
      if (resolveLine) { const done = resolveLine; resolveLine = undefined; done(line); }
      else lines.push(line);
    }
  });
  const next = () => lines.length ? Promise.resolve(lines.shift()) : Promise.race([
    new Promise((resolve) => { resolveLine = resolve; }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("native response timeout")), 10_000)),
  ]);
  const ready = (await next()).split("\t");
  assert.equal(ready[0], "READY");
  if (transientSwap) assertWindowsRestoreRootIdentity(helper, artifactRoot, oldArtifactRoot);
  renameSync(artifactRoot, movedArtifactRoot);
  mkdirSync(artifactRoot);
  const newArtifactRoot = inspectWindowsPath(helper, artifactRoot);
  assert.notEqual(newArtifactRoot.fileId, oldArtifactRoot.fileId);
  if (transientSwap) {
    copyFileSync(sourceBlob, join(artifactRoot, "blob.restore.tmp"));
    renameSync(artifactRoot, replacementArtifactRoot);
    renameSync(movedArtifactRoot, artifactRoot);
    assertWindowsRestoreRootIdentity(helper, artifactRoot, oldArtifactRoot);
    assert.equal(existsSync(join(artifactRoot, "blob.restore.tmp")), false);
    assert.equal(readFileSync(join(replacementArtifactRoot, "blob.restore.tmp"), "utf8"), "new blob");
    process.stdout.write("RED_TRANSIENT: before/after FileId passed while absolute copy wrote swapped root\n");
  } else if (expectGuard) {
    assert.throws(() => assertWindowsRestoreRootIdentity(helper, artifactRoot, oldArtifactRoot),
      (error) => error?.details?.reason_code === "RESTORE_ARTIFACT_ROOT_CHANGED");
    assert.equal(existsSync(join(artifactRoot, "blob.restore.tmp")), false);
    assert.equal(existsSync(target), false);
    process.stdout.write("PASS_GUARD: replaced artifact root rejected before blob or DB publish\n");
  } else {
  // This is the same path style used by restoreBackup's staged blob copy.
  copyFileSync(sourceBlob, join(artifactRoot, "blob.restore.tmp"));
  const [volume, fileId, bytes, sha] = ready[5].slice("stagedDb=".length).split(":");
  child.stdin.write(`MOVE\tstagedDb\t${hexName(basename(staged))}\t${hexName("state.db")}\t` +
    `${volume}\t${fileId}\t${bytes}\t${sha}\n`);
  assert.equal((await next()).split("\t")[0], "MOVED");
  assert.equal(existsSync(target), true);
  assert.equal(readFileSync(join(artifactRoot, "blob.restore.tmp"), "utf8"), "new blob");
  assert.equal(existsSync(join(movedArtifactRoot, "blob.restore.tmp")), false);
  assert.equal(existsSync(journalPathForDb(target)), true);
  appendRestorePhase(journalPathForDb(target), { ...base, phase: "BLOBS_READY" });
  process.stdout.write("RED_CONFIRMED: native DB pinned; TS blob path wrote replacement artifact root\n");
  }
} finally {
  if (child?.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/F"], { encoding: "utf8", timeout: 10_000 });
  assert.ok(resolve(top).startsWith(resolve(tmpdir())));
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
