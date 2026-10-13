/** Disposable Windows MIC feasibility probe. No product/customer paths are modified. */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

if (process.platform !== "win32") throw new Error("Windows only");
const root = mkdtempSync(join(tmpdir(), "aitest-wn-low-integrity-"));
const clone = join(root, "clone");
const lib = join(clone, "lib");
const workspace = join(root, "workspace");
const lowCmd = join(root, "low-cmd.exe");
const oldJar = join(lib, "old.jar");
const newJar = join(lib, "new.jar");
const output = join(workspace, "output.txt");
const result = { root, status: "NO_GO", cleanup: "NOT_RUN" };

function run(command, args) {
  const done = spawnSync(command, args, { encoding: "utf8", timeout: 15000, windowsHide: true });
  return { status: done.status, error: done.error?.code ?? null, stdout: done.stdout ?? "", stderr: done.stderr ?? "" };
}
function runBatch(name, line) {
  const script = join(root, name);
  writeFileSync(script, `@echo off\r\n${line}\r\n`);
  return run(lowCmd, ["/d", "/c", script]);
}

try {
  mkdirSync(lib, { recursive: true });
  mkdirSync(workspace);
  writeFileSync(oldJar, "pinned-old-content");
  copyFileSync(join(process.env.SystemRoot, "System32", "cmd.exe"), lowCmd);
  const exeLabel = run("icacls.exe", [lowCmd, "/setintegritylevel", "L"]);
  const workspaceLabel = run("icacls.exe", [workspace, "/setintegritylevel", "(OI)(CI)L"]);
  result.label_status = { exe: exeLabel.status, workspace: workspaceLabel.status };
  result.labels = {
    clone_low_label_present: /Mandatory Label\\Low Mandatory Level/iu.test(run("icacls.exe", [clone]).stdout),
    workspace_low_label_present: /Mandatory Label\\Low Mandatory Level/iu.test(run("icacls.exe", [workspace]).stdout),
  };
  if (exeLabel.status !== 0 || workspaceLabel.status !== 0) {
    result.reason = "LABEL_UNAVAILABLE";
  } else {
    const token = run(lowCmd, ["/d", "/v:off", "/c", "whoami /groups /fo csv"]);
    const lowToken = /S-1-16-4096/u.test(token.stdout);
    result.token = { status: token.status, low_integrity_sid: lowToken, error: token.error };
    if (!lowToken) {
      result.reason = "LOW_TOKEN_UNVERIFIED";
    } else {
      const read = runBatch("read.cmd", `type "${oldJar}"`);
      const add = runBatch("add.cmd", `echo new>"${newJar}"`);
      const write = runBatch("write.cmd", `echo output>"${output}"`);
      result.oracle = {
        read_existing: read.status === 0 && read.stdout.includes("pinned-old-content"),
        clone_add_denied: !existsSync(newJar),
        clone_add_exit: add.status,
        workspace_write: write.status === 0 && existsSync(output) && readFileSync(output, "utf8").includes("output"),
        old_unchanged: readFileSync(oldJar, "utf8") === "pinned-old-content",
        low_error: [read.error, add.error, write.error],
        diagnostics: {
          read_exit: read.status, read_stderr: read.stderr.trim(), read_stdout: read.stdout.trim(),
          add_stderr: add.stderr.trim(), write_exit: write.status, write_stderr: write.stderr.trim(),
        },
      };
      const ready = join(workspace, "ready.txt");
      const holdScript = join(root, "hold.cmd");
      writeFileSync(holdScript, `@echo off\r\necho ready>"${ready}"\r\nping -n 5 127.0.0.1 >nul\r\n`);
      const held = spawn(lowCmd, ["/d", "/c", holdScript], { stdio: "ignore", windowsHide: true });
      const heldClosed = new Promise((resolveClosed, rejectClosed) => {
        held.once("error", rejectClosed);
        held.once("close", resolveClosed);
      });
      for (let attempt = 0; attempt < 100 && !existsSync(ready); attempt += 1) await delay(25);
      const lowChildAlive = existsSync(ready) && held.exitCode === null;
      if (lowChildAlive) writeFileSync(newJar, "medium-peer-new");
      const peerAdded = lowChildAlive && readFileSync(newJar, "utf8") === "medium-peer-new" && held.exitCode === null;
      if (existsSync(newJar)) rmSync(newJar);
      const sameMembersAfterPeer = !existsSync(newJar) && readFileSync(oldJar, "utf8") === "pinned-old-content";
      const heldExit = await new Promise((resolveExit, rejectExit) => {
        const timer = setTimeout(() => {
          held.kill();
          rejectExit(new Error("Low child did not close in bounded time"));
        }, 10000);
        heldClosed.then((code) => { clearTimeout(timer); resolveExit(code); },
          (error) => { clearTimeout(timer); rejectExit(error); });
      });
      result.peer = { low_child_alive_during_write: lowChildAlive, medium_add_succeeded: peerAdded,
        same_members_after_delete: sameMembersAfterPeer, low_child_exit: heldExit };
      result.status = !result.labels.clone_low_label_present && result.labels.workspace_low_label_present &&
        result.oracle.read_existing && result.oracle.clone_add_denied && result.oracle.clone_add_exit !== 0 &&
        result.oracle.workspace_write && result.oracle.old_unchanged && lowChildAlive && peerAdded && sameMembersAfterPeer
        ? "LIMITED_POSITIVE" : "NO_GO";
    }
  }
} finally {
  const target = resolve(root);
  const inside = relative(resolve(tmpdir()), target);
  const safe = inside && !inside.startsWith("..") && !isAbsolute(inside) &&
    basename(target).startsWith("aitest-wn-low-integrity-") && statSync(target).isDirectory() &&
    realpathSync.native(target).toLowerCase() === target.toLowerCase();
  if (safe) {
    try { rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); result.cleanup = "REMOVED"; }
    catch (error) { result.cleanup = `FAILED:${error.code ?? error.message}`; }
  } else result.cleanup = "SKIPPED_UNSAFE_ROOT";
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.status !== "LIMITED_POSITIVE" || result.cleanup !== "REMOVED") process.exitCode = 1;
}
