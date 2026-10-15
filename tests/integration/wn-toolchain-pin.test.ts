import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { WindowsProcessSupervisor, processPinPaths, type NativeProcessPlan } from "../../src/runners/windows-process-supervisor.js";
import { registerWindowsNativeTestLock } from "../support/windows-native-test-lock.js";

registerWindowsNativeTestLock("wn-toolchain-pin");

function snapshot(plan: NativeProcessPlan): NonNullable<NativeProcessPlan["pinnedInputs"]> {
  return processPinPaths(plan).map((path) => ({
    path, sha256: existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null,
  }));
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(path)) return;
    await delay(50);
  }
  throw new Error("fixture process did not start");
}

describe.skipIf(process.platform !== "win32")("S02 native toolchain file pin", () => {
  it("rejects a real executable replacement between JS hash and suspended CreateProcess", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-pin-swap-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "ran.txt");
      writeFileSync(executable, `@echo off\r\necho original>"${sentinel}"\r\n`);
      const result = await new WindowsProcessSupervisor().run({
        executable, cwd: dir, argv: ["test"], timeoutMs: 5000, env: process.env,
      }, undefined, {
        beforeSpawn: () => writeFileSync(executable, `@echo off\r\necho swapped>"${sentinel}"\r\n`),
        afterSpawn: () => {}, afterTerminal: () => {},
      });
      expect(result.status).toBe("spawn_error");
      expect(result.errorCode).toBe("pin_mismatch");
      expect(result.preSpawnNoChild).toBe(true);
      expect(result.ownedTreeDrained).toBe(true);
      expect(existsSync(sentinel)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("holds the executable and selected settings file read-only through the owned run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-pin-live-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const settings = join(dir, "settings.xml");
      const ready = join(dir, "ready.txt");
      writeFileSync(settings, "<settings/>");
      writeFileSync(executable, `@echo off\r\necho ready>"${ready}"\r\nping -n 5 127.0.0.1 >nul\r\nexit /b 0\r\n`);
      const pending = new WindowsProcessSupervisor().run({
        executable, cwd: dir, argv: ["-s", settings, "test"], timeoutMs: 12000, env: process.env,
      });
      await waitForFile(ready);
      expect(() => writeFileSync(executable, "@echo off\r\necho swapped\r\n")).toThrow();
      expect(() => writeFileSync(settings, "<changed/>")).toThrow();
      const result = await pending;
      expect(result.status).toBe("success");
      expect(readFileSync(settings, "utf8")).toBe("<settings/>");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("uses the earlier resolver digest instead of accepting a fresh pre-goal hash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-pin-earlier-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "ran.txt");
      writeFileSync(executable, `@echo off\r\necho original>"${sentinel}"\r\n`);
      const plan: NativeProcessPlan = { executable, cwd: dir, argv: ["test"], timeoutMs: 5000, env: process.env };
      const pinnedInputs = snapshot(plan);
      writeFileSync(executable, `@echo off\r\necho changed>"${sentinel}"\r\n`);
      const result = await new WindowsProcessSupervisor().run({ ...plan, pinnedInputs });
      expect(result.status).toBe("spawn_error");
      expect(result.errorCode).toBe("pin_mismatch");
      expect(existsSync(sentinel)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("fails closed when an absent implicit config could be created after the snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-pin-absent-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "ran.txt");
      writeFileSync(executable, `@echo off\r\necho ran>"${sentinel}"\r\n`);
      const plan: NativeProcessPlan = { executable, cwd: dir, argv: ["test"], timeoutMs: 5000, env: process.env };
      const pinnedInputs = snapshot(plan);
      const config = join(dir, ".mvn", "maven.config");
      expect(pinnedInputs.find((pin) => pin.path.toLowerCase() === config.toLowerCase())?.sha256).toBeNull();
      const result = await new WindowsProcessSupervisor().run({ ...plan, pinnedInputs }, undefined, {
        beforeSpawn: () => { mkdirSync(join(dir, ".mvn")); writeFileSync(config, "-Dswapped=true\n"); },
        afterSpawn: () => {}, afterTerminal: () => {},
      });
      expect(result.status).toBe("spawn_error");
      expect(result.errorCode).toBe("pin_unavailable");
      expect(result.preSpawnNoChild).toBe(true);
      expect(result.ownedTreeDrained).toBe(true);
      expect(existsSync(sentinel)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects a parent junction even when the final script digest matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-pin-junction-"));
    try {
      const actual = join(dir, "actual");
      const junction = join(dir, "junction");
      mkdirSync(actual);
      const sentinel = join(dir, "ran.txt");
      writeFileSync(join(actual, "mvn.cmd"), `@echo off\r\necho ran>"${sentinel}"\r\n`);
      symlinkSync(actual, junction, "junction");
      const result = await new WindowsProcessSupervisor().run({
        executable: join(junction, "mvn.cmd"), cwd: dir, argv: ["test"], timeoutMs: 5000, env: process.env,
      });
      expect(result.status).toBe("spawn_error");
      expect(result.errorCode).toBe("pin_mismatch");
      expect(existsSync(sentinel)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
