/** Deterministic Windows Temp swap while native copy/publish holds root handles. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { inspectWindowsPath, packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-restore-owned-swap-"));
const sourceRoot = join(top, "source");
const targetRoot = join(top, "artifacts");
const moved = join(top, "artifacts-moved");
const replacement = join(top, "artifacts-replacement");
const helper = packagedWindowsFileHelper();

async function run(command, args, ready, mutate) {
  const child = spawn(helper.path, [command, ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  try {
    const first = await lines.next();
    assert.equal(first.value, ready);
    let swapped = false;
    try { swapped = mutate(); }
    catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
    }
    child.stdin.end(`${command === "copy-owned" ? "COPY" : "RENAME"}\n`);
    const second = await lines.next();
    assert.equal(second.value?.split("\t")[0], "OK");
    const exit = await new Promise((done) => child.once("close", done));
    assert.equal(exit, 0);
    return { fields: second.value.split("\t"), swapped };
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

try {
  mkdirSync(join(sourceRoot, "blobs"), { recursive: true });
  mkdirSync(join(targetRoot, "blobs"), { recursive: true });
  writeFileSync(join(sourceRoot, "blobs", "x.bin"), "old root bytes");
  const sourceId = inspectWindowsPath(helper, sourceRoot);
  const targetId = inspectWindowsPath(helper, targetRoot);
  const copied = await run("copy-owned", [sourceRoot, "blobs\\x.bin", targetRoot, "blobs\\x.stage",
    sourceId.volumeSerial, sourceId.fileId, targetId.volumeSerial, targetId.fileId], "COPY_READY", () => {
    renameSync(targetRoot, moved);
    mkdirSync(join(targetRoot, "blobs"), { recursive: true });
    return true;
  });
  if (copied.swapped) {
    assert.equal(existsSync(join(targetRoot, "blobs", "x.stage")), false);
    assert.equal(readFileSync(join(moved, "blobs", "x.stage"), "utf8"), "old root bytes");
    renameSync(targetRoot, replacement);
    renameSync(moved, targetRoot);
  } else assert.equal(readFileSync(join(targetRoot, "blobs", "x.stage"), "utf8"), "old root bytes");
  assert.equal(inspectWindowsPath(helper, targetRoot).fileId, targetId.fileId);
  const digest = createHash("sha256").update("old root bytes").digest("hex");
  assert.equal(copied.fields[5], digest);
  const published = await run("rename-owned", [targetRoot, "blobs\\x.stage", "blobs\\x.bin",
    targetId.volumeSerial, targetId.fileId, copied.fields[1], copied.fields[2], copied.fields[4], copied.fields[5]],
  "RENAME_READY", () => {
    renameSync(targetRoot, moved);
    mkdirSync(join(targetRoot, "blobs"), { recursive: true });
    return true;
  });
  if (published.swapped) {
    assert.equal(existsSync(join(targetRoot, "blobs", "x.bin")), false);
    assert.equal(readFileSync(join(moved, "blobs", "x.bin"), "utf8"), "old root bytes");
    renameSync(targetRoot, replacement + "-2");
    renameSync(moved, targetRoot);
  }
  assert.equal(inspectWindowsPath(helper, targetRoot).fileId, targetId.fileId);
  assert.equal(readFileSync(join(targetRoot, "blobs", "x.bin"), "utf8"), "old root bytes");
  process.stdout.write(`PASS: owned copy/publish root swap outcomes copy=${copied.swapped} publish=${published.swapped}; original FileId kept\n`);
} finally {
  assert.ok(resolve(top).startsWith(resolve(tmpdir())));
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
