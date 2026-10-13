import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
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

  it("bounds both real Windows streams above 8 MiB and records the budget reason", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn-process-8mib-"));
    const limit = 8 * 1024 * 1024;
    try {
      const producer = join(dir, "producer.js");
      const script = join(dir, "fixture.cmd");
      writeFileSync(producer, `process.stdout.write(Buffer.alloc(${limit + 17}, 65));process.stderr.write(Buffer.alloc(${limit + 31}, 66));`);
      writeFileSync(script, `@echo off\r\n"${process.execPath}" "${producer}"\r\nexit /b %errorlevel%\r\n`);
      const result = await new WindowsProcessSupervisor().run({ executable: script, cwd: dir, argv: [], timeoutMs: 30000, env: process.env });
      expect(result.status).toBe("success");
      expect(Buffer.byteLength(result.stdout)).toBe(limit);
      expect(Buffer.byteLength(result.stderr)).toBe(limit);
      expect(result.stdoutTruncatedBytes).toBe(17);
      expect(result.stderrTruncatedBytes).toBe(31);
      expect(result.stdoutTruncationReason).toBe("BYTE_BUDGET_EXCEEDED");
      expect(result.stderrTruncationReason).toBe("BYTE_BUDGET_EXCEEDED");
    } finally {
      const target = resolve(dir);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("wn-process-8mib-")) {
        rmSync(target, { recursive: true, force: true });
      } else {
        process.stderr.write("Refusing fixture cleanup outside owned Temp root\n");
      }
    }
  }, 45000);

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

  it("classifies a missing executable as ENOENT without accepted output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn-process-enoent-"));
    try {
      const result = await new WindowsProcessSupervisor().run({
        executable: join(dir, "missing.cmd"), cwd: dir, argv: [], timeoutMs: 5000, env: process.env,
      });
      expect(result).toMatchObject({
        status: "spawn_error", errorCode: "ENOENT", exitCode: null,
        stdout: "", stderr: "", ownedTreeDrained: true, preSpawnNoChild: true,
      });
    } finally {
      const target = resolve(dir);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("wn-process-enoent-")) {
        rmSync(target, { recursive: true, force: true });
      }
    }
  });

  it("keeps helper spawn failure separate from executable ENOENT", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn-process-spawn-fault-"));
    try {
      const executable = join(dir, "fixture.cmd");
      writeFileSync(executable, "@echo off\r\necho SHOULD_NOT_RUN\r\n");
      const result = await new WindowsProcessSupervisor().run({
        executable, cwd: join(dir, "missing-cwd"), argv: [], timeoutMs: 5000, env: process.env,
      });
      expect(result).toMatchObject({ status: "spawn_error", exitCode: null, stdout: "", stderr: "" });
      expect(result.preSpawnNoChild).not.toBe(true);
      expect(result.errorCode).toBe("ENOENT");
    } finally {
      const target = resolve(dir);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("wn-process-spawn-fault-")) {
        rmSync(target, { recursive: true, force: true });
      }
    }
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
