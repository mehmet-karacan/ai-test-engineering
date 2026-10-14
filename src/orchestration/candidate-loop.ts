/**
 * Aday kabul dongusu: iterate (candidate -> apply -> run -> coverage -> kalite -> kabul/red).
 * Kazanim kabul: hard gate'ler + coverage ayni kapsamla karsilastirilir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync, lstatSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { PatchApplier } from "../application/patch-applier.js";
import { assertQualityGate, isSutShadowing, type QualityFinding } from "../policies/quality-gate.js";
import { MavenRunner, strictTestExecutionProperties, type RunResult } from "../runners/maven-runner.js";
import { parseJacocoXml, findClassInReport } from "../coverage/jacoco-parser.js";
import { summarizeTestReports, assertCoverageConfigured, buildPlan, classifyTestRun, type SurefireSuite } from "../orchestration/build-plan.js";
import type { CandidateChangeSet } from "../workers/opencode/model-schemas.js";

export interface IterationBudget {
  max_candidate_iterations: number;
  max_repairs_per_candidate: number;
  no_progress_window: number;
  /** P05-B: resume manifest icin mutlak logical iteration siniri. */
  iteration_limit?: number;
  /** P05-B: resume manifest icin kalan fiziksel attempt havuzu. */
  remaining_attempts?: number;
}

export interface CandidateDecision {
  attempt_ordinal: number;
  iteration: number;
  repair_for_attempt?: number | null;
  decision: "adopted" | "rejected" | "needs_review";
  reason: string;
  coverage_before_bps: number | null;
  coverage_after_bps: number | null;
  quality_findings: QualityFinding[];
  regression_failures: string[];
  run_exit_code: number | null;
}

/** P05-B/PP26: onceki aday denemesinden yalniz sinirli arac olgulari tasinir. */
export interface CandidateGenerationFeedback {
  attempt_kind: "initial" | "repair";
  repair_ordinal: number;
  repair_of_iteration: number;
  previous_failure: string;
  failed_tests: string[];
  quality_findings: QualityFinding[];
  run_exit_code: number | null;
  coverage_after_bps: number | null;
  remaining_deadline_ms: number | null;
}

export interface IterationLoopResult {
  best_coverage_bps: number | null;
  best_branch_coverage_bps: number | null;
  iterations: CandidateDecision[];
  budget_exhausted: boolean;
  plateau: boolean;
  outcome: "TARGET_REACHED" | "TARGET_ALREADY_MET" | "TARGET_NOT_MET_PLATEAU" | "TARGET_NOT_MET_BUDGET" | "TARGET_NOT_MET_BLOCKED" | "IN_PROGRESS";
  /** Son guvenilir accepted setin calistigi workspace; final replay icin provenance. */
  trusted_workspace: string | null;
  /** P05-B: bu loop icinde kullanilan bounded repair denemeleri. */
  repairs_used: number;
  /** P05-B: son checkpoint'e kadar biriken no-progress sayaci. */
  no_progress_count: number;
  /** P05-B: repair'ler dahil toplam candidate attempt sayisi. */
  attempts_used: number;
}

export interface CoverageLookup {
  (projectRoot: string, fqn: string): { line: { covered: number; missed: number } | undefined; branch: { covered: number; missed: number } | undefined } | undefined;
}

export interface CoverageReadOptions {
  minimum_mtime_ms?: number;
  expected_source_filename?: string;
  source_relative_path?: string;
  require_class_file?: boolean;
  require_session_info?: boolean;
}

export interface CoverageEvidence {
  line: { covered: number; missed: number } | undefined;
  branch: { covered: number; missed: number } | undefined;
  report_path: string;
  report_sha256: string;
  source_sha256: string | null;
  binary_class_id: string | null;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readCoverageEvidenceAfterRun(projectRoot: string, fqn: string, moduleRelativePath = "", options: CoverageReadOptions = {}): CoverageEvidence | undefined {
  const xmlPath = join(projectRoot, moduleRelativePath, "target", "site", "jacoco", "jacoco.xml");
  if (!existsSync(xmlPath)) {
    return undefined;
  }
  if (options.minimum_mtime_ms !== undefined && statSync(xmlPath).mtimeMs < options.minimum_mtime_ms) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", `Stale JaCoCo raporu reddedildi: ${xmlPath}`, { reason_code: "STALE_COVERAGE_EVIDENCE", path: xmlPath });
  }
  const report = parseJacocoXml(xmlPath);
  if (options.require_session_info && report.session_infos.length === 0) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", `JaCoCo session bilgisi yok: ${xmlPath}`, { reason_code: "JACOCO_SESSION_MISSING", path: xmlPath });
  }
  const cls = findClassInReport(report, fqn);
  if (!cls) {
    return undefined;
  }
  if (options.expected_source_filename !== undefined && cls.sourcefilename !== options.expected_source_filename) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", `JaCoCo source eslesmedi: ${cls.sourcefilename} != ${options.expected_source_filename}`, {
      reason_code: "JACOCO_SOURCE_MISMATCH",
      fqn,
      path: xmlPath,
    });
  }
  const sourcePath = options.source_relative_path ? join(projectRoot, options.source_relative_path) : null;
  if (sourcePath && !existsSync(sourcePath)) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", `Coverage source dosyasi yok: ${sourcePath}`, { reason_code: "JACOCO_SOURCE_MISSING", fqn, path: xmlPath });
  }
  const classPath = join(projectRoot, moduleRelativePath, "target", "classes", `${fqn.replace(/\./g, "/")}.class`);
  if (options.require_class_file && !existsSync(classPath)) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", `Coverage class dosyasi yok: ${classPath}`, { reason_code: "JACOCO_CLASS_MISSING", fqn, path: xmlPath });
  }
  return {
    line: cls.line,
    branch: cls.branch,
    report_path: xmlPath,
    report_sha256: sha256File(xmlPath),
    source_sha256: sourcePath && existsSync(sourcePath) ? sha256File(sourcePath) : null,
    binary_class_id: existsSync(classPath) ? sha256File(classPath) : null,
  };
}

