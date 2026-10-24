import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Services } from "./services.js";
import { assertAllowedRoot, assertJobProjectContext } from "./services.js";
import { AppError } from "../domain/errors.js";
import type { ApplyPlan } from "../domain/apply-contracts.js";
import type { TestApplyInput } from "../domain/tool-schemas.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { CheckpointStore } from "../orchestration/checkpoint-store.js";
import { SourceSnapshot, computeSourceIdentity, type SnapshotManifest } from "../discovery/source-snapshot.js";
import { discoverModules } from "../discovery/pom-discovery.js";
import { PolicyGuard, type AllowedTestRoot } from "../policies/policy-guard.js";
import { prepareReportVerification } from "./report-runtime.js";
import type { SurefireSuite } from "../orchestration/build-plan.js";
import { projectNativeExecution } from "../configuration/project-native-execution.js";

export const applyDigest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export interface PreparedApply {
  plan: ApplyPlan;
  files: Array<{ path: string; sha256: string; content: Buffer }>;
  allowedTestRoots: AllowedTestRoot[];
  source: SnapshotManifest;
  finalInventory: SurefireSuite[];
  baselineInventory: SurefireSuite[];
}
/** Preserve module-qualified invocations, including repeated parameterized names. */
export function compareApplyTestInventory(baseline: SurefireSuite[], final: SurefireSuite[], current: SurefireSuite[]) {
  const counts = (suites: SurefireSuite[]) => {
    const values = new Map<string, { total: number; skipped: number }>();
    for (const suite of suites) {
      for (const name of suite.test_names) {
        const key = JSON.stringify([suite.module_relative_path, name]), old = values.get(key) ?? { total: 0, skipped: 0 };
        old.total++; values.set(key, old);
      }
      for (const name of suite.skipped_test_names) values.get(JSON.stringify([suite.module_relative_path, name]))!.skipped++;
    }
    return values;
  };
  const before = counts(baseline), accepted = counts(final), actual = counts(current);
  const missing_tests: string[] = [], newly_skipped_tests: string[] = [];
  for (const key of new Set([...before.keys(), ...accepted.keys()])) {
    if ((actual.get(key)?.total ?? 0) < Math.max(before.get(key)?.total ?? 0, accepted.get(key)?.total ?? 0)) missing_tests.push(key);
  }
  for (const [key, value] of actual) {
    if (value.skipped > (before.get(key)?.skipped ?? accepted.get(key)?.skipped ?? 0)) newly_skipped_tests.push(key);
  }
  return { missing_tests, newly_skipped_tests };
}
export function applyProject(input: TestApplyInput, services: Services): string {
  if (!services.storage || !services.jobs) throw new AppError("INTERNAL_ERROR", "Apply storage yok");
  const job = services.jobs.getJob(input.job_id);
  assertJobProjectContext(job, input.project_root, services.storage);
  assertJobProjectContext(job, input.target_workspace, services.storage);
  const root = new ProjectRepository(services.storage.db).getLocation(job.location_id).canonical_root;
  assertAllowedRoot(services.config, root);
  return resolve(root);
}
export function prepareApply(input: TestApplyInput, services: Services): PreparedApply {
  const root = applyProject(input, services), jobs = services.jobs!, storage = services.storage!;
  const job = jobs.getJob(input.job_id);
  if (job.lifecycle !== "COMPLETED" || job.verification_level === "UNVERIFIED") throw new AppError("POLICY_VIOLATION", "Yalniz tamamlanmis ve dogrulanmis isin testleri uygulanabilir");
  const checkpointId = job.best_checkpoint_id;
  if (!checkpointId || input.checkpoint_id && input.checkpoint_id !== checkpointId) throw new AppError("POLICY_VIOLATION", "Best checkpoint eslesmiyor");
  const store = new CheckpointStore(storage.db, services.config.storage.root), verified = store.verifyCheckpoint(checkpointId);
  const manifest = verified.manifest;
  if (!verified.valid || !manifest || manifest.job_id !== job.id || manifest.location_id !== job.location_id
    || manifest.project_id !== new ProjectRepository(storage.db).getLocation(job.location_id).project_id) throw new AppError("STORAGE_ERROR", "Apply checkpoint kaniti gecersiz");
  const report = prepareReportVerification(services, job.id)?.data;
  if (!report || report.checkpoint_id !== checkpointId || report.production_changed_files !== 0 || !report.final_run_id) throw new AppError("POLICY_VIOLATION", "Dogrulanmis final raporu/apply checkpoint kaniti yok");
  const inventory = (runId: string | null, stage: "baseline" | "final_replay"): SurefireSuite[] => {
    if (!runId) throw new AppError("POLICY_VIOLATION", "Ilk/son test receipt eksik");
    const receipt = storage.db.prepare<[string, string, string], { test_inventory_json: string; exit_code: number; timed_out: number; failures: number; errors: number; total_tests: number }>(
      "SELECT test_inventory_json,exit_code,timed_out,failures,errors,total_tests FROM test_run_provenance WHERE id=? AND job_id=? AND stage=?",
    ).get(runId, job.id, stage);
    if (!receipt || receipt.exit_code !== 0 || receipt.timed_out || receipt.failures || receipt.errors
      || receipt.total_tests < (stage === "final_replay" ? 1 : 0)) throw new AppError("POLICY_VIOLATION", "Ilk/son test receipt gecersiz");
    const suites = JSON.parse(receipt.test_inventory_json) as SurefireSuite[];
    const names = (value: unknown): value is string[] => Array.isArray(value) && value.every(name => typeof name === "string" && name.length > 0);
    if (!Array.isArray(suites) || suites.some(suite => !suite || typeof suite.module_relative_path !== "string" || !names(suite.test_names)
      || !names(suite.skipped_test_names) || !names(suite.failed_test_names) || !Number.isSafeInteger(suite.tests) || suite.tests < 0
      || suite.tests !== suite.test_names.length || suite.skipped !== suite.skipped_test_names.length
      || suite.skipped_test_names.some(name => !suite.test_names.includes(name)))
      || suites.reduce((sum, suite) => sum + suite.tests, 0) !== receipt.total_tests) throw new AppError("STORAGE_ERROR", "Ilk/son test envanteri gecersiz");
    return suites;
  };
  const baselineInventory = inventory(manifest.baseline_run_id, "baseline"), finalInventory = inventory(report.final_run_id, "final_replay");
  const source = new SourceSnapshot(root).buildManifest(), identity = computeSourceIdentity(root, source);
  if (identity.source_digest !== manifest.source_digest || identity.build_digest !== manifest.build_digest) throw new AppError("SOURCE_CHANGED", "Uretimden sonra asil kaynak degisti; yeniden analiz/test uretimi gerekli");
  const allowedTestRoots = report.test_roots
    ?? discoverModules(root).modules.map(module => ({ module_relative_path: module.module_relative_path, test_root: module.test_root }));
  const guard = new PolicyGuard(root, allowedTestRoots);
  if (!manifest.accepted_changes.length) throw new AppError("POLICY_VIOLATION", "Uygulanacak kabul edilmis yeni test yok");
  const keys = new Set<string>();
  const files = manifest.accepted_changes.map(file => {
    if (file.action !== "create" || !file.path.endsWith(".java") || !guard.checkPath(file.path).allowed) throw new AppError("POLICY_VIOLATION", "Uygulama yalniz yeni Java test dosyasi ekler");
    const key = process.platform === "win32" ? file.path.toLowerCase() : file.path;
    if (keys.has(key)) throw new AppError("POLICY_VIOLATION", "Tekrarli apply yolu"); keys.add(key);
    if (existsSync(join(root, file.path))) throw new AppError("SOURCE_CHANGED", "Mevcut testin uzerine yazilmaz");
    const content = readFileSync(join(services.config.storage.root, "blobs", "accepted", job.id, file.sha256.slice(0, 2), file.sha256.slice(2, 4), file.sha256));
    if (applyDigest(content) !== file.sha256) throw new AppError("STORAGE_ERROR", "Accepted test hash degisti");
    return { path: file.path, sha256: file.sha256, content };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const native = projectNativeExecution(services.config, root);
  const value = { schema_version: 1 as const, job_id: job.id, project_id: manifest.project_id, checkpoint_id: checkpointId,
    project_root: root, source_digest: identity.source_digest, build_digest: identity.build_digest,
    files: files.map(file => ({ path: file.path, sha256: file.sha256, bytes: file.content.length })),
    test_roots: allowedTestRoots, verification_scope: "FULL_PROJECT_SNAPSHOT" as const,
    verification_timeout_ms: Math.min(900_000, services.config.budgets.total_job_minutes * 60_000),
    test_inventory_digest: applyDigest(JSON.stringify({ baselineInventory, finalInventory })),
    ...(native ? { native_execution: native } : {}),
  };
  const plan: ApplyPlan = { ...value, patch_digest: applyDigest(JSON.stringify(value)) };
  if (input.patch_digest && input.patch_digest !== plan.patch_digest) throw new AppError("SOURCE_CHANGED", "Onaylanan patch digest degisti");
  return { plan, files, allowedTestRoots, source, finalInventory, baselineInventory };
}
