import { projectNativeExecution } from "../configuration/project-native-execution.js";
/**
 * Uygulama servisleri: tool handler'larinin cagirdigi use-case'ler.
 * P01: project_inspect, test_start, test_status temel akisi.
 * P02: guvenli kesif (snapshot, envanter, target resolution) eklendi.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { TestStartInputSchema, TestStatusInputSchema, ProjectInspectInputSchema, ProjectQueryInputSchema, percentToBasisPoints } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import { Storage } from "../storage/storage.js";
import { JobRepository, type JobRow } from "../storage/job-repository.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { InventoryRepository } from "../storage/inventory-repository.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { loadConfig, defaultConfig } from "../configuration/config-loader.js";
import type { AppConfig } from "../configuration/config-schema.js";
import { SourceSnapshot, computeSourceIdentity } from "../discovery/source-snapshot.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { collectJavaFiles, scanJavaFile, scanTestFile } from "../discovery/java-inventory.js";
import { buildFrozenTargetList, type ConcreteTarget } from "../discovery/target-resolver.js";
import { InventoryQueryService } from "./inventory-query.js";
import { InventoryScanService } from "./inventory-scan-service.js";
import { JobDispatcher } from "../orchestration/job-dispatcher.js";
import { resolveRunnerKindFromEnv } from "../runners/runner-factory.js";
import type { ReportStatusFacts } from "../reporting/report-projection.js";
import { verifyCurrentReport, prepareReportVerification } from "./report-runtime.js";
import { jobContext, nextJobAction, type JobContext } from "./job-context.js";
import { buildJobContract, contractRef, type JobContract } from "../domain/job-contract.js";
import { parseExactModelSpec } from "../workers/opencode/profile-reader.js";
import { buildSecretFreeConfigSnapshot } from "../configuration/config-security.js";
import { readProjectCoverageResult } from "../storage/project-coverage-result.js";
import { getApplyOperationView } from "../storage/apply-operation-view.js";
import type { ApplyOperationView } from "../domain/apply-contracts.js";

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

export function assertJobProjectContext(job: JobRow, projectRoot: string | undefined, storage: Storage): void {
  if (projectRoot === undefined) return;
  const root = canonicalProjectRoot(projectRoot);
  const locations = new ProjectRepository(storage.db).listLocationsProjects(root);
  if (!locations.some(location => location.id === job.location_id)) {
    throw new AppError("INVALID_PARAMETERS", "job_id ile project_root ayni projeye ait olmali", {
      reason_code: "JOB_PROJECT_MISMATCH",
      job_id: job.id,
      job_project_root: new ProjectRepository(storage.db).getLocation(job.location_id).canonical_root,
      requested_project_root: root,
      required_action: "Kullanicinin hangi projedeki isi istedigini netlestir; secilen proje ve job_id ile tekrar cagir",
    });
  }
}

export function assertAllowedRoot(config: AppConfig, canonicalRoot: string): void {
  if (config.allowed_project_roots.length === 0) {
    return;
  }
  const normalize = (value: string) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
  const candidate = normalize(canonicalRoot);
  const allowed = config.allowed_project_roots.some((root: string) => {
    const resolved = normalize(root);
    return candidate === resolved || candidate.startsWith(resolved.endsWith(sep) ? resolved : resolved + sep);
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
    metadata_scan: import("../domain/agent-contracts.js").InventoryScanResult | null;
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
  let metadataScan: import("../domain/agent-contracts.js").InventoryScanResult | null = null;
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
        // P03: snapshot tam source identity tasir (head/dirty/source/build digest).
        const identity = computeSourceIdentity(canonicalRoot, manifest);
        snapshotId = inventory.writeSnapshot(location.id, identity.head_commit, identity.dirty_digest, identity.source_digest, identity.build_digest, PARSER_VERSION);
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
      // S03/WN25-WN31: refresh istegi metadata envanterini kalici generation/page
      // store'a yazar. Parser/source snapshot ile metadata envanteri ayridir;
      // tarama kaynak kokune yazmaz ve partial sonucu saklar.
      const requiredHashPaths = [".mvn/maven.config", ".mvn/wrapper/maven-wrapper.properties"]
        .filter((path) => existsSync(resolve(canonicalRoot, path)));
      metadataScan = await new InventoryScanService(inventory).scan({
        project_id: projectId,
        location_id: location.id,
        root_path: canonicalRoot,
        required_hash_paths: requiredHashPaths,
        page_size: 250,
        owner_id: `project-inspect:${process.pid}`,
      });
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
      metadata_scan: metadataScan,
    },
    preflight: { status: "ok", reasons: [] },
  };
}

/**
 * P05/PR06: test_start cevabindaki concrete hedef ozeti.
 * Baslangicta kullaniciya donen hedef listesi, runtime/resume/rapor
 * ile birebir ayni frozen listedir (PP23).
 */
