import { describe, it, expect } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPlan, assertCoverageConfigured } from "../../src/orchestration/build-plan.js";
import { buildNativeMavenArgv } from "../../src/runners/native-toolchain.js";
import { prepareCoverageWorkspace, verifyCoverageWorkspace } from "../../src/orchestration/coverage-workspace.js";

describe("explicit CLI JaCoCo coverage", () => {
  it("rejects ancestor Maven config instead of hiding it behind neutral defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "coverage-inherited-"));
    try {
      const source = join(dir, "source"); cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), source, { recursive: true });
      mkdirSync(join(dir, ".mvn")); writeFileSync(join(dir, ".mvn/maven.config"), "-Pcustomer-profile");
      expect(() => prepareCoverageWorkspace(source, join(dir, "owned"))).toThrow(/inherited|ancestor/i);
      writeFileSync(join(dir, ".mvn/maven.config"), ""); writeFileSync(join(dir, ".mvn/extensions.xml"), "<extensions/>");
      expect(() => prepareCoverageWorkspace(source, join(dir, "neutral-owned"))).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("materializes only neutral missing native config in an owned copy and verifies original source bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "coverage-owned-"));
    const root = join(dir, "source"), owned = join(dir, "store");
    cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), root, { recursive: true });
    try {
      prepareCoverageWorkspace(root, owned);
      expect(existsSync(join(root, ".mvn/jvm.config"))).toBe(false);
      expect(verifyCoverageWorkspace(root, owned).defaults).toContain(".mvn/jvm.config");
      writeFileSync(join(owned, ".mvn/jvm.config"), "-Dchanged=true");
      expect(() => verifyCoverageWorkspace(root, owned)).toThrow(/source|default/i);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("adds pinned agent/test/report without requiring a customer POM plugin", () => {
    const root = mkdtempSync(join(tmpdir(), "coverage-cli-"));
    try {
      cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), root, { recursive: true });
      const plan = buildPlan(root, [], { coverage_mode: "cli" });
      expect(plan.maven_goals_coverage).toEqual([
        "org.jacoco:jacoco-maven-plugin:0.8.12:prepare-agent", "test",
        "org.jacoco:jacoco-maven-plugin:0.8.12:report",
      ]);
      expect(() => assertCoverageConfigured(plan)).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("permits only the pinned two plugin goals in native execution", () => {
    expect(() => buildNativeMavenArgv({ goals: [
      "org.jacoco:jacoco-maven-plugin:0.8.12:prepare-agent", "test",
      "org.jacoco:jacoco-maven-plugin:0.8.12:report",
    ] })).not.toThrow();
    for (const goal of ["org.jacoco:jacoco-maven-plugin:0.8.13:report", "org.jacoco:jacoco-maven-plugin:0.8.12:dump", "other:plugin:1:run"]) {
      expect(() => buildNativeMavenArgv({ goals: [goal] })).toThrow();
    }
  });
});
