import type { Services } from "./services.js";
import type { JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";

export interface JobContext {
  project_id: string;
  project_root: string;
  source_snapshot_id: string | null;
  best_checkpoint_id: string | null;
  consumed_attempts: number;
  execution_state: "ACTIVE_LEASE" | "NO_ACTIVE_LEASE" | "CLEANUP_PENDING";
  lease_expires_at: number | null;
  targets: Array<{selector:string;target_kind:string;line_target_bps:number;branch_target_bps:number|null}>;
}

/** Persisted facts help a fresh chat choose an action without relying on CWD. */
export function jobContext(services: Services, job: JobRow): JobContext {
  const db = services.storage!.db;
  const location = new ProjectRepository(db).getLocation(job.location_id);
  return {
    project_id: location.project_id, project_root: location.canonical_root,
    source_snapshot_id: job.source_snapshot_id, best_checkpoint_id: job.best_checkpoint_id,
    consumed_attempts: db.prepare<[string],{n:number}>("SELECT COUNT(*) n FROM candidate_iterations WHERE job_id = ?").get(job.id)!.n,
    ...executionFacts(services,job),
    targets: db.prepare<[string],JobContext["targets"][number]>("SELECT selector, target_kind, line_target_bps, branch_target_bps FROM job_targets WHERE job_id = ? ORDER BY selector, id").all(job.id),
  };
}

export function hasPendingCleanup(services: Services, jobId: string): boolean {
  const db=services.storage!.db;
  const event=db.prepare<[string],{event_type:string}>("SELECT event_type FROM job_events WHERE job_id = ? AND event_type IN ('job_cleanup_pending','job_cleanup_completed') ORDER BY sequence DESC LIMIT 1").get(jobId);
  return event?.event_type === "job_cleanup_pending" || !!db.prepare("SELECT 1 FROM owned_processes WHERE job_id = ? AND cleanup_state <> 'CLOSED' LIMIT 1").get(jobId);
}

function executionFacts(services: Services, job: JobRow): Pick<JobContext,"execution_state"|"lease_expires_at"> {
  const db=services.storage!.db;
  const lease=db.prepare<[string],{expires_at:number}>("SELECT expires_at FROM job_leases WHERE job_id = ?").get(job.id);
  const active=lease !== undefined && lease.expires_at > Date.now();
  const pending=hasPendingCleanup(services,job.id);
  return {lease_expires_at:lease?.expires_at ?? null,
    execution_state:pending && (!active || job.lifecycle === "PAUSED" || job.lifecycle === "CANCELLED") ? "CLEANUP_PENDING" : active ? "ACTIVE_LEASE" : "NO_ACTIVE_LEASE"};
}

export function nextJobAction(services: Services, job: JobRow): string {
  const execution=executionFacts(services,job);
  if (execution.execution_state === "CLEANUP_PENDING") return "test_status ile owned process temizligini incele; test_cancel ile temizligi yeniden dene; dogrulanmadan devralma";
  if (job.lifecycle === "COMPLETED") return "test_result ile dogrulanmis sonucu incele; bu is yeniden baslatilmaz";
  if (job.lifecycle === "CANCELLED") return "Is iptal edildi; yeniden uretim istenirse test_start ile yeni is baslat";
  const scan = services.storage!.db.prepare("SELECT 1 FROM job_events WHERE job_id = ? AND event_type = 'project_coverage_requested' LIMIT 1").get(job.id);
  if (scan && job.lifecycle === "WAITING_INPUT") return "test_result onerilerini kullaniciya sun; kullanici secince test_start(coverage_scan_id, targets) cagir";
  if (scan && (job.lifecycle === "PAUSED" || job.lifecycle === "INTERRUPTED" || job.lifecycle === "FAILED")) return "Coverage taramasi checkpoint'ten surmez; project_coverage ile yeni idempotency_key kullanarak tekrar tara";
  if (job.outcome === "SOURCE_CHANGED") return "Kaynak degisti; project_coverage ile yeni analiz veya test_start ile acik yeni is baslat; eski olcumleri yeni kaynaga aktarma";
  if (job.lifecycle === "PAUSED" || job.lifecycle === "INTERRUPTED") return "test_resume ile ayni isi son dogrulanmis checkpoint ve kalan butceyle surdur; yarim cagri yeniden calisabilir";
  if (job.lifecycle === "FAILED") return "test_result ile hata nedenini incele; ortam/kaynak duzeltildikten sonra uygun recovery veya yeni is yolunu sec";
  if (job.lifecycle === "RUNNING" && execution.execution_state === "NO_ACTIVE_LEASE") return "Aktif lease yok; test_resume ile ayni is icin checkpoint/source/ownership dogrulamali recovery dene";
  return "test_status ile mevcut isi izle; sohbet yanitini durdurmak isi duraklatmaz; duraklatmak icin test_cancel(reason=pause) kullan";
}
