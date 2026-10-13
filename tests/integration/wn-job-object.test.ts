import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";

async function waitForFile(path: string): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path)) return Number(readFileSync(path, "utf8"));
    await delay(25);
  }
  throw new Error(`Missing owned child PID: ${path}`);
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function removeOwnedFixture(root: string): Promise<void> {
  if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Fixture outside Temp");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); return; }
    catch (error) {
      if (attempt === 29 || !["EPERM", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      await delay(100);
    }
  }
}

describe.skipIf(process.platform !== "win32")("S02 Job Object ownership", () => {
  it("rejects a forged SystemRoot cmd.exe before launch", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-job-cmd-root-"));
    try {
      const fakeRoot = join(root, "fake-windows");
      const system32 = join(fakeRoot, "System32");
      mkdirSync(system32, { recursive: true });
      writeFileSync(join(system32, "cmd.exe"), "FORGED CMD");
      const batch = join(root, "mvn.cmd");
      writeFileSync(batch, "@echo off\r\necho should-not-run\r\n");
      const result = await new WindowsProcessSupervisor().run({ executable: batch, cwd: root, argv: [], timeoutMs: 5000,
        env: { SystemRoot: fakeRoot, Path: process.env.Path } });
      expect(result.status).toBe("spawn_error");
      expect(result.errorCode).toBe("cmd_path_error");
    } finally { await removeOwnedFixture(root); }
  });

  it("timeout closes an owned descendant after cmd exits and preserves an unrelated Node", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-job-timeout-"));
    const foreign = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    let ownedPid: number | undefined;
    try {
      const pidPath = join(root, "owned.pid");
      const childScript = join(root, "child.js");
      const batch = join(root, "mvn.cmd");
      writeFileSync(childScript, `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`);
      writeFileSync(batch, `@echo off\r\nstart "" /b "${process.execPath}" "${childScript}"\r\nexit /b 0\r\n`);
      const run = new WindowsProcessSupervisor().run({ executable: batch, cwd: root, argv: [], timeoutMs: 2500,
        env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path } });
      ownedPid = await Promise.race([waitForFile(pidPath), run.then((result) => { throw new Error(`run settled before child start: ${JSON.stringify(result)}`); })]);
      const result = await Promise.race([run, delay(7000).then(() => { throw new Error("owned run did not settle after timeout"); })]);
      expect(result.status).toBe("timeout");
      for (let attempt = 0; attempt < 40 && alive(ownedPid); attempt += 1) await delay(25);
      expect(alive(ownedPid)).toBe(false);
      expect(foreign.pid && alive(foreign.pid)).toBe(true);
    } finally {
      if (ownedPid && alive(ownedPid)) process.kill(ownedPid);
      if (foreign.pid && alive(foreign.pid)) foreign.kill();
      await removeOwnedFixture(root);
    }
  }, 15000);

  it("AbortSignal cancels an owned descendant without touching an unrelated Node", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-job-cancel-"));
    const foreign = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    let ownedPid: number | undefined;
    try {
      const pidPath = join(root, "owned.pid");
      const childScript = join(root, "child.js");
      const batch = join(root, "mvn.cmd");
      writeFileSync(childScript, `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`);
      writeFileSync(batch, `@echo off\r\nstart "" /b "${process.execPath}" "${childScript}"\r\nexit /b 0\r\n`);
      const controller = new AbortController();
      const run = new WindowsProcessSupervisor().run({ executable: batch, cwd: root, argv: [], timeoutMs: 10000,
        env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path } }, controller.signal);
      ownedPid = await Promise.race([waitForFile(pidPath), run.then((result) => { throw new Error(`run settled before child start: ${JSON.stringify(result)}`); })]);
      controller.abort();
      const result = await run;
      expect(result.status).toBe("cancelled");
      for (let attempt = 0; attempt < 40 && alive(ownedPid); attempt += 1) await delay(25);
      expect(alive(ownedPid)).toBe(false);
      expect(foreign.pid && alive(foreign.pid)).toBe(true);
    } finally {
      if (ownedPid && alive(ownedPid)) process.kill(ownedPid);
      if (foreign.pid && alive(foreign.pid)) foreign.kill();
      await removeOwnedFixture(root);
    }
  }, 15000);

  it("hard-killing the coordinator closes its helper job and leaves an unrelated Node alive", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-job-hardkill-"));
    const foreign = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    let ownedPid: number | undefined;
    let parentPid: number | undefined;
    let helperPid: number | undefined;
    try {
      const pidPath = join(root, "owned.pid");
      const helperPidPath = join(root, "helper.pid");
      const childScript = join(root, "child.js");
      const batch = join(root, "mvn.cmd");
      const parentScript = join(root, "coordinator.js");
      const helper = resolve("native/bin/windows-process-helper.exe");
      const cmd = join(process.env.SystemRoot!, "System32", "cmd.exe");
      writeFileSync(childScript, `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`);
      writeFileSync(batch, `@echo off\r\nstart "" /b "${process.execPath}" "${childScript}"\r\nexit /b 0\r\n`);
      const command = `"${cmd}" /d /s /v:off /c ""${batch}""`;
      writeFileSync(parentScript, `const {spawn}=require('node:child_process'); const fs=require('node:fs');\n` +
        `const child=spawn(${JSON.stringify(helper)},[${JSON.stringify(join(root, "status.json"))},${JSON.stringify(root)},${JSON.stringify(cmd)},${JSON.stringify(command)}],{stdio:['pipe','pipe','pipe']});\n` +
        `fs.writeFileSync(${JSON.stringify(helperPidPath)},String(child.pid)); setInterval(()=>{},1000);\n`);
      const parent = spawn(process.execPath, [parentScript], { stdio: "ignore" });
      parentPid = parent.pid;
      helperPid = await waitForFile(helperPidPath);
      ownedPid = await waitForFile(pidPath);
      const killed = spawnSync("taskkill", ["/F", "/PID", String(parentPid)], { encoding: "utf8" });
      expect(killed.status).toBe(0);
      for (let attempt = 0; attempt < 120 && alive(ownedPid); attempt += 1) await delay(25);
      expect(alive(ownedPid)).toBe(false);
      expect(alive(helperPid)).toBe(false);
      expect(foreign.pid && alive(foreign.pid)).toBe(true);
    } finally {
      if (parentPid && alive(parentPid)) spawnSync("taskkill", ["/F", "/PID", String(parentPid)]);
      if (helperPid && alive(helperPid)) spawnSync("taskkill", ["/F", "/PID", String(helperPid)]);
      if (ownedPid && alive(ownedPid)) process.kill(ownedPid);
      if (foreign.pid && alive(foreign.pid)) foreign.kill();
      await removeOwnedFixture(root);
    }
  }, 20000);
});