export function readCoverageAfterRun(projectRoot: string, fqn: string, moduleRelativePath = "", options: CoverageReadOptions = {}): { line: { covered: number; missed: number } | undefined; branch: { covered: number; missed: number } | undefined } | undefined {
  const evidence = readCoverageEvidenceAfterRun(projectRoot, fqn, moduleRelativePath, options);
  return evidence ? { line: evidence.line, branch: evidence.branch } : undefined;
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

/**
 * W04/F10/N26-N27: tek raw-counter evaluator - aday kazanc karari.
 * - Branch-only kazanc kabul: LINE ayni/iyilesme + BRANCH artis -> kabul.
 * - Metrik gerilemesi red: LINE veya BRANCH gerilemisse kabul edilmez (koruma kurali).
 * - BRANCH non-applicable ise yalniz LINE kazanci yeterli.
 * - Raw counter bos (null) metrik yalniz non-applicable iken kabul edilir.
 */
export interface GainEvaluation {
  accepted: boolean;
  reason: string;
  line_improved: boolean;
  branch_improved: boolean;
  line_regressed: boolean;
  branch_regressed: boolean;
}

type RawCounter = { covered: number; missed: number };

function compareCounterValues(before: RawCounter | undefined, after: RawCounter | undefined): -1 | 0 | 1 | null {
  if (!after) {
    return null;
  }
  const afterTotal = after.covered + after.missed;
  if (afterTotal <= 0) {
    return null;
  }
  if (!before) {
    return 1;
  }
  const beforeTotal = before.covered + before.missed;
  if (beforeTotal <= 0) {
    return 1;
  }
  const left = after.covered * beforeTotal;
  const right = before.covered * afterTotal;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function evaluateCandidateGain(
  best: { line: number | null; branch: number | null },
  after: { line: number | null; branch: number | null },
  branchApplicable: boolean,
  exact?: { best: { line: RawCounter | undefined; branch: RawCounter | undefined }; after: { line: RawCounter | undefined; branch: RawCounter | undefined } },
): GainEvaluation {
  const lineComparison = exact ? compareCounterValues(exact.best.line, exact.after.line) : after.line === null ? null : best.line === null ? 1 : after.line > best.line ? 1 : after.line < best.line ? -1 : 0;
  const branchComparison = exact ? compareCounterValues(exact.best.branch, exact.after.branch) : after.branch === null ? null : best.branch === null ? 1 : after.branch > best.branch ? 1 : after.branch < best.branch ? -1 : 0;
  const lineImproved = lineComparison === 1;
  const lineRegressed = lineComparison === -1;
  const branchImproved = branchComparison === 1;
  const branchRegressed = branchComparison === -1;

  if (after.line === null) {
    return { accepted: false, reason: "LINE olcumu yok", line_improved: lineImproved, branch_improved: branchImproved, line_regressed: lineRegressed, branch_regressed: branchRegressed };
  }
  // koruma kurali: herhangi bir applicable metrik gerilemisse kabul edilmez
  if (lineRegressed) {
    return { accepted: false, reason: `LINE geriledi (${best.line} -> ${after.line})`, line_improved: lineImproved, branch_improved: branchImproved, line_regressed: true, branch_regressed: branchRegressed };
  }
  // BRANCH is requested/applicable ise eksik BRANCH kaniti kazanc olarak kabul
  // edilemez. LINE artisi, kayip branch verisini iyilestirmez (N27).
  if (branchApplicable && after.branch === null) {
    return { accepted: false, reason: "BRANCH olcumu yok", line_improved: lineImproved, branch_improved: false, line_regressed: lineRegressed, branch_regressed: false };
  }
  if (branchApplicable && branchRegressed) {
    return { accepted: false, reason: `BRANCH geriledi (${best.branch} -> ${after.branch})`, line_improved: lineImproved, branch_improved: branchImproved, line_regressed: false, branch_regressed: true };
  }
  const anyGain = lineImproved || (branchApplicable && branchImproved);
  if (!anyGain) {
    return { accepted: false, reason: "kazanc yok (LINE ve BRANCH ayni)", line_improved: false, branch_improved: false, line_regressed: false, branch_regressed: false };
  }
  return {
    accepted: true,
    reason: branchApplicable
      ? `LINE ${lineImproved ? "artti" : "ayni"}, BRANCH ${branchImproved ? "artti" : "ayni"}`
      : `LINE ${lineImproved ? "artti" : "ayni"} (BRANCH non-applicable)`,
    line_improved: lineImproved,
    branch_improved: branchImproved,
    line_regressed: false,
    branch_regressed: false,
  };
}

function resolveAcceptedDir(acceptedDir: string): string {
  return acceptedDir;
}

const DELETED_FILES_MANIFEST = ".aitest-deleted.json";

function safeRelativeParts(path: string): string[] {
  if (path.length === 0 || path.includes("\\") || path.includes("\0") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/")) {
    throw new AppError("POLICY_VIOLATION", `Candidate yolu gecersiz: ${path}`, { reason_code: "PATH_ESCAPE" });
  }
  const parts = path.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new AppError("POLICY_VIOLATION", `Candidate yolu containment disi: ${path}`, { reason_code: "PATH_ESCAPE" });
  }
  return parts;
}

function containedPath(root: string, path: string): string {
  const absRoot = resolve(root);
  const absPath = resolve(absRoot, ...safeRelativeParts(path));
  const rel = relative(absRoot, absPath);
  if (rel.length === 0 || rel.startsWith("..") || rel.includes(".." + "\\") || rel.includes("../")) {
    throw new AppError("POLICY_VIOLATION", `Candidate yolu kok disina cikiyor: ${path}`, { reason_code: "PATH_ESCAPE" });
  }
  return absPath;
}

function readDeletedFiles(acceptedDir: string): Set<string> {
  const marker = join(acceptedDir, DELETED_FILES_MANIFEST);
  if (!existsSync(marker)) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("invalid deletion manifest");
    }
    return new Set(parsed.map((item) => String(item)));
  } catch {
    throw new AppError("STORAGE_ERROR", "Accepted deletion manifest bozuk", { reason_code: "ACCEPTED_SET_CORRUPT" });
  }
}

