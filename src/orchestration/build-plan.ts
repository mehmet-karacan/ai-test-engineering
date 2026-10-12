/**
 * BuildPlan + baseline akisi: gercek toolchain, baseline test kosusu, BASELINE_FAILED/UNSTABLE ayrimi.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../domain/errors.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { MavenRunner, strictTestExecutionProperties, type RunResult, type MavenRunOptions } from "../runners/maven-runner.js";

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

function scopedMavenGoals(modules: PomModule[], affectedModules: string[], goals: string[]): string[] {
  const normalized = [...new Set(affectedModules.map((modulePath) => modulePath.replace(/[\\/]/g, "/").replace(/^\.\/$/, "").replace(/\/+$/, "")))];
  const reactorModules = new Set(modules.map((module) => module.module_relative_path));
  const unknown = normalized.filter((modulePath) => modulePath.length > 0 && !reactorModules.has(modulePath));
  if (unknown.length > 0) {
    throw new AppError("BLOCKED_TARGET_RESOLUTION", `Effective Maven modul listesinde bilinmeyen modul: ${unknown.join(", ")}`, {
      reason_code: "AFFECTED_MODULE_UNKNOWN",
      affected_modules: unknown,
    });
  }
  const scoped = normalized.filter((modulePath) => modulePath.length > 0);
  if (scoped.length === 0 || modules.length <= 1) {
    return [...goals];
  }
  // Maven reactor kokunden relative module path'leri secilir; -am hedef modulu
  // icin gereken upstream modulleri de ayni invocation'a dahil eder.
  return ["-pl", scoped.join(","), "-am", ...goals];
}

export function buildPlan(projectRoot: string, affectedModulePaths: string[]): BuildPlan {
  const root = resolve(projectRoot);
  const discovery = discoverModules(root);
  const hasJunit4 = discovery.modules.some((m) => m.junit4_present);
  const hasJunit5 = discovery.modules.some((m) => m.junit5_present);
  const settingsPath = join(root, "settings.xml");
  const normalizedAffectedModules = [...new Set(affectedModulePaths.map((modulePath) => modulePath.replace(/[\\/]/g, "/").replace(/^\.\/$/, "").replace(/\/+$/, "")))];

  return {
    reactor_root: discovery.reactor_root,
    modules: discovery.modules,
    affected_modules: normalizedAffectedModules,
    maven_goals_build: scopedMavenGoals(discovery.modules, normalizedAffectedModules, ["test-compile"]),
    maven_goals_test: scopedMavenGoals(discovery.modules, normalizedAffectedModules, ["test"]),
    maven_goals_coverage: scopedMavenGoals(discovery.modules, normalizedAffectedModules, ["test", "jacoco:report"]),
    jdk_version: process.env["JAVA_HOME"] ? "from_env" : "default",
    test_framework: hasJunit4 && hasJunit5 ? "both" : hasJunit4 ? "junit4" : hasJunit5 ? "junit5" : "none",
    mockito_present: discovery.modules.some((m) => m.mockito_present),
    jacoco_present: discovery.modules.some((m) => m.jacoco_configured),
    settings_xml: existsSync(settingsPath) ? settingsPath : null,
  };
}

/**
 * P06/PP27: coverage kosusu agent + report zinciri icin POM'da JaCoCo
 * konfigurasyonu bulunmadiginda Maven exit koduna guvenilmez; typed blocker
 * ile durulur. Baseline'da en az bir executable modul, hedefli kosuda ise
 * secilen her executable modul kontrol edilir.
 */
