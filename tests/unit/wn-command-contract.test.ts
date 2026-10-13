import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NativeToolchainResolver, buildNativeMavenArgv, probeNativeMavenVersion, effectiveMavenEnvironment } from "../../src/runners/native-toolchain.js";
import { processPinPaths } from "../../src/runners/windows-process-supervisor.js";

describe("S02 native Maven command contract", () => {
  it("rejects conflicting Windows environment casing and omits unrelated keys", () => {
    expect(() => effectiveMavenEnvironment({ Path: "A", PATH: "B" })).toThrow();
    expect(effectiveMavenEnvironment({ Path: "A", PRIVATE_SENTINEL: "secret", MAVEN_ARGS: "secret", MAVEN_SKIP_RC: "" }))
      .toEqual({ Path: "A", MAVEN_SKIP_RC: "1" });
    expect(() => effectiveMavenEnvironment({ Path: "A" }, { MAVEN_OPTS: "-X & echo SENTINEL" })).toThrow();
  });
  it("uses installed Maven by default and honors Windows Path casing", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-toolchain-"));
    try {
      const bin = join(root, "Türkçe (tools) & bin");
      mkdirSync(bin);
      const installed = join(bin, "mvn.cmd");
      writeFileSync(installed, "@echo off\r\n");
      const work = join(root, "work");
      mkdirSync(work);
      writeFileSync(join(work, "mvnw.cmd"), "@echo off\r\n");
      const plan = NativeToolchainResolver.resolve({ cwd: work, env: { Path: bin }, platform: "win32" });
      expect(plan.executable).toBe(installed);
      expect(plan.source).toBe("installed");
      expect(plan.identity).toMatch(/^[a-f0-9]{64}$/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("rejects unsafe arguments before command construction", () => {
    for (const value of ["x%PATH%", "x!cmd!", "x^y", "x|more", "x<foo", "x>foo", "x\"y", "x\ny", "x\0y"]) {
      expect(() => buildNativeMavenArgv({ goals: ["test"], properties: { name: value } })).toThrow();
    }
    expect(buildNativeMavenArgv({ goals: ["test"], properties: { name: "Türkçe (test) & more" } }))
      .toContain("-Dname=Türkçe (test) & more");
  });

  it("rejects unapproved goals and unsupported platforms", () => {
    expect(() => buildNativeMavenArgv({ goals: ["deploy"] })).toThrow();
    expect(buildNativeMavenArgv({ goals: ["-pl", "module-a,module-b", "-am", "test"] }).slice(0, 4))
      .toEqual(["-pl", "module-a,module-b", "-am", "test"]);
    expect(() => buildNativeMavenArgv({ goals: ["-pl", "../escape", "-am", "test"] })).toThrow();
    expect(() => NativeToolchainResolver.resolve({ cwd: ".", env: {}, platform: "linux" })).toThrow();
  });

  it("requires explicit wrapper choice and rejects PowerShell-dependent wrapper", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-wrapper-"));
    try {
      mkdirSync(join(root, ".mvn", "wrapper"), { recursive: true });
      writeFileSync(join(root, "mvnw.cmd"), "@echo off\r\npowershell -Command download\r\n");
      writeFileSync(join(root, ".mvn", "wrapper", "maven-wrapper.properties"), "distributionUrl=https://example.invalid/maven.zip");
      expect(() => NativeToolchainResolver.resolve({ cwd: root, env: {}, platform: "win32", preferWrapper: true })).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("pins wrapper properties and jar bytes into the approved snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-wrapper-bytes-"));
    try {
      const wrapper = join(root, ".mvn", "wrapper");
      mkdirSync(wrapper, { recursive: true });
      writeFileSync(join(root, "mvnw.cmd"), "@echo off\r\necho safe\r\n");
      const properties = join(wrapper, "maven-wrapper.properties");
      const jar = join(wrapper, "maven-wrapper.jar");
      writeFileSync(properties, "distributionUrl=local");
      writeFileSync(jar, "jar-one");
      const first = NativeToolchainResolver.resolve({ cwd: root, env: {}, platform: "win32", preferWrapper: true });
      expect(dirname(first.executable)).toBe(first.cwd);
      const helperPaths = processPinPaths({ executable: first.executable, cwd: first.cwd, argv: ["test"], env: {}, timeoutMs: 1000 });
      const snapshotPaths = new Set(first.pinnedInputs.map((input) => input.path.toLowerCase()));
      expect(helperPaths.every((path) => snapshotPaths.has(path.toLowerCase()))).toBe(true);
      expect(first.pinnedInputs.find((input) => input.path === properties)?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(first.pinnedInputs.find((input) => input.path === jar)?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      writeFileSync(jar, "jar-two");
      const second = NativeToolchainResolver.resolve({ cwd: root, env: {}, platform: "win32", preferWrapper: true });
      expect(second.identity).not.toBe(first.identity);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("changes identity when approved settings, toolchains or profiles change without exposing contents", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-identity-"));
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "mvn.cmd"), "@echo off\r\n");
      const settings = join(root, "settings.xml");
      const toolchains = join(root, "toolchains.xml");
      writeFileSync(settings, "<server>SECRET_SENTINEL_A</server>");
      writeFileSync(toolchains, "<jdk>17</jdk>");
      const base = { cwd: root, env: { Path: bin }, platform: "win32" as const, settingsPath: settings, toolchainsPath: toolchains };
      const first = NativeToolchainResolver.resolve({ ...base, profiles: ["unit"] });
      expect(first.pinnedInputs.find((input) => input.path === join(bin, "mvn.cmd"))?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(first.pinnedInputs.find((input) => input.path === settings)?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(first.pinnedInputs.find((input) => input.path === toolchains)?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(first.pinnedInputs.find((input) => input.path === join(root, ".mvn", "maven.config"))?.sha256).toBeNull();
      writeFileSync(settings, "<server>SECRET_SENTINEL_B</server>");
      const second = NativeToolchainResolver.resolve({ ...base, profiles: ["unit"] });
      expect(second.identity).not.toBe(first.identity);
      expect(second.pinnedInputs.find((input) => input.path === settings)?.sha256).not.toBe(first.pinnedInputs.find((input) => input.path === settings)?.sha256);
      const third = NativeToolchainResolver.resolve({ ...base, profiles: ["coverage"] });
      expect(third.identity).not.toBe(second.identity);
      writeFileSync(toolchains, "<jdk>21</jdk>");
      const fourth = NativeToolchainResolver.resolve({ ...base, profiles: ["coverage"] });
      expect(fourth.identity).not.toBe(third.identity);
      expect(JSON.stringify(fourth)).not.toContain("SECRET_SENTINEL");
      expect(buildNativeMavenArgv({ goals: ["test"], settingsPath: settings, toolchainsPath: toolchains }))
        .toEqual(["test", "-s", settings, "-t", toolchains, "-B", "-ntp"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("includes inherited parent .mvn configuration in identity", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-parent-config-"));
    try {
      const bin = join(root, "bin");
      const module = join(root, "module");
      mkdirSync(bin);
      mkdirSync(module);
      mkdirSync(join(root, ".mvn"));
      writeFileSync(join(bin, "mvn.cmd"), "@echo off\r\n");
      const config = join(root, ".mvn", "maven.config");
      writeFileSync(config, "-Pfirst");
      const first = NativeToolchainResolver.resolve({ cwd: module, env: { Path: bin }, platform: "win32" });
      expect(first.pinnedInputs.find((input) => input.path === config)?.sha256).toMatch(/^[a-f0-9]{64}$/u);
      writeFileSync(config, "-Psecond");
      const second = NativeToolchainResolver.resolve({ cwd: module, env: { Path: bin }, platform: "win32" });
      expect(second.identity).not.toBe(first.identity);
      expect(second.pinnedInputs.find((input) => input.path === config)?.sha256).not.toBe(first.pinnedInputs.find((input) => input.path === config)?.sha256);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform !== "win32")("probes actual Maven and Java versions through selected command", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-versions-"));
    try {
      const mvn = join(root, "mvn.cmd");
      writeFileSync(mvn, "@echo off\r\necho Apache Maven 3.9.16\r\necho Java version: 25.0.3, vendor: Fixture\r\n");
      const plan = NativeToolchainResolver.resolve({ cwd: root, env: process.env, executable: mvn });
      const versions = await probeNativeMavenVersion(plan, process.env);
      expect(versions.mavenVersion).toBe("3.9.16");
      expect(versions.javaVersion).toBe("25.0.3");
      expect(versions.effectiveIdentity).not.toBe(plan.identity);
      expect(versions.outputDigest).toMatch(/^[a-f0-9]{64}$/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