function writeDeletedFiles(acceptedDir: string, deleted: Set<string>): void {
  mkdirSync(acceptedDir, { recursive: true });
  const marker = join(acceptedDir, DELETED_FILES_MANIFEST);
  writeFileSync(marker, JSON.stringify([...deleted].sort(), null, 2), "utf8");
}

function collectAcceptedChanges(acceptedDir: string): Array<{ path: string; sha256: string; action: "create" | "delete" }> {
  const changes: Array<{ path: string; sha256: string; action: "create" | "delete" }> = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      if (name === DELETED_FILES_MANIFEST) {
        continue;
      }
      const full = join(directory, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        const path = relative(acceptedDir, full).replace(/\\/g, "/");
        changes.push({ path, sha256: sha256Data(readFileSync(full)), action: "create" });
      } else {
        throw new AppError("POLICY_VIOLATION", `Accepted set symlink/ozel dosya iceriyor: ${full}`, { reason_code: "ACCEPTED_SET_UNSAFE" });
      }
    }
  };
  if (existsSync(acceptedDir)) {
    walk(acceptedDir);
    for (const path of readDeletedFiles(acceptedDir)) {
      if (!changes.some((change) => change.path === path)) {
        changes.push({ path, sha256: sha256Data(Buffer.alloc(0)), action: "delete" });
      }
    }
  }
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function sha256Data(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface IterateOptions {
  project_root: string;
  /** P06/PP20: baseline calismasinda dondurulan kaynak workspace'i. */
  frozen_source_root?: string;
  target_fqn: string;
  target_module_path: string;
  line_target_bps: number;
  branch_target_bps: number;
  budget: IterationBudget;
  /** P05-B/PP26: job icindeki tum hedefler icin ortak aday/repair maliyet havuzu. */
  attempt_budget?: number;
  /** P06/PP21: dispatcher tarafindan frozen baseline run'ina baglanan raw counter. */
  baseline_coverage?: { line: { covered: number; missed: number } | undefined; branch: { covered: number; missed: number } | undefined };
  /** P06/PP22: effective Maven test root; project-relative path. */
  target_test_root?: string;
  /** WN54: frozen test class selectors for the concrete target. */
  test_selectors?: string[];
  /** P06/PP28: JaCoCo class-source identity icin frozen kaynak yolu. */
  target_relative_path?: string;
  /** P05-B: resume'da logical limit start iteration'dan bagimsiz korunur. */
  iteration_limit?: number;
  /** iteration is supplied so a restart can reuse the same durable task for
   * the same logical candidate instead of creating a fresh UUID. */
  generate_candidate: (feedback?: CandidateGenerationFeedback, iteration?: number) => Promise<CandidateChangeSet | null>;
  staging_root: string;
  timeout_ms_per_run?: number;
  /** PR06/PP26: tum aday ve repair denemeleri icin job'a ait mutlak deadline. */
  deadline_at?: number;
  /** D05/F04: kabul edilen aday dosyalari birikimli accepted snapshot'a yazilir (opsiyonel) */
  accepted_snapshot_dir?: string;
  /** W02/F08: aday workspace'lerin kurulacagi kok (opsiyonel; varsayilan staging_root/workspaces) */
  workspace_root?: string;
  /** D05/F04: kabul kararindan sonra cagirilir (checkpoint/blob baglantisi) */
  on_accepted?: (info: {
    iteration: number;
    files: Array<{ path: string; sha256: string; action: "create" | "delete" }>;
    line_bps: number;
    branch_bps: number | null;
    remaining_budget: IterationBudget;
  }) => void;
  /** Worker kapali/izolasyon hazir degil gibi plateau olmayan typed blocker. */
  generation_failure_reason?: () => string | null;
  /** FIN06/12.1: her aday kararindan sonra cagirilir (DB candidate_iterations kaydi) */
  on_decision?: (info: {
    attempt_ordinal: number;
    iteration: number;
    repair_for_attempt?: number | null;
    decision: "adopted" | "rejected";
    reason: string;
    changeset_hash: string | null;
    coverage_before_bps: number | null;
    coverage_after_bps: number | null;
    error_fingerprint?: string | null;
  }) => void;
  /** P06/PP31: her candidate run'in test inventory/provenance kaydi icin callback. */
  on_run?: (info: {
    attempt_ordinal: number;
    iteration: number;
    execution_root: string;
    run: RunResult;
    test_inventory: SurefireSuite[];
    started_at: number;
    finished_at: number;
    coverage_report_path: string;
  }) => void;
}

export class CandidateLoop {
  private readonly runner: MavenRunner;
  private readonly acceptedSetDir: string | null;
  private readonly stagingDir: string;

  /**
   * FIN00.e/22.2 (4.2 kurali): CandidateLoop kendi icinde host runner YARATAMAZ;
   * verified runner capability constructor seviyesinde ZORUNLU verilir.
   * Varsayilan yok; parametre verilmeyen kurulum hata verir (fail-closed).
   * W02/F08: acceptedSetDir/stagingDir ayrı candidate workspace kurulumu icin.
   */
  constructor(runner: MavenRunner, options?: { accepted_set_dir?: string; staging_root?: string }) {
    if (runner === undefined || runner === null) {
      throw new AppError("BLOCKED_ISOLATION", "CandidateLoop verified runner capability'siz kurulamaz; host runner varsayilani kaldirildi (FIN00.e)");
    }
    this.runner = runner;
    this.acceptedSetDir = options?.accepted_set_dir ?? null;
    this.stagingDir = options?.staging_root ?? "";
  }

  /**
   * W02/F08: aday overlay ORIJINAL checkout'a YAZMAZ; ayri candidate workspace kurulur.
   * Candidate workspace: orijinal projenin tam kopyasi + accepted set + aday degisiklikleri;
   * run bu workspace'te calisir. Orijinal checkout hic degismez.
   * Native path guvenligi: path.join kullanilir; sabit backslash donusumu yok.
   */
  private buildCandidateWorkspace(
    projectRoot: string,
    changes: CandidateChangeSet["changes"],
    workspaceRoot: string,
    iteration: number,
    stagingRoot: string,
    acceptedSetDir: string | null,
  ): string {
    const absWorkspaceRoot = resolve(workspaceRoot);
    const workspace = containedPath(absWorkspaceRoot, `candidate-iter-${iteration}`);
    mkdirSync(join(workspace, ".."), { recursive: true });
    // Ayni iteration numarasinin eski target/log ciktisini yeniden kullanmak
    // stale coverage ve rejected aday karisimini engellemez; her kurulum temizdir.
    rmSync(workspace, { recursive: true, force: true });
    // W02/F08: orijinal projenin tam kopyasi workspace'e kurulur (pom/main/test dahil);
    // node_modules/target hariç (Maven kendi target'ini uretir; bagimliliklar cache'den).
    if (!existsSync(workspace)) {
      cpSync(projectRoot, workspace, {
        recursive: true,
        filter: (src) => {
          const name = src.split(/[\\/]/).pop() ?? "";
          return name !== "node_modules" && name !== ".git" && name !== "target";
        },
      });
    }
    // accepted set (parent kabul edilen dosyalar) workspace'e yazilir
    if (acceptedSetDir && existsSync(acceptedSetDir)) {
      cpSync(acceptedSetDir, workspace, { recursive: true, force: true });
      // Accepted set icindeki silme kayitlari kaynak agacina marker olarak
      // tasinmaz; yalniz ilgili dosyalar workspace'ten kaldirilir.
      const deleted = readDeletedFiles(acceptedSetDir);
      rmSync(join(workspace, DELETED_FILES_MANIFEST), { force: true });
      for (const path of deleted) {
        rmSync(containedPath(workspace, path), { recursive: true, force: true });
      }
    }
    // aday degisiklikler workspace'e yazilir (staging'den)
    for (const change of changes) {
      const projectTarget = containedPath(workspace, change.path);
      if (change.action === "delete") {
        rmSync(projectTarget, { recursive: true, force: true });
        continue;
      }
      const overlaySource = containedPath(stagingRoot, change.path);
      if (!existsSync(overlaySource)) {
        continue;
      }
      mkdirSync(join(projectTarget, ".."), { recursive: true });
      cpSync(overlaySource, projectTarget, { force: true });
    }
    return workspace;
  }

  /**
   * W02/F08: orijinal checkout'ta aday olcumu YOK; readCoverageAfterRun workspace'ten okunur.
   */
  private workspaceCoverage(workspace: string, fqn: string, moduleRelativePath = "", runStartedAt?: number, expectedSourceFilename?: string, expectedSourcePath?: string): { line: { covered: number; missed: number } | undefined; branch: { covered: number; missed: number } | undefined } | undefined {
    return readCoverageAfterRun(workspace, fqn, moduleRelativePath, {
      ...(runStartedAt !== undefined ? { minimum_mtime_ms: runStartedAt - 1000, require_session_info: true } : {}),
      ...(expectedSourceFilename !== undefined ? { expected_source_filename: expectedSourceFilename } : {}),
      ...(expectedSourcePath !== undefined ? { source_relative_path: expectedSourcePath } : {}),
    });
  }

  async iterate(options: IterateOptions, startIteration = 1): Promise<IterationLoopResult> {
    const iterations: CandidateDecision[] = [];
    let bestCoverageBps: number | null = null;
    let bestBranchBps: number | null = null;
    let trustedWorkspace: string | null = null;
    let noProgressCount = 0;
    let iteration = startIteration;
    let budgetExhausted = false;
    let plateau = false;
    let outcome: IterationLoopResult["outcome"] = "IN_PROGRESS";
    let repairFeedback: CandidateGenerationFeedback | undefined;
    let repairCount = 0;
    let repairsUsed = 0;
    const deadlineExceeded = (): boolean => options.deadline_at !== undefined && Date.now() >= options.deadline_at;
    const iterationLimit = options.iteration_limit
      ?? (startIteration > 1
        ? startIteration + options.budget.max_candidate_iterations - 1
        : options.budget.max_candidate_iterations);
    const attemptLimit = options.attempt_budget === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, options.attempt_budget);
    const scheduleRetry = (feedback: Omit<CandidateGenerationFeedback, "attempt_kind" | "repair_ordinal" | "repair_of_iteration" | "remaining_deadline_ms">): "repair" | "next" | "stop" => {
      noProgressCount++;
      if (noProgressCount >= options.budget.no_progress_window) {
        plateau = true;
        outcome = "TARGET_NOT_MET_PLATEAU";
        repairFeedback = undefined;
        return "stop";
      }
      if (repairCount < options.budget.max_repairs_per_candidate) {
        repairCount++;
        repairsUsed++;
        repairFeedback = {
          ...feedback,
          attempt_kind: "repair",
          repair_ordinal: repairCount,
          repair_of_iteration: iteration,
          remaining_deadline_ms: options.deadline_at === undefined ? null : Math.max(0, options.deadline_at - Date.now()),
        };
        return "repair";
      }
      repairCount = 0;
      repairFeedback = undefined;
      iteration++;
      return "next";
    };

    const frozenSourceRoot = options.frozen_source_root ?? options.project_root;
    const baselineCoverage = options.baseline_coverage ?? readCoverageAfterRun(frozenSourceRoot, options.target_fqn, options.target_module_path);
    const baselineBps = basisPointsFrom(baselineCoverage?.line);
    bestCoverageBps = baselineBps;
    bestBranchBps = basisPointsFrom(baselineCoverage?.branch);
    let bestLineCounter = baselineCoverage?.line;
    let bestBranchCounter = baselineCoverage?.branch;
    let branchNonApplicable = baselineCoverage?.branch !== undefined
      && baselineCoverage.branch.covered + baselineCoverage.branch.missed === 0;

    /**
     * Tek hedef-karar yolunu degerlendirir (D05/F03): tum done/early-exit/candidate-null/plateau/result
     * yollari ayni fonksiyonu kullanir; LINE ve BRANCH esiklerini birlikte kontrol eder.
     */
    const evaluateGoalMet = (lineCounter: RawCounter | undefined, branchCounter: RawCounter | undefined, branchIsNonApplicable = branchNonApplicable): boolean => {
      const lineTotal = lineCounter ? lineCounter.covered + lineCounter.missed : 0;
      if (!lineCounter || lineTotal <= 0) {
        return false;
      }
      const lineMet = lineCounter.covered * 10000 >= options.line_target_bps * lineTotal;
      const branchApplicable = options.branch_target_bps > 0;
      if (!branchApplicable) {
        return lineMet;
      }
      if (!branchCounter && branchIsNonApplicable) {
        return lineMet;
      }
      const branchTotal = branchCounter ? branchCounter.covered + branchCounter.missed : 0;
      if (!branchCounter || branchTotal <= 0) {
        return false;
      }
      return lineMet && branchCounter.covered * 10000 >= options.branch_target_bps * branchTotal;
    };

    if (evaluateGoalMet(bestLineCounter, bestBranchCounter)) {
      return {
        best_coverage_bps: bestCoverageBps,
        best_branch_coverage_bps: bestBranchBps,
        iterations,
        budget_exhausted: false,
        plateau: false,
        outcome: "TARGET_ALREADY_MET",
        trusted_workspace: frozenSourceRoot,
        repairs_used: 0,
        no_progress_count: 0,
        attempts_used: 0,
      };
    }

    while (iteration <= iterationLimit && iterations.length < attemptLimit) {
      if (deadlineExceeded()) {
        budgetExhausted = true;
        outcome = "TARGET_NOT_MET_BUDGET";
        break;
      }
      const currentFeedback = repairFeedback;
      const attemptOrdinal = iterations.length + 1;
      let candidate: CandidateChangeSet | null;
      try {
        candidate = await options.generate_candidate(currentFeedback, iteration);
      } catch (error) {
        const reason = `Worker aday uretimi basarisiz: ${String(error).slice(0, 500)}`;
        const errorFingerprint = sha256Data(reason);
        options.on_decision?.({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason,
          changeset_hash: null,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          error_fingerprint: errorFingerprint,
        });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: null,
        });
        const retry = scheduleRetry({
          previous_failure: reason,
          failed_tests: [],
          quality_findings: [],
          run_exit_code: null,
          coverage_after_bps: null,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }
      if (candidate === null) {
        const generationFailure = options.generation_failure_reason?.() ?? null;
        if (generationFailure) {
          outcome = "TARGET_NOT_MET_BLOCKED";
        } else {
          plateau = true;
          outcome = "TARGET_NOT_MET_PLATEAU";
        }
        break;
      }
      const candidateHash = sha256Data(JSON.stringify(candidate));

      const applier = new PatchApplier(frozenSourceRoot, [{ module_relative_path: options.target_module_path, test_root: options.target_test_root ?? "src/test/java" }], options.staging_root);
      const applyResult = applier.apply(candidate);

      if (applyResult.failed.length > 0) {
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "rejected", reason: `Patch uygulama basarisiz: ${applyResult.failed[0]!.reason}`, changeset_hash: candidateHash, coverage_before_bps: bestCoverageBps, coverage_after_bps: null });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason: `Patch uygulama basarisiz: ${applyResult.failed[0]!.reason}`,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: null,
        });
        const retry = scheduleRetry({
          previous_failure: `Patch uygulama basarisiz: ${applyResult.failed[0]!.reason}`,
          failed_tests: [],
          quality_findings: [],
          run_exit_code: null,
          coverage_after_bps: null,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }

      const qualityFindings: QualityFinding[] = [];
      let qualityFailed = false;
      for (const change of candidate.changes) {
        if (change.action !== "delete" && (change.new_content ?? change.patch)) {
          // K06/B10: SUT shadowing candidate kabul zincirinde kontrol edilir (ayni pakette ayni sinif adi):
          if (isSutShadowing(change.path, change.new_content ?? change.patch!, options.target_fqn)) {
            qualityFailed = true;
            qualityFindings.push({ rule_id: "SUT_SHADOWING", severity: "critical", location: change.path, evidence: `Test kaynaginda production sinifi aynI FQCN ile tanimlanmis: ${options.target_fqn}` });
            continue;
          }
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
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "rejected", reason: "Kalite kapisi basarisiz", changeset_hash: candidateHash, coverage_before_bps: bestCoverageBps, coverage_after_bps: null });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason: "Kalite kapisi basarisiz",
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          quality_findings: qualityFindings,
          regression_failures: [],
          run_exit_code: null,
        });
        const retry = scheduleRetry({
          previous_failure: "Kalite kapisi basarisiz",
          failed_tests: [],
          quality_findings: qualityFindings,
          run_exit_code: null,
          coverage_after_bps: null,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }

      const plan = buildPlan(frozenSourceRoot, [options.target_module_path]);
      assertCoverageConfigured(plan, [options.target_module_path]);
      const goals = plan.maven_goals_coverage;

      // W02/F08: aday ORIJINAL checkout'a yazilmaz; ayri candidate workspace kurulur ve
      // run/olcum bu workspace uzerinden yapilir. Orijinal checkout hic degismez.
      const candidateWorkspace = this.buildCandidateWorkspace(
        frozenSourceRoot,
        candidate.changes,
        options.workspace_root ?? join(options.staging_root, "workspaces"),
        iteration,
        options.staging_root,
        options.accepted_snapshot_dir ?? this.acceptedSetDir,
      );
      let afterBps: number | null = null;
      let afterBranchBps: number | null = null;
      const remainingDeadline = options.deadline_at === undefined ? null : Math.max(1, options.deadline_at - Date.now());
      const runStartedAt = Date.now();
      const properties = strictTestExecutionProperties();
      const selectors = [...new Set((options.test_selectors ?? []).filter((selector) => selector.length > 0))].sort();
      if (selectors.length > 0) properties.test = selectors.join(",");
      const run: RunResult = await this.runner.run({
        working_dir: candidateWorkspace,
        goals,
        properties,
        timeout_ms: Math.min(options.timeout_ms_per_run ?? 600000, remainingDeadline ?? Number.MAX_SAFE_INTEGER),
        log_dir: join(candidateWorkspace, "target", `aitest-iter-${iteration}-logs`),
      });
      const runFinishedAt = Date.now();

      if (deadlineExceeded()) {
        budgetExhausted = true;
        outcome = "TARGET_NOT_MET_BUDGET";
        break;
      }

      const testSummary = summarizeTestReports(candidateWorkspace, [options.target_module_path]);
      const suites = testSummary.suites;
      options.on_run?.({
        attempt_ordinal: attemptOrdinal,
        iteration,
        execution_root: candidateWorkspace,
        run,
        test_inventory: suites,
        started_at: runStartedAt,
        finished_at: runFinishedAt,
        coverage_report_path: join(candidateWorkspace, options.target_module_path, "target", "site", "jacoco", "jacoco.xml"),
      });
      const regressionFailures = suites.flatMap((s) => s.failed_test_names);
      const testClassification = classifyTestRun(run, testSummary);

      // WN55/WN57: exit 0, bozuk rapor veya tamamen skip edilmis testleri
      // coverage kazanimi olarak kullanma. Failed run'lar asagidaki mevcut
      // regression/non-zero yollarinda ayrintili feedback almaya devam eder.
      if (testClassification.status === "UNSTABLE") {
        const reason = `Maven test sonucu gecersiz: ${testClassification.reason_code ?? testClassification.status}`;
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "rejected", reason, changeset_hash: candidateHash, coverage_before_bps: bestCoverageBps, coverage_after_bps: null });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: null,
          quality_findings: [],
          regression_failures: regressionFailures,
          run_exit_code: run.exit_code,
        });
        const retry = scheduleRetry({
          previous_failure: reason,
          failed_tests: regressionFailures,
          quality_findings: [],
          run_exit_code: run.exit_code,
          coverage_after_bps: null,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }

      const afterCoverage = this.workspaceCoverage(candidateWorkspace, options.target_fqn, options.target_module_path, runStartedAt, options.target_relative_path ? basename(options.target_relative_path) : undefined, options.target_relative_path);
      afterBps = basisPointsFrom(afterCoverage?.line);
      afterBranchBps = basisPointsFrom(afterCoverage?.branch);

      if (regressionFailures.length > 0) {
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "rejected", reason: `Regresyon: ${regressionFailures.join(", ")}`, changeset_hash: candidateHash, coverage_before_bps: bestCoverageBps, coverage_after_bps: afterBps });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason: `Regresyon: ${regressionFailures.join(", ")}`,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: afterBps,
          quality_findings: [],
          regression_failures: regressionFailures,
          run_exit_code: run.exit_code,
        });
        const retry = scheduleRetry({
          previous_failure: `Regresyon: ${regressionFailures.join(", ")}`,
          failed_tests: regressionFailures,
          quality_findings: [],
          run_exit_code: run.exit_code,
          coverage_after_bps: afterBps,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }

      if (run.exit_code !== 0) {
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "rejected", reason: `Maven run basarisiz (exit ${run.exit_code})`, changeset_hash: candidateHash, coverage_before_bps: bestCoverageBps, coverage_after_bps: afterBps });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason: `Maven run basarisiz (exit ${run.exit_code})`,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: afterBps,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: run.exit_code,
        });
        const retry = scheduleRetry({
          previous_failure: `Maven run basarisiz (exit ${run.exit_code})`,
          failed_tests: [],
          quality_findings: [],
          run_exit_code: run.exit_code,
          coverage_after_bps: afterBps,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }

      // W04/F10/N26: tek raw-counter evaluator - LINE ve BRANCH birlikte degerlendirilir.
      // Branch-only kazanc kabul edilebilir (LINE ayni, BRANCH artmis);
      // LINE artarken mevcut BRANCH gerileyen aday tanimli koruma kuralina takilir.
      const gainEvaluation = evaluateCandidateGain(
        { line: bestCoverageBps, branch: bestBranchBps },
        { line: afterBps, branch: afterBranchBps },
        options.branch_target_bps > 0 && !(afterCoverage?.branch !== undefined && afterCoverage.branch.covered + afterCoverage.branch.missed === 0 && bestBranchBps === null),
        { best: { line: bestLineCounter, branch: bestBranchCounter }, after: { line: afterCoverage?.line, branch: afterCoverage?.branch } },
      );
      if (!gainEvaluation.accepted) {
        const reason = noProgressCount + 1 >= options.budget.no_progress_window
          ? `Plateau: ilerleme yok (${gainEvaluation.reason})`
          : `Anlamsiz kazanc yok (${gainEvaluation.reason})`;
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "rejected", reason, changeset_hash: candidateHash, coverage_before_bps: bestCoverageBps, coverage_after_bps: afterBps });
        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "rejected",
          reason,
          coverage_before_bps: bestCoverageBps,
          coverage_after_bps: afterBps,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: run.exit_code,
        });
        const retry = scheduleRetry({
          previous_failure: reason,
          failed_tests: [],
          quality_findings: [],
          run_exit_code: run.exit_code,
          coverage_after_bps: afterBps,
        });
        if (retry === "stop") {
          break;
        }
        continue;
      }

      const previousBestCoverageBps = bestCoverageBps;
      noProgressCount = 0;
      repairCount = 0;
      repairFeedback = undefined;
      bestCoverageBps = afterBps;
      bestBranchBps = afterBranchBps;
      bestLineCounter = afterCoverage?.line;
      bestBranchCounter = afterCoverage?.branch;
      branchNonApplicable = afterCoverage?.branch !== undefined
        && afterCoverage.branch.covered + afterCoverage.branch.missed === 0
        && bestBranchBps === null;
      trustedWorkspace = candidateWorkspace;

      const adoptedReason = `Coverage kazanci: LINE ${afterBps} bps, BRANCH ${afterBranchBps ?? "N/A"} bps`;
      // P03/PR03: adopted karar kaydi checkpoint basarisindan SONRA yazilir;
      // publish basarisinda adopted kaydi DB'de kalmaz (onceki trusted state korunur).

      // D05/F04 + W02/F08: kabul edilen aday dosyalari birikimli accepted snapshot'a yazilir;
      // sonraki iterasyon ve restart bu setin uzerinden devam eder. Native path (backslash donusumu yok).
      let acceptedBackupDir: string | null = null;
      try {
        if (options.accepted_snapshot_dir) {
          const acceptedDir = resolveAcceptedDir(options.accepted_snapshot_dir);
          acceptedBackupDir = `${acceptedDir}.backup-${process.pid}-${iteration}`;
          rmSync(acceptedBackupDir, { recursive: true, force: true });
          if (existsSync(acceptedDir)) {
            cpSync(acceptedDir, acceptedBackupDir, { recursive: true, force: true });
          }
          const deleted = readDeletedFiles(acceptedDir);
          for (const change of candidate.changes) {
            const target = containedPath(acceptedDir, change.path);
            if (change.action === "delete") {
              rmSync(target, { recursive: true, force: true });
              deleted.add(change.path);
              continue;
            }
            const source = containedPath(options.staging_root, change.path);
            if (!existsSync(source)) {
              continue;
            }
            mkdirSync(join(target, ".."), { recursive: true });
            cpSync(source, target, { force: true });
            deleted.delete(change.path);
          }
          writeDeletedFiles(acceptedDir, deleted);
        }

        iterations.push({
          attempt_ordinal: attemptOrdinal,
          iteration,
          repair_for_attempt: currentFeedback?.repair_ordinal ?? null,
          decision: "adopted",
          reason: `Coverage kazanci: LINE ${bestCoverageBps} bps, BRANCH ${bestBranchBps ?? "N/A"} bps`,
          coverage_before_bps: previousBestCoverageBps,
          coverage_after_bps: afterBps,
          quality_findings: [],
          regression_failures: [],
          run_exit_code: run.exit_code,
        });

        if (options.on_accepted) {
          const acceptedFiles = options.accepted_snapshot_dir
            ? collectAcceptedChanges(resolveAcceptedDir(options.accepted_snapshot_dir))
            : candidate.changes.map((c) => {
                const source = containedPath(options.staging_root, c.path);
                const content = c.action === "delete" ? Buffer.alloc(0) : existsSync(source) ? readFileSync(source) : Buffer.alloc(0);
                return { path: c.path, sha256: sha256Data(content), action: c.action === "delete" ? "delete" as const : "create" as const };
              });
          options.on_accepted({
            iteration,
            files: acceptedFiles,
            line_bps: afterBps ?? 0,
            branch_bps: afterBranchBps,
            remaining_budget: {
              max_candidate_iterations: Math.max(0, iterationLimit - iteration),
              max_repairs_per_candidate: options.budget.max_repairs_per_candidate,
              no_progress_window: options.budget.no_progress_window,
              iteration_limit: iterationLimit,
              remaining_attempts: Math.max(0, attemptLimit - iterations.length),
            },
          });
        }
        // P03/PR03: adopted karar kaydi yalniz checkpoint publish basarisindan SONRA
        // kalici olur; publish basarisinda (at) yuklenmis aday DB'de adopted kalmaz.
        options.on_decision?.({ attempt_ordinal: attemptOrdinal, iteration, repair_for_attempt: currentFeedback?.repair_ordinal ?? null, decision: "adopted", reason: adoptedReason, changeset_hash: candidateHash, coverage_before_bps: previousBestCoverageBps, coverage_after_bps: afterBps });
        if (acceptedBackupDir) {
          rmSync(acceptedBackupDir, { recursive: true, force: true });
        }
      } catch (error) {
        // P03/PR03: checkpoint/accepted-blob publish basarisinda uncheckpointed
        // accepted bytes kalmaz; onceki parent set geri yuklenir VE hata yayilir
        // (fail-closed). Aday accepted sayilmaz, adopted karar kaydi yazilmaz,
        // onceki trusted checkpoint korunur.
        if (acceptedBackupDir) {
          const acceptedDir = resolveAcceptedDir(options.accepted_snapshot_dir!);
          rmSync(acceptedDir, { recursive: true, force: true });
          if (existsSync(acceptedBackupDir)) {
            cpSync(acceptedBackupDir, acceptedDir, { recursive: true, force: true });
            rmSync(acceptedBackupDir, { recursive: true, force: true });
          }
        }
        throw error;
      }

      if (evaluateGoalMet(bestLineCounter, bestBranchCounter)) {
        outcome = "TARGET_REACHED";
        break;
      }
      iteration++;
    }

    if ((iteration > iterationLimit || iterations.length >= attemptLimit) && outcome === "IN_PROGRESS") {
      budgetExhausted = true;
      outcome = "TARGET_NOT_MET_BUDGET";
    }

    return {
      best_coverage_bps: bestCoverageBps,
      best_branch_coverage_bps: bestBranchBps,
      iterations,
      budget_exhausted: budgetExhausted,
      plateau,
      outcome,
      trusted_workspace: trustedWorkspace,
      repairs_used: repairsUsed,
      no_progress_count: noProgressCount,
      attempts_used: iterations.length,
    };
  }

  /** Accepted seti temiz bir workspace'te tekrar calistirir; final kaniti
   * reddedilmis son aday XML'ine veya kullanici checkout'una baglanmaz. */
  async replayAcceptedSet(options: {
    project_root: string;
    frozen_source_root?: string;
    target_fqns: string[];
    target_module_paths: string[];
    target_relative_paths: string[];
    accepted_snapshot_dir: string;
    staging_root: string;
    workspace_root: string;
    timeout_ms?: number;
    test_selectors?: string[];
  }): Promise<{ workspace: string; run: RunResult; coverage: Map<string, ReturnType<CoverageLookup>>; test_inventory: SurefireSuite[]; started_at: number; finished_at: number }> {
    const frozenSourceRoot = options.frozen_source_root ?? options.project_root;
    const workspace = this.buildCandidateWorkspace(frozenSourceRoot, [], options.workspace_root, 0, options.staging_root, options.accepted_snapshot_dir);
    const plan = buildPlan(frozenSourceRoot, [...new Set(options.target_module_paths)]);
    assertCoverageConfigured(plan, [...new Set(options.target_module_paths)]);
    const runStartedAt = Date.now();
    const properties = strictTestExecutionProperties();
    const selectors = [...new Set((options.test_selectors ?? []).filter((selector) => selector.length > 0))].sort();
    if (selectors.length > 0) properties.test = selectors.join(",");
    const run = await this.runner.run({
      working_dir: workspace,
      goals: plan.maven_goals_coverage,
      properties,
      timeout_ms: options.timeout_ms ?? 600000,
      log_dir: join(workspace, "target", "aitest-final-replay-logs"),
    });
    const runFinishedAt = Date.now();
    const testInventory = summarizeTestReports(workspace, [...new Set(options.target_module_paths)]).suites;
    const coverage = new Map<string, ReturnType<CoverageLookup>>();
    for (let index = 0; index < options.target_fqns.length; index++) {
      const fqn = options.target_fqns[index]!;
      const moduleRelativePath = options.target_module_paths[index] ?? "";
      coverage.set(fqn, this.workspaceCoverage(workspace, fqn, moduleRelativePath, runStartedAt, options.target_relative_paths[index] ? basename(options.target_relative_paths[index]!) : undefined, options.target_relative_paths[index]));
    }
    return { workspace, run, coverage, test_inventory: testInventory, started_at: runStartedAt, finished_at: runFinishedAt };
  }
}
