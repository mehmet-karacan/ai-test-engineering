import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { NativeProcessRegistry } from "../../src/orchestration/native-process-registry.js";

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
  it("hard-kill leaves a durable orphan fence while preserving a foreign process", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-job-registry-hardkill-"));
    const foreign = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    let parentPid: number | undefined;
    let ownedPid: number | undefined;
    const storage = new Storage({ dbPath: join(root, "state.db") });
    try {
      storage.migrate();
      const { location } = new ProjectRepository(storage.db).ensureLocation(root, "hardkill-registry", null);
      const jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "hardkill-registry" }).id;
      const pidPath = join(root, "owned.pid");
      const childScript = join(root, "child.js");
      writeFileSync(childScript, `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`);
      writeFileSync(join(root, "mvn.cmd"), `@echo off\r\nstart "" /b "${process.execPath}" "${childScript}"\r\nexit /b 0\r\n`);
      storage.close();
      const fixture = fileURLToPath(new URL("../fixtures/wn-registry-parent.mjs", import.meta.url));
      const parent = spawn(process.execPath, [fixture, root, jobId], { stdio: "ignore" });
      parentPid = parent.pid;
      ownedPid = await waitForFile(pidPath);
      expect(spawnSync("taskkill", ["/F", "/PID", String(parentPid)], { encoding: "utf8" }).status).toBe(0);
      for (let attempt = 0; attempt < 120 && alive(ownedPid); attempt += 1) await delay(25);
      expect(alive(ownedPid)).toBe(false);
      expect(foreign.pid && alive(foreign.pid)).toBe(true);
      const reopened = new Storage({ dbPath: join(root, "state.db") });
      try {
        const leases = new LeaseManager(reopened.db);
        const identity = reopened.db.prepare<[string], { process_identity: string }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId)!.process_identity;
        expect(JSON.parse(identity)).toMatchObject({ job_id: jobId, state: "spawned" });
        // Simulate a reused historical PID pointing at an unrelated live Node.
        // Restart must block on the durable record and never target that PID.
        const reused = JSON.stringify({ ...JSON.parse(identity), helper_pid: foreign.pid });
        reopened.db.prepare("UPDATE job_leases SET process_identity = ? WHERE job_id = ?").run(reused, jobId);
        leases.release(jobId, "hardkill-owner");
        expect(() => leases.acquire(jobId, "new-owner", 300000)).toThrowError();
        expect(reopened.db.prepare<[string], { process_identity: string }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId)!.process_identity).toBe(reused);
        expect(foreign.pid && alive(foreign.pid)).toBe(true);
      } finally { reopened.close(); }
    } finally {
      if (parentPid && alive(parentPid)) spawnSync("taskkill", ["/F", "/PID", String(parentPid)]);
      if (ownedPid && alive(ownedPid)) process.kill(ownedPid);
      if (foreign.pid && alive(foreign.pid)) foreign.kill();
      await removeOwnedFixture(root);
    }
  }, 20000);
  it("records and clears a real helper launch only after terminal Job Object proof", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-job-registry-"));
    const storage = new Storage({ dbPath: join(root, "state.db") });
    try {
      storage.migrate();
      const { location } = new ProjectRepository(storage.db).ensureLocation(root, "registry-fixture", null);
      const jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "registry-fixture" }).id;
      const leases = new LeaseManager(storage.db);
      const lease = leases.acquire(jobId, "fixture-owner", 300000).lease;
      const registry = new NativeProcessRegistry(storage.db, jobId, "fixture-owner", lease.fencing_token);
      const batch = join(root, "mvn.cmd");
      writeFileSync(batch, "@echo off\r\necho owned fixture\r\nexit /b 0\r\n");
      const result = await new WindowsProcessSupervisor().run({ executable: batch, cwd: root, argv: [], timeoutMs: 15000,
        env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path } }, undefined, registry);
      expect(result.status).toBe("success");
      const recorded = storage.db.prepare<[string], { process_identity: string | null }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId);
      expect(recorded?.process_identity).toBeNull();
      leases.release(jobId, "fixture-owner");
      expect(leases.acquire(jobId, "next-owner", 300000).lease.fencing_token).toBe(2);
    } finally { storage.close(); await removeOwnedFixture(root); }
  }, 25000);
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
      const run = new WindowsProcessSupervisor().run({ executable: batch, cwd: root, argv: [], timeoutMs: 8000,
        env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path } });
      ownedPid = await Promise.race([waitForFile(pidPath), run.then((result) => { throw new Error(`run settled before child start: ${JSON.stringify(result)}`); })]);
      const result = await Promise.race([run, delay(12000).then(() => { throw new Error("owned run did not settle after timeout"); })]);
      expect(result.status).toBe("timeout");
      for (let attempt = 0; attempt < 40 && alive(ownedPid); attempt += 1) await delay(25);
      expect(alive(ownedPid)).toBe(false);
      expect(foreign.pid && alive(foreign.pid)).toBe(true);
    } finally {
      if (ownedPid && alive(ownedPid)) process.kill(ownedPid);
      if (foreign.pid && alive(foreign.pid)) foreign.kill();
      await removeOwnedFixture(root);
    }
  }, 20000);

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
