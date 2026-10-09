/**
 * BuildPlan + baseline akisi: gercek toolchain, baseline test kosusu, BASELINE_FAILED/UNSTABLE ayrimi.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../domain/errors.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { MavenRunner, type RunResult, type MavenRunOptions } from "../runners/maven-runner.js";

export interface BuildPlan {
  reactor_root: string;
  modules: PomModule[];
  affected_modules: string[];
  maven_goals_build: string[];
  maven_goals_test: string[];
  maven_goals_coverage: string[];
  jdk_version: string;
  test_framework: "junit4" | "junit5" | "both" | "none";
  mockito_present: boolean;
  jacoco_present: boolean;
  settings_xml: string | null;
}

export function buildPlan(projectRoot: string, affectedModulePaths: string[]): BuildPlan {
  const root = resolve(projectRoot);
  const discovery = discoverModules(root);
  const hasJunit4 = discovery.modules.some((m) => m.junit4_present);
  const hasJunit5 = discovery.modules.some((m) => m.junit5_present);
  const settingsPath = join(root, "settings.xml");

  return {
    reactor_root: discovery.reactor_root,
    modules: discovery.modules,
    affected_modules: affectedModulePaths,
    maven_goals_build: ["test-compile"],
    maven_goals_test: ["test"],
    maven_goals_coverage: ["test", "jacoco:report"],
    jdk_version: process.env["JAVA_HOME"] ? "from_env" : "default",
    test_framework: hasJunit4 && hasJunit5 ? "both" : hasJunit4 ? "junit4" : hasJunit5 ? "junit5" : "none",
    mockito_present: discovery.modules.some((m) => m.mockito_present),
    jacoco_present: discovery.modules.some((m) => m.jacoco_configured),
    settings_xml: existsSync(settingsPath) ? settingsPath : null,
  };
}

export interface BaselineResult {
  status: "PASSED" | "FAILED" | "UNSTABLE" | "NO_TESTS";
  run: RunResult;
  failed_tests: string[];
  total_tests: number;
  failures: number;
  errors: number;
  skipped: number;
}

const surefireParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  isArray: (name) => name === "testcase" || name === "failure" || name === "error" || name === "testsuite",
});

export interface SurefireSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  failed_test_names: string[];
}

export function parseSurefireReports(projectRoot: string, moduleRelativePath: string): SurefireSuite[] {
  const reportDir = join(resolve(projectRoot), moduleRelativePath, "target", "surefire-reports");
  if (!existsSync(reportDir)) {
    return [];
  }
  const suites: SurefireSuite[] = [];
  for (const name of readdirSync(reportDir)) {
    if (!name.startsWith("TEST-") || !name.endsWith(".xml")) {
      continue;
    }
    try {
      const raw = surefireParser.parse(readFileSync(join(reportDir, name), "utf8")) as Record<string, unknown>;
      const suitesRaw = raw["testsuite"];
      const suiteList = Array.isArray(suitesRaw) ? suitesRaw as Array<Record<string, unknown>> : suitesRaw ? [suitesRaw as Record<string, unknown>] : [];
      for (const suiteRaw of suiteList) {
        const testcases = Array.isArray(suiteRaw["testcase"]) ? suiteRaw["testcase"] as Array<Record<string, unknown>> : suiteRaw["testcase"] ? [suiteRaw["testcase"] as Record<string, unknown>] : [];
        const failedNames: string[] = [];
        for (const tc of testcases) {
          if (tc["failure"] || tc["error"]) {
            failedNames.push(`${String(tc["@_classname"] ?? "")}#${String(tc["@_name"] ?? "")}`);
          }
        }
        suites.push({
          name: String(suiteRaw["@_name"] ?? name),
          tests: Number.parseInt(String(suiteRaw["@_tests"] ?? "0"), 10) || 0,
          failures: Number.parseInt(String(suiteRaw["@_failures"] ?? "0"), 10) || 0,
          errors: Number.parseInt(String(suiteRaw["@_errors"] ?? "0"), 10) || 0,
          skipped: Number.parseInt(String(suiteRaw["@_skipped"] ?? "0"), 10) || 0,
          failed_test_names: failedNames,
        });
      }
    } catch {
      continue;
    }
  }
  return suites;
}

export async function runBaseline(projectRoot: string, runner: MavenRunner, timeoutMs = 600000): Promise<BaselineResult> {
  const plan = buildPlan(projectRoot, []);
  if (plan.test_framework === "none") {
    return {
      status: "NO_TESTS",
      run: {
        exit_code: 0,
        duration_ms: 0,
        stdout_log_path: "",
        stderr_log_path: "",
        command: [],
        timed_out: false,
      },
      failed_tests: [],
      total_tests: 0,
      failures: 0,
      errors: 0,
      skipped: 0,
    };
  }

  const runOptions: MavenRunOptions = {
    working_dir: projectRoot,
    goals: plan.maven_goals_test,
    timeout_ms: timeoutMs,
    log_dir: join(resolve(projectRoot), "target", "aitest-baseline-logs"),
  };
  const run = await runner.run(runOptions);

  const suites: SurefireSuite[] = [];
  for (const module of plan.modules) {
    suites.push(...parseSurefireReports(projectRoot, module.module_relative_path));
  }
  const totalTests = suites.reduce((acc, s) => acc + s.tests, 0);
  const failures = suites.reduce((acc, s) => acc + s.failures, 0);
  const errors = suites.reduce((acc, s) => acc + s.errors, 0);
  const skipped = suites.reduce((acc, s) => acc + s.skipped, 0);
  const failedTests = suites.flatMap((s) => s.failed_test_names);

  let status: BaselineResult["status"] = "PASSED";
  if (run.exit_code !== 0) {
    status = failures + errors > 0 ? "FAILED" : "FAILED";
    if (totalTests === 0 && run.exit_code !== 0) {
      status = "FAILED";
    }
  }

  return {
    status,
    run,
    failed_tests: failedTests,
    total_tests: totalTests,
    failures,
    errors,
    skipped,
  };
}

export function assertBaselineUsable(baseline: BaselineResult): void {
  if (baseline.status === "FAILED") {
    throw new AppError("INTERNAL_ERROR", `Baseline testler basarisiz: ${baseline.failed_tests.join(", ")}`, {
      reason_code: "BASELINE_FAILED",
      failed_tests: baseline.failed_tests,
    });
  }
}
