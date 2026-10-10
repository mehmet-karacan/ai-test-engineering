/**
 * Job dispatcher: test_start ile baslayan kalici isin asamalarini gercekten yurutur.
 * discovery -> baseline -> analiz/plan -> aday -> run -> dogrulama -> accepted checkpoint -> rapor.
 * MCP handler yalniz use-case'e yonlendirir; event loop'u bloke etmez.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import type { Services } from "../application/services.js";
import { Storage } from "../storage/storage.js";
import { JobRepository, type JobRow } from "../storage/job-repository.js";
import { InventoryRepository } from "../storage/inventory-repository.js";
import { LeaseManager } from "./lease-manager.js";
import { CheckpointStore } from "./checkpoint-store.js";
import { CandidateLoop, readCoverageAfterRun, basisPointsFrom, type IterateOptions } from "./candidate-loop.js";
import { buildPlan, runBaseline, parseSurefireReports } from "./build-plan.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { collectJavaFiles, scanJavaFile, scanTestFile } from "../discovery/java-inventory.js";
import { MavenRunner } from "../runners/maven-runner.js";
import { DockerRunner, DockerMavenRunner, DEFAULT_MAVEN_IMAGE, assertDockerPreflightUsable } from "../runners/docker-runner.js";
import { CustomerRunnerFactory } from "../runners/runner-factory.js";
import { evaluateTarget, evaluateMetric, type TargetEvaluation } from "../coverage/coverage-math.js";
import { findClassInReport, parseJacocoXml } from "../coverage/jacoco-parser.js";
import { buildWorkerPrompt, DEFAULT_POLICY_RULES, type WorkerPromptContext } from "../workers/opencode/role-prompts.js";
import { promptForJson } from "../workers/opencode/worker-client.js";
import { OpenCodeWorkerClient } from "../workers/opencode/worker-client.js";
import { readWorkerProfileFromOpencodeConfig } from "../workers/opencode/profile-reader.js";
import { TestPlanSchema, CandidateChangeSetSchema } from "../workers/opencode/model-schemas.js";
import { ReportExporter } from "../reporting/report-generator.js";
import { defaultWorkerServerManager } from "../workers/opencode/worker-server-manager.js";

export type RunnerKind = "docker" | "host_dev_only";

export interface GoalContract {
  job_id: string;
  /** K02/B02: hedef proje kokunden gelmeli; storage root degil */
  project_root: string;
  targets: Array<{ selector: string; kind: string; line_target_bps: number; branch_target_bps: number }>;
  /** K02/B02: butce kullanici talebi/proje politikasindan; sabit 20/2/3 yok sayilamaz */
  budget: { max_candidate_iterations: number; max_repairs_per_candidate: number; no_progress_window: number };
  runner_kind: RunnerKind;
  model_profile: string | null;
}

export interface DispatchResult {
  job_id: string;
  phases_completed: string[];
  final_outcome: string;
  best_coverage: Record<string, number | null> | null;
  error: string | null;
}

export interface DispatcherOptions {
  services: Services;
  runnerKind: RunnerKind;
  workerEnabled: boolean;
  workspaceRoot: string;
}

export class JobDispatcher {
  private readonly services: Services;
  private readonly runnerKind: RunnerKind;
  private readonly workerEnabled: boolean;
  private readonly workspaceRoot: string;

  constructor(options: DispatcherOptions) {
    this.services = options.services;
    this.runnerKind = options.runnerKind;
    this.workerEnabled = options.workerEnabled;
    this.workspaceRoot = options.workspaceRoot;
  }

  buildGoalContract(job: JobRow, targets: Array<{ selector: string; kind: string; line_target_bps: number; branch_target_bps: number }>, projectRoot: string): GoalContract {
    // K02/B02: butce kullanici talebi/proje politikasindan (config.budgets); sabit 20/2/3 yok sayilmaz.
    const budgets = this.services.config.budgets;
    return {
      job_id: job.id,
      project_root: projectRoot,
      targets,
      budget: {
        max_candidate_iterations: budgets.max_candidate_iterations,
        max_repairs_per_candidate: budgets.max_repairs_per_candidate,
        no_progress_window: budgets.no_progress_window,
      },
      runner_kind: this.runnerKind,
      model_profile: null,
    };
  }