export interface ResolvedTargetView {
  selector: string;
  kind: string;
  matches: number;
  fqns: string[];
  module_path: string | null;
  source_set: string | null;
  relative_path: string | null;
  snapshot_id: string;
  concrete_digest: string;
  symbol_id: string | null;
}

export interface TestStartResult {
  job_id: string;
  lifecycle: string;
  phase: string;
  created: boolean;
  resolved_targets?: ResolvedTargetView[];
  ambiguous?: Array<{ selector: string; candidates: string[] }>;
}

export async function handleTestStart(input: unknown, services: Services): Promise<TestStartResult> {
  const parsed = TestStartInputSchema.parse(input);
  const requestedModel = parsed.model_profile ? parseExactModelSpec(parsed.model_profile) : null;
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
  // P03: test_start snapshot'i tam source identity ile yazilir (null digest kaydi
  // "ayni kaynak" kaniti degil; resume identity karsilastirmasi bu kayitla yapilir).
  const startManifest = new SourceSnapshot(canonicalRoot).buildManifest();
  const startIdentity = computeSourceIdentity(canonicalRoot, startManifest);
  if (parsed.coverage_scan_id) {
    const scanJob = jobs.getJob(parsed.coverage_scan_id);
    const scan = readProjectCoverageResult(services, parsed.coverage_scan_id);
    if (!scan || scanJob.lifecycle !== "WAITING_INPUT" || scanJob.outcome !== "COVERAGE_ANALYZED") {
      throw new AppError("INVALID_PARAMETERS", "Coverage taramasi sinif secimine hazir degil");
    }
    if (resolve(scan.project_root).toLowerCase() !== canonicalRoot.toLowerCase() || scan.source_digest !== startIdentity.source_digest || scan.build_digest !== startIdentity.build_digest) {
      throw new AppError("SOURCE_CHANGED", "Proje coverage taramasindan sonra degisti veya baska projeye ait; yeniden tarayin");
    }
    if (parsed.targets.length !== 1 || parsed.targets[0]!.kind !== "class" || !scan.recommendations.some((candidate) => candidate.fqn === parsed.targets[0]!.selector && candidate.suitable)) {
      throw new AppError("INVALID_PARAMETERS", "Onerilerden bir sinifi tam adiyla secin");
    }
  }
  const snapshotId = inventory.writeSnapshot(location.id, startIdentity.head_commit, startIdentity.dirty_digest, startIdentity.source_digest, startIdentity.build_digest, PARSER_VERSION);
  let resolvedTargets: ResolvedTargetView[] | undefined;
  let frozen: import("../discovery/target-resolver.js").FrozenTargetList | undefined;
  let bySelectorGroups: Array<{ selector: string; kind: "class" | "package" | "module"; concrete: Array<{ fqn: string; module_path: string; source_set: "main" | "test" | "unknown"; relative_path: string; symbol_id: string }> }> | undefined;

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

      // P05/PR06: TEK typed resolver - class/package/module ayni donusmez
      // (frozen) concrete listeden cozulur; module yeniden sinif gibi aratilmaz;
      // test/production ayrisimi source-set tabanlidir (Test suffix'i kanit degil).
      const resolution = inventory.resolveFrozenTargets(snapshotId, parsed.targets.map((t) => ({ selector: t.selector, kind: t.kind })));
      if (resolution.not_found.length > 0) {
        throw new AppError("BLOCKED_TARGET_RESOLUTION", `Hedef cozumlenemedi: ${resolution.not_found.join(", ")}`, {
          reason_code: "TARGET_NOT_FOUND",
          not_found: resolution.not_found,
        });
      }
      if (resolution.ambiguous.length > 0) {
        throw new AppError("BLOCKED_TARGET_RESOLUTION", "Hedef tek anlama cozumlenemedi; aday listesi dondu", {
          reason_code: "AMBIGUOUS_TARGET",
          ambiguous: resolution.ambiguous,
        });
      }
      // P05/PR06: TEK resolver - class/package/module ayni donusmez (frozen)
      // concrete listeden cozulur. Baslangicta kullaniciya donen hedef listesi
      // runtime/resume/rapor ile ayni listedir (PP23); module yeniden sinif
      // gibi aratilmaz; test/production ayrisimi source-set tabanlidir.
      const toConcrete = (c: { fqn: string; module_path: string; source_set: "main" | "test" | "unknown"; relative_path: string }): ConcreteTarget => ({
        fqn: c.fqn,
        module_path: c.module_path,
        source_set: c.source_set,
        relative_path: c.relative_path,
        snapshot_id: snapshotId,
      });
      const frozenList = buildFrozenTargetList(
        resolution.targets.map(toConcrete),
        snapshotId,
        parsed.targets.length,
        services.config.discovery.max_concrete_targets,
      );
      frozen = frozenList;
      bySelectorGroups = resolution.bySelector;
      // Selector -> concrete baglantisi resolver'in bySelector grublamasindan gelir;
      // baslangic/contract/goal ayni concrete seti kullanir.
      const selectorGroups = resolution.bySelector.filter((g) => g.selector !== undefined);
      const groupFor = (t: { selector: string; kind: string }) => selectorGroups.find((g) => g.selector === t.selector && g.kind === t.kind)?.concrete ?? [];
      resolvedTargets = parsed.targets.map((t) => {
        const concreteMatches = groupFor(t).map(toConcrete);
        return {
          selector: t.selector,
          kind: t.kind,
          matches: concreteMatches.length,
          fqns: concreteMatches.map((c) => c.fqn),
          module_path: concreteMatches.length === 1 ? concreteMatches[0]!.module_path : null,
          source_set: concreteMatches.length === 1 ? concreteMatches[0]!.source_set : null,
          relative_path: concreteMatches.length === 1 ? concreteMatches[0]!.relative_path : null,
          snapshot_id: snapshotId,
          concrete_digest: frozenList.digest,
          symbol_id: concreteMatches.length === 1 ? groupFor(t)[0]!.symbol_id ?? null : null,
        };
      });
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      // P05/PR06: hedef cozumleme blocker'lar (not found/ambiguous/expansion/
      // source-set) fail-closed; yutulamaz. POM keşif hatasi disinda INVALID_PARAMETERS
      // da propagate olur (onceki davranis korunur).
      if (error.code === "BLOCKED_TARGET_RESOLUTION" || error.code === "INVALID_PARAMETERS") {
        throw error;
      }
    }
  }

  // P05-B/PP23: dispatcher'a selector'suz frozen concrete liste verilemeyen
  // POM-less veya kesintiye ugramis discovery akisinda job olusturma yok.
  if (!resolvedTargets || !frozen || !bySelectorGroups) {
    throw new AppError("BLOCKED_TARGET_RESOLUTION", "Maven hedefleri frozen concrete listeye donusturulemedi", {
      reason_code: "FROZEN_TARGETS_MISSING",
    });
  }

  const digest = requestDigest({
    root: canonicalRoot,
    native_execution: projectNativeExecution(services.config, canonicalRoot),
    targets: parsed.targets,
    coverage: parsed.coverage,
    mode: parsed.mode,
    model_profile: parsed.model_profile,
    idempotency: parsed.idempotency_key,
    ...(parsed.coverage_scan_id ? { coverage_scan_id: parsed.coverage_scan_id } : {}),
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
    sourceSnapshotId: snapshotId,
    phase: "discovery",
  });

  jobs.appendEvent({
    job_id: job.id,
    event_type: "test_start_accepted",
    phase: "discovery",
    origin: "handleTestStart",
  });

  // K02/B05 + P05/PR06: job_targets'a hedefleri frozen concrete kimlikle kalici kaydet
  // (resume GoalContract kaynagi). Tek eslesen hedefte concrete alanlar dolu;
  // package/module expansion'da concrete alanlar selector satirinda null kalir ve
  // frozen liste concrete_digest ile sabitlenir (resolver yeniden sinif aratmaz).
  const insertTarget = storage.db.prepare(
    "INSERT INTO job_targets (id, job_id, symbol_id, module_id, selector, target_kind, resolved_scope_digest, line_target_bps, branch_target_bps, resolved_fqn, module_path, source_set, relative_path, snapshot_id, concrete_digest, created_at) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const t of parsed.targets) {
    const view = resolvedTargets?.find((r) => r.selector === t.selector && r.kind === t.kind);
    const singleFqn = view && view.matches === 1 ? view.fqns[0] ?? null : null;
    insertTarget.run(
      randomUUID(),
      job.id,
      view?.symbol_id ?? null,
      t.selector,
      t.kind,
      parsed.coverage.metrics.includes("LINE") ? percentToBasisPoints(parsed.coverage.percent) : 0,
      parsed.coverage.metrics.includes("BRANCH") ? percentToBasisPoints(parsed.coverage.branch_percent ?? parsed.coverage.percent) : null,
      singleFqn,
      view?.module_path ?? null,
      view?.source_set ?? null,
      view?.relative_path ?? null,
      view?.snapshot_id ?? null,
      view?.concrete_digest ?? null,
      Date.now(),
    );
  }
  // P05/PR06: package/module expansion'in tum concrete listesi selector bagiyla
  // kalici tutulur; resume selector'u yeniden cozumlemez. Ayni concrete iki
  // selector'a ait olabilir, bu nedenle tablo anahtarinda selector bulunur.
  if (bySelectorGroups && frozen) {
    const insertConcrete = storage.db.prepare(
      "INSERT INTO job_target_concretes (job_id, selector, target_kind, fqn, module_path, source_set, relative_path, snapshot_id, concrete_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    for (const group of bySelectorGroups) {
      for (const concrete of group.concrete) {
        insertConcrete.run(
          job.id,
          group.selector,
          group.kind,
          concrete.fqn,
          concrete.module_path,
          concrete.source_set,
          concrete.relative_path,
          snapshotId,
          frozen.digest,
          now,
        );
      }
    }
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
  // P05/PR06: goal hedefleri frozen concrete listeden gelir; dispatcher bu listeyi
  // yeniden cozmek icin selector aramasi yapmaz (tek resolver).
  const lineBps = parsed.coverage.metrics.includes("LINE") ? percentToBasisPoints(parsed.coverage.percent) : 0;
  const branchBps = parsed.coverage.metrics.includes("BRANCH") ? percentToBasisPoints(parsed.coverage.branch_percent ?? parsed.coverage.percent) : 0;
  const concreteForSelector = (t: { selector: string; kind: string }): ConcreteTarget[] => {
    if (!bySelectorGroups || !snapshotId) {
      return [];
    }
    const group = bySelectorGroups.find((g) => g.selector === t.selector && g.kind === t.kind);
    return (group?.concrete ?? []).map((c) => ({
      fqn: c.fqn,
      module_path: c.module_path,
      source_set: c.source_set,
      relative_path: c.relative_path,
      snapshot_id: snapshotId,
    }));
  };
  const goalTargets = parsed.targets.map((t) => ({
    selector: t.selector,
    kind: t.kind,
    concrete_targets: concreteForSelector(t),
    line_target_bps: lineBps,
    branch_target_bps: branchBps,
  }));
  const goal = dispatcher.buildGoalContract(job, goalTargets, canonicalRoot);
  if (parsed.coverage_scan_id) goal.coverage_mode = "cli";
  // P05/PR06: kullanicinin istedigi provider/model GoalContract'a birebir tasinir.
  // Worker bu kimligi prompt cagrisi sirasinda tekrar dogrular; sessiz default yoktur.
  goal.model_profile = parsed.model_profile ?? null;
  // P05/PR06: frozen concrete hedef liste digest'i goal'a sabitlenir;
  // dispatcher dispatch'te ayni digest'i yeniden uretip dogrular (PP23).
  if (frozen) {
    goal.concrete_targets_digest = frozen.digest;
  }

  // FIN01/K02/9.1: Immutable execution contract; is baslamadan sabitlenir.
  // Secretsiz config snapshot'i job'a baglanir; sonradan global config degisince calisan job'un
  // politikalari sessizce degismez.
  const configSnapshot = buildSecretFreeConfigSnapshot(services.config);
  const contract: JobContract = buildJobContract({
    ...(parsed.coverage_scan_id ? { coverage_mode: "cli" as const } : {}),
    job_id: job.id,
    project_id: location.project_id,
    location_id: location.id,
    canonical_root: canonicalRoot,
    request_digest: digest,
    idempotency_key: parsed.idempotency_key ?? null,
    source_snapshot_digest: snapshotId,
    // P05/PR06: contract concrete hedef bilgisiyle kurulur. Class hedefinde
    // tek concrete; package/module expansion'da concrete alanlar selector
    // seviyesinde null kalir (frozen liste concrete_digest ile job_targets'ta).
    resolved_targets: goalTargets.map((t) => {
      const single = t.concrete_targets.length === 1 ? t.concrete_targets[0]! : null;
      return {
        selector: t.selector,
        kind: t.kind as "class" | "package" | "module",
        resolved_fqn: single ? single.fqn : null,
        module_path: single ? single.module_path : null,
        source_set: single ? single.source_set : null,
        relative_path: single ? single.relative_path : null,
        snapshot_id: single ? single.snapshot_id : null,
        concrete_targets: t.concrete_targets.map((c) => ({
          fqn: c.fqn,
          module_path: c.module_path,
          source_set: c.source_set,
          relative_path: c.relative_path,
          snapshot_id: c.snapshot_id,
        })),
        line_target_bps: t.line_target_bps,
        branch_target_bps: t.branch_target_bps,
      };
    }),
    runner_kind: runnerKind,
    model_profile: requestedModel,
    policy_digest: configSnapshot.digest,
    config_digest: configSnapshot.digest,
    config_schema_version: services.config.schema_version,
    budget: {
      max_candidate_iterations: services.config.budgets.max_candidate_iterations,
      max_repairs_per_candidate: services.config.budgets.max_repairs_per_candidate,
      no_progress_window: services.config.budgets.no_progress_window,
      total_job_minutes: services.config.budgets.total_job_minutes,
    },
    parent_contract_digest: null,
    revision: 1,
  });
  jobs.updatePolicyDigest(job.id, contractRef(contract).digest, contract.config_digest, job.row_version);

  const launch = (): void => {
    if (!["QUEUED", "RUNNING"].includes(jobs.getJob(job.id).lifecycle)) return;
    if (goal.coverage_mode === "cli" && jobs.getJob(job.id).lifecycle === "QUEUED") jobs.updateLifecycle(job.id, "RUNNING", jobs.getJob(job.id).row_version);
    void dispatcher.dispatch(job, goal, canonicalRoot).catch((error: unknown) => {
    process.stderr.write(`[aitest-dispatch] job ${job.id} hata: ${String(error)}\n`);
  }); };
  if (goal.coverage_mode === "cli") setImmediate(launch);
  else launch();

  return {
    job_id: job.id,
    lifecycle: job.lifecycle,
    phase: job.phase,
    created: true,
    ...(resolvedTargets !== undefined ? { resolved_targets: resolvedTargets } : {}),
  };
}

