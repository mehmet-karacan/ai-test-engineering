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
  /** W03/F06: gercek run yapilmadiysa null; sentetik exit0 kaydi uretilmez */
  run: RunResult | null;
  failed_tests: string[];
  total_tests: number;
  failures: number;
  errors: number;
  skipped: number;
  /** W03/F06: framework yok/test yok/skip ayrisimi icin neden kodu */
  reason_code: string | null;
  /** W03/F06: bozuk XML raporlari; silently continue edilmez */
  malformed_reports: string[];
  /** W03/F06: skip politika izleri (surefire skipTests/maven.test.skip) */
  skip_config_detected: string[];
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

export function parseSurefireReports(projectRoot: string, moduleRelativePath: string, malformedOut?: string[]): SurefireSuite[] {
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
    } catch (error) {
      // W03/F06: bozuk XML silently continue edilmez; dosya kaydedilir, etkilenen sonuc eksik kalir
      malformedOut?.push(`${name}: ${String(error).slice(0, 120)}`);
    }
  }
  return suites;
}

/**
 * W03/F06: skip politika izleri - POM/properties icinde literal skip bayraklari.
 * Kullanici politikasi sessizce degistirilmez; izler raporda gorunur.
 */
export function detectSkipConfig(projectRoot: string): string[] {
  const detected: string[] = [];
  const pomPath = join(resolve(projectRoot), "pom.xml");
  if (existsSync(pomPath)) {
    const content = readFileSync(pomPath, "utf8");
    if (/<skipTests>\s*true\s*<\/skipTests>/.test(content)) {
      detected.push("pom.xml: skipTests=true");
    }
    if (/<maven\.test\.skip>\s*true\s*<\/maven\.test\.skip>/.test(content)) {
      detected.push("pom.xml: maven.test.skip=true");
    }
    if (/<skipITs>\s*true\s*<\/skipITs>/.test(content)) {
      detected.push("pom.xml: skipITs=true");
    }
  }
  return detected;
}

export async function runBaseline(projectRoot: string, runner: MavenRunner, timeoutMs = 600000): Promise<BaselineResult> {
  const plan = buildPlan(projectRoot, []);
  const malformedReports: string[] = [];
  const skipConfig = detectSkipConfig(projectRoot);

  // W03/F06: framework yok -> GERCEK run YAPILMAZ; run:null + reason; sentetik exit0 kaydi YOK
  if (plan.test_framework === "none") {
    return {
      status: "NO_TESTS",
      run: null,
      failed_tests: [],
      total_tests: 0,
      failures: 0,
      errors: 0,
      skipped: 0,
      reason_code: "NO_TEST_FRAMEWORK",
      malformed_reports: [],
      skip_config_detected: skipConfig,
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
    suites.push(...parseSurefireReports(projectRoot, module.module_relative_path, malformedReports));
  }
  const totalTests = suites.reduce((acc, s) => acc + s.tests, 0);
  const failures = suites.reduce((acc, s) => acc + s.failures, 0);
  const errors = suites.reduce((acc, s) => acc + s.errors, 0);
  const skipped = suites.reduce((acc, s) => acc + s.skipped, 0);
  const failedTests = suites.flatMap((s) => s.failed_test_names);

  // W03/F06: run exit0 olsa bile XML failure/error varken PASSED OLAMAZ
  let status: BaselineResult["status"] = "PASSED";
  let reasonCode: string | null = null;
  if (failures + errors > 0) {
    status = "FAILED";
    reasonCode = failures > 0 && errors > 0 ? "TEST_FAILURES_AND_ERRORS" : failures > 0 ? "TEST_FAILURES" : "TEST_ERRORS";
  } else if (run.exit_code !== 0) {
    status = "FAILED";
    reasonCode = "MAVEN_EXIT_NONZERO";
  } else if (totalTests === 0) {
    status = "NO_TESTS";
    reasonCode = "NO_DISCOVERED_TESTS";
  } else if (malformedReports.length > 0) {
    status = "UNSTABLE";
    reasonCode = "MALFORMED_TEST_REPORT";
  }

  return {
    status,
    run,
    failed_tests: failedTests,
    total_tests: totalTests,
    failures,
    errors,
    skipped,
    reason_code: reasonCode,
    malformed_reports: malformedReports,
    skip_config_detected: skipConfig,
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