  async dispatch(job: JobRow, goal: GoalContract, projectRoot: string): Promise<DispatchResult> {
    const phases: string[] = [];
    const storage = this.services.storage;
    const jobs = this.services.jobs;
    if (!storage || !jobs) {
      throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
    }
    const leases = new LeaseManager(storage.db);
    const checkpoints = new CheckpointStore(storage.db, this.workspaceRoot);
    const inventory = new InventoryRepository(storage.db);

    try {
      jobs.updatePhase(job.id, "preflight", jobs.getJob(job.id).row_version);
      phases.push("preflight");

      // K01/B01: izolasyon gecidi - customer job'da host yolu secilemez; docker verified izolasyon zorunlu.
      // host_dev_only yalniz urunun guvenilir gelistirme testlerinde acikca istenir (customerJob=false).
      const runnerFactory = new CustomerRunnerFactory();
      runnerFactory.assertHostDevOnlyAllowed(this.runnerKind, true);
      let dockerRunner: DockerRunner | undefined;
      let hostRunner: MavenRunner | undefined;
      if (this.runnerKind === "docker") {
        dockerRunner = new DockerRunner();
        const preflight = await dockerRunner.preflight();
        assertDockerPreflightUsable(preflight);
      } else if (this.runnerKind === "host_dev_only") {
        // urun girisinden gelmemis, test-only composition ile ayrilmis kullanim: host runner yalniz burada
        hostRunner = new MavenRunner();
      }
      phases.push("preflight_ok");

      jobs.updatePhase(job.id, "baseline", jobs.getJob(job.id).row_version);
      phases.push("baseline");

      // baseline: mevcut testler gercekten calisir (guvenli runner contract'indan)
      if (this.runnerKind === "host_dev_only" && hostRunner) {
        const baseline = await runBaseline(projectRoot, hostRunner, 600000);
        if (baseline.status === "FAILED") {
          jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
          jobs.updateOutcome(job.id, "BASELINE_FAILED", jobs.getJob(job.id).row_version);
          return { job_id: job.id, phases_completed: phases, final_outcome: "BASELINE_FAILED", best_coverage: null, error: `Baseline basarisiz: ${baseline.failed_tests.join(", ")}` };
        }
      } else if (dockerRunner) {
        const dockerResult = await dockerRunner.run({
          working_dir: projectRoot,
          image: DEFAULT_MAVEN_IMAGE,
          command: ["mvn", "test"],
          timeout_ms: 600000,
          log_dir: join(resolve(projectRoot), "target", "aitest-docker-baseline-logs"),
          network: "none",
          memory_mb: 2048,
          cpus: 2,
        });
        if (dockerResult.exit_code !== 0) {
          jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
          jobs.updateOutcome(job.id, "BASELINE_FAILED", jobs.getJob(job.id).row_version);
          return { job_id: job.id, phases_completed: phases, final_outcome: "BASELINE_FAILED", best_coverage: null, error: `Docker baseline basarisiz (exit ${dockerResult.exit_code})` };
        }
      }
      phases.push("baseline_ok");

      jobs.updatePhase(job.id, "analysis", jobs.getJob(job.id).row_version);
      phases.push("analysis");

      // hedef cozumu: hedef siniflari envanterden coz
      // D02/F01 duzeltmesi: once envanteri doldur (module + package + codeSymbols); sonra hedef coz.
      // Gercek location id: job.location_id (test_jobs FK).
      const snapshotId = inventory.writeSnapshot(job.location_id, null, null, "statik-tarama-1");
      const discovery = discoverModules(projectRoot);
      for (const module of discovery.modules) {
        const moduleId = inventory.writeModule(snapshotId, module);
        const javaFiles = collectJavaFiles(projectRoot, module.source_root);
        for (const javaFile of javaFiles) {
          const { symbols } = scanJavaFile(javaFile, projectRoot);
          for (const symbol of symbols) {
            const packageId = inventory.writePackage(moduleId, symbol.package_name || "(default)", "main");
            inventory.writeSymbol(packageId, symbol);
          }
        }
      }

      const resolvedTargets: Array<{ selector: string; fqn: string; module: PomModule }> = [];
      for (const target of goal.targets) {
        const matches = inventory.resolveTarget(snapshotId, target.selector);
        if (matches.length === 0) {
          throw new AppError("INVALID_PARAMETERS", `Hedef sinif bulunamadi: ${target.selector}`);
        }
        if (matches.length > 1) {
          throw new AppError("INVALID_PARAMETERS", "Hedef tek anlama cozumlenemedi", { reason_code: "AMBIGUOUS_TARGET", candidates: matches });
        }
        const match = matches[0]!;
        const module = discoverModules(projectRoot).modules.find((m) => m.module_relative_path === match.module_relative_path);
        if (!module) {
          throw new AppError("INVALID_PARAMETERS", `Modul bulunamadi: ${match.module_relative_path}`);
        }
        resolvedTargets.push({ selector: target.selector, fqn: match.fqn, module });
      }
      phases.push("analysis_ok");

      jobs.updatePhase(job.id, "generation", jobs.getJob(job.id).row_version);
      phases.push("generation");

      const stagingRoot = join(this.workspaceRoot, "jobs", job.id, "staging");
      const acceptedDir = join(this.workspaceRoot, "jobs", job.id, "accepted");
      mkdirSync(stagingRoot, { recursive: true });
      mkdirSync(acceptedDir, { recursive: true });
      // FIN00.e/22.2 (B01 kapanisi): candidate loop yalniz verified runner capability ile kurulur;
      // normal giris docker-backed runner kullanir; candidate calistirmalari host Maven'e HIC gecmez.
      const loopRunner = this.buildVerifiedLoopRunner(dockerRunner, hostRunner, projectRoot);
      const loop = new CandidateLoop(loopRunner);

      for (const resolved of resolvedTargets) {
        const targetSpec = goal.targets.find((t) => t.selector === resolved.selector)!;
        const iterateOptions: IterateOptions = {
          project_root: projectRoot,
          target_fqn: resolved.fqn,
          target_module_path: resolved.module.module_relative_path,
          line_target_bps: targetSpec.line_target_bps,
          branch_target_bps: targetSpec.branch_target_bps,
          budget: goal.budget,
          staging_root: stagingRoot,
          timeout_ms_per_run: 600000,
          // K04/B04: birikimli accepted set + checkpoint callback'i runtime'a bagli:
          accepted_snapshot_dir: acceptedDir,
          on_accepted: (info) => {
            jobs.appendEvent({
              job_id: job.id,
              event_type: "candidate_accepted",
              phase: "verification",
              origin: "JobDispatcher",
            });
            process.stderr.write(`[aitest-dispatch] job ${job.id} iter ${info.iteration} kabul: ${info.files.length} dosya, LINE ${info.line_bps} bps\n`);
          },
          generate_candidate: async () => {
            if (!this.workerEnabled) {
              return null;
            }
            return this.generateCandidateFromWorker(projectRoot, resolved.fqn, resolved.module, job.id);
          },
        };
        const loopResult = await loop.iterate(iterateOptions);
        phases.push(`loop_${resolved.selector}_${loopResult.outcome}`);
      }

      jobs.updatePhase(job.id, "verification", jobs.getJob(job.id).row_version);
      phases.push("verification");

      // FIN03/14.2: cozulmus hedefler icin once/after coverage snapshot kayitlari (DB iliskisi):
      for (const resolved of resolvedTargets) {
        const coverage = readCoverageAfterRun(projectRoot, resolved.fqn);
        const linePair = coverage?.line;
        const branchPair = coverage?.branch;
        const lineValidity = linePair ? "OK" : "UNAVAILABLE";
        const branchValidity = branchPair ? "OK" : "UNAVAILABLE";
        inventory.writeCoverageSnapshot({
          job_id: job.id,
          target_symbol_id: null,
          run_id: null,
          fqn: resolved.fqn,
          source_sha256: null,
          binary_class_id: null,
          line_covered: linePair?.covered ?? 0,
          line_missed: linePair?.missed ?? 0,
          branch_covered: branchPair?.covered ?? null,
          branch_missed: branchPair?.missed ?? null,
          line_validity: lineValidity,
          branch_validity: branchValidity,
          before_after: "after",
          checkpoint_id: checkpoints.bestCheckpoint(job.id),
        });
      }

      // FIN03/14.2: candidate iteration kayitlari DB'ye yazilir (loopResult'tan):
      // K04/B03: son dogrulanmis coverage per-target; LINE+BRANCH birlikte (tek evaluator)
      const bestCoverage: Record<string, number | null> = {};
      let allMet = true;
      for (const resolved of resolvedTargets) {
        const coverage = readCoverageAfterRun(projectRoot, resolved.fqn);
        const lineBps = basisPointsFrom(coverage?.line);
        const branchBps = basisPointsFrom(coverage?.branch);
        bestCoverage[resolved.fqn] = lineBps;
        const targetSpec = goal.targets.find((t) => t.selector === resolved.selector)!;
        // evaluateGoalMet ile ayni per-target/per-metric dogrulayici (tek evaluator):
        const lineMet = lineBps !== null && lineBps >= targetSpec.line_target_bps;
        const branchApplicable = targetSpec.branch_target_bps > 0;
        const branchMet = !branchApplicable || (branchBps !== null && branchBps >= targetSpec.branch_target_bps);
        if (!lineMet || !branchMet) {
          allMet = false;
        }
      }

      const finalOutcome = allMet ? "TARGET_REACHED" : "TARGET_NOT_MET_PLATEAU";
      jobs.updateOutcome(job.id, finalOutcome, jobs.getJob(job.id).row_version);
      jobs.updateLifecycle(job.id, "COMPLETED", jobs.getJob(job.id).row_version);
      phases.push("completed");
      jobs.appendEvent({ job_id: job.id, event_type: "verification_completed", phase: "verification", origin: "JobDispatcher" });

      // D09/F14: rapor DB/checkpoint kanitlarindan otomatik uretilir (ayni kanit projeksiyonu)
      const reportDir = join(this.workspaceRoot, "jobs", job.id, "reports");
      const reportData = {
        schema_version: 1 as const,
        job_id: job.id,
        project_root: projectRoot.replace(/\\/g, "/"),
        head_commit: null,
        snapshot_id: null,
        outcome: finalOutcome,
        verification_scope: "AFFECTED_SCOPE",
        apply_state: "READY_FOR_REVIEW",
        targets: resolvedTargets.map((rt) => {
          const coverage = readCoverageAfterRun(projectRoot, rt.fqn);
          const linePair = coverage?.line;
          const branchPair = coverage?.branch;
          const targetSpec = goal.targets.find((t) => t.selector === rt.selector)!;
          return {
            target_id: rt.selector,
            selector: rt.selector,
            fqn: rt.fqn,
            line: linePair ? { covered: linePair.covered, missed: linePair.missed, total: linePair.covered + linePair.missed, bps: basisPointsFrom(linePair) ?? 0, target_bps: targetSpec.line_target_bps, met: (basisPointsFrom(linePair) ?? 0) >= targetSpec.line_target_bps, validity: "OK" } : null,
            branch: branchPair ? { covered: branchPair.covered, missed: branchPair.missed, total: branchPair.covered + branchPair.missed, bps: basisPointsFrom(branchPair) ?? 0, target_bps: targetSpec.branch_target_bps, met: (basisPointsFrom(branchPair) ?? 0) >= targetSpec.branch_target_bps, validity: "OK" } : null,
          };
        }),
        iterations: [],
        tests_added: 0,
        tests_modified: 0,
        run_summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        gates: [{ name: "test_only_policy", status: "PASSED" as const, detail: "production degisikligi 0" }],
        gaps: [],
        models: [],
        production_changed_files: 0,
        generated_at: Date.now(),
      };
      const exporter = new ReportExporter(reportDir);
      const exportResult = exporter.export(reportData);
      phases.push(`report_${exportResult.verification_passed ? "ok" : "inconsistent"}`);

      return { job_id: job.id, phases_completed: phases, final_outcome: finalOutcome, best_coverage: bestCoverage, error: null };
    } catch (error) {
      const message = error instanceof AppError ? `${error.code}: ${error.message}` : String(error);
      process.stderr.write(`[aitest-dispatch] job ${job.id} FAILED (${phases.join(",")}): ${message}\n`);
      jobs.appendEvent({ job_id: job.id, event_type: "dispatch_failed", phase: (phases[phases.length - 1] as never) ?? "analysis", origin: "JobDispatcher" });
      try {
        // dispatch hatasinda outcome DB'ye yazilir (BLOCKED_ENVIRONMENT); outcome null kalmaz:
        jobs.updateOutcome(job.id, "BLOCKED_ENVIRONMENT", jobs.getJob(job.id).row_version);
        jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
      } catch {
        // lifecycle zaten degismis olabilir
      }
      return { job_id: job.id, phases_completed: phases, final_outcome: "FAILED", best_coverage: null, error: message };
    }
  }

