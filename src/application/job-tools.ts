/**
 * Kalan MCP araclari: test_resume, test_cancel, test_result, test_apply use-case'leri.
 * MCP handler'larin cagirdigi application katmani; is mantigi burada.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { TestResumeInputSchema, TestCancelInputSchema, TestResultInputSchema } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import type { Services } from "./services.js";
import type { ApplyCallContext } from "../domain/apply-contracts.js";
import { canonicalProjectRoot, assertJobProjectContext } from "./services.js";
import type { JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { LeaseManager } from "../orchestration/lease-manager.js";
import { CheckpointStore } from "../orchestration/checkpoint-store.js";
import { handleWorkspaceTestApply, cancelWorkspaceApply, waitWorkspaceApply, type WorkspaceApplyResult } from "./test-apply.js";
import { getApplyOperationView } from "../storage/apply-operation-view.js";
import type { ApplyOperationView } from "../domain/apply-contracts.js";
import { CustomerRunnerFactory, resolveRunnerKindFromEnv } from "../runners/runner-factory.js";
import { verifyNativeToolchain } from "../runners/native-toolchain.js";
import { NativeToolchainRecordStore } from "../orchestration/native-toolchain-record.js";
import { NativeProcessRegistry } from "../orchestration/native-process-registry.js";
import { parseExactModelSpec } from "../workers/opencode/profile-reader.js";
import { readProjectCoverageResult, readProjectCoverageFailure, type ProjectCoverageResult, type ProjectCoverageFailure } from "../storage/project-coverage-result.js";
import type { ReportStatusFacts } from "../reporting/report-projection.js";
import { verifyCurrentReport, prepareReportVerification } from "./report-runtime.js";
import { MAX_WORKER_REQUEST_TIMEOUT_MS } from "../workers/opencode/worker-config.js";
import { jobContext, nextJobAction, hasPendingCleanup, type JobContext } from "./job-context.js";

function nativePathIdentity(value: string): string {
  const normalized = resolve(value).replace(/\\/gu, "/").replace(/\/+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export interface TestResumeResult {
  job_context?: JobContext;
  required_action?: string;
  job_id: string;
  lifecycle: string;
  phase: string;
  resumed: boolean;
  candidates?: Array<{ job_id: string; phase: string; created_at: number }>;
  message: string;
}

export async function handleTestResume(input: unknown, services: Services): Promise<TestResumeResult> {
  const parsed = TestResumeInputSchema.parse(input);
  if (parsed.model_profile) {
    parseExactModelSpec(parsed.model_profile);
  }
  const { storage, jobs } = requireStorage(services);
  let job: JobRow;

  if (parsed.job_id) {
    job = jobs.getJob(parsed.job_id);
  } else if (parsed.project_root) {
    const canonicalRoot = canonicalProjectRoot(parsed.project_root);
    const projects = new ProjectRepository(storage.db);
    const locations = projects.listLocationsProjects(canonicalRoot);
    const resumable = jobs.findResumableJobsByLocations(locations.map((l) => l.id));
    if (resumable.length === 0) {
      throw new AppError("INVALID_PARAMETERS", `Bu projede devam edilebilir is bulunamadi: ${parsed.project_root}`);
    }
    if (resumable.length > 1) {
      return {
        job_id: resumable[0]!.id,
        lifecycle: resumable[0]!.lifecycle,
        phase: resumable[0]!.phase,
        resumed: false,
        candidates: resumable.map((j) => ({ job_id: j.id, phase: j.phase, created_at: j.created_at })),
        required_action: "Birden fazla uygun is var; job_id secimini kullanici niyetine gore netlestir",
        message: `Birden fazla uygun is var (${resumable.length}); job_id ile netlestirin`,
      };
    }
    job = resumable[0]!;
  } else {
    throw new AppError("INVALID_PARAMETERS", "job_id veya project_root gereklidir");
  }

  assertJobProjectContext(job, parsed.project_root, storage);
  if (job.lifecycle === "COMPLETED" || job.lifecycle === "CANCELLED") {
    return { job_id: job.id, lifecycle: job.lifecycle, phase: job.phase, resumed: false,
      job_context: jobContext(services, job), required_action: nextJobAction(services, job),
      message: `Is ${job.lifecycle}; yeniden devam etmez` };
  }
  if (jobContext(services,job).execution_state === "CLEANUP_PENDING") {
    return {job_id:job.id,lifecycle:job.lifecycle,phase:job.phase,resumed:false,
      job_context:jobContext(services,job),required_action:nextJobAction(services,job),
      message:"Owned process temizligi dogrulanmadan is devam ettirilemez"};
  }
  if (jobs.listEvents(job.id, undefined, 50).some((event) => event.event_type === "project_coverage_requested")) {
    return { job_id: job.id, lifecycle: job.lifecycle, phase: job.phase, resumed: false,
      job_context: jobContext(services, job), required_action: nextJobAction(services, job),
      message: job.lifecycle === "WAITING_INPUT" ? "Onerilerden sinif secip test_start ile baslatin" : "Coverage taramasini yeni idempotency_key ile project_coverage uzerinden yeniden baslatin" };
  }

  // Runner identity must be checked before lifecycle becomes RUNNING. A legacy
  // Docker job cannot silently inherit the new Windows native default.
  const { JobDispatcher } = await import("../orchestration/job-dispatcher.js");
  const runnerKind = resolveRunnerKindFromEnv(process.env["AITEST_RUNNER"], true);
  const dispatcher = new JobDispatcher({
    services,
    runnerKind,
    workerEnabled: process.env["AITEST_WORKER_ENABLED"] === "1",
    workspaceRoot: services.config.storage.root,
  });
  dispatcher.assertRecordedRunnerKind(storage, job);
  // Immutable model conflicts are caller errors. Reject before native probes,
  // lease acquisition or publishing RUNNING so the paused job stays resumable.
  dispatcher.assertResumeModelProfile(storage, job, parsed.model_profile ?? null);
  let verifyNativeResume: ((fencingToken: number, ownerId: string) => Promise<void>) | null = null;
  if (runnerKind === "windows_native") {
    // Do not mark a resumed job RUNNING when customer process ownership is
    // still unavailable. The dispatcher will recheck before any Maven probe.
    new CustomerRunnerFactory().assertNativeCustomerReady();
    const record = new NativeToolchainRecordStore(storage.db, services.config.storage.root);
    const options = record.optionsForResume(job.id, process.env);
    const locationRoot = new ProjectRepository(storage.db).getLocation(job.location_id).canonical_root;
    const expectedNativeRoot = dispatcher.readJobContractCoverageMode(storage, job) === "cli"
      ? join(services.config.storage.root, "jobs", job.id, "coverage-preflight") : locationRoot;
    if (nativePathIdentity(options.cwd) !== nativePathIdentity(expectedNativeRoot) || (parsed.project_root && nativePathIdentity(canonicalProjectRoot(parsed.project_root)) !== nativePathIdentity(locationRoot))) {
      throw new AppError("POLICY_VIOLATION", "Native toolchain project root differs from job location", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" });
    }
    verifyNativeResume = async (fencingToken, ownerId) => {
      const registry = new NativeProcessRegistry(storage.db, job.id, ownerId, fencingToken);
      await record.verify(job.id, options, (plan, env) => verifyNativeToolchain(plan, env, undefined, registry));
    };
  }

  // Acquire a unique fenced owner before publishing RUNNING. A competing
  // resume must not mutate the state/event stream of the active owner.
  const leaseOwnerId = `resume-${process.pid}-${job.id}-${randomUUID()}`;
  const leaseManager = new LeaseManager(storage.db);
  const deadlineAt = job.created_at + services.config.budgets.total_job_minutes * 60000;
  const resumeLeaseTtlMs = Math.max(1000, Math.min(MAX_WORKER_REQUEST_TIMEOUT_MS + 300000, Math.max(1000, deadlineAt - Date.now())));
  const lease = runnerKind === "windows_native"
    ? leaseManager.acquireNative(job.id, leaseOwnerId, resumeLeaseTtlMs).lease
    : leaseManager.acquire(job.id, leaseOwnerId, resumeLeaseTtlMs, `resume-${process.pid}`).lease;
  try {
    // Version probing is a real child process; it must run under this lease's
    // durable Job Object registry, before publishing RUNNING.
    if (verifyNativeResume) await verifyNativeResume(lease.fencing_token, leaseOwnerId);
    storage.db.transaction(() => {
      jobs.updateLifecycle(job.id, "RUNNING", job.row_version);
      jobs.appendEvent({ job_id: job.id, event_type: "test_resume_accepted", phase: job.phase, origin: "handleTestResume" });
    })();
  } catch (error) {
    leaseManager.release(job.id, leaseOwnerId);
    throw error;
  }

  // dispatch'i ayni job'dan tekrar baslat (kaldigi asamadan; source/checkpoint dogrulamasi dispatcher'da):
  // GoalContract job kayitlarindan yeniden kurulur (resume parametresi gerekmez):
  void dispatcher.resumeDispatch(job, parsed.project_root ?? undefined, parsed.model_profile ?? null, leaseOwnerId).catch((error: unknown) => {
    process.stderr.write(`[aitest-dispatch] resume job ${job.id} hata: ${String(error)}\n`);
    try {
      storage.db.transaction(() => {
        const owner = storage.db.prepare<[string], { owner_id: string; fencing_token: number }>(
          "SELECT owner_id, fencing_token FROM job_leases WHERE job_id = ?",
        ).get(job.id);
        const latest = jobs.getJob(job.id);
        if (owner?.owner_id !== leaseOwnerId || owner.fencing_token !== lease.fencing_token || latest.lifecycle !== "RUNNING") return;
        const outcome = error instanceof AppError && error.code === "POLICY_VIOLATION" ? "POLICY_VIOLATION"
          : error instanceof AppError && error.code === "BLOCKED_ISOLATION" ? "BLOCKED_ISOLATION"
          : "BLOCKED_ENVIRONMENT";
        jobs.updateOutcome(job.id, outcome, latest.row_version);
        jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
      })();
    } catch (stateError) {
      process.stderr.write(`[aitest-dispatch] resume job ${job.id} state update hatasi: ${String(stateError)}\n`);
    } finally {
      leaseManager.release(job.id, leaseOwnerId);
    }
  });

  return { job_id: job.id, lifecycle: "RUNNING", phase: job.phase, resumed: true,
    job_context: jobContext(services, jobs.getJob(job.id)), required_action: "test_status ile ayni isi izle",
    message: "Is ayni job'dan devam ediyor (dispatcher baslatildi)" };
}

export interface TestCancelResult {
  job_context?: JobContext;
  required_action?: string;
  cleanup_pending?: boolean;
  job_id: string;
  lifecycle: string;
  paused: boolean;
  message: string;
}

export async function handleTestCancel(input: unknown, services: Services): Promise<TestCancelResult> {
  const parsed = TestCancelInputSchema.parse(input);
  const { jobs } = requireStorage(services);
  const job = jobs.getJob(parsed.job_id);
  assertJobProjectContext(job, parsed.project_root, requireStorage(services).storage);

  const db = requireStorage(services).storage.db;
  const application = getApplyOperationView(db, job.id);
  if (application && (application.state === "APPLYING" || application.state === "RECOVERY_REQUIRED")) {
    cancelWorkspaceApply(job.id, services);
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([waitWorkspaceApply(job.id), new Promise<void>(resolve => { stopTimer = setTimeout(resolve, 10_000); })]); }
    finally { if (stopTimer) clearTimeout(stopTimer); }
    const current = getApplyOperationView(db, job.id);
    const pending = current?.state === "APPLYING" || current?.state === "RECOVERY_REQUIRED";
    return { job_id: job.id, lifecycle: job.lifecycle, paused: false, cleanup_pending: pending,
      job_context: jobContext(services, jobs.getJob(job.id)), required_action: nextJobAction(services, jobs.getJob(job.id)),
      message: pending ? "Uygulama durdurma/temizlik bekliyor; uretim sonucu korunur" : "Uygulama durduruldu ve sahipli testler geri alindi; uretim sonucu korunur" };
  }
  const pendingProcesses = () => db.prepare<[string],{n:number}>("SELECT COUNT(*) n FROM owned_processes WHERE job_id = ? AND cleanup_state <> 'CLOSED'").get(job.id)!.n > 0;
  const present = (current: JobRow, cleanupPending = false): TestCancelResult => ({
    job_id: current.id, lifecycle: current.lifecycle, paused: current.lifecycle === "PAUSED",
    job_context: jobContext(services,current), cleanup_pending: cleanupPending,
    required_action: cleanupPending ? "test_status ile durumu incele; owned process temizligi dogrulanmadan devam etme" : nextJobAction(services,current),
    message: cleanupPending ? "Durdurma durumu kaydedildi; process temizligi henuz dogrulanamadi" : `Is ${current.lifecycle}; artifact'ler korunur`,
  });
  const hadPendingCleanup=hasPendingCleanup(services,job.id);
  if ((job.lifecycle === "COMPLETED" || job.lifecycle === "CANCELLED" || job.lifecycle === "FAILED") && !hadPendingCleanup) {
    return present(job);
  }
  const activeOwner = db.prepare("SELECT 1 FROM job_leases WHERE job_id = ? AND expires_at > ?").get(job.id,Date.now());
  if (job.lifecycle === "PAUSED" && parsed.reason === "pause" && !hadPendingCleanup && !activeOwner) {
    return present(job);
  }

  const leases = new LeaseManager((requireStorage(services)).storage.db);
  // Publish stop intent before aborting. The worker's late failure must see it.
  const stop = db.transaction(() => {
    const current = jobs.getJob(job.id);
    const lease = db.prepare<[string],{owner_id:string;fencing_token:number}>("SELECT owner_id, fencing_token FROM job_leases WHERE job_id = ?").get(job.id);
    const state = ["COMPLETED","CANCELLED","FAILED"].includes(current.lifecycle) ? current.lifecycle : parsed.reason === "pause" ? "PAUSED" : "CANCELLED";
    // A resume may own a preflight lease while still PAUSED. A newer stop
    // invalidates its original row-version CAS even before native spawn.
    const invalidateResume = current.lifecycle === "PAUSED" && lease !== undefined;
    const updated = current.lifecycle === state && !invalidateResume ? current : jobs.updateLifecycle(job.id,state,current.row_version);
    if (current.lifecycle !== state) jobs.appendEvent({job_id:job.id,event_type:parsed.reason === "pause" ? "test_paused" : "test_cancelled",phase:current.phase,origin:"handleTestCancel"});
    return { lease, updated };
  }).immediate();
  let cleanupFailed = false;

  // W05/F11/N37: cancel/pause - owned worker/Maven process'leri sonlandirilir (yalniz owned kaynaklar).
  // Gec cevap CANCELLED/PAUSED'i COMPLETED'e ceviremez; late-write fencing lease fence ile korunur.
  try {
    const { JobDispatcher } = await import("../orchestration/job-dispatcher.js");
    const dispatcher = new JobDispatcher({
      services,
      runnerKind: resolveRunnerKindFromEnv(process.env["AITEST_RUNNER"], true),
      workerEnabled: process.env["AITEST_WORKER_ENABLED"] === "1",
      workspaceRoot: services.config.storage.root,
    });
    const stopped=db.transaction(() => {
      const currentLease=db.prepare<[string],{owner_id:string;fencing_token:number}>("SELECT owner_id, fencing_token FROM job_leases WHERE job_id = ?").get(job.id);
      const sameOwner=stop.lease ? currentLease?.owner_id === stop.lease.owner_id && currentLease.fencing_token === stop.lease.fencing_token : currentLease === undefined;
      if (!sameOwner) return false;
      dispatcher.stopOwnedProcesses(job.id);
      return true;
    }).immediate();
    if (stopped) await dispatcher.waitForOwnedProcessCleanup(job.id);
  } catch (stopError) {
    cleanupFailed = true;
    // owned process sonlandirma hatasi lifecycle akisini bozmaz; kayitli olur
    process.stderr.write(`[aitest-cancel] job ${job.id} owned process stop hatasi: ${String(stopError)}\n`);
  }

  // NativeProcessRegistry closes the durable ownership row through the active
  // lease. Keep that lease until the cleanup fence completes; releasing it
  // first makes a legitimate helper terminal receipt look unresolved and
  // permanently blocks resume.
  return db.transaction(() => {
    const latest = jobs.getJob(job.id);
    const currentLease = db.prepare<[string],{owner_id:string;fencing_token:number}>("SELECT owner_id, fencing_token FROM job_leases WHERE job_id = ?").get(job.id);
    const sameOwner=stop.lease ? currentLease?.owner_id === stop.lease.owner_id && currentLease.fencing_token === stop.lease.fencing_token : currentLease === undefined;
    const cleanupPending=cleanupFailed || pendingProcesses();
    if (sameOwner) {
      if (cleanupPending || hadPendingCleanup) jobs.appendEvent({job_id:job.id,event_type:cleanupPending ? "job_cleanup_pending" : "job_cleanup_completed",phase:latest.phase,origin:"handleTestCancel"});
      if (stop.lease && !cleanupPending) leases.release(job.id,stop.lease.owner_id);
    }
    return present(latest,sameOwner ? cleanupPending : jobContext(services,latest).execution_state === "CLEANUP_PENDING");
  }).immediate();
}

export interface TestResultResult {
  application?: ApplyOperationView;
  job_context: JobContext;
  required_action: string;
  coverage_scan_failure?: ProjectCoverageFailure;
  coverage_scan?: Omit<ProjectCoverageResult, "classes"> & { class_count: number };
  job_id: string;
  outcome: string | null;
  lifecycle: string;
  verification_level: string;
  apply_state: string;
  best_checkpoint_id: string | null;
  last_trusted_coverage: { percent: number; basisPoints: number } | null;
  report_facts: ReportStatusFacts | null;
  report_path: string | null;
  artifact_refs: string[];
}

export async function handleTestResult(input: unknown, services: Services): Promise<TestResultResult> {
  const parsed = TestResultInputSchema.parse(input);
  const { storage, jobs } = requireStorage(services);
  const prepared = parsed.job_id ? prepareReportVerification(services, parsed.job_id) : undefined;
  return storage.db.transaction(() => {
    let job = jobs.getJob(parsed.job_id);
    assertJobProjectContext(job, parsed.project_root, storage);
    const publishedVerification = verifyCurrentReport(services, job.id, prepared);
    job = publishedVerification.job ?? job;

    // K07/B06: son trusted coverage yalniz dispatcher'in final replay DB kanitindan
    // okunur; kullanici checkout'undaki stale jacoco.xml trusted sayilmaz.
    let lastCoverage: { percent: number; basisPoints: number } | null = null;
    const coverageRow = storage.db
      .prepare<[string], { line_covered: number; line_missed: number }>(
        "SELECT line_covered, line_missed FROM coverage_snapshots WHERE job_id = ? AND before_after = 'after' AND line_validity = 'OK' ORDER BY created_at DESC LIMIT 1",
      )
      .get(job.id);
    if (coverageRow) {
      const total = coverageRow.line_covered + coverageRow.line_missed;
      if (total > 0) {
        const bps = Math.floor((coverageRow.line_covered * 10000) / total);
        lastCoverage = { percent: bps / 100, basisPoints: bps };
      }
    }

    const checkpoints = new CheckpointStore(storage.db, services.config.storage.root);
    const bestCheckpoint = checkpoints.bestCheckpoint(job.id);

    // gercek rapor yolu: JobDispatcher'in urettigi reports dizini (workspaceRoot/jobs/<id>/reports):
    // report_path yalniz PUBLISHED dogrulamasi gecmis authoritative export'ta
    // sunulur; stale index.html veya bozuk/eksik manifest rapor yolunu yetkili
    // sayilamaz (PR07/PP40).
    const reportRoot = join(services.config.storage.root, "jobs", job.id, "reports");
    const reportDir = join(reportRoot, "index.html");
    const publicationVerified = publishedVerification.missing.length === 0 && publishedVerification.hash_mismatch.length === 0 && existsSync(join(reportRoot, "PUBLISHED"));
    const reportPath = publicationVerified && existsSync(reportDir) ? reportDir : null;
    const reportFacts = publicationVerified ? publishedVerification.facts ?? null : null;

    // artifact refs: o job'a ait kayitli artifact'ler (registry'den):
    const artifactRows = storage.db
      .prepare<[string], { relative_store_path: string; sha256: string }>(
        "SELECT relative_store_path, sha256 FROM artifacts WHERE job_id = ? ORDER BY created_at DESC LIMIT 20",
      )
      .all(job.id);

    return {
      job_id: job.id,
      job_context: jobContext(services, job), required_action: nextJobAction(services, job),
      outcome: job.outcome,
      lifecycle: job.lifecycle,
      verification_level: job.verification_level,
      apply_state: job.apply_state,
      ...(() => { const application = getApplyOperationView(storage.db, job.id); return application ? { application } : {}; })(),
      best_checkpoint_id: bestCheckpoint,
      last_trusted_coverage: lastCoverage,
      report_path: reportPath,
      report_facts: reportFacts,
      artifact_refs: artifactRows.map((a) => `${a.relative_store_path}#${a.sha256.slice(0, 12)}`),
      ...(() => { const scan = readProjectCoverageResult(services, job.id); if (!scan || job.outcome !== "COVERAGE_ANALYZED") return {};
        const { classes, ...summary } = scan;
        return { coverage_scan: { ...summary, class_count: classes.length } }; })(),
      ...(() => { const failure = readProjectCoverageFailure(services, job.id); return failure ? { coverage_scan_failure: failure } : {}; })(),
    };
  }).immediate();
}

export type TestApplyResult = WorkspaceApplyResult;

export async function handleTestApply(input: unknown, services: Services, context: ApplyCallContext = {}): Promise<TestApplyResult> {
  return handleWorkspaceTestApply(input, services, context);
}

function requireStorage(services: Services): { storage: NonNullable<Services["storage"]>; jobs: NonNullable<Services["jobs"]> } {
  if (!services.storage || !services.jobs) {
    throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
  }
  return { storage: services.storage, jobs: services.jobs };
}
