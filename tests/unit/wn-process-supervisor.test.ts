import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";

describe.skipIf(process.platform !== "win32")("S02 Windows process supervisor", () => {
  it("passes ampersand as data and waits for both streams to close", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn (Türkçe) & process-"));
    try {
      const script = join(dir, "fixture.cmd");
      writeFileSync(script, "@echo off\r\necho ARGV=%1\r\necho ERR=done 1>&2\r\n");
      const result = await new WindowsProcessSupervisor().run({ executable: script, cwd: dir, argv: ["hello&echo SENTINEL"], timeoutMs: 5000, env: process.env });
      expect(result.status).toBe("success");
      expect(result.stdout).toContain("hello&echo SENTINEL");
      expect(result.stderr).toContain("ERR=done");
      expect(result.stdout.match(/SENTINEL/g)).toHaveLength(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("caps large UTF-8 output and reports truncation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn-process-"));
    try {
      const script = join(dir, "fixture.cmd");
      writeFileSync(script, "@echo off\r\necho abcdefghijklmnop\r\n");
      const result = await new WindowsProcessSupervisor().run({ executable: script, cwd: dir, argv: [], timeoutMs: 5000, env: process.env, maxLogBytes: 8 });
      expect(result.status).toBe("success");
      expect(result.stdoutTruncatedBytes).toBeGreaterThan(0);
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(8);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("distinguishes nonzero exit and timeout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn-process-"));
    try {
      const failure = join(dir, "failure.cmd");
      writeFileSync(failure, "@echo off\r\nexit /b 7\r\n");
      const supervisor = new WindowsProcessSupervisor();
      const failed = await supervisor.run({ executable: failure, cwd: dir, argv: [], timeoutMs: 5000, env: process.env });
      expect(failed.status).toBe("nonzero");
      expect(failed.exitCode).toBe(7);
      const slow = join(dir, "slow.cmd");
      writeFileSync(slow, "@echo off\r\nping -n 8 127.0.0.1 >nul\r\n");
      const timed = await supervisor.run({ executable: slow, cwd: dir, argv: [], timeoutMs: 200, env: process.env });
      expect(timed.status).toBe("timeout");
      expect(timed.durationMs).toBeLessThan(6000);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("does not emit a broken UTF-8 code point at the byte limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn-process-"));
    try {
      const script = join(dir, "unicode.cmd");
      writeFileSync(script, "@echo off\r\nnode -e \"process.stdout.write(String.fromCodePoint(0x1F600))\"\r\n");
      const result = await new WindowsProcessSupervisor().run({ executable: script, cwd: dir, argv: [], timeoutMs: 5000, env: process.env, maxLogBytes: 2 });
      expect(result.status).toBe("success");
      expect(result.stdout).toBe("");
      expect(result.stdoutTruncatedBytes).toBeGreaterThan(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