export function assertCoverageConfigured(plan: BuildPlan, affectedModulePaths: string[] = plan.affected_modules): void {
  const normalized = [...new Set(affectedModulePaths.map((modulePath) => modulePath.replace(/[\\/]/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")))].filter(Boolean);
  const selected = normalized.length > 0
    ? plan.modules.filter((module) => normalized.includes(module.module_relative_path) && module.packaging !== "pom")
    : plan.modules.filter((module) => module.packaging !== "pom");
  const missing = selected.filter((module) => !module.jacoco_configured).map((module) => module.module_relative_path || ".");
  if (missing.length > 0 && (normalized.length > 0 || missing.length === selected.length)) {
    throw new AppError("BLOCKED_COVERAGE_CONFIGURATION", `JaCoCo agent/report yapilandirmasi yok: ${missing.join(", ")}`, {
      reason_code: "JACOCO_PLUGIN_MISSING",
      modules: missing,
    });
  }
  if (selected.length === 0) {
    throw new AppError("BLOCKED_COVERAGE_CONFIGURATION", "Coverage icin executable Maven modul bulunamadi", {
      reason_code: "NO_EXECUTABLE_MODULE",
    });
  }
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
  /** P06/PP20: baseline'in gercek calistigi frozen workspace. */
  execution_root: string;
  test_inventory: SurefireSuite[];
  run_started_at: number | null;
  run_finished_at: number | null;
}

export interface BaselineOptions {
  /** P06/PP20: orijinal checkout yerine urun storage altinda frozen workspace. */
  workspace_root?: string;
  /** P06/PP27: baseline run'inda JaCoCo report hedefini de calistir. */
  collect_coverage?: boolean;
}

/** P06/PP20: customer checkout'u degistirmeden frozen baseline workspace uretir. */
export function createFrozenWorkspace(projectRoot: string, workspaceRoot: string): string {
  const source = resolve(projectRoot);
  const destination = resolve(workspaceRoot);
  if (source === destination) {
    throw new AppError("POLICY_VIOLATION", "Frozen workspace customer checkout ile ayni olamaz", { reason_code: "FROZEN_WORKSPACE_COLLISION" });
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(join(destination, ".."), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const name = entry.split(/[\\/]/).pop() ?? "";
      return name !== ".git" && name !== "node_modules" && name !== "target";
    },
  });
  return destination;
}

const surefireParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  isArray: (name) => name === "testcase" || name === "failure" || name === "error" || name === "testsuite",
});

export interface SurefireSuite {
  module_relative_path: string;
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  test_names: string[];
  skipped_test_names: string[];
  failed_test_names: string[];
}

function parseTestReportDirectory(projectRoot: string, moduleRelativePath: string, reportDirectory: "surefire-reports" | "failsafe-reports", malformedOut?: string[]): SurefireSuite[] {
  const reportDir = join(resolve(projectRoot), moduleRelativePath, "target", reportDirectory);
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
        const testNames: string[] = [];
        const skippedNames: string[] = [];
        const failedNames: string[] = [];
        for (const tc of testcases) {
          const testName = `${String(tc["@_classname"] ?? "")}#${String(tc["@_name"] ?? "")}`;
          testNames.push(testName);
          if (tc["skipped"]) {
            skippedNames.push(testName);
          }
          if (tc["failure"] || tc["error"]) {
            failedNames.push(testName);
          }
        }
        suites.push({
          module_relative_path: moduleRelativePath,
          name: String(suiteRaw["@_name"] ?? name),
          tests: Number.parseInt(String(suiteRaw["@_tests"] ?? "0"), 10) || 0,
          failures: Number.parseInt(String(suiteRaw["@_failures"] ?? "0"), 10) || 0,
          errors: Number.parseInt(String(suiteRaw["@_errors"] ?? "0"), 10) || 0,
          skipped: Number.parseInt(String(suiteRaw["@_skipped"] ?? "0"), 10) || 0,
          test_names: testNames,
          skipped_test_names: skippedNames,
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

export function parseSurefireReports(projectRoot: string, moduleRelativePath: string, malformedOut?: string[]): SurefireSuite[] {
  return parseTestReportDirectory(projectRoot, moduleRelativePath, "surefire-reports", malformedOut);
}

export function parseFailsafeReports(projectRoot: string, moduleRelativePath: string, malformedOut?: string[]): SurefireSuite[] {
  return parseTestReportDirectory(projectRoot, moduleRelativePath, "failsafe-reports", malformedOut);
}

export interface TestReportSummary {
  suites: SurefireSuite[];
  total_tests: number;
  failures: number;
  errors: number;
  skipped: number;
  failed_tests: string[];
  malformed_reports: string[];
}

export interface TestInventoryRegression {
  missing_tests: string[];
  newly_skipped_tests: string[];
}

/** P06/PP31: baseline test kimligi kaybolur veya yeni skip olursa final gecmez. */
export function compareTestInventory(baseline: SurefireSuite[], current: SurefireSuite[], moduleRelativePaths?: string[]): TestInventoryRegression {
  const scope = moduleRelativePaths === undefined ? null : new Set(moduleRelativePaths);
  const select = (suites: SurefireSuite[]): SurefireSuite[] => scope === null ? suites : suites.filter((suite) => scope.has(suite.module_relative_path));
  const baselineSuites = select(baseline);
  const currentSuites = select(current);
  const baselineNames = new Set(baselineSuites.flatMap((suite) => suite.test_names));
  const currentNames = new Set(currentSuites.flatMap((suite) => suite.test_names));
  const baselineSkipped = new Set(baselineSuites.flatMap((suite) => suite.skipped_test_names));
  const currentSkipped = new Set(currentSuites.flatMap((suite) => suite.skipped_test_names));
  return {
    missing_tests: [...baselineNames].filter((name) => !currentNames.has(name)).sort(),
    newly_skipped_tests: [...currentSkipped].filter((name) => !baselineSkipped.has(name)).sort(),
  };
}

export function summarizeTestReports(projectRoot: string, moduleRelativePaths: string[]): TestReportSummary {
  const malformedReports: string[] = [];
  const suites: SurefireSuite[] = [];
  for (const moduleRelativePath of [...new Set(moduleRelativePaths)]) {
    suites.push(...parseSurefireReports(projectRoot, moduleRelativePath, malformedReports));
    suites.push(...parseFailsafeReports(projectRoot, moduleRelativePath, malformedReports));
  }
  return {
    suites,
    total_tests: suites.reduce((acc, suite) => acc + suite.tests, 0),
    failures: suites.reduce((acc, suite) => acc + suite.failures, 0),
    errors: suites.reduce((acc, suite) => acc + suite.errors, 0),
    skipped: suites.reduce((acc, suite) => acc + suite.skipped, 0),
    failed_tests: suites.flatMap((suite) => suite.failed_test_names),
    malformed_reports: malformedReports,
  };
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

export async function runBaseline(projectRoot: string, runner: MavenRunner, timeoutMs = 600000, options: BaselineOptions = {}): Promise<BaselineResult> {
  const executionRoot = options.workspace_root ? createFrozenWorkspace(projectRoot, options.workspace_root) : resolve(projectRoot);
  const plan = buildPlan(executionRoot, []);
  const malformedReports: string[] = [];
  const skipConfig = detectSkipConfig(executionRoot);

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
      execution_root: executionRoot,
      test_inventory: [],
      run_started_at: null,
      run_finished_at: null,
    };
  }

  if (options.collect_coverage) {
    assertCoverageConfigured(plan, []);
  }

  const runOptions: MavenRunOptions = {
    working_dir: executionRoot,
    goals: options.collect_coverage ? plan.maven_goals_coverage : plan.maven_goals_test,
    properties: strictTestExecutionProperties(),
    timeout_ms: timeoutMs,
    log_dir: join(executionRoot, "target", "aitest-baseline-logs"),
  };
  const runStartedAt = Date.now();
  const run = await runner.run(runOptions);
  const runFinishedAt = Date.now();

  const reportSummary = summarizeTestReports(executionRoot, plan.modules.map((module) => module.module_relative_path));
  malformedReports.push(...reportSummary.malformed_reports);
  const totalTests = reportSummary.total_tests;
  const failures = reportSummary.failures;
  const errors = reportSummary.errors;
  const skipped = reportSummary.skipped;
  const failedTests = reportSummary.failed_tests;

  // W03/F06: run exit0 olsa bile XML failure/error varken PASSED OLAMAZ
  let status: BaselineResult["status"] = "PASSED";
  let reasonCode: string | null = null;
  if (failures + errors > 0) {
    status = "FAILED";
    reasonCode = failures > 0 && errors > 0 ? "TEST_FAILURES_AND_ERRORS" : failures > 0 ? "TEST_FAILURES" : "TEST_ERRORS";
  } else if (run.timed_out) {
    status = "FAILED";
    reasonCode = "MAVEN_RUN_TIMEOUT";
  } else if (run.exit_code !== 0) {
    status = "FAILED";
    reasonCode = "MAVEN_EXIT_NONZERO";
  } else if (totalTests === 0) {
    status = "NO_TESTS";
    reasonCode = "NO_DISCOVERED_TESTS";
  } else if (skipped === totalTests) {
    status = "UNSTABLE";
    reasonCode = "ALL_TESTS_SKIPPED";
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
    execution_root: executionRoot,
    test_inventory: reportSummary.suites,
    run_started_at: runStartedAt,
    run_finished_at: runFinishedAt,
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
