/**
 * Job dispatcher: test_start ile baslayan kalici isin asamalarini gercekten yurutur.
 * discovery -> baseline -> analiz/plan -> aday -> run -> dogrulama -> accepted checkpoint -> rapor.
 * MCP handler yalniz use-case'e yonlendirir; event loop'u bloke etmez.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import type { Services } from "../application/services.js";
import type { JobRow } from "../storage/job-repository.js";
import { InventoryRepository } from "../storage/inventory-repository.js";
import { LeaseManager } from "./lease-manager.js";
import { CheckpointStore, resumeBudgetFromManifest, type AcceptedBlob } from "./checkpoint-store.js";
import { RecoveryManager } from "./recovery-manager.js";
import { SourceSnapshot, computeSourceIdentity, type SourceIdentity, type SnapshotManifest } from "../discovery/source-snapshot.js";
import type { JobContract } from "../domain/job-contract.js";
import { CandidateLoop, readCoverageAfterRun, basisPointsFrom, type IterateOptions, type IterationLoopResult } from "./candidate-loop.js";
import { runBaseline } from "./build-plan.js";
import { discoverModules, type PomModule } from "../discovery/pom-discovery.js";
import { collectJavaFiles, scanJavaFile, scanTestFile } from "../discovery/java-inventory.js";
import { MavenRunner } from "../runners/maven-runner.js";
import { DockerRunner, DockerMavenRunner, scanMavenSettingsForSecrets } from "../runners/docker-runner.js";
import { CustomerRunnerFactory } from "../runners/runner-factory.js";
import { evaluateTarget, evaluateMetric } from "../coverage/coverage-math.js";
import { buildWorkerPrompt, DEFAULT_POLICY_RULES, type WorkerPromptContext } from "../workers/opencode/role-prompts.js";
import { promptForJsonResult, WorkerRequestFailure, type WorkerPromptResult } from "../workers/opencode/worker-client.js";
import { readWorkerProfileFromOpencodeConfig } from "../workers/opencode/profile-reader.js";
import { CandidateChangeSetSchema } from "../workers/opencode/model-schemas.js";
import { ReportExporter } from "../reporting/report-generator.js";
import { defaultWorkerServerManager } from "../workers/opencode/worker-server-manager.js";
import { buildFrozenTargetList, rebuildFrozenTargetDigest, type ConcreteTarget } from "../discovery/target-resolver.js";

export type RunnerKind = "docker" | "host_dev_only";

export interface GoalContract {
  job_id: string;
  /** K02/B02: hedef proje kokunden gelmeli; storage root degil */
  project_root: string;
  /**
   * P05/PR06: hedefler frozen concrete listeden gelir (tek resolver).
   * `concrete_targets` bos iken (eski/legacy goal) dispatch fail-closed RED;
   * selector yeniden sinif gibi aratilmaz.
   */
  targets: Array<{
    selector: string;
    kind: string;
    concrete_targets: ConcreteTarget[];
    line_target_bps: number;
    branch_target_bps: number;
  }>;
  /** K02/B02: butce kullanici talebi/proje politikasindan; sabit 20/2/3 yok sayilamaz */
  budget: { max_candidate_iterations: number; max_repairs_per_candidate: number; no_progress_window: number };
  runner_kind: RunnerKind;
  model_profile: string | null;
  /** Resume'da son accepted iteration sonrasi baslangic ordinal'i. */
  start_iteration?: number;
  /** P05/PR06: frozen concrete hedef liste digest'i (servis/dispatcher tutarliligi). */
  concrete_targets_digest?: string | null;
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

