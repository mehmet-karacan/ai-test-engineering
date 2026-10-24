import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { PolicyGuard, type AllowedTestRoot } from "../policies/policy-guard.js";

export interface AcceptedChangeProjection {
  tests_added: number;
  tests_modified: number;
  production_changed_files: number;
}

export interface RunSummaryProjection {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface ReportStatusFacts {
  tests_added: number;
  tests_modified: number;
  run_summary: RunSummaryProjection;
  production_changed_files: number;
  test_only_policy: "PASSED" | "FAILED" | "NOT_RUN";
}

export function isTestSourcePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)src\/(test|it|integration-test)\//.test(normalized)
    || /(^|\/)(test|tests)\//.test(normalized)
    || /(^|\/)[^/]+\.test\.[^/]+$/.test(normalized)
    || /(^|\/)[^/]+tests?\.(java|kt|groovy|js|jsx|ts|tsx)$/.test(normalized);
}

function originalPathExists(projectRoot: string, path: string): boolean {
  const root = resolve(projectRoot);
  const candidate = resolve(root, path);
  const escaped = relative(root, candidate).startsWith("..") || relative(root, candidate).includes(":");
  return !escaped && existsSync(candidate);
}

/** New reports use the same module-root policy that accepted the patch. */
export function reportTestPathClassifier(projectRoot: string, testRoots?: AllowedTestRoot[]): (path: string) => boolean {
  if (testRoots === undefined) return isTestSourcePath; // Historical reports lack root metadata.
  const policy = new PolicyGuard(projectRoot, testRoots);
  return path => policy.checkPath(path).allowed;
}

export function projectAcceptedChanges(projectRoot: string, changes: Array<{ path: string; action: string }>, testRoots?: AllowedTestRoot[]): AcceptedChangeProjection {
  let testsAdded = 0;
  let testsModified = 0;
  let productionChangedFiles = 0;
  const testPathAllowed = reportTestPathClassifier(projectRoot, testRoots);
  for (const change of changes) {
    const testPath = testPathAllowed(change.path);
    if (!testPath) {
      productionChangedFiles++;
      continue;
    }
    const action = change.action.toLowerCase();
    const existedBefore = action !== "delete" && originalPathExists(projectRoot, change.path);
    if (action === "create" && !existedBefore) {
      testsAdded++;
    } else {
      testsModified++;
    }
  }
  return { tests_added: testsAdded, tests_modified: testsModified, production_changed_files: productionChangedFiles };
}

export function projectRunSummary(input: { total_tests: number; failures: number; errors: number; skipped: number }): RunSummaryProjection {
  const total = Math.max(0, input.total_tests);
  const failed = Math.max(0, input.failures + input.errors);
  const skipped = Math.max(0, input.skipped);
  return {
    total,
    passed: Math.max(0, total - failed - skipped),
    failed,
    skipped,
  };
}

export function projectReportStatusFacts(value: unknown, jobId: string): ReportStatusFacts | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const report = value as Record<string, unknown>;
  const run = report["run_summary"];
  const gate = Array.isArray(report["gates"])
    ? report["gates"].find((item) => item && typeof item === "object" && (item as Record<string, unknown>)["name"] === "test_only_policy") as Record<string, unknown> | undefined
    : undefined;
  if (report["job_id"] !== jobId || !run || typeof run !== "object") {
    return null;
  }
  const runRecord = run as Record<string, unknown>;
  const numeric = (key: string): number | null => typeof report[key] === "number" && Number.isInteger(report[key]) && (report[key] as number) >= 0 ? report[key] as number : null;
  const runNumber = (key: string): number | null => typeof runRecord[key] === "number" && Number.isInteger(runRecord[key]) && (runRecord[key] as number) >= 0 ? runRecord[key] as number : null;
  const testsAdded = numeric("tests_added");
  const testsModified = numeric("tests_modified");
  const total = runNumber("total");
  const passed = runNumber("passed");
  const failed = runNumber("failed");
  const skipped = runNumber("skipped");
  const productionChangedFiles = numeric("production_changed_files");
  const status = gate?.["status"];
  if (testsAdded === null || testsModified === null || total === null || passed === null || failed === null || skipped === null || productionChangedFiles === null || (status !== "PASSED" && status !== "FAILED" && status !== "NOT_RUN")) {
    return null;
  }
  return {
    tests_added: testsAdded,
    tests_modified: testsModified,
    run_summary: { total, passed, failed, skipped },
    production_changed_files: productionChangedFiles,
    test_only_policy: status,
  };
}
