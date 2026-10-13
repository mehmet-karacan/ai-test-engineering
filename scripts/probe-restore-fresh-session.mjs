/** Native fresh-target wire probe. All files live in this process's owned Temp directory. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.platform, "win32");
const root = mkdtempSync(join(tmpdir(), "aitest-fresh-wire-"));
const helper = fileURLToPath(new URL("../native/bin/windows-file-helper.exe", import.meta.url));
const dbName = "state.db";
const stagedName = `${dbName}.restore-${randomUUID()}`;
const preservedName = `${dbName}.restore-old-${randomUUID()}`;
const generation = randomUUID();
const hex = (name) => Buffer.from(name, "utf16le").toString("hex");
const target = join(root, dbName);
const staged = join(root, stagedName);
const start = (mode) => {
  const args = [mode, root, hex(dbName), hex(stagedName)];
  if (mode === "recover-fresh") args.push(hex(preservedName));
  args.push(generation);
  const child = spawn(helper, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const exited = new Promise((resolve) => child.once("close", resolve));
  let buffer = "";
  const queue = [];
  let waiting;
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n");
      const line = buffer.slice(0, end).replace(/\r$/u, "");
      buffer = buffer.slice(end + 1);
      if (waiting) { const resolve = waiting; waiting = undefined; resolve(line); }
      else queue.push(line);
    }
  });
  const next = async () => queue.shift() ?? await Promise.race([
    new Promise((resolve) => { waiting = resolve; }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("native response timeout")), 5000)),
  ]);
  const send = async (line) => { child.stdin.write(`${line}\n`); return next(); };
  return { child, next, send, exit: () => exited };
};
const move = (from, to, snapshot) => {
  const [volume, fileId, bytes, sha] = snapshot.split(":");
  return `MOVE\tstagedDb\t${hex(from)}\t${hex(to)}\t${volume}\t${fileId}\t${bytes}\t${sha}`;
};

try {
  writeFileSync(staged, "new generation");
  writeFileSync(target, "racer");
  let session = start("session-fresh");
  assert.equal(await session.exit(), 2, "occupied target must fail before READY");
  assert.equal(readFileSync(target, "utf8"), "racer");
  rmSync(target);

  session = start("session-fresh");
  const ready = (await session.next()).split("\t");
  assert.equal(ready[0], "READY");
  assert.deepEqual(ready.slice(2, 5), ["oldDb=-", "oldWal=-", "oldShm=-"]);
  const snapshot = ready[5].slice("stagedDb=".length);
  assert.match(snapshot, /^[a-f0-9]{16}:[a-f0-9]{32}:\d+:[a-f0-9]{64}$/u);
  const wrong = snapshot.replace(/^[a-f0-9]/u, snapshot[0] === "a" ? "b" : "a");
  session.child.stdin.write(`${move(stagedName, dbName, wrong)}\n`);
  assert.equal(await session.exit(), 2, "wrong FileId/volume/hash must reject");
  assert.equal(existsSync(target), false);

  session = start("session-fresh");
  const ready2 = (await session.next()).split("\t");
  writeFileSync(target, "racer");
  session.child.stdin.write(`${move(stagedName, dbName, ready2[5].slice("stagedDb=".length))}\n`);
  assert.equal(await session.exit(), 2, "late create must reject NO_REPLACE");
  assert.equal(readFileSync(target, "utf8"), "racer");
  rmSync(target);

  session = start("session-fresh");
  const ready3 = (await session.next()).split("\t");
  const moved = (await session.send(move(stagedName, dbName, ready3[5].slice("stagedDb=".length)))).split("\t");
  assert.equal(moved[0], "MOVED");
  assert.equal(moved[6], moved[7], "FileId and hash must survive publish");
  assert.equal(await session.send("VERIFY"), `VERIFY_READY\t${generation}\t1\t${moved[7]}`);
  assert.equal(await session.send("CLOSE"), `CLOSED\t${generation}\t1`);
  assert.equal(await session.exit(), 0);
  assert.equal(readFileSync(target, "utf8"), "new generation");

  session = start("recover-fresh");
  const recovery = (await session.next()).split("\t");
  assert.equal(recovery[0], "RECOVERY_READY");
  assert.equal(recovery[2], "1");
  assert.deepEqual(recovery.slice(3, 6), ["oldDb=-", "oldWal=-", "oldShm=-"]);
  assert.equal(await session.send(`ACCEPT\t${recovery.slice(1).join("\t")}`), `ACCEPTED\t${generation}\t1`);
  const identity = recovery[6].split(":").slice(1).join(":");
  const rolled = (await session.send(move(dbName, stagedName, identity))).split("\t");
  assert.equal(rolled[0], "MOVED");
  assert.equal(rolled[6], rolled[7]);
  assert.equal(await session.send("CLOSE"), `CLOSED\t${generation}\t2`);
  assert.equal(await session.exit(), 0);
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(staged, "utf8"), "new generation");
  session = start("recover-fresh");
  const empty = (await session.next()).split("\t");
  assert.equal(empty[2], "0");
  assert.equal(await session.send(`ACCEPT\t${empty.slice(1).join("\t")}`), `ACCEPTED\t${generation}\t0`);
  assert.equal(await session.send("CLOSE"), `CLOSED\t${generation}\t0`);
  assert.equal(await session.exit(), 0);
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(staged, "utf8"), "new generation");
  process.stdout.write("PASS: fresh READY, no-replace, identity, verify, recovery rollback\n");
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
