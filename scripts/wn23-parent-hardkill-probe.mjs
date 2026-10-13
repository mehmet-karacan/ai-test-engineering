import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Diagnostic only: a nonzero exit is a WN23 NO_GO, not a product test failure.
if (process.platform !== "win32") throw new Error("Windows required");
const root = mkdtempSync(join(tmpdir(), "aitest-wn23-parent-kill-"));
const helper = resolve("native/bin/windows-process-helper.exe");
const builder = resolve("tests/fixtures/build-windows-job-topology.cmd");
const cmd = join(process.env.SystemRoot, "System32", "cmd.exe");
const pidPaths = Object.fromEntries(["helper", "child", "grandchild"].map((name) => [name, join(root, `${name}.pid`)]));
const pids = {};
let parent;
let foreign;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function readPid(path) {
  for (let i = 0; i < 200; i += 1) {
    if (existsSync(path)) return Number(readFileSync(path, "utf8"));
    await delay(25);
  }
  throw new Error(`PID missing: ${path}`);
}
async function stopped(pid) {
  for (let i = 0; i < 200; i += 1) {
    if (!alive(pid)) return true;
    await delay(50);
  }
  return !alive(pid);
}
function readStatus(path) {
  if (!existsSync(path)) return null;
  try { return readFileSync(path, "utf8"); }
  catch (error) {
    if (["EBUSY", "EPERM"].includes(error.code)) return `unreadable:${error.code}`;
    throw error;
  }
}
async function cleanup() {
  // ChildProcess handles belong to this fixture. Never taskkill a raw PID read
  // from a file: it could have been reused by an unrelated process.
  if (parent && parent.exitCode === null) parent.kill();
  if (foreign && foreign.exitCode === null) foreign.kill();
  for (let i = 0; i < 40 && ((parent && parent.exitCode === null) || (foreign && foreign.exitCode === null)); i += 1) await delay(25);
  const residual = ["helper", "child", "grandchild"].filter((name) => pids[name] && alive(pids[name]));
  if (residual.length) {
    process.stderr.write(`Unresolved indirect process; fixture retained at ${root}: ${residual.join(",")}\n`);
    process.exitCode = 2;
    return;
  }
  const temp = realpathSync(tmpdir());
  const actual = realpathSync(root);
  if (dirname(actual).toLowerCase() !== temp.toLowerCase() || !basename(actual).startsWith("aitest-wn23-parent-kill-")) throw new Error("Unsafe cleanup root");
  rmSync(actual, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
}
try {
  const built = spawnSync(cmd, ["/d", "/c", builder, root], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(`Topology builder failed: ${built.status} ${built.stderr}`);
  const topology = join(root, "windows-job-topology.exe");
  const grandchildScript = join(root, "grandchild.js");
  const childScript = join(root, "child.js");
  const batch = join(root, "mvn.cmd");
  const status = join(root, "status.json");
  writeFileSync(grandchildScript, `require('node:fs').writeFileSync(${JSON.stringify(pidPaths.grandchild)},String(process.pid)); setInterval(()=>{},1000);`);
  writeFileSync(childScript, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const grandchild=spawn(process.execPath,[${JSON.stringify(grandchildScript)}],{stdio:'ignore'}); fs.writeFileSync(${JSON.stringify(pidPaths.child)},String(process.pid)); setInterval(()=>{},1000);`);
  writeFileSync(batch, `@echo off\r\nstart "" /b "${process.execPath}" "${childScript}"\r\nexit /b 0\r\n`);
  const command = `"${cmd}" /d /s /v:off /c ""${batch}""`;
  const sha = createHash("sha256").update(readFileSync(batch)).digest("hex");
  const parentScript = join(root, "parent.js");
  writeFileSync(parentScript, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(${JSON.stringify(helper)},${JSON.stringify([status, root, cmd, command, sha, batch])},{stdio:['pipe','pipe','pipe']}); fs.writeFileSync(${JSON.stringify(pidPaths.helper)},String(child.pid)); setInterval(()=>{},1000);`);
  foreign = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  parent = spawn(process.execPath, [parentScript], { stdio: "ignore" });
  pids.parent = parent.pid;
  for (const name of ["helper", "child", "grandchild"]) pids[name] = await readPid(pidPaths[name]);
  pids.foreign = foreign.pid;
  const membership = {};
  for (const [name, pid] of Object.entries(pids)) {
    const query = spawnSync(topology, ["--pid", String(pid)], { encoding: "utf8" });
    membership[name] = { status: query.status, output: query.stdout.trim() };
  }
  const parentKillAccepted = parent.kill();
  const exited = {};
  for (const name of ["parent", "helper", "child", "grandchild"]) exited[name] = await stopped(pids[name]);
  const firstStatus = readStatus(status);
  await delay(500);
  const lateStatus = readStatus(status);
  const result = { membership, parentKillAccepted, exited, foreignAlive: alive(foreign.pid), firstStatus, lateStatus };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  const memberProven = Object.values(membership).every((value) => value.status === 0 && value.output.endsWith("in_job=1"));
  let ownerLost = false;
  try { ownerLost = JSON.parse(lateStatus)?.kind === "owner_lost"; } catch { /* untrusted status is NO_GO */ }
  process.exitCode = memberProven && parentKillAccepted && Object.values(exited).every(Boolean) && result.foreignAlive && ownerLost ? 0 : 2;
} finally {
  await cleanup();
}
