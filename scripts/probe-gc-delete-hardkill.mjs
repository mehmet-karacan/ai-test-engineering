/** Real Windows taskkill on both sides of native owned-delete disposition. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { inspectWindowsPath, packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";

assert.equal(process.platform, "win32");
const root = mkdtempSync(join(tmpdir(), "aitest-gc-delete-kill-"));
const helper = packagedWindowsFileHelper();

async function cut(name, afterDisposition) {
  const path = join(root, name);
  writeFileSync(path, "owned bytes");
  const rootId = inspectWindowsPath(helper, root);
  const fileId = inspectWindowsPath(helper, path);
  const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
  const child = spawn(helper.path, ["delete-owned-probe", root, name,
    fileId.volumeSerial, fileId.fileId, String(fileId.bytes), sha, rootId.volumeSerial, rootId.fileId],
  { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  try {
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
    assert.equal((await lines.next()).value?.split("\t")[0], "DELETE_READY");
    if (afterDisposition) {
      child.stdin.write("DELETE\n");
      assert.equal((await lines.next()).value, "DISPOSITION_SET");
    }
    const killed = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/F"],
      { encoding: "utf8", timeout: 10_000 });
    assert.equal(killed.status, 0, killed.stderr);
    await new Promise((done) => child.once("close", done));
    assert.equal(existsSync(path), !afterDisposition);
    if (!afterDisposition) assert.equal(readFileSync(path, "utf8"), "owned bytes");
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

try {
  await cut("before.bin", false);
  await cut("after.bin", true);
  process.stdout.write("PASS: taskkill before DELETE preserved bytes; after disposition removed owned FileId without receipt\n");
} finally {
  assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