// MCP cancel yeni JobDispatcher ornegi uzerinden gelebilir. Kaynak sahipligi
// instance alaninda tutulursa aktif worker/runner bulunamaz; registry job kimligi
// ile sinirli tutulur ve yabanci process'e dokunulmaz.
const ownedWorkerServers = new Map<string, import("../workers/opencode/worker-server-manager.js").WorkerServerManager>();
const ownedRunners = new Map<string, MavenRunner>();

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

  buildGoalContract(
    job: JobRow,
    targets: Array<{
      selector: string;
      kind: string;
      concrete_targets: ConcreteTarget[];
      line_target_bps: number;
      branch_target_bps: number;
    }>,
    projectRoot: string,
  ): GoalContract {
    // K02/B02: butce kullanici talebi/proje politikasindan (config.budgets); sabit 20/2/3 yok sayilamaz.
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
      concrete_targets_digest: null,
    };
  }

  async dispatch(job: JobRow, goal: GoalContract, projectRoot: string, executionOwnerId?: string): Promise<DispatchResult> {
    const phases: string[] = [];
    const storage = this.services.storage;
    const jobs = this.services.jobs;
    if (!storage || !jobs) {
      throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
    }
    const leases = new LeaseManager(storage.db);
    const checkpoints = new CheckpointStore(storage.db, this.workspaceRoot);
    const inventory = new InventoryRepository(storage.db);
    const ownerId = executionOwnerId ?? `dispatch-${process.pid}-${job.id}`;
    const leaseTtlMs = 300000;
    let leaseAcquired = false;
    let activeLease: { owner_id: string; fencing_token: number } | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let leaseLost = false;
    // P03/PP15: total job time butcesi kesinti sonrasi da korunur (kalicilik).
    let jobDeadlineAt: number;
    const assertJobDeadline = (): void => {
      if (Date.now() > jobDeadlineAt) {
        throw new AppError("POLICY_VIOLATION", "Toplam job sure butcesi asildi", { reason_code: "JOB_DEADLINE_EXCEEDED" });
      }
    };
    const assertLease = (): void => {
      if (!activeLease || leaseLost) {
        throw new AppError("POLICY_VIOLATION", "Dispatch lease kaybedildi; yeni sonuc yazilamaz", { reason_code: "LEASE_LOST" });
      }
      leases.assertFence(job.id, activeLease.owner_id, activeLease.fencing_token);
    };
    const stopHeartbeat = (): void => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };
    const startHeartbeat = (): void => {
      heartbeatTimer = setInterval(() => {
        if (!activeLease) {
          return;
        }
        try {
          leases.renew(job.id, ownerId, leaseTtlMs);
        } catch (error) {
          leaseLost = true;
          process.stderr.write(`[aitest-dispatch] job ${job.id} heartbeat lease kaybi: ${String(error)}\n`);
          this.stopOwnedProcesses(job.id);
        }
      }, Math.max(1000, Math.floor(leaseTtlMs / 3)));
      heartbeatTimer.unref?.();
    };

    try {
      const acquired = leases.acquire(job.id, ownerId, leaseTtlMs, `dispatcher-${process.pid}`);
      if (acquired.previous_owner_alive) {
        throw new AppError("POLICY_VIOLATION", "Job baska aktif owner tarafindan calistiriliyor", { reason_code: "LEASE_HELD" });
      }
      leaseAcquired = true;
      activeLease = { owner_id: acquired.lease.owner_id, fencing_token: acquired.lease.fencing_token };
      startHeartbeat();
      assertLease();
      jobs.updatePhase(job.id, "preflight", jobs.getJob(job.id).row_version);
      phases.push("preflight");
      // P03/PP15: total job deadline created_at + config total_job_minutes;
      // resume'da global config ile sifirlanmaz (ayni job satiri kullanilir).
      jobDeadlineAt = jobs.getJob(job.id).created_at + this.services.config.budgets.total_job_minutes * 60000;
      assertJobDeadline();

      // K01/B01: izolasyon gecidi - customer job'da host yolu secilemez; docker verified izolasyon zorunlu.
      // host_dev_only yalniz urunun guvenilir gelistirme testlerinde acikca istenir (customerJob=false).
      // P04/PP16: normal MCP customer job'u GERCEK verified capability probe sonucu olmadan baslamaz;
      // ensureVerified probe yolunu zorunlu kullanir (docker info/image tek basina kanit degil - PR04).
      const runnerFactory = new CustomerRunnerFactory();
      runnerFactory.assertHostDevOnlyAllowed(this.runnerKind, true);
      let dockerRunner: DockerRunner | undefined;
      let dockerImage: string | undefined;
      let hostRunner: MavenRunner | undefined;
      if (this.runnerKind === "docker") {
        // P04/PR04: ensureVerified preflight + tam capability probe calistirir;
        // probe basarisizsa BLOCKED_ISOLATION ile job fail-closed (host fallback yok).
        const capability = await runnerFactory.ensureVerified({ workspaceRoot: join(this.workspaceRoot, "jobs", job.id, "probe") });
        dockerRunner = capability.docker ?? undefined;
        if (capability.image) {
          dockerImage = capability.image;
        }
        jobs.appendEvent({
          job_id: job.id,
          event_type: "isolation_capability_verified",
          phase: "preflight",
          origin: "JobDispatcher",
        });
      } else if (this.runnerKind === "host_dev_only") {
        // urun girisinden gelmemis, test-only composition ile ayrilmis kullanim: host runner yalniz burada
        hostRunner = new MavenRunner();
        ownedRunners.set(job.id, hostRunner);
      }
      phases.push("preflight_ok");

      assertLease();
      jobs.updatePhase(job.id, "baseline", jobs.getJob(job.id).row_version);
      phases.push("baseline");

      // baseline: mevcut testler gercekten calisir (guvenli runner contract'indan)
      if (this.runnerKind === "host_dev_only" && hostRunner) {
        const baseline = await runBaseline(projectRoot, hostRunner, 600000);
        if (baseline.status === "FAILED") {
          const latest = jobs.getJob(job.id);
          if (latest.lifecycle === "CANCELLED" || latest.lifecycle === "PAUSED") {
            throw new AppError("POLICY_VIOLATION", "Baseline iptal/pause sonrasinda tamamlandi", { reason_code: latest.lifecycle });
          }
          jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
          jobs.updateOutcome(job.id, "BASELINE_FAILED", jobs.getJob(job.id).row_version);
          return { job_id: job.id, phases_completed: phases, final_outcome: "BASELINE_FAILED", best_coverage: null, error: `Baseline basarisiz: ${baseline.failed_tests.join(", ")}` };
        }
      } else if (dockerRunner) {
        // KRITIK BULGU duzeltmesi: baseline da DockerMavenRunner uzerinden calisir (provisioning + izinli mirror).
        // Onceki kusur: baseline dogrudan dockerRunner.run ile mvn test, network:none calisiyordu; cache bosken
        // parent POM cozulemiyordu (Network is unreachable) ve BASELINE_FAILED uretiliyordu.
        // Simdi baseline, loopRunner ile ayni DockerMavenRunner yolunu kullanir: cache bos ise provisioning
        // asamasi izinli mirror'a gider; execution run'i yine network:none ile sandbox'lanir.
        const baselineRunner = this.buildVerifiedLoopRunner(dockerRunner, hostRunner, projectRoot, job.id, dockerImage);
        ownedRunners.set(job.id, baselineRunner);
        const baseline = await runBaseline(projectRoot, baselineRunner, 600000);
        if (baseline.status === "FAILED") {
          const latest = jobs.getJob(job.id);
          if (latest.lifecycle === "CANCELLED" || latest.lifecycle === "PAUSED") {
            throw new AppError("POLICY_VIOLATION", "Docker baseline iptal/pause sonrasinda tamamlandi", { reason_code: latest.lifecycle });
          }
          jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
          jobs.updateOutcome(job.id, "BASELINE_FAILED", jobs.getJob(job.id).row_version);
          return { job_id: job.id, phases_completed: phases, final_outcome: "BASELINE_FAILED", best_coverage: null, error: `Docker baseline basarisiz: ${baseline.failed_tests.join(", ")}` };
        }
      }
      phases.push("baseline_ok");

      jobs.updatePhase(job.id, "analysis", jobs.getJob(job.id).row_version);
      phases.push("analysis");

      // hedef cozumu: hedef siniflari envanterden coz
      // D02/F01 duzeltmesi: once envanteri doldur (module + package + codeSymbols); sonra hedef coz.
      // Gercek location id: job.location_id (test_jobs FK).
      // P03/PP11: source identity KAYITLI ve DOLU olmali - HEAD (git rev-parse),
      // sirali canonical path+byte source digest ve build config digest.
      // Yalniz digest (null) kaydi "ayni kaynak" sayilamaz.
      // P05/PR06: source identity KAYITLI ve DOLU olmali - HEAD (git rev-parse),
      // sirali canonical path+byte source digest ve build config digest.
      const sourceManifest = new SourceSnapshot(projectRoot).buildManifest();
      const sourceIdentity = computeSourceIdentity(projectRoot, sourceManifest);
      // P05/PR06: frozen concrete hedefler start'ta yazilan snapshot'a baglidir;
      // ayni snapshot yeniden kullanilir (resume'da ayni kimlik korunur). Guncel
      // identity recorded identity ile birebir eslesmezse fail-closed (SOURCE_CHANGED).
      const jobRowForSnapshot = jobs.getJob(job.id);
      let snapshotId: string;
      if (jobRowForSnapshot.source_snapshot_id) {
        snapshotId = jobRowForSnapshot.source_snapshot_id;
        const recorded = storage.db
          .prepare<[string], { head_commit: string | null; dirty_digest: string | null; source_digest: string | null; build_digest: string | null }>(
            "SELECT head_commit, dirty_digest, source_digest, build_digest FROM source_identities WHERE snapshot_id = ?",
          )
          .get(snapshotId);
        if (
          !recorded ||
          recorded.head_commit !== sourceIdentity.head_commit ||
          recorded.dirty_digest !== sourceIdentity.dirty_digest ||
          recorded.source_digest !== sourceIdentity.source_digest ||
          recorded.build_digest !== sourceIdentity.build_digest
        ) {
          throw new AppError("SOURCE_CHANGED", "Kaynak identity frozen snapshot ile uyusmuyor; sessiz devam yok", {
            reason_code: "SOURCE_CHANGED",
          });
        }
        const sourceManifestArtifactId = this.persistSourceManifest(storage, job, sourceManifest);
        storage.db.prepare("UPDATE project_snapshots SET source_manifest_artifact_id = ? WHERE id = ?")
          .run(sourceManifestArtifactId, snapshotId);
      } else {
        snapshotId = inventory.writeSnapshot(
          job.location_id,
          sourceIdentity.head_commit,
          sourceIdentity.dirty_digest,
          sourceIdentity.source_digest,
          sourceIdentity.build_digest,
          "statik-tarama-1",
          this.persistSourceManifest(storage, job, sourceManifest),
        );
        storage.db.prepare("UPDATE test_jobs SET source_snapshot_id = ? WHERE id = ?").run(snapshotId, job.id);
      }
      this.persistSourceIdentity(storage, snapshotId, sourceIdentity);

      // P05/PR06: TEK resolver - dispatcher goal'deki frozen concrete hedef listesini
      // KULLANIR; selector'u yeniden sinif gibi aratMAZ. Listeden yeniden kurulan frozen
      // digest, servis tarafinda uretilen digest ile birebir eslemeli (PP23).
      const allConcrete: ConcreteTarget[] = [];
      for (const target of goal.targets) {
        if (!target.concrete_targets || target.concrete_targets.length === 0) {
          throw new AppError("BLOCKED_TARGET_RESOLUTION", `Hedef icin concrete target kaydi yok (selector=${target.selector}); sessiz yeniden cozum yok`, {
            reason_code: "CONCRETE_TARGET_MISSING",
          });
        }
        for (const c of target.concrete_targets) {
          if (c.snapshot_id !== snapshotId) {
            throw new AppError("BLOCKED_TARGET_RESOLUTION", `Frozen hedef snapshot kimligi uyusmuyor (fqn=${c.fqn}; beklenen=${snapshotId})`, {
              reason_code: "SNAPSHOT_MISMATCH",
            });
          }
          allConcrete.push(c);
        }
      }
      const uniqueConcrete = [...new Map(allConcrete.map((c) => [
        `${c.fqn}|${c.module_path}|${c.source_set}|${c.relative_path}|${c.snapshot_id}`,
        c,
      ])).values()];
      const goalFrozen = buildFrozenTargetList(uniqueConcrete, snapshotId, goal.targets.length, this.services.config.discovery.max_concrete_targets);
      const computedDigest = rebuildFrozenTargetDigest(allConcrete);
      if (goal.concrete_targets_digest && goal.concrete_targets_digest !== computedDigest) {
        throw new AppError("BLOCKED_TARGET_RESOLUTION", "Frozen concrete hedef digest'i servis/dispatcher arasi uyusmuyor", {
          reason_code: "CONCRETE_DIGEST_MISMATCH",
        });
      }
      this.persistJobContract(storage, job, goal, sourceIdentity);
      // P05/PR06: frozen concrete hedef listesi job'a kalici yazilir; resume bu
      // kayitlardan ayni listeyi geri kurar (PP15/PP23).
      this.persistJobTargetConcretes(storage, job.id, goal.targets, goalFrozen.digest);

      // Envanter: concrete hedeflerin module/package/simbolleri bu snapshot'a yazilir
      // (resume ve sonraki sorgular icin kalicilik).
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

      // Frozen concrete hedefler icin source-set dogrulamasi: kayitli source_set
      // "test" ise hedef test kaynak sinifidir (source-set tabanli; "Test" suffix'i
      // kanit degil - LoadTest gibi main siniflari yanlis elenmez).
      const resolvedTargets: Array<{ selector: string; fqn: string; module: PomModule; source_set: "main" | "test" | "unknown"; relative_path: string }> = [];
      for (const target of goal.targets) {
        for (const c of target.concrete_targets) {
          const module = discovery.modules.find((m) => m.module_relative_path === c.module_path);
          if (!module) {
            throw new AppError("BLOCKED_TARGET_RESOLUTION", `Concrete hedefin modulu bulunamadi: ${c.module_path} (fqn=${c.fqn})`, {
              reason_code: "MODULE_NOT_FOUND",
            });
          }
          if (c.source_set === "test") {
            continue;
          }
          resolvedTargets.push({ selector: target.selector, fqn: c.fqn, module, source_set: c.source_set, relative_path: c.relative_path });
        }
      }
      if (resolvedTargets.length === 0) {
        throw new AppError("BLOCKED_TARGET_RESOLUTION", "Tum hedefler test kaynak sinifi; production hedef listesi bos", {
          reason_code: "TEST_SOURCE_TARGETS",
        });
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
      // W02/F08: accepted set + staging bilgisi loop'a verilir; aday ayri workspace'te calisir.
      const loopRunner = this.buildVerifiedLoopRunner(dockerRunner, hostRunner, projectRoot, job.id, dockerImage);
      ownedRunners.set(job.id, loopRunner);
      const loop = new CandidateLoop(loopRunner, { accepted_set_dir: acceptedDir, staging_root: stagingRoot });
      const loopResults = new Map<string, IterationLoopResult>();

      for (const resolved of resolvedTargets) {
        assertLease();
        const targetSpec = goal.targets.find((t) => t.selector === resolved.selector)!;
        const iterateOptions: IterateOptions = {
          project_root: projectRoot,
          target_fqn: resolved.fqn,
          target_module_path: resolved.module.module_relative_path,
          line_target_bps: targetSpec.line_target_bps,
          branch_target_bps: targetSpec.branch_target_bps,
          budget: goal.budget,
          staging_root: stagingRoot,
          workspace_root: join(this.workspaceRoot, "jobs", job.id, "candidates", resolved.fqn.replace(/[^A-Za-z0-9_.-]/g, "_")),
          timeout_ms_per_run: 600000,
          deadline_at: jobDeadlineAt,
        // K04/B04: birikimli accepted set + checkpoint callback'i runtime'a bagli:
        // W04/F09/N29: on_accepted artik GERCEK accepted checkpoint yayinlar (yalniz event/log degil):
        // accepted manifest blob'u + DB checkpoint satiri + best_checkpoint pointer'i publish edilir.
        accepted_snapshot_dir: acceptedDir,
        on_accepted: (info) => {
          assertLease();
          assertJobDeadline();
          // P03/PR03:
          // 1) accepted dosyalar immutable content-addressed blob olarak yayinlanir;
          // 2) manifest source identity (head/dirty/build digest) + accepted envanter +
          //    butce doludur; 3) parent GERCEK best pointer'dir ve publish CAS
          //    (generation/row version) ile korunur.
          let publishedCheckpointId: string | null = null;
          try {
            const projectIdRow = storage.db.prepare<[string], { project_id: string }>("SELECT project_id FROM project_locations WHERE id = ?").get(job.location_id);
            const manifest = {
              schema_version: 1 as const,
              job_id: job.id,
              project_id: projectIdRow?.project_id ?? job.location_id,
              location_id: job.location_id,
              target_ids: resolvedTargets.map((rt) => rt.selector),
              user_goal: `coverage:${goal.targets.find((t) => t.selector === resolved.selector)?.selector ?? resolved.selector}`,
              source_snapshot_id: snapshotId,
              head_commit: sourceIdentity.head_commit,
              source_digest: sourceIdentity.source_digest,
              dirty_digest: sourceIdentity.dirty_digest,
              build_digest: sourceIdentity.build_digest,
              policy_digest: goal.model_profile ? null : job.policy_digest,
              parser_version: "statik-tarama-1",
              toolchain: { node: process.version },
              accepted_changes: info.files.map((f) => ({ path: f.path, sha256: f.sha256, action: f.action })),
              parent_checkpoint_id: checkpoints.bestCheckpoint(job.id),
              baseline_run_id: null,
              last_trusted_run_id: null,
              active_phase: "verification",
              next_action: "candidate_accepted",
              remaining_budget: {
                max_candidate_iterations: Math.max(0, goal.budget.max_candidate_iterations - info.iteration),
                max_repairs_per_candidate: goal.budget.max_repairs_per_candidate,
                no_progress_window: goal.budget.no_progress_window,
              },
              requested_model: goal.model_profile ?? null,
              resolved_model: goal.model_profile ?? null,
              worker_session_ref: null,
              generation: info.iteration,
              created_at: Date.now(),
            };
            const acceptedBlobFiles = info.files.map((f) => {
              const absPath = join(acceptedDir, f.path);
              const content = f.action === "delete" ? "" : readFileSync(absPath, "utf8");
              return { path: f.path, sha256: f.sha256, action: f.action, content };
            });
            const published = checkpoints.publishCheckpoint(manifest, activeLease, null, checkpoints.publishAcceptedBlobs(job.id, acceptedBlobFiles));
            publishedCheckpointId = published.checkpoint_id;
          } catch (checkpointError) {
            process.stderr.write(`[aitest-dispatch] job ${job.id} accepted checkpoint publish hatasi: ${String(checkpointError)}\n`);
            // Accepted pointer olmadan aday kabul edilmez; loop/dispatch fail-closed
            // olur ve onceki trusted checkpoint korunur.
            throw checkpointError;
          }
          jobs.appendEvent({
            job_id: job.id,
            event_type: "candidate_accepted",
            phase: "verification",
            origin: "JobDispatcher",
          });
          process.stderr.write(`[aitest-dispatch] job ${job.id} iter ${info.iteration} kabul: ${info.files.length} dosya, LINE ${info.line_bps} bps${publishedCheckpointId ? `, checkpoint ${publishedCheckpointId.slice(0, 8)}` : ", checkpoint YOK"}\n`);
        },
          // FIN06/12.1: her aday karari DB candidate_iterations tablosuna yazilir (job iliskisi):
          on_decision: (info) => {
            assertLease();
            if (storage) {
              new InventoryRepository(storage.db).writeCandidateIteration({
                job_id: job.id,
                parent_checkpoint_id: checkpoints.bestCheckpoint(job.id),
                iteration_ordinal: info.iteration,
                changeset_hash: info.changeset_hash ?? "unknown",
                strategy_key: null,
                decision: info.decision,
                decision_reason: info.reason,
                coverage_before_bps: info.coverage_before_bps,
                coverage_after_bps: info.coverage_after_bps,
                error_fingerprint: null,
              });
            }
          },
          generate_candidate: async () => {
            assertLease();
            const latest = jobs.getJob(job.id);
            if (latest.lifecycle === "CANCELLED" || latest.lifecycle === "PAUSED") {
              throw new AppError("POLICY_VIOLATION", `Job ${latest.lifecycle} iken yeni aday baslatilamaz`, { reason_code: latest.lifecycle });
            }
            if (!this.workerEnabled) {
              return null;
            }
            return this.generateCandidateFromWorker(projectRoot, resolved.fqn, resolved.module, job.id, goal.model_profile);
          },
          generation_failure_reason: () => this.workerEnabled ? null : "WORKER_DISABLED",
        };
        const loopResult = await loop.iterate(iterateOptions, goal.start_iteration ?? 1);
        assertLease();
        loopResults.set(resolved.fqn, loopResult);
        phases.push(`loop_${resolved.selector}_${loopResult.outcome}`);
      }

      assertLease();
      jobs.updatePhase(job.id, "verification", jobs.getJob(job.id).row_version);
      phases.push("verification");

      // W04/F09/N32: son karar yalniz accepted setin temiz final replay'inden
      // gelir. Kullanici checkout'undaki eski/stale target XML'i kullanilmaz.
      const finalReplay = await loop.replayAcceptedSet({
        project_root: projectRoot,
        target_fqns: resolvedTargets.map((rt) => rt.fqn),
        target_module_paths: resolvedTargets.map((rt) => rt.module.module_relative_path),
        accepted_snapshot_dir: acceptedDir,
        staging_root: stagingRoot,
        workspace_root: join(this.workspaceRoot, "jobs", job.id, "final"),
        timeout_ms: 600000,
      });
      const replaySucceeded = finalReplay.run.exit_code === 0 && !finalReplay.run.timed_out;
      const finalCoverage = replaySucceeded
        ? finalReplay.coverage
        : new Map<string, ReturnType<typeof import("./candidate-loop.js").readCoverageAfterRun>>();

      // FIN03/14.2: cozulmus hedefler icin once/after coverage snapshot kayitlari (DB iliskisi):
      for (const resolved of resolvedTargets) {
        const coverage = finalCoverage.get(resolved.fqn);
        const linePair = coverage?.line;
        const branchPair = coverage?.branch;
        // Missing LINE evidence is not a synthetic 0% snapshot (N27/N32).
        if (linePair) {
          inventory.writeCoverageSnapshot({
            job_id: job.id,
            target_symbol_id: null,
            run_id: null,
            fqn: resolved.fqn,
            source_sha256: null,
            binary_class_id: null,
            line_covered: linePair.covered,
            line_missed: linePair.missed,
            branch_covered: branchPair?.covered ?? null,
            branch_missed: branchPair?.missed ?? null,
            line_validity: "OK",
            branch_validity: branchPair ? "OK" : "UNAVAILABLE",
            before_after: "after",
            checkpoint_id: checkpoints.bestCheckpoint(job.id),
          });
        }
      }

      // FIN03/14.2: candidate iteration kayitlari DB'ye yazilir (loopResult'tan):
      // K04/B03 + W04/F10/N25: son dogrulanmis coverage per-target; LINE+BRANCH birlikte (tek evaluator)
      const bestCoverage: Record<string, number | null> = {};
      let allMet = true;
      for (const resolved of resolvedTargets) {
        const coverage = finalCoverage.get(resolved.fqn);
        const linePair = coverage?.line;
        const branchPair = coverage?.branch;
        const lineBps = basisPointsFrom(linePair);
        bestCoverage[resolved.fqn] = lineBps;
        const targetSpec = goal.targets.find((t) => t.selector === resolved.selector)!;
        // W04/F10/N25: tek evaluator (evaluateTarget) - LINE+BRANCH birlikte; loop ile ayni karar
        const lineEval = evaluateMetric("LINE", linePair, linePair !== undefined, targetSpec.line_target_bps);
        const branchEval = evaluateMetric("BRANCH", branchPair, branchPair !== undefined, targetSpec.branch_target_bps);
        const targetEval = evaluateTarget(resolved.selector, resolved.fqn, [lineEval, branchEval], ["LINE", ...(targetSpec.branch_target_bps > 0 ? ["BRANCH" as const] : [])]);
        if (!targetEval.all_required_met) {
          allMet = false;
        }
      }

      const loopOutcomes = [...loopResults.values()].map((result) => result.outcome);
      const fallbackOutcome = loopOutcomes.includes("TARGET_NOT_MET_BLOCKED")
        ? "TARGET_NOT_MET_BLOCKED"
        : loopOutcomes.includes("TARGET_NOT_MET_BUDGET")
          ? "TARGET_NOT_MET_BUDGET"
          : loopOutcomes.includes("TARGET_NOT_MET_PLATEAU")
            ? "TARGET_NOT_MET_PLATEAU"
            : "TARGET_NOT_MET_PLATEAU";
      const missingRequiredEvidence = resolvedTargets.some((resolved) => {
        const coverage = finalCoverage.get(resolved.fqn);
        const targetSpec = goal.targets.find((target) => target.selector === resolved.selector)!;
        return coverage?.line === undefined || (targetSpec.branch_target_bps > 0 && coverage?.branch === undefined);
      });
      const finalOutcome = !replaySucceeded
        ? "FINAL_VERIFICATION_FAILED"
        : missingRequiredEvidence
          ? "INVALID_COVERAGE_EVIDENCE"
        : allMet
          ? loopOutcomes.length > 0 && loopOutcomes.every((outcome) => outcome === "TARGET_ALREADY_MET") ? "TARGET_ALREADY_MET" : "TARGET_REACHED"
          : fallbackOutcome;
      const reportIterations = [...loopResults.values()].flatMap((result) => result.iterations.map((iteration) => ({
        ordinal: iteration.iteration,
        strategy: "worker_candidate",
        decision: iteration.decision,
        reason: iteration.reason,
        coverage_before_bps: iteration.coverage_before_bps,
        coverage_after_bps: iteration.coverage_after_bps,
      })));
      const latestBeforeFinalize = jobs.getJob(job.id);
      assertLease();
      if (latestBeforeFinalize.lifecycle === "CANCELLED" || latestBeforeFinalize.lifecycle === "PAUSED") {
        throw new AppError("POLICY_VIOLATION", `Job ${latestBeforeFinalize.lifecycle} olarak finalize edilemez`, { reason_code: latestBeforeFinalize.lifecycle });
      }
      jobs.updateOutcome(job.id, finalOutcome, jobs.getJob(job.id).row_version);
      jobs.updateLifecycle(job.id, finalOutcome === "FINAL_VERIFICATION_FAILED" ? "FAILED" : "COMPLETED", jobs.getJob(job.id).row_version);
      phases.push("completed");
      jobs.appendEvent({ job_id: job.id, event_type: "verification_completed", phase: "verification", origin: "JobDispatcher" });

      // D09/F14: rapor DB/checkpoint kanitlarindan otomatik uretilir (ayni kanit projeksiyonu)
      const reportDir = join(this.workspaceRoot, "jobs", job.id, "reports");
      const reportData = {
        schema_version: 1 as const,
        job_id: job.id,
        project_root: projectRoot.replace(/\\/g, "/"),
        head_commit: null,
        snapshot_id: snapshotId,
        outcome: finalOutcome,
        verification_scope: "AFFECTED_SCOPE",
        apply_state: "READY_FOR_REVIEW",
        targets: resolvedTargets.map((rt) => {
          const coverage = finalCoverage.get(rt.fqn);
          const linePair = coverage?.line;
          const branchPair = coverage?.branch;
          const targetSpec = goal.targets.find((t) => t.selector === rt.selector)!;
          const lineEval = evaluateMetric("LINE", linePair, linePair !== undefined, targetSpec.line_target_bps);
          const branchEval = evaluateMetric("BRANCH", branchPair, branchPair !== undefined, targetSpec.branch_target_bps);
          return {
            target_id: rt.selector,
            selector: rt.selector,
            fqn: rt.fqn,
            line: linePair ? { covered: linePair.covered, missed: linePair.missed, total: linePair.covered + linePair.missed, bps: lineEval.basis_points, target_bps: targetSpec.line_target_bps, met: lineEval.target_met, validity: lineEval.validity } : null,
            branch: branchPair ? { covered: branchPair.covered, missed: branchPair.missed, total: branchPair.covered + branchPair.missed, bps: branchEval.basis_points, target_bps: targetSpec.branch_target_bps, met: branchEval.target_met, validity: branchEval.validity } : null,
          };
        }),
        iterations: reportIterations,
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

      ownedRunners.delete(job.id);
      ownedWorkerServers.delete(job.id);
      stopHeartbeat();
      if (leaseAcquired) {
        leases.release(job.id, ownerId);
      }

      return { job_id: job.id, phases_completed: phases, final_outcome: finalOutcome, best_coverage: bestCoverage, error: null };
    } catch (error) {
      const message = error instanceof AppError ? `${error.code}: ${error.message}` : String(error);
      process.stderr.write(`[aitest-dispatch] job ${job.id} FAILED (${phases.join(",")}): ${message}\n`);
      // Hata/cancel yolunda bu dispatch'in owned kaynaklari kapanir; yeni
      // dispatcher instance'i da module registry uzerinden ayni job'u bulur.
      this.stopOwnedProcesses(job.id);
      stopHeartbeat();
      if (leaseAcquired) {
        leases.release(job.id, ownerId);
      }
      const currentJob = jobs.getJob(job.id);
      jobs.appendEvent({ job_id: job.id, event_type: "dispatch_failed", phase: (phases[phases.length - 1] as never) ?? "analysis", origin: "JobDispatcher" });
      try {
        // Cancel/pause sonrasi gec hata bu lifecycle'i COMPLETED/FAILED ile
        // overwrite edemez (N37). Normal hata typed FAILED/BLOCKED olarak kalir.
        if (currentJob.lifecycle !== "CANCELLED" && currentJob.lifecycle !== "PAUSED") {
          const errorCode = error instanceof AppError ? error.code : "INTERNAL_ERROR";
          // P04/PR04: typed blocker'lar outcome'ta ayrisir; hepsi generic BLOCKED_ENVIRONMENT ezilmez
          const outcome = errorCode === "POLICY_VIOLATION"
            ? "POLICY_VIOLATION"
            : errorCode === "BLOCKED_ISOLATION"
              ? "BLOCKED_ISOLATION"
              : errorCode === "BLOCKED_DEPENDENCIES"
                ? "BLOCKED_DEPENDENCIES"
                : errorCode === "BLOCKED_TARGET_RESOLUTION"
                  ? "BLOCKED_TARGET_RESOLUTION"
                  : "BLOCKED_ENVIRONMENT";
          jobs.updateOutcome(job.id, outcome, jobs.getJob(job.id).row_version);
          jobs.updateLifecycle(job.id, "FAILED", jobs.getJob(job.id).row_version);
        }
      } catch {
        // lifecycle zaten degismis olabilir
      }
      if (currentJob.lifecycle === "CANCELLED" || currentJob.lifecycle === "PAUSED") {
        return { job_id: job.id, phases_completed: phases, final_outcome: currentJob.lifecycle, best_coverage: null, error: message };
      }
      return { job_id: job.id, phases_completed: phases, final_outcome: "FAILED", best_coverage: null, error: message };
    }
  }

  /**
   * P03/PR03: immutable contract kaydi.
   * Contract tam icerigini (hedefler, butce, model, source identity) content-addressed
   * blob olarak kalici saklar; yalniz digest yeterli degil. Resume bu kayitla
   * ayni hedef/butce/model'i kullanir (global config sifirlamaz).
   */
  private persistJobContract(
    storage: NonNullable<Services["storage"]>,
    job: JobRow,
    goal: GoalContract,
    sourceIdentity: SourceIdentity,
  ): { contractArtifactId: string; contractHash: string } {
    const db = storage.db;
    const stable = {
      job_id: job.id,
      project_root: goal.project_root,
      targets: goal.targets,
      budget: goal.budget,
      runner_kind: goal.runner_kind,
      model_profile: goal.model_profile,
      source_digest: sourceIdentity.source_digest,
      build_digest: sourceIdentity.build_digest,
    };
    const contractHash = createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex");
    const contractJson = JSON.stringify({ schema_version: 1, ...stable, contract_hash: contractHash }, null, 2);
    const contractArtifactId = randomUUID();
    const contractBlobDir = join(this.workspaceRoot, "jobs", job.id, "contract");
    mkdirSync(contractBlobDir, { recursive: true });
    const contractPath = join(contractBlobDir, contractHash);
    if (!existsSync(contractPath)) {
      const tmpPath = `${contractPath}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmpPath, contractJson, "utf8");
      renameSync(tmpPath, contractPath);
    }
    const existing = db
      .prepare<[string, string], { id: string }>("SELECT id FROM artifacts WHERE sha256 = ? AND relative_store_path = ?")
      .get(contractHash, `jobs/${job.id}/contract/${contractHash}`);
    if (existing) {
      return { contractArtifactId: existing.id, contractHash };
    }
    db.prepare(
      "INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', 'job_contract', ?)",
    ).run(contractArtifactId, job.id, "job_contract", `jobs/${job.id}/contract/${contractHash}`, contractHash, Buffer.byteLength(contractJson, "utf8"), Date.now());
    return { contractArtifactId, contractHash };
  }

  /**
   * P05/PR06: frozen concrete hedef listesi job'a kalici yazilir (her concrete
   * hedef bir satir). Resume bu kayitlardan ayni listeyi geri kurar; selector
   * yeniden sinif gibi cozulmez (PP15/PP23).
   */
  private persistJobTargetConcretes(
    storage: NonNullable<Services["storage"]>,
    jobId: string,
    targets: Array<{ selector: string; kind: string; concrete_targets: ConcreteTarget[] }>,
    concreteDigest: string,
  ): void {
    const db = storage.db;
    db.prepare("DELETE FROM job_target_concretes WHERE job_id = ?").run(jobId);
    const insert = db.prepare(
      "INSERT INTO job_target_concretes (job_id, selector, target_kind, fqn, module_path, source_set, relative_path, snapshot_id, concrete_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    for (const target of targets) {
      for (const c of target.concrete_targets) {
        insert.run(jobId, target.selector, target.kind, c.fqn, c.module_path, c.source_set, c.relative_path, c.snapshot_id, concreteDigest, now);
      }
    }
  }

  /**
   * P03/PR03: kaynak manifestinin tam icerigi de immutable artifact olarak saklanir;
   * source snapshot satiri contract blob ile karistirilmaz.
   */
  private persistSourceManifest(storage: NonNullable<Services["storage"]>, job: JobRow, manifest: SnapshotManifest): string {
    const db = storage.db;
    const persisted = {
      ...manifest,
      entries: manifest.entries.map(({ source_location: _sourceLocation, ...entry }) => entry),
    };
    const content = JSON.stringify(persisted, null, 2);
    const hash = createHash("sha256").update(content, "utf8").digest("hex");
    const relativePath = `jobs/${job.id}/source/${hash}`;
    const targetDir = join(this.workspaceRoot, "jobs", job.id, "source");
    const target = join(targetDir, hash);
    mkdirSync(targetDir, { recursive: true });
    if (!existsSync(target)) {
      const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmpPath, content, "utf8");
      renameSync(tmpPath, target);
    }
    const existing = db.prepare<[string, string], { id: string }>("SELECT id FROM artifacts WHERE sha256 = ? AND relative_store_path = ?").get(hash, relativePath);
    if (existing) {
      return existing.id;
    }
    const artifactId = randomUUID();
    db.prepare(
      "INSERT INTO artifacts (id, job_id, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, '1', 'internal', 'READY', 'source_manifest', ?)",
    ).run(artifactId, job.id, "source_manifest", relativePath, hash, Buffer.byteLength(content, "utf8"), Date.now());
    return artifactId;
  }

  /**
   * P03/PP11: source identity kaydi - snapshot'a bagli tam identity (head/dirty/
   * source/build digest). Resume bu kayitla guncel identity'yi karsilastirir;
   * null/bilinmeyen recorded identity "degismeyen kaynak" sayilmaz (R04).
   */
  private persistSourceIdentity(storage: NonNullable<Services["storage"]>, snapshotId: string, identity: SourceIdentity): void {
    const db = storage.db;
    db.prepare("DELETE FROM source_identities WHERE snapshot_id = ?").run(snapshotId);
    db.prepare("INSERT INTO source_identities (snapshot_id, head_commit, dirty_digest, source_digest, build_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(snapshotId, identity.head_commit, identity.dirty_digest, identity.source_digest, identity.build_digest, Date.now());
  }

  /**
   * FIN00.e/22.2: candidate loop icin verified runner uretir.
   * Docker verified ise DockerMavenRunner (source ro, target writable mount, settings ro mount);
   * host yalniz test-only composition'da (host_dev_only) acikca verilir; normal giriste host Maven yoktur.
   * 8.3: credential'siz Maven settings read-only baglanir (bagimlilik hazirlama yalniz onayli mirror'a).
   * P04/PP19: settings mount ONCESI secret taranir (credential'li dosya container'a girmez);
   * Maven cache job'a ozel volume ile izole edilir (job A, job B cache'ini degistiremez).
   */
  private buildVerifiedLoopRunner(dockerRunner: DockerRunner | undefined, hostRunner: MavenRunner | undefined, projectRoot: string, jobId?: string, verifiedImage?: string): MavenRunner {
    if (this.runnerKind === "host_dev_only" && hostRunner) {
      return hostRunner;
    }
    if (dockerRunner) {
      const targetMounts = [{ host: join(resolve(projectRoot), "target"), container: "/work/target" }];
      const settingsPath = join(homedir(), ".m2", "settings.xml");
      const runnerOptions: { target_mounts: Array<{ host: string; container: string }>; image?: string; maven_settings?: { host_path: string; container_path: string }; provisioning?: { enabled: boolean; allowed_mirrors: string[]; timeout_ms: number }; maven_cache_volume?: string } = { target_mounts: targetMounts };
      if (verifiedImage) {
        runnerOptions.image = verifiedImage;
      }
      if (existsSync(settingsPath)) {
        // P04/PP19: secret tarayici; credential'li host settings container'a aktarilmaz
        const scan = scanMavenSettingsForSecrets(settingsPath);
        if (scan.usable) {
          runnerOptions.maven_settings = { host_path: settingsPath, container_path: "/settings/settings.xml" };
        } else {
          process.stderr.write(`[aitest-dispatch] job ${jobId ?? "?"} host settings mount reddedildi: ${scan.reason_code} (${scan.reason})\n`);
        }
      }
      // 8.3: hazirlama profili config'ten (izinli mirror listesi):
      runnerOptions.provisioning = {
        enabled: this.services.config.dependency_provisioning.enabled,
        allowed_mirrors: [...this.services.config.dependency_provisioning.allowed_mirrors],
        timeout_ms: this.services.config.dependency_provisioning.timeout_ms,
      };
      // P04/PP19: job'a ozel Maven cache volume; paylasilan cache cross-job bozulamaz
      if (jobId) {
        runnerOptions.maven_cache_volume = `aitest-m2-cache-${jobId}`;
      }
      return new DockerMavenRunner(runnerOptions, dockerRunner);
    }
    throw new AppError("BLOCKED_ISOLATION", "Verified loop runner uretilemedi; candidate calistirmasi yapilmaz (FIN00.e)");
  }

  /**
   * K05/B05 + W05/F11: resume - ayni job'dan kaldigi asamadan devam.
   * W05/F11 duzeltmesi: resume artik RecoveryManager ile checkpoint/source dogrulamasindan gecer;
   * kalan iterasyon/butce best checkpoint manifest'inden yuklenir (config sifirlamaz);
   * SOURCE_CHANGED durumunda kontrollu rebaseline; dispatch'i bastan tekrar cagirmaz.
   */
  async resumeDispatch(job: JobRow, projectRootHint?: string): Promise<DispatchResult> {
    const storage = this.services.storage;
    const jobs = this.services.jobs;
    if (!storage || !jobs) {
      throw new AppError("INTERNAL_ERROR", "Storage servisleri baslatilmamis");
    }
    const leases = new LeaseManager(storage.db);
    const checkpoints = new CheckpointStore(storage.db, this.workspaceRoot);
    const recovery = new RecoveryManager(storage.db, leases, checkpoints);

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

    // P03/PP11: kaynak kontrolu tam source identity ile: HEAD + sirali canonical
    // path+byte source digest + build config digest. Null/bilinmeyen recorded
    // identity "degismeyen kaynak" sayilmaz (R04).
    const snapshot = new SourceSnapshot(projectRoot);
    const snapshotManifest = snapshot.buildManifest();
    const currentIdentity = computeSourceIdentity(projectRoot, snapshotManifest);
    const recoveryOwnerId = `resume-${process.pid}-${job.id}`;
    const plan = recovery.planRecovery(job, recoveryOwnerId, { current_identity: currentIdentity });

    if (plan.action === "rebaseline") {
      // W05/F11/N35: kaynak degisti; stale coverage isaretlenir; kontrollu rebaseline
      jobs.appendEvent({ job_id: job.id, event_type: "resume_source_changed", phase: job.phase, origin: "resumeDispatch" });
      // Eski accepted set ve coverage yeni customer bytes ile birlestirilmez.
      // Kontrollu rebaseline yeni revision/explicit start gerektirir.
      leases.release(job.id, recoveryOwnerId);
      throw new AppError("SOURCE_CHANGED", `Resume kaynagi degismis (${plan.reason}); eski accepted checkpoint ile devam edilmedi`, { reason_code: "SOURCE_CHANGED" });
    }

    if (targetRows.length === 0) {
      // job_targets yoksa hedef cozulemez; sessiz discovery ile baslatma yok.
      leases.release(job.id, recoveryOwnerId);
      throw new AppError("INVALID_PARAMETERS", `Job hedefleri kayitli degil; test_start ile yeni is gerekli: ${job.id}`);
    }

    // P03/PP15: resume ayni job/target/accepted set/butce/kontratta surer.
    // Butce ve tursu YALNIZ dogrulanmis checkpoint manifest'inden yuklenir;
    // global config butceyi sifirlamaz (config yalniz checkpoint'siz yolda kullanilir).
    const configBudgets = this.services.config.budgets;
    let budget = {
      max_candidate_iterations: configBudgets.max_candidate_iterations,
      max_repairs_per_candidate: configBudgets.max_repairs_per_candidate,
      no_progress_window: configBudgets.no_progress_window,
    };
    let startIteration = 1;
    let goalModelProfile: string | null = null;
    if (plan.action === "resume" && plan.checkpoint_id && plan.checkpoint_manifest) {
      const rb = resumeBudgetFromManifest(plan.checkpoint_manifest, configBudgets);
      budget = {
        max_candidate_iterations: rb.remaining_iterations,
        max_repairs_per_candidate: rb.remaining_repairs,
        no_progress_window: rb.no_progress_window,
      };
      startIteration = rb.start_iteration;
      goalModelProfile = plan.checkpoint_manifest.requested_model;
      jobs.appendEvent({ job_id: job.id, event_type: "resume_checkpoint_verified", phase: job.phase, origin: "resumeDispatch" });
      // Accepted set mutable klasordeki durumdan degil, immutable content-addressed
      // blob'lardan geri yuklenir; klasor karismasi resume'yu bozamaz.
      const acceptedDir = join(this.workspaceRoot, "jobs", job.id, "accepted");
      if (plan.checkpoint_manifest.accepted_changes.length > 0) {
        checkpoints.restoreAcceptedFiles(job.id, plan.checkpoint_manifest.accepted_changes, acceptedDir);
      }
    } else {
      jobs.appendEvent({ job_id: job.id, event_type: "resume_fresh_start", phase: job.phase, origin: "resumeDispatch" });
    }

    // P05/PR06: resume ayni frozen concrete hedef listesini kullanir (PP15/PP23).
    // Liste job_target_concretes'ten geri kurulur; yoksa (P05 onceki legacy job)
    // fail-closed RED - selector yeniden sinif gibi cozulmez.
    const concreteRows = storage.db
      .prepare<
        [string],
        { selector: string; target_kind: string; fqn: string; module_path: string; source_set: string; relative_path: string; snapshot_id: string; concrete_digest: string }
      >(
        "SELECT selector, target_kind, fqn, module_path, source_set, relative_path, snapshot_id, concrete_digest FROM job_target_concretes WHERE job_id = ?",
      )
      .all(job.id);
    if (concreteRows.length === 0) {
      leases.release(job.id, recoveryOwnerId);
      throw new AppError("BLOCKED_TARGET_RESOLUTION", "Job icin frozen concrete hedef kaydi yok (legacy); resume sessiz yeniden cozumlemez", {
        reason_code: "LEGACY_GOAL_NO_CONCRETE",
      });
    }
    const digestBySelector = new Map<string, string>();
    for (const row of concreteRows) {
      digestBySelector.set(row.selector, row.concrete_digest);
    }
    const concreteBySelector = new Map<string, ConcreteTarget[]>();
    for (const row of concreteRows) {
      const list = concreteBySelector.get(row.selector) ?? [];
      list.push({
        fqn: row.fqn,
        module_path: row.module_path,
        source_set: row.source_set === "test" ? "test" : row.source_set === "main" ? "main" : "unknown",
        relative_path: row.relative_path,
        snapshot_id: row.snapshot_id,
      });
      concreteBySelector.set(row.selector, list);
    }
    const goal: GoalContract = {
      job_id: job.id,
      project_root: projectRoot,
      targets: targetRows.map((t) => ({
        selector: t.selector,
        kind: t.target_kind,
        concrete_targets: concreteBySelector.get(t.selector) ?? [],
        line_target_bps: t.line_target_bps,
        branch_target_bps: t.branch_target_bps ?? 0,
      })),
      budget,
      runner_kind: this.runnerKind,
      model_profile: goalModelProfile,
      start_iteration: startIteration,
      concrete_targets_digest: [...digestBySelector.values()][0] ?? null,
    };
    return this.dispatch(job, goal, projectRoot, recoveryOwnerId);
  }

  /**
   * W05/F11/N37: cancel/pause - owned kaynaklari sonlandirir (yalniz urunun kendi process'leri).
   * Owned worker server'lar stop edilir; MavenRunner kendi running map'ini zaten yonetir;
   * yabanci process/container'a dokunulmaz.
   */
  stopOwnedProcesses(jobId?: string): void {
    this.stopWorkerServers(jobId);
    if (jobId) {
      ownedRunners.get(jobId)?.stopAll();
      ownedRunners.delete(jobId);
    } else {
      for (const runner of ownedRunners.values()) {
        runner.stopAll();
      }
      ownedRunners.clear();
    }
  }

  private stopWorkerServers(jobId?: string): void {
    // job bazli worker server manager'lari sonlandir (owned); yabanci TUI/server'a dokunulmaz
    const managers = jobId
      ? (ownedWorkerServers.has(jobId) ? [[jobId, ownedWorkerServers.get(jobId)!] as const] : [])
      : [...ownedWorkerServers.entries()];
    for (const [, manager] of managers) {
      try {
        manager.stopOwnedServer();
      } catch {
        // zaten sonlanmis olabilir
      }
    }
    if (jobId) {
      ownedWorkerServers.delete(jobId);
    } else {
      ownedWorkerServers.clear();
    }
  }

  /**
   * W05/F11/N37: job'un owned worker server'i kayit altina alinir; cancel/pause'da sonlandirilir.
   */
  registerOwnedWorkerServer(jobId: string, manager: import("../workers/opencode/worker-server-manager.js").WorkerServerManager): void {
    ownedWorkerServers.set(jobId, manager);
  }

  private async generateCandidateFromWorker(projectRoot: string, targetFqn: string, module: PomModule, jobId: string, requestedModel: string | null = null): Promise<import("../workers/opencode/model-schemas.js").CandidateChangeSet | null> {
    // K03/B02: sabit porta sessiz baglanma; urune ait kontrollu worker server manager.
    const portOffset = Number.parseInt(createHash("sha256").update(jobId, "utf8").digest("hex").slice(0, 6), 16) % 2000;
    const serverManager = defaultWorkerServerManager(projectRoot, { config_instance_key: jobId, port: 14096 + portOffset });
    // W05/F11/N37: owned server cancel/pause icin kayit altina alinir
    this.registerOwnedWorkerServer(jobId, serverManager);
    const client = await serverManager.ensureRunning();
    const profile = readWorkerProfileFromOpencodeConfig(undefined, requestedModel ?? undefined);
    const session = await client.createSession();
    // FIN03/14.2 + FIN05/6.3: worker attempt kaydi DB'ye yazilir; her request job/attempt/session
    // ile korele edilir; baska session'dan eski cevap kabul edilemez.
    const storage = this.services.storage;
    const inventory = storage ? new InventoryRepository(storage.db) : null;
    const attemptOrdinal = storage
      ? (storage.db
          .prepare<[string], { max_ord: number | null }>("SELECT MAX(attempt_ordinal) AS max_ord FROM worker_attempts WHERE job_id = ?")
          .get(jobId)?.max_ord ?? 0) + 1
      : 1;
    const attemptStart = Date.now();

    // hedef dosyanin gercek govdesi (ilk 5 dosya kisiti degil; hedef dosyayi bul):
    const javaFiles = collectJavaFiles(projectRoot, module.source_root);
    const targetFile = javaFiles.find((f) => resolve(f) === resolve(projectRoot, module.source_root, ...`${targetFqn.replace(/\./g, "/")}.java`.split("/")));
    const signatures: string[] = [];
    let classBody = "";
    let classBodyTruncated = false;
    if (targetFile) {
      const { methods } = scanJavaFile(targetFile, projectRoot);
      for (const method of methods) {
        signatures.push(method.signature);
      }
      // 10.2 zorunlu baglam: hedef sinifin gercek govdesi prompt'a girer (RT21 pilot bulgusu:
      // govdesiz prompt'ta model kaynak kodu isteyen aciklama yaziyor, JSON uretemiyor).
      classBody = readFileSync(targetFile, "utf8");
      if (classBody.length > 12000) {
        classBodyTruncated = true;
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
      class_body: classBody.length > 0 ? classBody : "",
      policy_rules: [...DEFAULT_POLICY_RULES],
    };
    const prompt = buildWorkerPrompt(promptContext);

    // K03/B02: politika tool flags'i cagrida gercekten uygulanir (write/bash/task/web kapali):
    const { workerToolFlags } = await import("../workers/opencode/worker-config.js");
    const { defaultWorkerConfig } = await import("../workers/opencode/worker-config.js");
    const flags = workerToolFlags(defaultWorkerConfig("http://127.0.0.1"));

    // W01/F02: attempt kaydi istek ONCESI yazilir (durable); sonuc sonrasina guncellenir.
    const promptDigest = createHash("sha256").update(prompt, "utf8").digest("hex");
    if (inventory) {
      inventory.writeWorkerAttempt({
        job_id: jobId,
        attempt_ordinal: attemptOrdinal,
        role: "test_designer",
        provider_id: profile.provider_id,
        model_id: profile.model_id,
        profile_digest: createHash("sha256").update(JSON.stringify({ provider_id: profile.provider_id, model_id: profile.model_id, base_url: profile.base_url }), "utf8").digest("hex"),
        session_id: session.session_id,
        message_id: null,
        status: "error",
        input_digest: promptDigest,
        output_digest: null,
        duration_ms: null,
        input_tokens: null,
        output_tokens: null,
        repair_for_attempt: null,
        error_class: "IN_PROGRESS",
      });
    }

    let promptResult: WorkerPromptResult | null = null;
    let attemptFinalized = false;
    const finalizeAttempt = (status: "ok" | "timeout" | "error" | "aborted", result: WorkerPromptResult | null, errorClass: string | null, outputDigest: string | null): void => {
      if (attemptFinalized || !inventory) {
        return;
      }
      attemptFinalized = true;
      inventory.updateWorkerAttemptOutcome({
        job_id: jobId,
        attempt_ordinal: attemptOrdinal,
        status,
        session_id: session.session_id,
        message_id: result?.message_id ?? null,
        input_digest: promptDigest,
        output_digest: outputDigest,
        duration_ms: result?.elapsed_ms ?? Date.now() - attemptStart,
        input_tokens: result?.usage.input_tokens ?? null,
        output_tokens: result?.usage.output_tokens ?? null,
        error_class: errorClass,
      });
    };

    try {
      const response = await promptForJsonResult(client, {
        session_id: session.session_id,
        prompt,
        model: { providerID: profile.provider_id, modelID: profile.model_id },
        tools: flags,
        timeout_ms: 300000,
      });
      promptResult = response.result;

      // W01/F02: status:ok yalniz JSON parse + changeset schema sonrasi yazilir.
      let changeset: import("../workers/opencode/model-schemas.js").CandidateChangeSet;
      try {
        changeset = CandidateChangeSetSchema.parse(response.value);
      } catch (error) {
        const failure = new WorkerRequestFailure("SCHEMA_MISMATCH", `worker changeset semasi uyumsuz: ${String(error)}`, promptResult);
        finalizeAttempt("error", promptResult, failure.outcome_kind, null);
        throw failure;
      }
      const rawText = JSON.stringify(response.value);
      finalizeAttempt("ok", promptResult, classBodyTruncated ? "CLASS_BODY_TRUNCATED_12K" : null, createHash("sha256").update(rawText, "utf8").digest("hex"));
      return changeset;
    } catch (error) {
      const failure = error instanceof WorkerRequestFailure ? error : new WorkerRequestFailure("SERVER_ERROR", String(error), promptResult);
      const status: "timeout" | "error" | "aborted" = failure.outcome_kind === "REQUEST_TIMEOUT" ? "timeout" : failure.outcome_kind === "CANCELLED" ? "aborted" : "error";
      finalizeAttempt(status, failure.result ?? promptResult, failure.outcome_kind, null);
      try {
        await client.abortSession(session.session_id);
      } catch {
        // abort hatasi primary hatayi maskelemez
      }
      throw failure;
    } finally {
      // Worker server yalniz bu aday isteginin sahip oldugu child'dir.
      serverManager.stopOwnedServer();
    }
  }
}

/**
 * FIN05/6.3: Baska session'dan eski cevap veya iptalden sonra gelen cevap kabul edilemez.
 * Worker cevabi yalniz ayni session_id ve tamamlanmis assistant mesajindan okunur.
 */
export function isStaleWorkerResponse(responseSessionId: string | null, expectedSessionId: string, aborted: boolean): boolean {
  if (aborted) {
    return true;
  }
  if (responseSessionId === null || responseSessionId !== expectedSessionId) {
    return true;
  }
  return false;
}
