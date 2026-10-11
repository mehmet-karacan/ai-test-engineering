/**
 * Kalan MCP araclari: test_resume, test_cancel, test_result, test_apply use-case'leri.
 * MCP handler'larin cagirdigi application katmani; is mantigi burada.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TestResumeInputSchema, TestCancelInputSchema, TestResultInputSchema, TestApplyInputSchema } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import type { Services } from "./services.js";
import { canonicalProjectRoot } from "./services.js";
import type { JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { LeaseManager } from "../orchestration/lease-manager.js";
import { CheckpointStore } from "../orchestration/checkpoint-store.js";
import { defaultApplyConfig } from "../reporting/test-apply.js";
import { resolveRunnerKindFromEnv } from "../runners/runner-factory.js";

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

  // K05/B05: resume gercek dispatcher devami - ayni job'dan kaldigi asamadan devam.
  jobs.updateLifecycle(job.id, "RUNNING", job.row_version);
  jobs.appendEvent({ job_id: job.id, event_type: "test_resume_accepted", phase: job.phase, origin: "handleTestResume" });

  // dispatch'i ayni job'dan tekrar baslat (kaldigi asamadan; source/checkpoint dogrulamasi dispatcher'da):
  const { JobDispatcher } = await import("../orchestration/job-dispatcher.js");
  const { resolveRunnerKindFromEnv } = await import("../runners/runner-factory.js");
  const dispatcher = new JobDispatcher({
    services,
    runnerKind: resolveRunnerKindFromEnv(process.env["AITEST_RUNNER"], true),
    workerEnabled: process.env["AITEST_WORKER_ENABLED"] === "1",
    workspaceRoot: services.config.storage.root,
  });
  // GoalContract job kayitlarindan yeniden kurulur (resume parametresi gerekmez):
  void dispatcher.resumeDispatch(job, parsed.project_root ?? undefined).catch((error: unknown) => {
    process.stderr.write(`[aitest-dispatch] resume job ${job.id} hata: ${String(error)}\n`);
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
  const reportDir = join(services.config.storage.root, "jobs", job.id, "reports", "index.html");
  const reportPath = existsSync(reportDir) ? reportDir : null;

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
