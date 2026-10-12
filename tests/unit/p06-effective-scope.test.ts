import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { assertCoverageConfigured, buildPlan, compareTestInventory, type SurefireSuite } from "../../src/orchestration/build-plan.js";
import { AppError } from "../../src/domain/errors.js";
import { readCoverageAfterRun, readCoverageEvidenceAfterRun } from "../../src/orchestration/candidate-loop.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("P06-B2 effective Maven affected-module scope", () => {
  it("cok modullu reactor'da -pl/-am gercek coverage komutuna tasinir", () => {
    const plan = buildPlan(join(FIXTURES, "java21-multi-module"), ["app"]);

    expect(plan.affected_modules).toEqual(["app"]);
    expect(plan.maven_goals_build).toEqual(["-pl", "app", "-am", "test-compile"]);
    expect(plan.maven_goals_test).toEqual(["-pl", "app", "-am", "test"]);
    expect(plan.maven_goals_coverage).toEqual(["-pl", "app", "-am", "test", "jacoco:report"]);
  });

  it("Windows path ayiracini normalize eder ve duplicate scope'u tekilleştirir", () => {
    const plan = buildPlan(join(FIXTURES, "java21-multi-module"), ["app\\", "app", "core"]);

    expect(plan.affected_modules).toEqual(["app", "core"]);
    expect(plan.maven_goals_test).toEqual(["-pl", "app,core", "-am", "test"]);
  });

  it("reactor disi affected module'u typed blocker ile reddeder", () => {
    try {
      buildPlan(join(FIXTURES, "java21-multi-module"), ["missing-module"]);
      throw new Error("AFFECTED_MODULE_UNKNOWN bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("BLOCKED_TARGET_RESOLUTION");
      expect((error as AppError).details?.reason_code).toBe("AFFECTED_MODULE_UNKNOWN");
    }
  });

  it("tek modullu projede gereksiz -pl/-am eklemez", () => {
    const plan = buildPlan(join(FIXTURES, "sample-maven-project"), [""]);

    expect(plan.maven_goals_coverage).toEqual(["test", "jacoco:report"]);
  });

  it("JaCoCo olmayan hedef modul typed coverage blocker uretir", () => {
    const plan = buildPlan(join(FIXTURES, "java21-multi-module"), ["core"]);
    expect(() => assertCoverageConfigured(plan, ["core"])).toThrowError(AppError);
    try {
      assertCoverageConfigured(plan, ["core"]);
    } catch (error) {
      expect((error as AppError).code).toBe("BLOCKED_COVERAGE_CONFIGURATION");
      expect((error as AppError).details?.reason_code).toBe("JACOCO_PLUGIN_MISSING");
    }
  });

  it("stale JaCoCo XML counter'a donusturulmez", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p06-stale-"));
    try {
      const xmlPath = join(dir, "target", "site", "jacoco", "jacoco.xml");
      mkdirSync(join(xmlPath, ".."), { recursive: true });
      writeFileSync(xmlPath, `<report><sessioninfo id="old" start="1" dump="1"/><package name="p"><class name="p.Service" sourcefilename="Service.java"><counter type="LINE" missed="9" covered="1"/></class></package></report>`);
      const old = new Date(Date.now() - 60_000);
      utimesSync(xmlPath, old, old);
      expect(() => readCoverageAfterRun(dir, "p.Service", "", { minimum_mtime_ms: Date.now() - 1000, require_session_info: true, expected_source_filename: "Service.java" })).toThrowError(/Stale JaCoCo/);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("JaCoCo wrong-source XML source mismatch olarak reddedilir", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p06-source-"));
    try {
      const xmlPath = join(dir, "target", "site", "jacoco", "jacoco.xml");
      mkdirSync(join(xmlPath, ".."), { recursive: true });
      writeFileSync(xmlPath, `<report><sessioninfo id="fresh" start="${Date.now()}" dump="${Date.now()}"/><package name="p"><class name="p.Service" sourcefilename="Other.java"><counter type="LINE" missed="9" covered="1"/></class></package></report>`);
      expect(() => readCoverageAfterRun(dir, "p.Service", "", { minimum_mtime_ms: Date.now() - 1000, require_session_info: true, expected_source_filename: "Service.java" })).toThrowError(/source eslesmedi/);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("baseline test kimligi kaybi ve yeni skip final replay'i gecirmez", () => {
    const suite = (test_names: string[], skipped_test_names: string[] = []): SurefireSuite => ({
      module_relative_path: "app",
      name: "AppTest",
      tests: test_names.length,
      failures: 0,
      errors: 0,
      skipped: skipped_test_names.length,
      test_names,
      skipped_test_names,
      failed_test_names: [],
    });
    const result = compareTestInventory(
      [suite(["AppTest#kept", "AppTest#removed"])],
      [suite(["AppTest#kept", "AppTest#new"], ["AppTest#new"])],
      ["app"],
    );
    expect(result.missing_tests).toEqual(["AppTest#removed"]);
    expect(result.newly_skipped_tests).toEqual(["AppTest#new"]);
  });

  it("coverage evidence report/source/class hashlerini uretir", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p06-evidence-"));
    try {
      const xmlPath = join(dir, "target", "site", "jacoco", "jacoco.xml");
      const sourcePath = join(dir, "src", "main", "java", "p", "Service.java");
      const classPath = join(dir, "target", "classes", "p", "Service.class");
      mkdirSync(join(xmlPath, ".."), { recursive: true });
      mkdirSync(join(sourcePath, ".."), { recursive: true });
      mkdirSync(join(classPath, ".."), { recursive: true });
      writeFileSync(sourcePath, "class Service {}", "utf8");
      writeFileSync(classPath, Buffer.from([1, 2, 3]));
      writeFileSync(xmlPath, `<report><sessioninfo id="fresh" start="${Date.now()}" dump="${Date.now()}"/><package name="p"><class name="p.Service" sourcefilename="Service.java"><counter type="LINE" missed="1" covered="9"/></class></package></report>`);
      const evidence = readCoverageEvidenceAfterRun(dir, "p.Service", "", {
        minimum_mtime_ms: Date.now() - 1000,
        require_session_info: true,
        require_class_file: true,
        expected_source_filename: "Service.java",
        source_relative_path: "src/main/java/p/Service.java",
      });
      expect(evidence?.report_sha256).toHaveLength(64);
      expect(evidence?.source_sha256).toHaveLength(64);
      expect(evidence?.binary_class_id).toHaveLength(64);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
