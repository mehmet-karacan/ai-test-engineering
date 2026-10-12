/**
 * Kalan MCP araclari: test_resume, test_cancel, test_result, test_apply use-case'leri.
 * MCP handler'larin cagirdigi application katmani; is mantigi burada.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TestResumeInputSchema, TestCancelInputSchema, TestResultInputSchema, TestApplyInputSchema } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import type { Services } from "./services.js";
import { canonicalProjectRoot } from "./services.js";
import type { JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { LeaseManager } from "../orchestration/lease-manager.js";
import { CheckpointStore } from "../orchestration/checkpoint-store.js";
import { defaultApplyConfig } from "../reporting/test-apply.js";
import { CustomerRunnerFactory, resolveRunnerKindFromEnv } from "../runners/runner-factory.js";
import { verifyNativeToolchain } from "../runners/native-toolchain.js";
import { NativeToolchainRecordStore } from "../orchestration/native-toolchain-record.js";
import { parseExactModelSpec } from "../workers/opencode/profile-reader.js";
import { projectReportStatusFacts, type ReportStatusFacts } from "../reporting/report-projection.js";
import { ReportExporter } from "../reporting/report-generator.js";

export interface TestResumeResult {
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
        message: `Birden fazla uygun is var (${resumable.length}); job_id ile netlestirin`,
      };
    }
    job = resumable[0]!;
  } else {
    throw new AppError("INVALID_PARAMETERS", "job_id veya project_root gereklidir");
  }

  if (job.lifecycle === "COMPLETED") {
    return { job_id: job.id, lifecycle: job.lifecycle, phase: job.phase, resumed: false, message: "Is zaten tamamlandi; yeniden devam etmez" };
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
  if (runnerKind === "windows_native") {
    // Do not mark a resumed job RUNNING when customer process ownership is
    // still unavailable. The dispatcher will recheck before any Maven probe.
    new CustomerRunnerFactory().assertNativeCustomerReady();
    const record = new NativeToolchainRecordStore(storage.db, services.config.storage.root);
    const options = record.optionsForResume(job.id, process.env);
    const locationRoot = new ProjectRepository(storage.db).getLocation(job.location_id).canonical_root;
    if (options.cwd !== locationRoot || (parsed.project_root && canonicalProjectRoot(parsed.project_root) !== locationRoot)) {
      throw new AppError("POLICY_VIOLATION", "Native toolchain project root differs from job location", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" });
    }
    await record.verify(job.id, options, verifyNativeToolchain);
  }

  // Acquire a unique fenced owner before publishing RUNNING. A competing
  // resume must not mutate the state/event stream of the active owner.
  const leaseOwnerId = `resume-${process.pid}-${job.id}-${randomUUID()}`;
  const leaseManager = new LeaseManager(storage.db);
  const lease = leaseManager.acquire(job.id, leaseOwnerId, 300000, `resume-${process.pid}`).lease;
  try {
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

  return { job_id: job.id, lifecycle: "RUNNING", phase: job.phase, resumed: true, message: "Is ayni job'dan devam ediyor (dispatcher baslatildi)" };
}

export interface TestCancelResult {
  job_id: string;
  lifecycle: string;
  paused: boolean;
  message: string;
}

export async function handleTestCancel(input: unknown, services: Services): Promise<TestCancelResult> {
  const parsed = TestCancelInputSchema.parse(input);
  const { jobs } = requireStorage(services);
  const job = jobs.getJob(parsed.job_id);

  if (job.lifecycle === "COMPLETED" || job.lifecycle === "CANCELLED") {
    return { job_id: job.id, lifecycle: job.lifecycle, paused: false, message: `Is zaten ${job.lifecycle}` };
  }

  const leases = new LeaseManager((requireStorage(services)).storage.db);
  try {
    const currentLease = leases.get(job.id);
    leases.release(job.id, currentLease.owner_id);
  } catch {
    // lease zaten yok olabilir
  }

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
    dispatcher.stopOwnedProcesses(job.id);
  } catch (stopError) {
    // owned process sonlandirma hatasi lifecycle akisini bozmaz; kayitli olur
    process.stderr.write(`[aitest-cancel] job ${job.id} owned process stop hatasi: ${String(stopError)}\n`);
  }

  if (parsed.reason === "pause") {
    jobs.updateLifecycle(job.id, "PAUSED", job.row_version);
    jobs.appendEvent({ job_id: job.id, event_type: "test_paused", phase: job.phase, origin: "handleTestCancel" });
    return { job_id: job.id, lifecycle: "PAUSED", paused: true, message: "Is duraklatildi; owned process'ler sonlandirildi; test_resume ile devam edilebilir" };
  }

  jobs.updateLifecycle(job.id, "CANCELLED", job.row_version);
  jobs.appendEvent({ job_id: job.id, event_type: "test_cancelled", phase: job.phase, origin: "handleTestCancel" });
  return { job_id: job.id, lifecycle: "CANCELLED", paused: false, message: "Iptal edildi; owned process'ler sonlandirildi; artifact'ler korunur" };
}

export interface TestResultResult {
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
  const job = jobs.getJob(parsed.job_id);

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
  const reportJsonPath = join(reportRoot, "report.json");
  const publishedVerification = existsSync(join(reportRoot, "PUBLISHED")) ? new ReportExporter(reportRoot).verifyExport() : { missing: ["PUBLISHED"], hash_mismatch: [] };
  const publicationVerified = publishedVerification.missing.length === 0 && publishedVerification.hash_mismatch.length === 0;
  const reportPath = publicationVerified && existsSync(reportDir) ? reportDir : null;
  let reportFacts: ReportStatusFacts | null = null;
  if (publicationVerified && existsSync(reportJsonPath)) {
    try {
      reportFacts = projectReportStatusFacts(JSON.parse(readFileSync(reportJsonPath, "utf8")), job.id);
    } catch {
      reportFacts = null;
    }
  }

  // artifact refs: o job'a ait kayitli artifact'ler (registry'den):
  const artifactRows = storage.db
    .prepare<[string], { relative_store_path: string; sha256: string }>(
      "SELECT relative_store_path, sha256 FROM artifacts WHERE job_id = ? ORDER BY created_at DESC LIMIT 20",
    )
    .all(job.id);

  return {
    job_id: job.id,
    outcome: job.outcome,
    lifecycle: job.lifecycle,
    verification_level: job.verification_level,
    apply_state: job.apply_state,
    best_checkpoint_id: bestCheckpoint,
    last_trusted_coverage: lastCoverage,
    report_path: reportPath,
    report_facts: reportFacts,
    artifact_refs: artifactRows.map((a) => `${a.relative_store_path}#${a.sha256.slice(0, 12)}`),
  };
}

export interface TestApplyResult {
  job_id: string;
  state: "APPLIED" | "CONFLICT" | "REJECTED" | "PATCH_ONLY";
  operation_id: string | null;
  applied_paths: string[];
  conflicts: Array<{ path: string; reason: string }>;
  message: string;
}

export async function handleTestApply(input: unknown, services: Services): Promise<TestApplyResult> {
  const parsed = TestApplyInputSchema.parse(input);
  const { jobs } = requireStorage(services);
  const job = jobs.getJob(parsed.job_id);

  if (job.apply_state === "APPLIED") {
    return { job_id: job.id, state: "APPLIED", operation_id: null, applied_paths: [], conflicts: [], message: "Is zaten uygulanmis; idempotent" };
  }

  const config = defaultApplyConfig();
  if (!config.allow_workspace_apply) {
    return { job_id: job.id, state: "PATCH_ONLY", operation_id: null, applied_paths: [], conflicts: [], message: "Workspace apply kapali; patch-only sonuc" };
  }

  throw new AppError("POLICY_VIOLATION", "Guvenilir onay adapter'i yok; patch-only sonuc doner", { reason_code: "APPLY_DISABLED" });
}

function requireStorage(services: Services): { storage: NonNullable<Services["storage"]>; jobs: NonNullable<Services["jobs"]> } {
  if (!services.storage || !services.jobs) {
    throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
  }
  return { storage: services.storage, jobs: services.jobs };
}