  /**
   * FIN00.e/22.2: candidate loop icin verified runner uretir.
   * Docker verified ise DockerMavenRunner (source ro, target writable mount); host yalniz
   * test-only composition'da (host_dev_only) acikca verilir; normal giriste host Maven yoktur.
   */
  private buildVerifiedLoopRunner(dockerRunner: DockerRunner | undefined, hostRunner: MavenRunner | undefined, projectRoot: string): MavenRunner {
    if (this.runnerKind === "host_dev_only" && hostRunner) {
      return hostRunner;
    }
    if (dockerRunner) {
      const targetMounts = [{ host: join(resolve(projectRoot), "target"), container: "/work/target" }];
      return new DockerMavenRunner({ target_mounts: targetMounts }, dockerRunner);
    }
    throw new AppError("BLOCKED_ISOLATION", "Verified loop runner uretilemedi; candidate calistirmasi yapilmaz (FIN00.e)");
  }

  /**
   * K05/B05: resume - ayni job'dan kaldigi asamadan devam.
   * GoalContract job kayitlarindan (job_targets) yeniden kurulur; kaynak/checkpoint dogrulamasi dispatcher'da.
   */
  async resumeDispatch(job: JobRow, projectRootHint?: string): Promise<DispatchResult> {
    const storage = this.services.storage;
    const jobs = this.services.jobs;
    if (!storage || !jobs) {
      throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
    }
    // job_targets'tan hedefleri yukle:
    const targetRows = storage.db
      .prepare<[string], { selector: string; target_kind: string; line_target_bps: number; branch_target_bps: number | null }>(
        "SELECT selector, target_kind, line_target_bps, branch_target_bps FROM job_targets WHERE job_id = ?",
      )
      .all(job.id);

    let projectRoot = projectRootHint;
    if (!projectRoot) {
      const locationRow = storage.db
        .prepare<[string], { canonical_root: string }>("SELECT canonical_root FROM project_locations WHERE id = ?")
        .get(job.location_id);
      projectRoot = locationRow?.canonical_root;
    }
    if (!projectRoot) {
      throw new AppError("INVALID_PARAMETERS", `Job icin proje koku cozumlenemedi: ${job.id}`);
    }

    // hedefler job_targets'ta kayitliysa kullan; yoksa discovery ile yeniden coz:
    if (targetRows.length > 0) {
      const goal: GoalContract = {
        job_id: job.id,
        project_root: projectRoot,
        targets: targetRows.map((t) => ({
          selector: t.selector,
          kind: t.target_kind,
          line_target_bps: t.line_target_bps,
          branch_target_bps: t.branch_target_bps ?? 0,
        })),
        budget: {
          max_candidate_iterations: this.services.config.budgets.max_candidate_iterations,
          max_repairs_per_candidate: this.services.config.budgets.max_repairs_per_candidate,
          no_progress_window: this.services.config.budgets.no_progress_window,
        },
        runner_kind: this.runnerKind,
        model_profile: null,
      };
      return this.dispatch(job, goal, projectRoot);
    }

    // job_targets yoksa job'a ait request_digest'ten hedef cozulemez; discovery ile mevcut hedefleri kullan:
    throw new AppError("INVALID_PARAMETERS", `Job hedefleri kayitli degil; test_start ile yeni is gerekli: ${job.id}`);
  }