export interface TestStatusResult {
  application?: ApplyOperationView;
  job_context: JobContext;
  job_id: string;
  lifecycle: string;
  phase: string;
  outcome: string | null;
  verification_level: string;
  apply_state: string;
  last_trusted_coverage: { percent: number; basisPoints: number } | null;
  report_facts: ReportStatusFacts | null;
  events: Array<{ sequence: number; event_type: string; phase: string | null }>;
  required_action: string | null;
}

export async function handleTestStatus(input: unknown, services: Services): Promise<TestStatusResult> {
  const parsed = TestStatusInputSchema.parse(input);
  const { jobs, storage } = requireServices(services);
  let preparationJobId = parsed.job_id;
  if (!preparationJobId && parsed.project_root) {
    const root = canonicalProjectRoot(parsed.project_root);
    const locations = new ProjectRepository(storage.db).listLocationsProjects(root);
    preparationJobId = jobs.findLatestJobByLocations(locations.map(location => location.id))?.id;
  }
  const prepared = preparationJobId ? prepareReportVerification(services, preparationJobId) : undefined;
  return storage.db.transaction(() => {
    let job: JobRow;
    if (parsed.job_id) {
      job = jobs.getJob(parsed.job_id);
    } else if (parsed.project_root) {
      const canonicalRoot = canonicalProjectRoot(parsed.project_root);
      const projects = new ProjectRepository((requireServices(services)).storage.db);
      const locations = projects.listLocationsProjects(canonicalRoot);
      const latest = jobs.findLatestJobByLocations(locations.map((l) => l.id));
      if (!latest) {
        throw new AppError("INVALID_PARAMETERS", `Bu projede job bulunamadi: ${parsed.project_root}`);
      }
      job = latest;
    } else {
      throw new AppError("INVALID_PARAMETERS", "job_id veya project_root gereklidir");
    }

    assertJobProjectContext(job, parsed.project_root, requireServices(services).storage);
    const publishedVerification = verifyCurrentReport(services, job.id, prepared);
    job = publishedVerification.job ?? job;
    const events = jobs.listEvents(job.id, parsed.event_cursor, 50);
    // K07/B06: last_trusted_coverage yalniz dispatcher final replay DB kanitindan okunur;
    // kullanici checkout'undaki eski XML trusted veri degildir.
    let lastTrustedCoverage: { percent: number; basisPoints: number } | null = null;
    const coverageRow = storage.db
      .prepare<[string], { line_covered: number; line_missed: number }>(
        "SELECT line_covered, line_missed FROM coverage_snapshots WHERE job_id = ? AND before_after = 'after' AND line_validity = 'OK' ORDER BY created_at DESC LIMIT 1",
      )
      .get(job.id);
    if (coverageRow) {
      const total = coverageRow.line_covered + coverageRow.line_missed;
      if (total > 0) {
        const basisPoints = Math.floor((coverageRow.line_covered * 10000) / total);
        lastTrustedCoverage = { percent: basisPoints / 100, basisPoints };
      }
    }
    const reportRoot = join(services.config.storage.root, "jobs", job.id, "reports");
    const reportFacts = publishedVerification.missing.length === 0 && publishedVerification.hash_mismatch.length === 0
      && existsSync(join(reportRoot, "PUBLISHED")) ? publishedVerification.facts ?? null : null;
    return {
      job_id: job.id,
      job_context: jobContext(services, job),
      lifecycle: job.lifecycle,
      phase: job.phase,
      outcome: job.outcome,
      verification_level: job.verification_level,
      apply_state: job.apply_state,
      ...(() => { const application = getApplyOperationView(storage.db, job.id); return application ? { application } : {}; })(),
      last_trusted_coverage: lastTrustedCoverage,
      report_facts: reportFacts,
      events: events.map((e) => ({ sequence: e.sequence, event_type: e.event_type, phase: e.phase })),
      required_action: nextJobAction(services, job),
    };
  }).immediate();
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
    const locations = projects.listLocationsProjects(canonicalRoot);
    if (parsed.project_id && !locations.some(location => location.project_id === parsed.project_id)) {
      throw new AppError("INVALID_PARAMETERS", "project_id ile project_root ayni projeye ait olmali", {
        reason_code: "PROJECT_CONTEXT_MISMATCH",
      });
    }
    locationIds = locations.filter(location => !parsed.project_id || location.project_id === parsed.project_id).map((l) => l.id);
  } else if (parsed.project_id) {
    locationIds = projects.listLocations(parsed.project_id).map((l) => l.id);
  } else if (parsed.view === "projects") {
    locationIds = storage.db.prepare<[], { id: string }>("SELECT id FROM project_locations ORDER BY id").all().map(location => location.id);
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
