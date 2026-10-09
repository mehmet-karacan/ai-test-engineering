/**
 * Uygulama servisleri: tool handler'larinin cagirdigi use-case'ler.
 * P01 kapsaminda project_inspect ve test_start/test_status temel akisi; digerleri sonraki asamalarda gerceklesir.
 */
import { createHash } from "node:crypto";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { TestStartInputSchema, TestStatusInputSchema, ProjectInspectInputSchema, percentToBasisPoints } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import { Storage } from "../storage/storage.js";
import { JobRepository, type JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { loadConfig, defaultConfig } from "../configuration/config-loader.js";
import type { AppConfig } from "../configuration/config-schema.js";

export interface Services {
  config: AppConfig;
  storage?: Storage;
  jobs?: JobRepository;
  artifacts?: ArtifactStore;
}

export function createServices(configPath?: string): Services {
  const config = loadConfig(configPath);
  const services: Services = { config };
  return services;
}

export function createDefaultServicesForTest(dbPath: string, artifactRoot: string): Services {
  const config = defaultConfig();
  const storage = new Storage({ dbPath });
  storage.migrate();
  const jobs = new JobRepository(storage.db);
  const artifacts = new ArtifactStore({ root: artifactRoot });
  return { config, storage, jobs, artifacts };
}

export function canonicalProjectRoot(projectRoot: string): string {
  const resolved = resolve(projectRoot);
  if (!existsSync(resolved)) {
    throw new AppError("INVALID_PARAMETERS", `Proje koku bulunamadi: ${projectRoot}`);
  }
  if (!statSync(resolved).isDirectory()) {
    throw new AppError("INVALID_PARAMETERS", `Proje koku bir dizin olmali: ${projectRoot}`);
  }
  return resolved;
}

export function assertAllowedRoot(config: AppConfig, canonicalRoot: string): void {
  if (config.allowed_project_roots.length === 0) {
    return;
  }
  const allowed = config.allowed_project_roots.some((root: string) => {
    const resolved = resolve(root);
    return canonicalRoot === resolved || canonicalRoot.startsWith(resolved + sep);
  });
  if (!allowed) {
    throw new AppError("POLICY_VIOLATION", `Yetkili proje koku disinda: ${canonicalRoot}`);
  }
}

export function requestDigest(parts: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

export interface ProjectInspectResult {
  project_root: string;
  project_id: string;
  inventory: {
    kind: "maven_single" | "maven_multi" | "unknown";
    build_files: string[];
  };
  preflight: {
    status: "ok" | "blocked";
    reasons: string[];
  };
}

export async function handleProjectInspect(input: unknown, services: Services): Promise<ProjectInspectResult> {
  const parsed = ProjectInspectInputSchema.parse(input);
  const canonicalRoot = canonicalProjectRoot(parsed.project_root);
  assertAllowedRoot(services.config, canonicalRoot);

  const buildFiles: string[] = [];
  const pomPath = resolve(canonicalRoot, "pom.xml");
  let kind: ProjectInspectResult["inventory"]["kind"] = "unknown";
  if (existsSync(pomPath)) {
    buildFiles.push("pom.xml");
    const content = readFileSync(pomPath, "utf8");
    kind = content.includes("<modules>") ? "maven_multi" : "maven_single";
  }

  let projectId: string;
  if (services.storage) {
    const projects = new ProjectRepository(services.storage.db);
    const { project } = projects.ensureLocation(
      canonicalRoot,
      canonicalRoot.split(/[\\/]/).filter((p) => p.length > 0).pop() ?? "unnamed-project",
      null,
    );
    projectId = project.id;
  } else {
    projectId = requestDigest({ root: canonicalRoot }).slice(0, 36);
  }

  return {
    project_root: canonicalRoot.replace(/\\/g, "/"),
    project_id: projectId,
    inventory: { kind, build_files: buildFiles },
    preflight: { status: "ok", reasons: [] },
  };
}

export interface TestStartResult {
  job_id: string;
  lifecycle: string;
  phase: string;
  created: boolean;
}

export async function handleTestStart(input: unknown, services: Services): Promise<TestStartResult> {
  const parsed = TestStartInputSchema.parse(input);
  const canonicalRoot = canonicalProjectRoot(parsed.project_root);
  assertAllowedRoot(services.config, canonicalRoot);
  const { storage, jobs, artifacts } = requireServices(services);
  const projects = new ProjectRepository(storage.db);

  const { location } = projects.ensureLocation(
    canonicalRoot,
    canonicalRoot.split(/[\\/]/).filter((p) => p.length > 0).pop() ?? "unnamed-project",
    null,
  );

  const digest = requestDigest({
    root: canonicalRoot,
    targets: parsed.targets,
    coverage: parsed.coverage,
    mode: parsed.mode,
    idempotency: parsed.idempotency_key,
  });

  const existing = jobs.findJobByRequestDigest(location.id, digest);
  if (existing) {
    return { job_id: existing.id, lifecycle: existing.lifecycle, phase: existing.phase, created: false };
  }

  if (parsed.targets.length > 5) {
    throw new AppError(
      "INVALID_PARAMETERS",
      `Buyuk kapsam: ${parsed.targets.length} hedef; talep/butce netligi icin daha kucuk hedef listesi gerekiyor`,
    );
  }

  const job = jobs.createJob({
    locationId: location.id,
    requestDigest: digest,
    phase: "discovery",
  });

  jobs.appendEvent({
    job_id: job.id,
    event_type: "test_start_accepted",
    phase: "discovery",
    origin: "handleTestStart",
  });

  return { job_id: job.id, lifecycle: job.lifecycle, phase: job.phase, created: true };
}

export interface TestStatusResult {
  job_id: string;
  lifecycle: string;
  phase: string;
  outcome: string | null;
  verification_level: string;
  apply_state: string;
  last_trusted_coverage: { percent: number; basisPoints: number } | null;
  events: Array<{ sequence: number; event_type: string; phase: string | null }>;
  required_action: string | null;
}

export async function handleTestStatus(input: unknown, services: Services): Promise<TestStatusResult> {
  const parsed = TestStatusInputSchema.parse(input);
  const { jobs } = requireServices(services);
  let job: JobRow;
  if (parsed.job_id) {
    job = jobs.getJob(parsed.job_id);
  } else if (parsed.project_root) {
    const canonicalRoot = canonicalProjectRoot(parsed.project_root);
    const projects = new ProjectRepository((requireServices(services)).storage.db);
    const locations = projects.listLocationsProjects(canonicalRoot);
    const resumable = jobs.findResumableJobsByLocations(locations.map((l) => l.id));
    if (resumable.length === 0) {
      throw new AppError("INVALID_PARAMETERS", `Bu projede aktif job bulunamadi: ${parsed.project_root}`);
    }
    job = resumable[0]!;
  } else {
    throw new AppError("INVALID_PARAMETERS", "job_id veya project_root gereklidir");
  }

  const events = jobs.listEvents(job.id, parsed.event_cursor, 50);
  return {
    job_id: job.id,
    lifecycle: job.lifecycle,
    phase: job.phase,
    outcome: job.outcome,
    verification_level: job.verification_level,
    apply_state: job.apply_state,
    last_trusted_coverage: null,
    events: events.map((e) => ({ sequence: e.sequence, event_type: e.event_type, phase: e.phase })),
    required_action: job.lifecycle === "INTERRUPTED" ? "test_resume ile devam edilebilir" : null,
  };
}

export function targetBasisPoints(percent: number): { line: number; branch: number } {
  const bps = percentToBasisPoints(percent);
  return { line: bps, branch: bps };
}

export function requireServices(services: Services): { storage: Storage; jobs: JobRepository; artifacts: ArtifactStore } {
  if (!services.storage || !services.jobs || !services.artifacts) {
    throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
  }
  return { storage: services.storage, jobs: services.jobs, artifacts: services.artifacts };
}
