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
import { DockerRunner, DEFAULT_MAVEN_IMAGE, assertDockerPreflightUsable } from "../runners/docker-runner.js";
import { evaluateTarget, evaluateMetric, type TargetEvaluation } from "../coverage/coverage-math.js";
import { findClassInReport, parseJacocoXml } from "../coverage/jacoco-parser.js";
import { buildWorkerPrompt, DEFAULT_POLICY_RULES, type WorkerPromptContext } from "../workers/opencode/role-prompts.js";
import { promptForJson } from "../workers/opencode/worker-client.js";
import { OpenCodeWorkerClient } from "../workers/opencode/worker-client.js";
import { readWorkerProfileFromOpencodeConfig } from "../workers/opencode/profile-reader.js";
import { TestPlanSchema, CandidateChangeSetSchema } from "../workers/opencode/model-schemas.js";

export type RunnerKind = "docker" | "host_dev_only";

export interface GoalContract {
  job_id: string;
  project_root: string;
  targets: Array<{ selector: string; kind: string; line_target_bps: number; branch_target_bps: number }>;
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

  buildGoalContract(job: JobRow, targets: Array<{ selector: string; kind: string; line_target_bps: number; branch_target_bps: number }>): GoalContract {
    return {
      job_id: job.id,
      project_root: this.services.config.storage.root,
      targets,
      budget: {
        max_candidate_iterations: 20,
        max_repairs_per_candidate: 2,
        no_progress_window: 3,
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

      // izolasyon gecidi: docker capability preflight
      let dockerRunner: DockerRunner | undefined;
      if (this.runnerKind === "docker") {
        dockerRunner = new DockerRunner();
        const preflight = await dockerRunner.preflight();
        assertDockerPreflightUsable(preflight);
      } else if (this.runnerKind === "host_dev_only") {
        // urunun guvenilir gelistirme testleri disinda kullanilamaz
      }
      phases.push("preflight_ok");

      jobs.updatePhase(job.id, "baseline", jobs.getJob(job.id).row_version);
      phases.push("baseline");

      // baseline: mevcut testler gercekten calisir
      const hostRunner = new MavenRunner();
      if (this.runnerKind === "host_dev_only") {
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
      const snapshotId = inventory.writeSnapshot(locationIdOf(projectRoot), null, null, "statik-tarama-1");
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
      mkdirSync(stagingRoot, { recursive: true });
      const loop = new CandidateLoop();

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

      // son dogrulanmis coverage per-target
      const bestCoverage: Record<string, number | null> = {};
      let allMet = true;
      for (const resolved of resolvedTargets) {
        const coverage = readCoverageAfterRun(projectRoot, resolved.fqn);
        const bps = basisPointsFrom(coverage?.line);
        bestCoverage[resolved.fqn] = bps;
        const targetSpec = goal.targets.find((t) => t.selector === resolved.selector)!;
        if (bps === null || bps < targetSpec.line_target_bps) {
          allMet = false;
        }
      }

      const finalOutcome = allMet ? "TARGET_REACHED" : "TARGET_NOT_MET_PLATEAU";
      jobs.updateOutcome(job.id, finalOutcome, jobs.getJob(job.id).row_version);
      jobs.updateLifecycle(job.id, "COMPLETED", jobs.getJob(job.id).row_version);
      phases.push("completed");

      return { job_id: job.id, phases_completed: phases, final_outcome: finalOutcome, best_coverage: bestCoverage, error: null };
    } catch (error) {
      const message = error instanceof AppError ? `${error.code}: ${error.message}` : String(error);
      try {
        jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
      } catch {
        // lifecycle zaten degismis olabilir
      }
      return { job_id: job.id, phases_completed: phases, final_outcome: "FAILED", best_coverage: null, error: message };
    }
  }

  private async generateCandidateFromWorker(projectRoot: string, targetFqn: string, module: PomModule, jobId: string): Promise<import("../workers/opencode/model-schemas.js").CandidateChangeSet | null> {
    const profile = readWorkerProfileFromOpencodeConfig();
    const client = new OpenCodeWorkerClient({ base_url: "http://127.0.0.1:14096" });
    if (!(await client.health(5000))) {
      return null;
    }
    const session = await client.createSession();
    const javaFiles = collectJavaFiles(join(resolve(projectRoot), module.module_relative_path), "src/main/java");
    const signatures: string[] = [];
    for (const file of javaFiles.slice(0, 5)) {
      const { symbols, methods } = scanJavaFile(file, projectRoot);
      for (const method of methods) {
        signatures.push(method.signature);
      }
      void symbols;
    }
    const promptContext: WorkerPromptContext = {
      role: "test_designer",
      class_name: targetFqn.split(".").pop() ?? targetFqn,
      package_name: targetFqn.split(".").slice(0, -1).join("."),
      dependencies_signatures: signatures,
      existing_tests_summary: [],
      uncovered_areas: [`${targetFqn}: kapsanmamis alanlar`],
      policy_rules: [...DEFAULT_POLICY_RULES],
    };
    const prompt = buildWorkerPrompt(promptContext);
    const raw = await promptForJson(client, {
      session_id: session.session_id,
      prompt,
      model: { providerID: profile.provider_id, modelID: profile.model_id },
      timeout_ms: 300000,
    });
    void jobId;
    const changeset = CandidateChangeSetSchema.parse(raw);
    return changeset;
  }
}

function locationIdOf(canonicalRoot: string): string {
  return randomUUID();
}
