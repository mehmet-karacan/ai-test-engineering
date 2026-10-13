/** Native handle-relative GC delete under a nested path replacement in owned Windows Temp. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectWindowsPath } from "../dist/discovery/windows-file-bridge.js";

assert.equal(process.platform, "win32");
const helperPath = fileURLToPath(new URL("../native/bin/windows-file-helper.exe", import.meta.url));
const helper = { path: helperPath,
  sha256: createHash("sha256").update(readFileSync(helperPath)).digest("hex") };
const root = mkdtempSync(join(tmpdir(), "aitest-gc-pinned-delete-"));
const nested = join(root, "blobs");
const target = join(nested, "x.bin");
const moved = join(nested, "x-old.bin");
let child;
try {
  mkdirSync(nested);
  writeFileSync(target, "old candidate");
  const rootIdentity = inspectWindowsPath(helper, root);
  const initial = inspectWindowsPath(helper, target);
  const sha = createHash("sha256").update(readFileSync(target)).digest("hex");
  const wrong = spawnSync(helperPath, ["delete-owned-session", root, "blobs\\x.bin",
    initial.volumeSerial, "f".repeat(32), String(initial.bytes), sha,
    rootIdentity.volumeSerial, rootIdentity.fileId],
  { encoding: "utf8", timeout: 10_000 });
  assert.equal(wrong.status, 2, "changed FileId must reject before READY");
  assert.equal(readFileSync(target, "utf8"), "old candidate");
  const wrongRoot = spawnSync(helperPath, ["delete-owned-session", root, "blobs\\x.bin",
    initial.volumeSerial, initial.fileId, String(initial.bytes), sha,
    rootIdentity.volumeSerial, "f".repeat(32)],
  { encoding: "utf8", timeout: 10_000 });
  assert.equal(wrongRoot.status, 2, "changed root FileId must reject before READY");
  assert.equal(readFileSync(target, "utf8"), "old candidate");
  child = spawn(helperPath, ["delete-owned-session", root, "blobs\\x.bin",
    initial.volumeSerial, initial.fileId, String(initial.bytes), sha,
    rootIdentity.volumeSerial, rootIdentity.fileId],
  { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let buffer = "";
  let waiting;
  const lines = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n");
      const line = buffer.slice(0, end).replace(/\r$/u, "");
      buffer = buffer.slice(end + 1);
      if (waiting) { const done = waiting; waiting = undefined; done(line); }
      else lines.push(line);
    }
  });
  const next = () => lines.length ? Promise.resolve(lines.shift()) : Promise.race([
    new Promise((resolve) => { waiting = resolve; }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("delete helper timeout")), 10_000)),
  ]);
  const ready = (await next()).split("\t");
  assert.deepEqual(ready, ["DELETE_READY", initial.volumeSerial, initial.fileId, String(initial.bytes), sha]);
  renameSync(target, moved);
  writeFileSync(target, "replacement user data");
  child.stdin.write("DELETE\n");
  assert.equal(await next(), `DELETED\t${initial.volumeSerial}\t${initial.fileId}`);
  const exit = await new Promise((resolve) => child.once("close", resolve));
  child = undefined;
  assert.equal(exit, 0);
  assert.equal(readFileSync(target, "utf8"), "replacement user data");
  assert.equal(existsSync(moved), false);
  process.stdout.write("PASS: pinned GC delete removed old FileId and preserved replacement bytes\n");
} finally {
  child?.kill();
  assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
