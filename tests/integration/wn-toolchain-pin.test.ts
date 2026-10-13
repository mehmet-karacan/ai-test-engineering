import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";

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
});
