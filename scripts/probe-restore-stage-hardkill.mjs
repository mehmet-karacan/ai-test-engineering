/** Real Windows cut points for delete-on-close stage and durable FileId receipt. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { inspectWindowsPath } from "../dist/discovery/windows-file-bridge.js";
import { faultFixtureWindowsFileHelper } from "./windows-file-helper-fault-fixture.mjs";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-stage-hardkill-"));
try {
  const sourceRoot = join(top, "source"), targetRoot = join(top, "target");
  mkdirSync(join(sourceRoot, "blobs"), { recursive: true });
  mkdirSync(join(targetRoot, "blobs"), { recursive: true });
  writeFileSync(join(sourceRoot, "blobs", "x.bin"), "stage bytes");
  const helper = faultFixtureWindowsFileHelper();
  const sourceId = inspectWindowsPath(helper, sourceRoot);
  const targetId = inspectWindowsPath(helper, targetRoot);
  const sha = createHash("sha256").update("stage bytes").digest("hex");
  async function start(stageName, fault, command = "copy-stage-session") {
    const stage = join(targetRoot, "blobs", stageName);
    const child = spawn(helper.path, [command, sourceRoot, "blobs\\x.bin",
      targetRoot, `blobs\\${stageName}`, sourceId.volumeSerial, sourceId.fileId,
      targetId.volumeSerial, targetId.fileId], {
      stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true,
      env: { ...process.env, ...(fault ? { [fault]: "1" } : {}) },
    });
    child.stdin.on("error", () => {});
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const next = async () => (await lines.next()).value;
    assert.equal(await next(), "COPY_READY");
    return { child, next, stage, pending: `${stage}.pending` };
  }
  async function kill(child) {
    execFileSync("taskkill", ["/F", "/PID", String(child.pid)], { stdio: "ignore" });
    await new Promise((resolve) => child.once("close", resolve));
  }
  {
    const s = await start("old-created.tmp", "AITEST_NATIVE_OLD_COPY_HALT_AFTER_CREATE", "copy-owned");
    s.child.stdin.write("COPY\n");
    assert.equal(await s.next(), "CREATED_OLD");
    await kill(s.child);
    assert.equal(existsSync(s.stage), true);
    assert.equal(readFileSync(s.stage).byteLength, 0);
    process.stdout.write("RED: old CREATE_NEW hardkill left unreceipted stage\n");
  }
  {
    const s = await start("created.tmp", "AITEST_NATIVE_STAGE_HALT_AFTER_CREATE");
    s.child.stdin.write("COPY\n");
    assert.equal(await s.next(), "CREATED");
    assert.equal(existsSync(s.pending), true);
    assert.throws(() => openSync(s.pending, "r"),
      (error) => ["EBUSY", "EACCES", "EPERM"].includes(error?.code));
    await kill(s.child);
    assert.equal(existsSync(s.pending), false);
    assert.equal(existsSync(s.stage), false);
    process.stdout.write("GREEN: CREATE_NEW hardkill auto-deleted pending stage\n");
  }
  {
    const s = await start("copied.tmp");
    s.child.stdin.write("COPY\n");
    assert.match(await s.next(), /^COPIED\t/u);
    await kill(s.child);
    assert.equal(existsSync(s.pending), false);
    assert.equal(existsSync(s.stage), false);
    process.stdout.write("GREEN: COPIED before receipt hardkill left no stage\n");
  }
  {
    const s = await start("linked.tmp", "AITEST_NATIVE_STAGE_HALT_AFTER_LINK");
    s.child.stdin.write("COPY\n");
    const fields = (await s.next()).split("\t");
    assert.equal(fields[0], "COPIED");
    assert.equal(fields[3], "11");
    assert.equal(fields[4], sha);
    const receipt = join(top, "stage-receipt.txt");
    const fd = openSync(receipt, "a");
    try { writeFileSync(fd, `${fields.slice(1).join(":")}\n`); fsyncSync(fd); }
    finally { closeSync(fd); }
    s.child.stdin.write(`LINK\t${fields.slice(1).join("\t")}\n`);
    assert.equal(await s.next(), "LINK_CREATED");
    await kill(s.child);
    assert.equal(existsSync(s.pending), false);
    assert.equal(existsSync(s.stage), true);
    assert.equal(inspectWindowsPath(helper, s.stage).fileId, fields[2]);
    assert.equal(readFileSync(s.stage, "utf8"), "stage bytes");
    assert.equal(readFileSync(receipt, "utf8"), `${fields.slice(1).join(":")}\n`);
    process.stdout.write("GREEN: LINK hardkill left only FileId-receipted stage\n");
  }
} finally {
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
