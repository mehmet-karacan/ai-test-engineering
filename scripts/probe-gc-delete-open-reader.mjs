/** Measure Windows delete acknowledgement while a raw reader still owns a handle. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { inspectWindowsPath, packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";

assert.equal(process.platform, "win32");
const root = mkdtempSync(join(tmpdir(), "aitest-gc-open-reader-"));
const path = join(root, "x.bin");
let reader;
try {
  writeFileSync(path, "owned bytes");
  const helper = packagedWindowsFileHelper();
  const rootId = inspectWindowsPath(helper, root);
  const fileId = inspectWindowsPath(helper, path);
  const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
  reader = spawn(process.execPath, ["-e",
    "const f=require('node:fs');const fd=f.openSync(process.argv[1],'r');console.log('READY');process.stdin.on('end',()=>{f.closeSync(fd);process.exit(0)});process.stdin.resume()", path],
  { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const lines = createInterface({ input: reader.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  assert.equal((await lines.next()).value, "READY");
  const deleted = spawnSync(helper.path, ["delete-owned-session", root, "x.bin",
    fileId.volumeSerial, fileId.fileId, String(fileId.bytes), sha, rootId.volumeSerial, rootId.fileId],
  { input: "DELETE\n", encoding: "utf8", timeout: 10_000 });
  const beforeReaderClose = existsSync(path);
  reader.stdin.end();
  const readerExit = await new Promise((done) => reader.once("close", done));
  reader = undefined;
  assert.equal(readerExit, 0);
  if (deleted.status === 0) assert.equal(existsSync(path), false);
  else assert.equal(readFileSync(path, "utf8"), "owned bytes");
  process.stdout.write(`OPEN_READER: delete_exit=${deleted.status} exists_before_reader_close=${beforeReaderClose} exists_after=${existsSync(path)}\n`);
} finally {
  reader?.kill();
  assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
