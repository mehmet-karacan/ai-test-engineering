/**
 * BuildPlan + baseline akisi: gercek toolchain, baseline test kosusu, BASELINE_FAILED/UNSTABLE ayrimi.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../domain/errors.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { resolveEffectiveMavenModel, type EffectiveMavenModel } from "../discovery/effective-maven-model.js";
import { MavenRunner, strictTestExecutionProperties, type RunResult, type MavenRunOptions } from "../runners/maven-runner.js";
import { scanTestFile } from "../discovery/java-inventory.js";
import { prepareCoverageWorkspace } from "./coverage-workspace.js";

export interface BuildPlan {
  coverage_mode?: "configured" | "cli";
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
  /** Frozen static effective model and its input provenance. */
  effective_maven_model: EffectiveMavenModel;
}

export interface BuildPlanOptions {
  coverage_mode?: "configured" | "cli";
  active_profiles?: string[];
  settings_path?: string;
  toolchains_path?: string;
  toolchain_version?: string;
  toolchain_vendor?: string;
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

export function buildPlan(projectRoot: string, affectedModulePaths: string[], options: BuildPlanOptions = {}): BuildPlan {
  const root = resolve(projectRoot);
  const discovery = discoverModules(root);
  const settingsPath = join(root, "settings.xml");
  const effectiveOptions: BuildPlanOptions = options.settings_path === undefined && existsSync(settingsPath)
    ? { ...options, settings_path: settingsPath }
    : options;
  const effectiveMavenModel = resolveEffectiveMavenModel(root, effectiveOptions);
  const effectiveByPath = new Map(effectiveMavenModel.modules.map((module) => [module.module_relative_path, module]));
  // Effective model values are authoritative for inherited profile/pluginManagement
  // settings. Keep PomModule paths relative because the discovery API consumes
  // them relative to reactor_root.
  const modules = discovery.modules.map((module) => {
    const effective = effectiveByPath.get(module.module_relative_path);
    if (!effective) return module;
    return {
      ...module,
      source_root: effective.source_root,
      test_root: effective.test_root,
      jacoco_configured: effective.jacoco_configured,
      surefire_configured: effective.surefire_configured,
      junit4_present: effective.junit4_present,
      junit5_present: effective.junit5_present,
      mockito_present: effective.mockito_present,
    };
  });
  const hasJunit4 = modules.some((m) => m.junit4_present);
  const hasJunit5 = modules.some((m) => m.junit5_present);
  const normalizedAffectedModules = [...new Set(affectedModulePaths.map((modulePath) => modulePath.replace(/[\\/]/g, "/").replace(/^\.\/$/, "").replace(/\/+$/, "")))];

  return {
    coverage_mode: options.coverage_mode ?? "configured",
    reactor_root: discovery.reactor_root,
    modules,
    affected_modules: normalizedAffectedModules,
    maven_goals_build: scopedMavenGoals(discovery.modules, normalizedAffectedModules, ["test-compile"]),
    maven_goals_test: scopedMavenGoals(discovery.modules, normalizedAffectedModules, ["test"]),
    maven_goals_coverage: scopedMavenGoals(discovery.modules, normalizedAffectedModules,
      options.coverage_mode === "cli"
        ? ["org.jacoco:jacoco-maven-plugin:0.8.12:prepare-agent", "test", "org.jacoco:jacoco-maven-plugin:0.8.12:report"]
        : ["test", "jacoco:report"]),
    jdk_version: process.env["JAVA_HOME"] ? "from_env" : "default",
    test_framework: hasJunit4 && hasJunit5 ? "both" : hasJunit4 ? "junit4" : hasJunit5 ? "junit5" : "none",
    mockito_present: modules.some((m) => m.mockito_present),
    jacoco_present: modules.some((m) => m.jacoco_configured),
    settings_xml: existsSync(settingsPath) ? settingsPath : null,
    effective_maven_model: effectiveMavenModel,
  };
}

/**
 * P06/PP27: coverage kosusu agent + report zinciri icin POM'da JaCoCo
 * konfigurasyonu bulunmadiginda Maven exit koduna guvenilmez; typed blocker
 * ile durulur. Baseline'da en az bir executable modul, hedefli kosuda ise
 * secilen her executable modul kontrol edilir.
 */
export function assertCoverageConfigured(plan: BuildPlan, affectedModulePaths: string[] = plan.affected_modules): void {
  if (plan.coverage_mode === "cli") return; // Explicit pinned command instrumentation; fresh report remains mandatory.
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
  coverage_mode?: "configured" | "cli";
  /** P06/PP20: orijinal checkout yerine urun storage altinda frozen workspace. */
  workspace_root?: string;
  /** P06/PP27: baseline run'inda JaCoCo report hedefini de calistir. */
  collect_coverage?: boolean;
  /** WN54: mevcut hedefe karsilik gelen test siniflarini secerek calistir. */
  test_selectors?: string[];
}

/**
 * WN54: tek bir main sinifi icin deterministik test sinifi secimi.
 *
 * Maven'in `-Dtest` filtresi hedef sinifinin test esini kullanir; es dosya
 * bulunamazsa filtre uygulanmaz ve Maven'in normal test kesfi korunur. Bu
 * yardimci sadece owned snapshot'ta statik dosya kaniti okur; test uydurmaz.
 */
export function deriveTargetTestSelectors(
  projectRoot: string,
  targets: Array<{ fqn: string; relative_path: string; source_set?: string }>,
): string[] {
  const selectors = new Set<string>();
  for (const target of targets) {
    if (target.source_set !== undefined && target.source_set !== "main") continue;
    const normalized = target.relative_path.replace(/\\/g, "/");
    const marker = "/main/";
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex < 0 || !normalized.endsWith(".java")) continue;
    const testRelative = `${normalized.slice(0, markerIndex)}/test/${normalized.slice(markerIndex + marker.length, -5)}Test.java`;
    const testPath = join(resolve(projectRoot), ...testRelative.split("/"));
    if (!existsSync(testPath)) continue;
    const scanned = scanTestFile(testPath, resolve(projectRoot));
    if (scanned.testClass?.fqn) selectors.add(scanned.testClass.fqn);
  }
  return [...selectors].sort();
}

