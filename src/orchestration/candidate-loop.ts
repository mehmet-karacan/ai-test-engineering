/**
 * Aday kabul dongusu: iterate (candidate -> apply -> run -> coverage -> kalite -> kabul/red).
 * Kazanim kabul: hard gate'ler + coverage ayni kapsamla karsilastirilir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../domain/errors.js";
import { PatchApplier } from "../application/patch-applier.js";
import { assertQualityGate, scanTestQuality, type QualityFinding } from "../policies/quality-gate.js";
import { MavenRunner, type RunResult } from "../runners/maven-runner.js";
import { parseJacocoXml, findClassInReport, type CounterKind } from "../coverage/jacoco-parser.js";
import { evaluateMetric, evaluateTarget, type MetricEvaluation } from "../coverage/coverage-math.js";
import { parseSurefireReports, buildPlan, type BaselineResult } from "../orchestration/build-plan.js";
import type { CandidateChangeSet } from "../workers/opencode/model-schemas.js";

export interface IterationBudget {
  max_candidate_iterations: number;
  max_repairs_per_candidate: number;
  no_progress_window: number;
}

export interface CandidateDecision {
  iteration: number;
  decision: "adopted" | "rejected" | "needs_review";
  reason: string;
  coverage_before_bps: number | null;
  coverage_after_bps: number | null;
  quality_findings: QualityFinding[];
  regression_failures: string[];
  run_exit_code: number | null;
}

export interface IterationLoopResult {
  best_coverage_bps: number | null;
  iterations: CandidateDecision[];
  budget_exhausted: boolean;
  plateau: boolean;
  outcome: "TARGET_REACHED" | "TARGET_NOT_MET_PLATEAU" | "TARGET_NOT_MET_BUDGET" | "IN_PROGRESS";
}

export interface CoverageLookup {
  (projectRoot: string, fqn: string): { line: { covered: number; missed: number } | undefined; branch: { covered: number; missed: number } | undefined } | undefined;
}

export function readCoverageAfterRun(projectRoot: string, fqn: string): { line: { covered: number; missed: number } | undefined; branch: { covered: number; missed: number } | undefined } | undefined {
  const xmlPath = join(projectRoot, "target", "site", "jacoco", "jacoco.xml");
  if (!existsSync(xmlPath)) {
    return undefined;
  }
  const report = parseJacocoXml(xmlPath);
  const cls = findClassInReport(report, fqn);
  if (!cls) {
    return undefined;
  }
  return { line: cls.line, branch: cls.branch };
}

export function basisPointsFrom(pair: { covered: number; missed: number } | undefined): number | null {
  if (!pair) {
    return null;
  }
  const n = pair.covered + pair.missed;
  if (n <= 0) {
    return null;
  }
  return Math.floor((pair.covered * 10000) / n);
}

export interface IterateOptions {
  project_root: string;
  target_fqn: string;
  target_module_path: string;
  line_target_bps: number;
  branch_target_bps: number;
  budget: IterationBudget;
  generate_candidate: () => Promise<CandidateChangeSet | null>;
  staging_root: string;
  timeout_ms_per_run?: number;
}

export class CandidateLoop {
  private readonly runner: MavenRunner;

  constructor(runner?: MavenRunner) {
    this.runner = runner ?? new MavenRunner();
  }

  /**
   * Staging'deki aday dosyalarini olcum icin gecici overlay olarak projenin test kokune kopyalar.
   * Orijinal dirty kaynak korunur; run sonrasi overlay temizlenir.
   */
  private applyOverlay(stagingRoot: string, projectRoot: string, changes: CandidateChangeSet["changes"]): Array<{ path: string; backup: Buffer | null }> {
    const applied: Array<{ path: string; backup: Buffer | null }> = [];
    for (const change of changes) {
      if (change.action === "delete") {
        continue;
      }
      const normalized = change.path.replace(/\//g, "\\");
      const overlaySource = join(stagingRoot, normalized);
      if (!existsSync(overlaySource)) {
        continue;
      }
      const projectTarget = join(projectRoot, normalized);
      const backup = existsSync(projectTarget) ? readFileSync(projectTarget) : null;
      mkdirSync(join(projectTarget, ".."), { recursive: true });
      cpSync(overlaySource, projectTarget);
      applied.push({ path: change.path, backup });
    }
    return applied;
  }

  private revertOverlay(projectRoot: string, applied: Array<{ path: string; backup: Buffer | null }>): void {
    for (const entry of applied) {
      const projectTarget = join(projectRoot, entry.path.replace(/\//g, "\\"));
      if (entry.backup !== null) {
        writeFileSync(projectTarget, entry.backup);
      } else {
        rmSync(projectTarget, { force: true });
      }
    }
  }

  async iterate(options: IterateOptions, startIteration = 1): Promise<IterationLoopResult> {
    const iterations: CandidateDecision[] = [];
    let bestCoverageBps: number | null = null;
    let noProgressCount = 0;
    let iteration = startIteration;
    let budgetExhausted = false;
    let plateau = false;
    let outcome: IterationLoopResult["outcome"] = "IN_PROGRESS";

    const baselineCoverage = readCoverageAfterRun(options.project_root, options.target_fqn);
    const baselineBps = basisPointsFrom(baselineCoverage?.line);
    bestCoverageBps = baselineBps;

    while (iteration <= options.budget.max_candidate_iterations) {
      const candidate = await options.generate_candidate();
      if (candidate === null) {
        plateau = true;
        outcome = bestCoverageBps !== null && bestCoverageBps >= options.line_target_bps ? "TARGET_REACHED" : "TARGET_NOT_MET_PLATEAU";
        break;
      }

      const applier = new PatchApplier(options.project_root, [{ module_relative_path: options.target_module_path, test_root: "src/test/java" }], options.staging_root);
      const applyResult = applier.apply(candidate);

      if (applyResult.failed.length > 0) {
        iterations.push({
          iteration,
          decision: "rejected",
          reason: `Patch uygulama basarisiz: ${applyResult.failed[0]!.reason}`,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: null,
        });
        iteration++;
        continue;
      }

      const qualityFindings: QualityFinding[] = [];
      let qualityFailed = false;
      for (const change of candidate.changes) {
        if (change.action !== "delete" && (change.new_content ?? change.patch)) {
          try {
            assertQualityGate(change.new_content ?? change.patch!, change.path);
          } catch (error) {
            qualityFailed = true;
            if (error instanceof AppError && error.details && Array.isArray(error.details["findings"])) {
              qualityFindings.push(...(error.details["findings"] as QualityFinding[]));
            } else {
              qualityFindings.push({ rule_id: "QUALITY_GATE", severity: "critical", location: change.path, evidence: String(error) });
            }
          }
        }
      }

      if (qualityFailed) {
        iterations.push({
          iteration,
          decision: "rejected",
          reason: "Kalite kapisi basarisiz",
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          quality_findings: qualityFindings,
          regression_failures: [],
          run_exit_code: null,
        });
        iteration++;
        continue;
      }

      const plan = buildPlan(options.project_root, [options.target_module_path]);
      const goals = plan.maven_goals_coverage;

      const overlay = this.applyOverlay(options.staging_root, options.project_root, candidate.changes);
      let run: RunResult;
      let afterBps: number | null = null;
      try {
        run = await this.runner.run({
          working_dir: options.project_root,
          goals,
          timeout_ms: options.timeout_ms_per_run ?? 600000,
          log_dir: join(options.project_root, "target", `aitest-iter-${iteration}-logs`),
        });

        const suites = parseSurefireReports(options.project_root, options.target_module_path);
        const regressionFailures = suites.flatMap((s) => s.failed_test_names);

        const afterCoverage = readCoverageAfterRun(options.project_root, options.target_fqn);
        afterBps = basisPointsFrom(afterCoverage?.line);

        if (regressionFailures.length > 0) {
          iterations.push({
            iteration,
            decision: "rejected",
            reason: `Regresyon: ${regressionFailures.join(", ")}`,
            coverage_before_bps: bestCoverageBps,
            coverage_after_bps: afterBps,
            quality_findings: [],
            regression_failures: regressionFailures,
            run_exit_code: run.exit_code,
          });
          iteration++;
          continue;
        }

        if (run.exit_code !== 0) {
          iterations.push({
            iteration,
            decision: "rejected",
            reason: `Maven run basarisiz (exit ${run.exit_code})`,
            coverage_before_bps: bestCoverageBps,
            coverage_after_bps: afterBps,
            quality_findings: [],
            regression_failures: [],
            run_exit_code: run.exit_code,
          });
          iteration++;
          continue;
        }
      } finally {
        this.revertOverlay(options.project_root, overlay);
      }

      const meaningfulGain = afterBps !== null && (bestCoverageBps === null || afterBps > bestCoverageBps);
      if (!meaningfulGain) {
        noProgressCount++;
        iterations.push({
          iteration,
          decision: "rejected",
          reason: noProgressCount >= options.budget.no_progress_window ? "Plateau: ilerleme yok" : "Anlamsiz kazanc yok",
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: afterBps,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: run.exit_code,
        });
        if (noProgressCount >= options.budget.no_progress_window) {
          plateau = true;
          outcome = "TARGET_NOT_MET_PLATEAU";
          break;
        }
        iteration++;
        continue;
      }

      noProgressCount = 0;
      bestCoverageBps = afterBps;
      iterations.push({
        iteration,
        decision: "adopted",
        reason: `Coverage kazanci: ${bestCoverageBps} bps`,
        coverage_before_bps: baselineBps,
        coverage_after_bps: afterBps,
        quality_findings: [],
        regression_failures: [],
        run_exit_code: run.exit_code,
      });

      const targetMet = afterBps !== null && afterBps >= options.line_target_bps;
      if (targetMet) {
        outcome = "TARGET_REACHED";
        break;
      }
      iteration++;
    }

    if (iteration > options.budget.max_candidate_iterations && outcome === "IN_PROGRESS") {
      budgetExhausted = true;
      outcome = "TARGET_NOT_MET_BUDGET";
    }

    return {
      best_coverage_bps: bestCoverageBps,
      iterations,
      budget_exhausted: budgetExhausted,
      plateau,
      outcome,
    };
  }
}
