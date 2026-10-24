import { mkdirSync, readFileSync } from "node:fs";
import { join, relative, isAbsolute, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { Services } from "./services.js";
import { TestApplyInputSchema } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import type { ApplyCallContext, ApplyOperationView, ApplyPlan, ApplyVerification } from "../domain/apply-contracts.js";
import { ApplyOperationRepository } from "../storage/apply-operation-repository.js";
import { getApplyOperationView } from "../storage/apply-operation-view.js";
import { applyProject, prepareApply, applyDigest, compareApplyTestInventory, type PreparedApply } from "./test-apply-plan.js";
import { LeaseManager } from "../orchestration/lease-manager.js";
import { NativeProcessRegistry } from "../orchestration/native-process-registry.js";
import { SourceSnapshot, computeSourceIdentity, sourceDigestFromManifest } from "../discovery/source-snapshot.js";
import { prepareCoverageWorkspace, verifyCoverageWorkspace } from "../orchestration/coverage-workspace.js";
import { runBaseline } from "../orchestration/build-plan.js";
import { MavenRunner } from "../runners/maven-runner.js";
import { CustomerRunnerFactory } from "../runners/runner-factory.js";

interface ActiveApply { operationId: string; controller: AbortController; runner?: MavenRunner; done: Promise<void> }
const active = new Map<string, ActiveApply>();
const LEASE_TTL = 120_000;
export interface WorkspaceApplyResult {
  job_id: string;
  state: ApplyOperationView["state"] | "READY_FOR_REVIEW" | "APPROVAL_REQUIRED";
  operation_id: string | null;
  applied_paths: string[];
  conflicts: Array<{ path: string; reason: string }>;
  message: string;
  plan?: ApplyPlan;
  application?: ApplyOperationView;
}
function result(jobId: string, state: WorkspaceApplyResult["state"], message: string, plan?: ApplyPlan, view?: ApplyOperationView): WorkspaceApplyResult {
  return { job_id: jobId, state, operation_id: view?.operation_id ?? null, applied_paths: view?.applied_paths ?? [], conflicts: view?.conflicts ?? [], message,
    ...(plan ? { plan } : {}), ...(view ? { application: view } : {}) };
}
function failure(jobId: string, error: unknown): WorkspaceApplyResult {
  return result(jobId, error instanceof AppError && error.code === "SOURCE_CHANGED" ? "CONFLICT" : "REJECTED",
    error instanceof AppError ? error.message : "Uygulama dogrulanamadi; asil dosyalarin durumunu kontrol edin");
}
function publisherOptions(services: Services, plan: ApplyPlan, operationId: string, roots: PreparedApply["allowedTestRoots"]) {
  return { workspace: plan.project_root, storeRoot: join(services.config.storage.root, "jobs", plan.job_id, "apply", operationId, "publisher"), operationId, allowedTestRoots: roots };
}
/** Interrupt only this application's owned Maven tree; never mutate generation lifecycle. */
export function cancelWorkspaceApply(jobId: string, services: Services): boolean {
  if (!services.storage) return false;
  const changed = new ApplyOperationRepository(services.storage.db).requestCancel(jobId);
  const run = active.get(jobId); run?.controller.abort(); run?.runner?.stopAll();
  return changed;
}
export async function waitWorkspaceApply(jobId: string): Promise<void> { await active.get(jobId)?.done; }

export async function handleWorkspaceTestApply(input: unknown, services: Services, context: ApplyCallContext = {}): Promise<WorkspaceApplyResult> {
  const parsed = TestApplyInputSchema.parse(input);
  applyProject(parsed, services); // Context errors remain typed and precede idempotency.
  const repository = new ApplyOperationRepository(services.storage!.db), previous = repository.latest(parsed.job_id);
  if (previous) {
    const plan = JSON.parse(previous.plan_json) as ApplyPlan, view = getApplyOperationView(services.storage!.db, parsed.job_id);
    if (!view) return result(parsed.job_id, "RECOVERY_REQUIRED", "Uygulama kaydi gecersiz; otomatik yeniden uygulama yapilmaz");
    if (parsed.checkpoint_id && parsed.checkpoint_id !== plan.checkpoint_id || parsed.patch_digest && parsed.patch_digest !== plan.patch_digest) return result(parsed.job_id, "CONFLICT", "Kayitli uygulama ile checkpoint/patch eslesmiyor");
    if (previous.active) {
      if (parsed.mode === "recover") return recoverApply(services, previous.operation_id);
      const lease = services.storage!.db.prepare<[string, number], { n: number }>("SELECT 1 n FROM job_leases WHERE job_id=? AND expires_at>?").get(parsed.job_id, Date.now());
      return result(parsed.job_id, lease ? view.state : "RECOVERY_REQUIRED", lease ? view.message : "Yarim uygulama var; test_apply mode=recover ile sahipli dosyalari temizleyin", plan, view);
    }
    if (view.state === "APPLIED") return result(parsed.job_id, "APPLIED", "Onayli uygulama ve tum test dogrulamasi zaten tamamlandi", plan, view);
  }
  if (services.jobs!.getJob(parsed.job_id).apply_state === "APPLIED" && !previous) return result(parsed.job_id, "APPLIED", "Is daha once uygulanmis; eski kayit korunur");
  if (parsed.mode === "recover") return result(parsed.job_id, "REJECTED", "Kurtarilacak aktif uygulama yok");
  let prepared: PreparedApply;
  try { prepared = prepareApply(parsed, services); } catch (error) { return failure(parsed.job_id, error); }
  if (parsed.mode === "preview") return result(parsed.job_id, "READY_FOR_REVIEW", "Yeni testleri ve tum proje dogrulamasini inceleyip mode=apply ile kullanici onayi isteyin", prepared.plan);
  if (!context.requestApplyApproval) return result(parsed.job_id, "APPROVAL_REQUIRED", "OpenCode kullanici onay formu gerekli; metin referansi onay sayilmaz", prepared.plan);
  if (context.signal?.aborted) return result(parsed.job_id, "REJECTED", "Onay istegi iptal edildi");
  let approval;
  try { approval = await context.requestApplyApproval(structuredClone(prepared.plan), context.signal); }
  catch { return result(parsed.job_id, "REJECTED", "Kullanici onayi tamamlanmadi; dosya yazilmadi", prepared.plan); }
  if (approval.action !== "accept" || !approval.approved || context.signal?.aborted) return result(parsed.job_id, "REJECTED", "Kullanici onaylamadi; dosya yazilmadi", prepared.plan);
  // Every source and accepted byte is checked again after the human wait.
  try {
    const fresh = prepareApply(parsed, services);
    if (fresh.plan.patch_digest !== prepared.plan.patch_digest) throw new AppError("SOURCE_CHANGED", "Onay beklenirken uygulanacak kapsam degisti");
    prepared = fresh;
  } catch (error) { return failure(parsed.job_id, error); }
  const owner = `apply-${process.pid}-${randomUUID()}`, leases = new LeaseManager(services.storage!.db);
  let acquired = false;
  try {
    const native = leases.acquireNative(parsed.job_id, owner, LEASE_TTL); acquired = true;
    const job = services.jobs!.getJob(parsed.job_id);
    const timeout = prepared.plan.verification_timeout_ms!;
    const approvalRecord = services.jobs!.recordApproval({ job_id: job.id, project_id: prepared.plan.project_id, approval_kind: "TEST_APPLY",
      scope_digest: prepared.plan.patch_digest, model_digest: applyDigest("apply:no-model-call"), budget_digest: applyDigest(JSON.stringify({ timeout })),
      decision: "APPROVED", decided_by: "mcp-human-form" });
    const view = repository.start(prepared.plan, owner, native.lease.fencing_token, approvalRecord.approval_id);
    const controller = new AbortController();
    const run: ActiveApply = { operationId: view.operation_id, controller, done: Promise.resolve() };
    active.set(job.id, run);
    run.done = new Promise<void>(resolve => setImmediate(() => {
      void executeApply(services, prepared, view.operation_id, owner, native.lease.fencing_token, run, timeout).finally(resolve);
    }));
    return result(job.id, "APPLYING", "Kullanici onayi alindi; aktarim ve tum test dogrulamasi basladi, test_status/test_result ile izleyin", prepared.plan, view);
  } catch (error) {
    if (acquired) leases.release(parsed.job_id, owner);
    return failure(parsed.job_id, error);
  }
}

async function executeApply(services: Services, prepared: PreparedApply, operationId: string, owner: string, fence: number, run: ActiveApply, timeout: number): Promise<void> {
  const db = services.storage!.db, repository = new ApplyOperationRepository(db), leases = new LeaseManager(db);
  const { plan } = prepared;
  const workRoot = join(services.config.storage.root, "jobs", plan.job_id, "apply", operationId);
  let publisher: InstanceType<typeof import("../orchestration/workspace-test-publisher.js")["WorkspaceTestPublisher"]> | undefined;
  let verification: ApplyVerification | null = null;
  let publisherPrepared = false;
  const beforeMutation = () => { leases.assertFence(plan.job_id, owner, fence); leases.renew(plan.job_id, owner, LEASE_TTL); };
  const assertOwner = () => {
    leases.assertFence(plan.job_id, owner, fence);
    if (run.controller.signal.aborted || repository.read(operationId).cancel_requested) throw new AppError("POLICY_VIOLATION", "Uygulama iptal edildi", { reason_code: "APPLY_CANCELLED" });
  };
  const heartbeat = setInterval(() => { try { leases.renew(plan.job_id, owner, LEASE_TTL); if (repository.read(operationId).cancel_requested) run.controller.abort(); } catch { run.controller.abort(); } if (run.controller.signal.aborted) run.runner?.stopAll(); }, 5_000);
  heartbeat.unref();
  try {
    assertOwner(); new CustomerRunnerFactory().assertNativeCustomerReady();
    const storageRelative = relative(plan.project_root, services.config.storage.root);
    if (!(storageRelative === ".." || storageRelative.startsWith(`..${sep}`) || isAbsolute(storageRelative))) throw new AppError("POLICY_VIOLATION", "Runtime asil proje icinde olamaz");
    const { WorkspaceTestPublisher } = await import("../orchestration/workspace-test-publisher.js");
    publisher = new WorkspaceTestPublisher({ ...publisherOptions(services, plan, operationId, prepared.allowedTestRoots), beforeMutation });
    publisher.prepare(prepared.files); publisherPrepared = true; assertOwner();
    const before = computeSourceIdentity(plan.project_root, new SourceSnapshot(plan.project_root).buildManifest());
    if (before.source_digest !== plan.source_digest || before.build_digest !== plan.build_digest) throw new AppError("SOURCE_CHANGED", "Asil kaynak aktarimdan once degisti");
    const applied = publisher.publish(); assertOwner();
    const appliedManifest = new SourceSnapshot(plan.project_root).buildManifest();
    const after = computeSourceIdentity(plan.project_root, appliedManifest);
    const originalEntries = appliedManifest.entries.filter(entry => !plan.files.some(file => file.path === entry.relative_path));
    if (sourceDigestFromManifest({ ...appliedManifest, entries: originalEntries }) !== plan.source_digest
      || after.build_digest !== plan.build_digest || !publisher.verify()) throw new AppError("SOURCE_CHANGED", "Aktarim sirasinda mevcut kaynak/test/POM degisti");
    repository.update(operationId, owner, fence, { phase: "verification", applied_paths: applied, message: "Asil projeden dogrulanmis kopyada tum Maven testleri calisiyor" });
    mkdirSync(workRoot, { recursive: true });
    const execution = prepareCoverageWorkspace(plan.project_root, join(workRoot, "verification"));
    verifyCoverageWorkspace(plan.project_root, execution); assertOwner();
    const profile = plan.native_execution, registry = new NativeProcessRegistry(db, plan.job_id, owner, fence);
    const runner = new MavenRunner(undefined, registry, () => assertOwner(), profile ? { profile, ownedRoot: workRoot } : undefined);
    run.runner = runner;
    const onAbort = () => runner.stopAll(); run.controller.signal.addEventListener("abort", onAbort, { once: true });
    let baseline;
    try { baseline = await runBaseline(execution, runner, timeout, { collect_coverage: true, coverage_mode: "cli", test_selectors: [] }); }
    finally { run.controller.signal.removeEventListener("abort", onAbort); }
    const regression = compareApplyTestInventory(prepared.baselineInventory, prepared.finalInventory, baseline.test_inventory);
    const allPresent = regression.missing_tests.length === 0 && regression.newly_skipped_tests.length === 0;
    // Preserve the finished run even if the following source/copy check fails.
    verification = { status: "FAILED", scope: "FULL_PROJECT_SNAPSHOT", total: baseline.total_tests,
      passed: Math.max(0, baseline.total_tests - baseline.failures - baseline.errors - baseline.skipped), failures: baseline.failures,
      errors: baseline.errors, skipped: baseline.skipped, existing_tests_preserved: false, all_tests_present: allPresent,
      exit_code: baseline.run?.exit_code ?? null, reason_code: "APPLY_SOURCE_CHANGED", execution_root: execution };
    assertOwner();
    verifyCoverageWorkspace(plan.project_root, execution);
    const originalAfter = computeSourceIdentity(plan.project_root, new SourceSnapshot(plan.project_root).buildManifest());
    const existingPreserved = originalAfter.source_digest === after.source_digest && originalAfter.build_digest === after.build_digest && publisher.verify();
    const passed = baseline.status === "PASSED" && existingPreserved && allPresent;
    verification = { status: passed ? "PASSED" : "FAILED", scope: "FULL_PROJECT_SNAPSHOT", total: baseline.total_tests,
      passed: Math.max(0, baseline.total_tests - baseline.failures - baseline.errors - baseline.skipped), failures: baseline.failures,
      errors: baseline.errors, skipped: baseline.skipped, existing_tests_preserved: existingPreserved, all_tests_present: allPresent,
      exit_code: baseline.run?.exit_code ?? null, reason_code: passed ? null : !existingPreserved ? "APPLY_SOURCE_CHANGED" : !allPresent ? "APPLY_TEST_INVENTORY_REGRESSION" : baseline.reason_code ?? "APPLY_TESTS_FAILED", execution_root: execution };
    const receipt = services.artifacts!.publish("apply_verification", JSON.stringify({ schema_version: 1, operation_id: operationId, plan,
      verification, run: baseline.run, test_inventory: baseline.test_inventory, source_digest_after_apply: after.source_digest }, null, 2), { schemaVersion: "1" });
    if (!services.artifacts!.verify(receipt.sha256)) throw new AppError("STORAGE_ERROR", "Apply verification artifact hash gecersiz");
    db.prepare("INSERT INTO artifacts(id,job_id,kind,relative_store_path,sha256,bytes,schema_version,sensitivity,status,pin_reason,created_at) VALUES(?,?,?,?,?,?,'1','internal','READY','apply_verification',?)")
      .run(receipt.id, plan.job_id, receipt.kind, receipt.relativeStorePath, receipt.sha256, receipt.bytes, Date.now());
    assertOwner();
    if (!passed) throw new AppError("POLICY_VIOLATION", "Tum test dogrulamasi gecmedi");
    repository.update(operationId, owner, fence, { state: "APPLIED", phase: "done", verification, message: "Yeni testler asil projeye uygulandi; tum proje testleri verified kopyada gecti" });
  } catch (error) {
    try {
      leases.assertFence(plan.job_id, owner, fence);
      repository.update(operationId, owner, fence, { phase: "rollback", message: "Dogrulama tamamlanmadi; yalniz sahipli yeni testler geri aliniyor" });
      const rolled = publisherPrepared ? publisher!.rollback() : { removed_paths: [], conflicts: [] };
      const nativePending = db.prepare<[string], { n: number }>("SELECT COUNT(*) n FROM owned_processes WHERE job_id=? AND cleanup_state<>'CLOSED'").get(plan.job_id)!.n > 0;
      const remaining = rolled.conflicts.length > 0 || nativePending;
      let originalPreserved = false;
      try {
        const current = new SourceSnapshot(plan.project_root).buildManifest();
        originalPreserved = sourceDigestFromManifest({ ...current, entries: current.entries.filter(entry => !plan.files.some(file => file.path === entry.relative_path)) }) === plan.source_digest;
      } catch { /* Unreadable source cannot be claimed preserved. */ }
      if (verification && run.controller.signal.aborted) verification = { ...verification, status: "CANCELLED", reason_code: "APPLY_CANCELLED" };
      verification ??= { status: run.controller.signal.aborted ? "CANCELLED" : "BLOCKED", scope: "FULL_PROJECT_SNAPSHOT", total: 0, passed: 0,
        failures: 0, errors: 0, skipped: 0, existing_tests_preserved: originalPreserved, all_tests_present: false, exit_code: null,
        reason_code: error instanceof AppError ? error.details?.["reason_code"] as string ?? error.code : "APPLY_ERROR", execution_root: join(workRoot, "verification") };
      repository.update(operationId, owner, fence, { state: remaining ? "RECOVERY_REQUIRED" : "ROLLED_BACK", phase: "done", verification,
        applied_paths: [], conflicts: rolled.conflicts, message: remaining ? "Kullanici degisikligi veya belirsiz dosya sahipligi korundu; manuel inceleme/recover gerekli" : "Uygulama dogrulanamadi; bu islemin yeni testleri geri alindi" });
    } catch {
      try {
        repository.update(operationId, owner, fence, { state: "RECOVERY_REQUIRED", phase: "done", verification,
          conflicts: plan.files.map(file => ({ path: file.path, reason: "Kalici journal/surec sahipligi dogrulanamadi; kullanici dosyalari korunuyor" })),
          message: "Guvenli geri alma tamamlanamadi; journal/surec sahipligi incelemesi gerekli" });
      } catch { process.stderr.write(`[aitest-apply] ${operationId} recovery required; stale owner cannot publish\n`); }
    }
  } finally {
    clearInterval(heartbeat);
    const pending = db.prepare<[string], { n: number }>("SELECT COUNT(*) n FROM owned_processes WHERE job_id=? AND cleanup_state<>'CLOSED'").get(plan.job_id)!.n;
    if (!pending) leases.release(plan.job_id, owner);
    if (active.get(plan.job_id) === run) active.delete(plan.job_id);
  }
}

async function recoverApply(services: Services, operationId: string): Promise<WorkspaceApplyResult> {
  const repository = new ApplyOperationRepository(services.storage!.db), row = repository.read(operationId), plan = JSON.parse(row.plan_json) as ApplyPlan;
  if (active.has(row.job_id)) return result(row.job_id, "APPLYING", "Aktif uygulamayi once test_cancel ile durdurun", plan);
  const leases = new LeaseManager(services.storage!.db), owner = `apply-recover-${process.pid}-${randomUUID()}`;
  try {
    const lease = leases.acquireNative(row.job_id, owner, LEASE_TTL).lease;
    repository.claimRecovery(operationId, owner, lease.fencing_token);
    const roots = plan.test_roots;
    if (!roots?.length) throw new AppError("STORAGE_ERROR", "Frozen apply test roots eksik");
    const { WorkspaceTestPublisher } = await import("../orchestration/workspace-test-publisher.js");
    const beforeMutation = () => { leases.assertFence(row.job_id, owner, lease.fencing_token); leases.renew(row.job_id, owner, LEASE_TTL); };
    const publisher = new WorkspaceTestPublisher({ ...publisherOptions(services, plan, operationId, roots), beforeMutation });
    publisher.prepare(plan.files.map(file => {
      const content = readFileSync(join(services.config.storage.root, "blobs", "accepted", plan.job_id, file.sha256.slice(0, 2), file.sha256.slice(2, 4), file.sha256));
      return { path: file.path, sha256: file.sha256, content };
    }));
    // Journal owns exact FileIds; rollback does not reinterpret current user files.
    const rolled = publisher.rollback();
    const view = repository.update(operationId, owner, lease.fencing_token, { state: rolled.conflicts.length ? "RECOVERY_REQUIRED" : "ROLLED_BACK",
      phase: "done", applied_paths: [], conflicts: rolled.conflicts, message: rolled.conflicts.length ? "Kullanici dosyalari korundu; belirsiz sahiplik inceleme gerektiriyor" : "Yarim uygulama geri alindi; yeniden denemek icin yeni preview/onay gerekli" });
    return result(row.job_id, view.state, view.message, plan, view);
  } catch (error) { return result(row.job_id, "RECOVERY_REQUIRED", `Aktif lease/native process temizligi veya journal sahipligi dogrulanamadi: ${error instanceof AppError ? error.message : "Islem kaydi okunamadi"}`, plan); }
  finally { leases.release(row.job_id, owner); }
}