/** P06/PP20: customer checkout'u degistirmeden frozen baseline workspace uretir. */
export function createFrozenWorkspace(projectRoot: string, workspaceRoot: string): string {
  const source = resolve(projectRoot);
  const destination = resolve(workspaceRoot);
  if (source === destination) {
    throw new AppError("POLICY_VIOLATION", "Frozen workspace customer checkout ile ayni olamaz", { reason_code: "FROZEN_WORKSPACE_COLLISION" });
  }
  // Windows may report a transient ENOTEMPTY while the native helper or an
  // external file watcher is closing/creating a marker in the old workspace.
  // Bounded retries keep cleanup deterministic without widening the path.
  rmSync(destination, { recursive: true, force: true, maxRetries: 12, retryDelay: 50 });
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

export interface TestRunClassification {
  status: "PASSED" | "FAILED" | "UNSTABLE" | "NO_TESTS";
  reason_code: string | null;
}

/**
 * Surefire/Failsafe raporu ile Maven process sonucunu tek bir fail-closed
 * karara indirger. Exit 0 tek basina test kaniti degildir: bozuk rapor,
 * testsiz veya tamamen skip kosu coverage kazanci olarak kullanilamaz.
 */
export function classifyTestRun(
  run: Pick<RunResult, "exit_code" | "timed_out">,
  summary: Pick<TestReportSummary, "total_tests" | "failures" | "errors" | "skipped" | "malformed_reports">,
): TestRunClassification {
  if (summary.malformed_reports.length > 0) {
    return { status: "UNSTABLE", reason_code: "MALFORMED_TEST_REPORT" };
  }
  if (summary.failures + summary.errors > 0) {
    return {
      status: "FAILED",
      reason_code: summary.failures > 0 && summary.errors > 0
        ? "TEST_FAILURES_AND_ERRORS"
        : summary.failures > 0
          ? "TEST_FAILURES"
          : "TEST_ERRORS",
    };
  }
  if (run.timed_out) {
    return { status: "FAILED", reason_code: "MAVEN_RUN_TIMEOUT" };
  }
  if (run.exit_code !== 0) {
    return { status: "FAILED", reason_code: "MAVEN_EXIT_NONZERO" };
  }
  if (summary.total_tests === 0) {
    return { status: "NO_TESTS", reason_code: "NO_DISCOVERED_TESTS" };
  }
  if (summary.skipped === summary.total_tests) {
    return { status: "UNSTABLE", reason_code: "ALL_TESTS_SKIPPED" };
  }
  return { status: "PASSED", reason_code: null };
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
  const executionRoot = options.workspace_root
    ? options.coverage_mode === "cli" ? prepareCoverageWorkspace(projectRoot, options.workspace_root) : createFrozenWorkspace(projectRoot, options.workspace_root)
    : resolve(projectRoot);
  const plan = buildPlan(executionRoot, [], { ...(options.coverage_mode ? { coverage_mode: options.coverage_mode } : {}) });
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

  const properties = strictTestExecutionProperties();
  const selectors = [...new Set((options.test_selectors ?? []).filter((selector) => selector.length > 0))].sort();
  if (selectors.length > 0) properties.test = selectors.join(",");
  const runOptions: MavenRunOptions = {
    working_dir: executionRoot,
    goals: options.collect_coverage ? plan.maven_goals_coverage : plan.maven_goals_test,
    properties,
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

  const classification = classifyTestRun(run, reportSummary);

  return {
    status: classification.status,
    run,
    failed_tests: failedTests,
    total_tests: totalTests,
    failures,
    errors,
    skipped,
    reason_code: classification.reason_code,
    malformed_reports: malformedReports,
    skip_config_detected: skipConfig,
    execution_root: executionRoot,
    test_inventory: reportSummary.suites,
    run_started_at: runStartedAt,
    run_finished_at: runFinishedAt,
  };
}

export function assertBaselineUsable(baseline: BaselineResult): void {
  if (baseline.status !== "PASSED") {
    const reasonCode = baseline.reason_code ?? `BASELINE_${baseline.status}`;
    throw new AppError("INTERNAL_ERROR", `Baseline trusted degil: ${baseline.status}`, {
      reason_code: reasonCode,
      failed_tests: baseline.failed_tests,
    });
  }
}
