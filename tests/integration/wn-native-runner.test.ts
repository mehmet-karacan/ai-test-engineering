import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import { AppError } from "../../src/domain/errors.js";
import { WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";

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

  it("retains truncation counts and reasons in a failed native run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner truncated-failure-"));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\n");
      const processRun = vi.spyOn(WindowsProcessSupervisor.prototype, "run").mockImplementation(async (plan) =>
        plan.argv[0] === "-v"
          ? { status: "success", exitCode: 0, stdout: "Apache Maven 3.9.16\nJava version: 25.0.3, vendor: Fixture\n", stderr: "",
            stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: 1 }
          : { status: "timeout", exitCode: null, stdout: "bounded", stderr: "", stdoutTruncatedBytes: 17,
            stderrTruncatedBytes: 0, stdoutTruncationReason: "BYTE_BUDGET_EXCEEDED", durationMs: 1 });
      try {
        await expect(new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
          log_dir: join(dir, "logs"), executable })).rejects.toMatchObject({ details: {
          stdout_truncated_bytes: 17, stdout_truncation_reason: "BYTE_BUDGET_EXCEEDED",
        } });
      } finally { processRun.mockRestore(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("keeps the written UTF-8 log under 8 MiB when invalid input bytes expand", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner invalid-utf8-"));
    const limit = 8 * 1024 * 1024;
    try {
      const executable = join(dir, "mvn.cmd");
      const producer = join(dir, "producer.js");
      writeFileSync(producer, `process.stdout.write(Buffer.alloc(${limit}, 0xff));process.stderr.write(Buffer.concat([Buffer.alloc(${limit - 1}, 65), Buffer.from('😀')]));`);
      writeFileSync(executable, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\n"${process.execPath}" "${producer}"\r\nexit /b %errorlevel%\r\n`);
      const result = await new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 30000,
        log_dir: join(dir, "logs"), executable });
      expect(readFileSync(result.stdout_log_path).length).toBeLessThanOrEqual(limit);
      expect(readFileSync(result.stderr_log_path).length).toBeLessThanOrEqual(limit);
      expect(result.stdout_truncated_bytes).toBeGreaterThan(0);
      expect(result.stdout_truncation_reason).toBe("BYTE_BUDGET_EXCEEDED");
      expect(result.stderr_truncated_bytes).toBeGreaterThan(0);
      expect(result.stderr_truncation_reason).toBe("BYTE_BUDGET_EXCEEDED");
    } finally {
      const target = resolve(dir);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("wn runner invalid-utf8-")) {
        rmSync(target, { recursive: true, force: true });
      } else {
        process.stderr.write("Refusing invalid UTF-8 fixture cleanup outside owned Temp root\n");
      }
    }
  }, 45000);

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

  it("rejects executable bytes changed by the execution identity guard before goals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner guard-byte-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "GOALS_RAN");
      writeFileSync(executable, "@echo off\r\nif \"%~1\"==\"-v\" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\n");
      const runner = new MavenRunner(undefined, undefined, () => {
        writeFileSync(executable, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho ran>"${sentinel}"\r\n`);
      });
      await expect(runner.run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable })).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects inherited .mvn bytes changed by the guard before goals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner guard-config-"));
    try {
      const executable = join(dir, "mvn.cmd");
      const sentinel = join(dir, "GOALS_RAN");
      writeFileSync(executable, `@echo off\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\necho ran>"${sentinel}"\r\n`);
      const configDir = join(dir, ".mvn");
      mkdirSync(configDir);
      const config = join(configDir, "maven.config");
      writeFileSync(config, "-B");
      const runner = new MavenRunner(undefined, undefined, () => writeFileSync(config, "-ntp"));
      await expect(runner.run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable })).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("passes the verified digest snapshot to the native goal unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner expected-pins-"));
    try {
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, "@echo off\r\necho Apache Maven 3.9.16\r\necho Java version: 25.0.3, vendor: Fixture\r\n");
      let verifiedPins: ReadonlyArray<{ path: string; sha256: string | null }> | undefined;
      let goalPins: ReadonlyArray<{ path: string; sha256: string | null }> | undefined;
      const processRun = vi.spyOn(WindowsProcessSupervisor.prototype, "run").mockImplementation(async function (plan) {
        if (plan.argv[0] === "-v") return { status: "success", exitCode: 0,
          stdout: "Apache Maven 3.9.16\nJava version: 25.0.3, vendor: Fixture\n", stderr: "",
          stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: 1, ownedTreeDrained: true };
        goalPins = (plan as typeof plan & { pinnedInputs?: typeof verifiedPins }).pinnedInputs;
        return { status: "success", exitCode: 0, stdout: "bounded", stderr: "", stdoutTruncatedBytes: 17,
          stderrTruncatedBytes: 0, stdoutTruncationReason: "BYTE_BUDGET_EXCEEDED", durationMs: 1, ownedTreeDrained: true };
      });
      try {
        const lifecycle = { beforeSpawn: () => undefined, afterSpawn: () => undefined, afterTerminal: () => undefined };
        const result = await new MavenRunner(undefined, lifecycle, (verified) => { verifiedPins = verified.pinnedInputs; }).run({
          working_dir: dir, goals: ["test"], timeout_ms: 15000, log_dir: join(dir, "logs"), executable,
        });
        expect(verifiedPins).toBeDefined();
        expect(goalPins).toEqual(verifiedPins);
        expect(result.stdout_truncated_bytes).toBe(17);
        expect(result.stdout_truncation_reason).toBe("BYTE_BUDGET_EXCEEDED");
      } finally { processRun.mockRestore(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("disables Maven pre/post rc scripts and omits inherited MAVEN_ARGS", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wn runner rc-"));
    const priorArgs = process.env.MAVEN_ARGS;
    const priorSkip = process.env.MAVEN_SKIP_RC;
    process.env.MAVEN_ARGS = "UNAPPROVED_ARGUMENTS";
    delete process.env.MAVEN_SKIP_RC;
    try {
      const profile = join(dir, "profile");
      mkdirSync(profile);
      const pre = join(dir, "PRE_RAN");
      const post = join(dir, "POST_RAN");
      const args = join(dir, "ARGS_RAN");
      writeFileSync(join(profile, "mavenrc_pre.cmd"), `@echo off\r\necho pre>"${pre}"\r\n`);
      writeFileSync(join(profile, "mavenrc_post.cmd"), `@echo off\r\necho post>"${post}"\r\n`);
      const executable = join(dir, "mvn.cmd");
      writeFileSync(executable, `@echo off\r\nif "%MAVEN_SKIP_RC%"=="" call "%USERPROFILE%\\mavenrc_pre.cmd"\r\nif not "%MAVEN_ARGS%"=="" echo args>"${args}"\r\nif "%~1"=="-v" (\r\n echo Apache Maven 3.9.16\r\n echo Java version: 25.0.3, vendor: Fixture\r\n exit /b 0\r\n)\r\nif "%MAVEN_SKIP_RC%"=="" call "%USERPROFILE%\\mavenrc_post.cmd"\r\n`);
      const result = await new MavenRunner().run({ working_dir: dir, goals: ["test"], timeout_ms: 15000,
        log_dir: join(dir, "logs"), executable, env: { USERPROFILE: profile } });
      expect(result.native_status).toBe("success");
      for (const sentinel of [pre, post, args]) expect(() => readFileSync(sentinel)).toThrow();
      expect(process.env.MAVEN_SKIP_RC).toBeUndefined();
    } finally {
      if (priorArgs === undefined) delete process.env.MAVEN_ARGS; else process.env.MAVEN_ARGS = priorArgs;
      if (priorSkip === undefined) delete process.env.MAVEN_SKIP_RC; else process.env.MAVEN_SKIP_RC = priorSkip;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
