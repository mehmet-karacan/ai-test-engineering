import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, linkSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../../src/configuration/config-loader.js";
import { projectNativeExecution } from "../../src/configuration/project-native-execution.js";
import { withUnitTestSkipOverride } from "../../src/runners/unit-test-skip-override.js";

describe("project native execution", () => {
  it("selects only the configured Maven root and leaves process environment alone", () => {
    const config = defaultConfig(); const root = join(tmpdir(), "customer/backend");
    config.native_execution_profiles = [{ project_root: root, java_home: join(tmpdir(), "jdk21"), run_skipped_unit_tests: true }];
    const before = { ...process.env };
    expect(projectNativeExecution(config, root)).toEqual({ java_home: join(tmpdir(), "jdk21"), run_skipped_unit_tests: true });
    expect(projectNativeExecution(config, join(root, "other"))).toBeUndefined();
    expect(process.env).toEqual(before);
  });
  it.skipIf(process.platform !== "win32")("never overwrites a replacement hardlink and still restores other modules", async () => {
    const root = mkdtempSync(join(tmpdir(), "unit-hardlink-"));
    try {
      const work = join(root, "job/baseline"); mkdirSync(join(work, "child"), { recursive: true });
      const pom = join(work, "pom.xml"), child = join(work, "child/pom.xml"), outside = join(root, "outside.xml");
      const text = "<project><modules><module>child</module></modules><skipTests>true</skipTests></project>";
      const childText = "<project><skipTests>true</skipTests></project>";
      writeFileSync(pom, text); writeFileSync(child, childText);
      await expect(withUnitTestSkipOverride(work, join(root, "job"), join(work, "target/logs"), async () => {
        writeFileSync(outside, readFileSync(pom)); unlinkSync(pom); linkSync(outside, pom);
      })).rejects.toThrow(/changed/);
      expect(readFileSync(outside, "utf8")).toBe(text.replace("true", "false"));
      expect(readFileSync(child, "utf8")).toBe(childText);
      expect(JSON.parse(readFileSync(join(work, "target/logs/unit-test-skip-overrides.json"), "utf8")).restored).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform !== "win32")("rejects modified staged receipts instead of publishing a false restore claim", async () => {
    const root = mkdtempSync(join(tmpdir(), "unit-receipt-"));
    try {
      const owned = join(root, "job"), work = join(owned, "baseline"); mkdirSync(work, { recursive: true });
      const pom = join(work, "pom.xml"); writeFileSync(pom, "<project><skipTests>true</skipTests></project>");
      await expect(withUnitTestSkipOverride(work, owned, join(work, "target/logs"), async () => {
        const stage = readdirSync(owned).find(name => name.startsWith("unit-test-overlay-"))!;
        writeFileSync(join(owned, stage, "failed.json"), JSON.stringify({ schema_version: 1, restored: true, files: [] }));
        writeFileSync(pom, "changed");
      })).rejects.toThrow(/changed/);
      expect(JSON.parse(readFileSync(join(work, "target/logs/unit-test-skip-overrides.json"), "utf8")).restored).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform !== "win32")("detects POM tampering during execution without overwriting unexpected bytes", async () => {
    const root = mkdtempSync(join(tmpdir(), "unit-tamper-"));
    try {
      const work = join(root, "job/baseline"); mkdirSync(work, { recursive: true });
      const pom = join(work, "pom.xml"); writeFileSync(pom, "<project><skipTests>true</skipTests></project>");
      await expect(withUnitTestSkipOverride(work, join(root, "job"), join(work, "target/logs"), async () => { writeFileSync(pom, "unexpected"); })).rejects.toThrow(/changed/);
      expect(readFileSync(pom, "utf8")).toBe("unexpected");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform !== "win32")("overrides only owned POM unit skip literals during execution, records evidence and restores bytes on failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "unit-skip-"));
    try {
      const work = join(root, "job/baseline"); mkdirSync(work, { recursive: true });
      const pom = join(work, "pom.xml"), text = "<project><skipTests>true</skipTests><skipITs>true</skipITs></project>\r\n";
      writeFileSync(pom, text); const logs = join(work, "target/logs");
      await expect(withUnitTestSkipOverride(work, join(root, "job"), logs, async () => {
        expect(readFileSync(pom, "utf8")).toContain("<skipTests>false</skipTests>");
        expect(readFileSync(pom, "utf8")).toContain("<skipITs>true</skipITs>");
        throw new Error("Maven failed");
      })).rejects.toThrow("Maven failed");
      expect(readFileSync(pom, "utf8")).toBe(text);
      const evidence = JSON.parse(readFileSync(join(logs, "unit-test-skip-overrides.json"), "utf8"));
      expect(evidence.files[0].original_sha256).not.toBe(evidence.files[0].execution_sha256);
      expect(evidence.restored).toBe(true);
      mkdirSync(join(root, "other"));
      await expect(withUnitTestSkipOverride(work, join(root, "other"), logs, async () => 1)).rejects.toThrow(/owned/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
