import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NativeToolchainResolver, buildNativeMavenArgv } from "../../src/runners/native-toolchain.js";

describe("S02 native Maven command contract", () => {
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
});
