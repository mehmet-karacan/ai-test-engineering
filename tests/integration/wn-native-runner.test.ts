import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { AppError } from "../../src/domain/errors.js";

describe.skipIf(process.platform !== "win32")("S02 MavenRunner native path", () => {
  it("uses an explicitly selected installed Maven script without Docker or wrapper", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner (Türkçe) & "));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\nif \"%~1\"==\"-v\" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho Maven fixture %1 %2\r\n");
      writeFileSync(join(dir, "mvnw.cmd"), "@echo off\r\nexit /b 99\r\n");
      const result = await new MavenRunner().run({
        working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable,
      });
      expect(result.exit_code).toBe(0);
      expect(result.timed_out).toBe(false);
      expect(result.command[0]).toBe(executable);
      expect(result.toolchain_identity).toMatch(/^[a-f0-9]{64}$/);
      expect(readFileSync(result.stdout_log_path, "utf8")).toContain("Maven fixture");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("selects PATH Maven before a present wrapper", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner path-"));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\nif \"%~1\"==\"-v\" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho PATH Maven\r\n");
      writeFileSync(join(dir, "mvnw.cmd"), "@echo off\r\nexit /b 99\r\n");
      const result = await new MavenRunner().run({
        working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), env: { Path: dir },
      });
      expect(result.native_status).toBe("success");
      expect(result.command[0]).toBe(executable);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("does not return a timed-out Maven run as accepted evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner timeout-"));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\nif \"%~1\"==\"-v\" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\nping -n 8 127.0.0.1 >nul\r\n");
      await expect(new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 200,
        log_dir: join(dir, "logs"), executable })).rejects.toMatchObject({ code: "BLOCKED_ISOLATION" } satisfies Partial<AppError>);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects an explicit empty settings path before Maven starts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner settings-"));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\necho SHOULD_NOT_RUN\r\n");
      await expect(new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable, settings_path: "" })).rejects.toMatchObject({ code: "INVALID_PARAMETERS" } satisfies Partial<AppError>);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("does not run goals when selected executable has unknown version", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner unknown-version-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "GOALS_RAN");
      writeFileSync(executable, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven unknown\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho ran>"${sentinel}"\r\n`);
      await expect(new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable })).rejects.toMatchObject({ details: { reason_code: "MAVEN_VERSION_UNVERIFIED" } });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects a version changed after plan pinning before goals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner version-change-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "GOALS_RAN");
      writeFileSync(executable, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven %MAVEN_OPTS%\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho ran>"${sentinel}"\r\n`);
      const runner = new MavenRunner();
      const first = await runner.run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "first"), executable, env: { MAVEN_OPTS: "3.9.16" } });
      rmSync(sentinel);
      await expect(runner.run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "second"), executable, env: { MAVEN_OPTS: "3.9.17" },
        expected_toolchain_identity: first.toolchain_identity })).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("keeps a constructor-pinned identity across separate run calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn pinned runner-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "GOALS_RAN");
      writeFileSync(executable, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho ran>"${sentinel}"\r\n`);
      await expect(new MavenRunner("0".repeat(64)).run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable })).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("passes only approved Maven environment and rejects unknown overrides", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner env-"));
    const prior = process.env["AITEST_PRIVATE_SENTINEL"];
    process.env["AITEST_PRIVATE_SENTINEL"] = "SECRET_NOT_FOR_MAVEN";
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\nif \"%~1\"==\"-v\" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho PRIVATE=%AITEST_PRIVATE_SENTINEL%\r\n");
      const result = await new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable });
      expect(readFileSync(result.stdout_log_path, "utf8")).not.toContain("SECRET_NOT_FOR_MAVEN");
      await expect(new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "rejected"), executable, env: { AITEST_PRIVATE_SENTINEL: "SECRET_NOT_FOR_MAVEN" } }))
        .rejects.toMatchObject({ code: "INVALID_PARAMETERS" });
    } finally {
      if (prior === undefined) delete process.env["AITEST_PRIVATE_SENTINEL"];
      else process.env["AITEST_PRIVATE_SENTINEL"] = prior;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