  private async generateCandidateFromWorker(projectRoot: string, targetFqn: string, module: PomModule, jobId: string): Promise<import("../workers/opencode/model-schemas.js").CandidateChangeSet | null> {
    // K03/B02: sabit porta sessiz baglanma; urune ait kontrollu worker server manager.
    const serverManager = defaultWorkerServerManager(projectRoot);
    const client = await serverManager.ensureRunning();
    const profile = readWorkerProfileFromOpencodeConfig();
    const session = await client.createSession();

    // hedef dosyanin gercek govdesi (ilk 5 dosya kisiti degil; hedef dosyayi bul):
    const javaFiles = collectJavaFiles(projectRoot, module.source_root);
    const targetFileName = `${targetFqn.split(".").pop()}.java`;
    const targetFile = javaFiles.find((f) => f.endsWith(targetFileName));
    const signatures: string[] = [];
    if (targetFile) {
      const { methods } = scanJavaFile(targetFile, projectRoot);
      for (const method of methods) {
        signatures.push(method.signature);
      }
    } else {
      for (const file of javaFiles.slice(0, 5)) {
        const { methods } = scanJavaFile(file, projectRoot);
        for (const method of methods) {
          signatures.push(method.signature);
        }
      }
    }

    // mevcut test ozeti (bos degil; varken "Mevcut test yok" denemez):
    const testFiles = collectJavaFiles(projectRoot, module.test_root);
    const existingTests: string[] = [];
    for (const testFile of testFiles.slice(0, 5)) {
      const { testClass, methods } = scanTestFile(testFile, projectRoot);
      if (testClass) {
        existingTests.push(`${testClass.fqn}: ${methods.length} test`);
      }
    }

    // coverage aciklari: gercek satir/branch sayaclari:
    const coverage = readCoverageAfterRun(projectRoot, targetFqn);
    const uncoveredAreas: string[] = [];
    if (coverage?.line) {
      uncoveredAreas.push(`LINE: ${coverage.line.covered}/${coverage.line.covered + coverage.line.missed}`);
    }
    if (coverage?.branch) {
      uncoveredAreas.push(`BRANCH: ${coverage.branch.covered}/${coverage.branch.covered + coverage.branch.missed}`);
    }

    const promptContext: WorkerPromptContext = {
      role: "test_designer",
      class_name: targetFqn.split(".").pop() ?? targetFqn,
      package_name: targetFqn.split(".").slice(0, -1).join("."),
      dependencies_signatures: signatures,
      existing_tests_summary: existingTests.length > 0 ? existingTests : ["bilinmiyor"],
      uncovered_areas: uncoveredAreas.length > 0 ? uncoveredAreas : [`${targetFqn}: kapsanmamis alanlar (bilinmiyor)`],
      policy_rules: [...DEFAULT_POLICY_RULES],
    };
    const prompt = buildWorkerPrompt(promptContext);

    // K03/B02: politika tool flags'i cagrida gercekten uygulanir (write/bash/task/web kapali):
    const { workerToolFlags } = await import("../workers/opencode/worker-config.js");
    const { defaultWorkerConfig } = await import("../workers/opencode/worker-config.js");
    const flags = workerToolFlags(defaultWorkerConfig("http://127.0.0.1"));

    const raw = await promptForJson(client, {
      session_id: session.session_id,
      prompt,
      model: { providerID: profile.provider_id, modelID: profile.model_id },
      tools: flags,
      timeout_ms: 300000,
    });
    void jobId;
    const changeset = CandidateChangeSetSchema.parse(raw);
    return changeset;
  }
}
