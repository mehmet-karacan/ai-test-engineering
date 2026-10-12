import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MavenRunner } from "../../src/runners/maven-runner.js";

describe.skipIf(process.platform !== "win32")("S02 MavenRunner native path", () => {
  it("uses an explicitly selected installed Maven script without Docker or wrapper", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner (Türkçe) & "));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\necho Maven fixture %1 %2\r\n");
      writeFileSync(join(dir, "mvnw.cmd"), "@echo off\r\nexit /b 99\r\n");
      const result = await new MavenRunner().run({
        working_dir: dir, goals: ["test"], timeout_ms: 5000,
        log_dir: join(dir, "logs"), executable,
      });
      expect(result.exit_code).toBe(0);
      expect(result.timed_out).toBe(false);
      expect(result.command[0]).toBe(executable);
      expect(readFileSync(result.stdout_log_path, "utf8")).toContain("Maven fixture");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("selects PATH Maven before a present wrapper", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner path-"));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\necho PATH Maven\r\n");
      writeFileSync(join(dir, "mvnw.cmd"), "@echo off\r\nexit /b 99\r\n");
      const result = await new MavenRunner().run({
        working_dir: dir, goals: ["test"], timeout_ms: 5000,
        log_dir: join(dir, "logs"), env: { Path: dir },
      });
      expect(result.native_status).toBe("success");
      expect(result.command[0]).toBe(executable);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
