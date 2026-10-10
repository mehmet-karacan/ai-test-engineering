/**
 * Uygulama servisleri: tool handler'larinin cagirdigi use-case'ler.
 * P01: project_inspect, test_start, test_status temel akisi.
 * P02: guvenli kesif (snapshot, envanter, target resolution) eklendi.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { TestStartInputSchema, TestStatusInputSchema, ProjectInspectInputSchema, ProjectQueryInputSchema, percentToBasisPoints } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import { Storage } from "../storage/storage.js";
import { JobRepository, type JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { InventoryRepository } from "../storage/inventory-repository.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { loadConfig, defaultConfig } from "../configuration/config-loader.js";
import type { AppConfig } from "../configuration/config-schema.js";
import { SourceSnapshot } from "../discovery/source-snapshot.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { collectJavaFiles, scanJavaFile, scanTestFile } from "../discovery/java-inventory.js";
import { InventoryQueryService } from "./inventory-query.js";
import { JobDispatcher } from "../orchestration/job-dispatcher.js";
import { resolveRunnerKindFromEnv } from "../runners/runner-factory.js";

export const PARSER_VERSION = "statik-tarama-1";

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
    module_count: number;
    snapshot_id: string | null;
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

  let modules: PomModule[] = [];
  let kind: ProjectInspectResult["inventory"]["kind"] = "unknown";
  const pomPath = resolve(canonicalRoot, "pom.xml");
  if (existsSync(pomPath)) {
    try {
      const discovery = discoverModules(canonicalRoot);
      modules = discovery.modules;
      kind = modules.length > 1 ? "maven_multi" : "maven_single";
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      kind = "unknown";
    }
  }

  let projectId: string;
  let snapshotId: string | null = null;
  if (services.storage) {
    const projects = new ProjectRepository(services.storage.db);
    const { project, location } = projects.ensureLocation(
      canonicalRoot,
      canonicalRoot.split(/[\\/]/).filter((p) => p.length > 0).pop() ?? "unnamed-project",
      null,
    );
    projectId = project.id;

    if (parsed.refresh || modules.length > 0) {
      const inventory = new InventoryRepository(services.storage.db);
      const snapshot = new SourceSnapshot(canonicalRoot);
      const manifest = snapshot.buildManifest();
      const dirtyDigest = manifest.dirty ? requestDigest({ entries: manifest.entries.map((e) => e.sha256) }) : null;
      snapshotId = inventory.writeSnapshot(location.id, manifest.head_commit, dirtyDigest, PARSER_VERSION);
      for (const module of modules) {
        const moduleId = inventory.writeModule(snapshotId, module);
        const javaFiles = collectJavaFiles(canonicalRoot, module.source_root);
        for (const javaFile of javaFiles) {
          const { symbols } = scanJavaFile(javaFile, canonicalRoot);
          for (const symbol of symbols) {
            const packageId = inventory.writePackage(moduleId, symbol.package_name || "(default)", "main");
            inventory.writeSymbol(packageId, symbol);
          }
        }
        const testFiles = collectJavaFiles(canonicalRoot, module.test_root);
        for (const testFile of testFiles) {
          const { testClass, methods } = scanTestFile(testFile, canonicalRoot);
          if (testClass) {
            const packageId = inventory.writePackage(moduleId, testClass.fqn.split(".").slice(0, -1).join(".") || "(default)", "test");
            const symbolId = inventory.writeSymbol(packageId, {
              kind: "class",
              fqn: testClass.fqn,
              simple_name: testClass.fqn.split(".").pop() ?? testClass.fqn,
              package_name: testClass.fqn.split(".").slice(0, -1).join("."),
              relative_path: testClass.relative_path,
              source_sha256: testClass.source_sha256,
              line_start: 1,
              line_end: 1,
              enclosing: null,
            });
            for (const method of methods) {
              inventory.writeTestCase(moduleId, symbolId, method.kind, `${method.owner_fqn}#${method.name}`, testClass.relative_path, testClass.source_sha256);
            }
          }
        }
      }
    }
  } else {
    projectId = requestDigest({ root: canonicalRoot }).slice(0, 36);
  }

  return {
    project_root: canonicalRoot.replace(/\\/g, "/"),
    project_id: projectId,
    inventory: {
      kind,
      build_files: modules.length > 0 ? modules.map((m) => `${m.module_relative_path || "."} -> ${m.artifact_id}`) : [],
      module_count: modules.length,
      snapshot_id: snapshotId,
    },
    preflight: { status: "ok", reasons: [] },
  };
}

export interface TestStartResult {
  job_id: string;
  lifecycle: string;
  phase: string;
  created: boolean;
  resolved_targets?: Array<{ selector: string; matches: number; fqns: string[] }>;
  ambiguous?: Array<{ selector: string; candidates: string[] }>;
}

export async function handleTestStart(input: unknown, services: Services): Promise<TestStartResult> {
  const parsed = TestStartInputSchema.parse(input);
  const canonicalRoot = canonicalProjectRoot(parsed.project_root);
  assertAllowedRoot(services.config, canonicalRoot);
  const { storage, jobs } = requireServices(services);
  const projects = new ProjectRepository(storage.db);

  const { location } = projects.ensureLocation(
    canonicalRoot,
    canonicalRoot.split(/[\\/]/).filter((p) => p.length > 0).pop() ?? "unnamed-project",
    null,
  );

  const inventory = new InventoryRepository(storage.db);
  const snapshotId = inventory.writeSnapshot(location.id, null, null, PARSER_VERSION);
  let resolvedTargets: Array<{ selector: string; matches: number; fqns: string[] }> | undefined;
  let ambiguous: Array<{ selector: string; candidates: string[] }> | undefined;

  if (existsSync(resolve(canonicalRoot, "pom.xml"))) {
    try {
      const discovery = discoverModules(canonicalRoot);
      for (const module of discovery.modules) {
        const moduleId = inventory.writeModule(snapshotId, module);
        const javaFiles = collectJavaFiles(canonicalRoot, module.source_root);
        for (const javaFile of javaFiles) {
          const { symbols } = scanJavaFile(javaFile, canonicalRoot);
          for (const symbol of symbols) {
            const packageId = inventory.writePackage(moduleId, symbol.package_name || "(default)", "main");
            inventory.writeSymbol(packageId, symbol);
          }
        }
        const testFiles = collectJavaFiles(canonicalRoot, module.test_root);
        for (const testFile of testFiles) {
          const { testClass, methods } = scanTestFile(testFile, canonicalRoot);
          if (testClass) {
            const packageId = inventory.writePackage(moduleId, testClass.fqn.split(".").slice(0, -1).join(".") || "(default)", "test");
            const symbolId = inventory.writeSymbol(packageId, {
              kind: "class",
              fqn: testClass.fqn,
              simple_name: testClass.fqn.split(".").pop() ?? testClass.fqn,
              package_name: testClass.fqn.split(".").slice(0, -1).join("."),
              relative_path: testClass.relative_path,
              source_sha256: testClass.source_sha256,
              line_start: 1,
              line_end: 1,
              enclosing: null,
            });
            for (const method of methods) {
              inventory.writeTestCase(moduleId, symbolId, method.kind, `${method.owner_fqn}#${method.name}`, testClass.relative_path, testClass.source_sha256);
            }
          }
        }
      }

      const ambiguousList: Array<{ selector: string; candidates: string[] }> = [];
      const resolvedList: Array<{ selector: string; matches: number; fqns: string[] }> = [];
      for (const target of parsed.targets) {
        if (target.kind === "package") {
          // K06/B09: package hedefi somut class listesine acilir (sessiz repo genisletme yok):
          const pkgClasses = inventory.resolveTarget(snapshotId, `${target.selector}.`);
          if (pkgClasses.length === 0) {
            throw new AppError("INVALID_PARAMETERS", `Paket hedefi icinde sinif bulunamadi: ${target.selector}`);
          }
          resolvedList.push({ selector: target.selector, matches: pkgClasses.length, fqns: pkgClasses.map((m) => m.fqn) });
          continue;
        }
        if (target.kind === "module") {
          // K06/B09: module hedefi o moduldeki tum siniflara acilir:
          const moduleClasses = inventory.listModuleClasses(snapshotId, target.selector);
          if (moduleClasses.length === 0) {
            throw new AppError("INVALID_PARAMETERS", `Modul hedefi icinde sinif bulunamadi: ${target.selector}`);
          }
          resolvedList.push({ selector: target.selector, matches: moduleClasses.length, fqns: moduleClasses });
          continue;
        }
        if (target.kind !== "class") {
          continue;
        }
        const matches = inventory.resolveTarget(snapshotId, target.selector);
        if (matches.length === 0) {
          throw new AppError("INVALID_PARAMETERS", `Hedef sinif bulunamadi: ${target.selector}`);
        }
        if (matches.length > 1) {
          const byModule = new Map<string, string[]>();
          for (const match of matches) {
            const list = byModule.get(match.module_relative_path) ?? [];
            list.push(match.fqn);
            byModule.set(match.module_relative_path, list);
          }
          if (byModule.size > 1) {
            ambiguousList.push({ selector: target.selector, candidates: matches.map((m) => `${m.module_relative_path}: ${m.fqn}`) });
            continue;
          }
        }
        resolvedList.push({ selector: target.selector, matches: matches.length, fqns: matches.map((m) => m.fqn) });
      }
      if (ambiguousList.length > 0) {
        ambiguous = ambiguousList;
      }
      resolvedTargets = resolvedList;
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      if (error.code === "INVALID_PARAMETERS") {
        throw error;
      }
    }
  }

  if (ambiguous && ambiguous.length > 0) {
    throw new AppError("INVALID_PARAMETERS", "Hedef tek anlama cozumlenemedi; aday listesi dondu", {
      reason_code: "AMBIGUOUS_TARGET",
      ambiguous,
    });
  }

  const digest = requestDigest({
    root: canonicalRoot,
    targets: parsed.targets,
    coverage: parsed.coverage,
    mode: parsed.mode,
    idempotency: parsed.idempotency_key,
  });

  const existing = jobs.findJobByRequestDigest(location.id, digest);
  if (existing) {
    return {
      job_id: existing.id,
      lifecycle: existing.lifecycle,
      phase: existing.phase,
      created: false,
      ...(resolvedTargets !== undefined ? { resolved_targets: resolvedTargets } : {}),
    };
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

  // K02/B05: job_targets'a hedefleri kalici kaydet (resume GoalContract kaynagi)
  const insertTarget = storage.db.prepare(
    "INSERT INTO job_targets (id, job_id, symbol_id, module_id, selector, target_kind, resolved_scope_digest, line_target_bps, branch_target_bps, created_at) VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?)",
  );
  for (const t of parsed.targets) {
    insertTarget.run(
      randomUUID(),
      job.id,
      t.selector,
      t.kind,
      percentToBasisPoints(parsed.coverage.percent),
      parsed.coverage.metrics.includes("BRANCH") ? percentToBasisPoints(parsed.coverage.percent) : null,
      Date.now(),
    );
  }

  // D02/F01: dispatcher'a gecici dispatch - job'a ait asamalar gercekten yurutulur.
  // Dispatcher async olarak ilerler; event loop'u bloke etmez. Kisa surede job handle doner.
  // K01/B01: customer job'da host yolu urun girisinden secilemez; default docker (verified izolasyon).
  // RT02: tip donusumune guvenilmez; bilinmeyen deger fail-closed.
  const runnerKind = resolveRunnerKindFromEnv(process.env["AITEST_RUNNER"], true);
  const dispatcher = new JobDispatcher({
    services,
    runnerKind,
    workerEnabled: process.env["AITEST_WORKER_ENABLED"] === "1",
    workspaceRoot: services.config.storage.root,
  });
  const goalTargets = parsed.targets.map((t) => ({
    selector: t.selector,
    kind: t.kind,
    line_target_bps: percentToBasisPoints(parsed.coverage.percent),
    branch_target_bps: parsed.coverage.metrics.includes("BRANCH") ? percentToBasisPoints(parsed.coverage.percent) : 0,
  }));
  const goal = dispatcher.buildGoalContract(job, goalTargets, canonicalRoot);
  void dispatcher.dispatch(job, goal, canonicalRoot).catch((error: unknown) => {
    process.stderr.write(`[aitest-dispatch] job ${job.id} hata: ${String(error)}\n`);
  });

  return {
    job_id: job.id,
    lifecycle: job.lifecycle,
    phase: job.phase,
    created: true,
    ...(resolvedTargets !== undefined ? { resolved_targets: resolvedTargets } : {}),
  };
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

export async function handleProjectQuery(input: unknown, services: Services): Promise<ReturnType<InventoryQueryService["query"]>> {
  const parsed = ProjectQueryInputSchema.parse(input);
  const { storage } = requireServices(services);
  const projects = new ProjectRepository(storage.db);
  let locationIds: string[] = [];

  if (parsed.project_root) {
    const canonicalRoot = canonicalProjectRoot(parsed.project_root);
    locationIds = projects.listLocationsProjects(canonicalRoot).map((l) => l.id);
  } else if (parsed.project_id) {
    locationIds = projects.listLocations(parsed.project_id).map((l) => l.id);
  }

  const queryService = new InventoryQueryService();
  return queryService.query(storage.db, parsed, locationIds);
}

export function requireServices(services: Services): { storage: Storage; jobs: JobRepository; artifacts: ArtifactStore } {
  if (!services.storage || !services.jobs || !services.artifacts) {
    throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
  }
  return { storage: services.storage, jobs: services.jobs, artifacts: services.artifacts };
}
