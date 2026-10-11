/**
 * Coverage hesabi: basis point/tamsayi, yuzde yalniz gorunum; her hedef ayri olculur.
 * hedef_saglandi = covered * 10000 >= hedef_bps * n
 */
import { AppError } from "../domain/errors.js";
import type { CounterKind } from "./jacoco-parser.js";

export interface CounterPair {
  covered: number;
  missed: number;
}

export type CounterValidity =
  | "OK"
  | "NOT_APPLICABLE"
  | "UNAVAILABLE"
  | "INVALID_COVERAGE_EVIDENCE";

export interface MetricEvaluation {
  kind: CounterKind;
  validity: CounterValidity;
  covered: number;
  missed: number;
  total: number;
  basis_points: number;
  percent_display: number | null;
  target_bps: number;
  target_met: boolean;
}

export function evaluateMetric(
  kind: CounterKind,
  counter: CounterPair | undefined,
  counterExists: boolean,
  targetBps: number,
): MetricEvaluation {
  if (!counterExists || !counter) {
    return {
      kind,
      validity: "UNAVAILABLE",
      covered: 0,
      missed: 0,
      total: 0,
      basis_points: 0,
      percent_display: null,
      target_bps: targetBps,
      target_met: false,
    };
  }
  const total = counter.covered + counter.missed;
  if (counter.covered < 0 || counter.missed < 0) {
    return {
      kind,
      validity: "INVALID_COVERAGE_EVIDENCE",
      covered: counter.covered,
      missed: counter.missed,
      total,
      basis_points: 0,
      percent_display: null,
      target_bps: targetBps,
      target_met: false,
    };
  }
  if (total === 0) {
    return {
      kind,
      validity: "NOT_APPLICABLE",
      covered: 0,
      missed: 0,
      total: 0,
      basis_points: 0,
      percent_display: null,
      target_bps: targetBps,
      target_met: false,
    };
  }
  const basisPoints = Math.floor((counter.covered * 10000) / total);
  return {
    kind,
    validity: "OK",
    covered: counter.covered,
    missed: counter.missed,
    total,
    basis_points: basisPoints,
    percent_display: basisPoints / 100,
    target_bps: targetBps,
    target_met: counter.covered * 10000 >= targetBps * total,
  };
}

export interface TargetEvaluation {
  target_id: string;
  fqn: string;
  line: MetricEvaluation;
  branch: MetricEvaluation;
  all_required_met: boolean;
  validity: "OK" | "PARTIAL" | "INVALID";
}

export function evaluateTarget(
  targetId: string,
  fqn: string,
  metrics: Array<MetricEvaluation>,
  requiredKinds: CounterKind[],
): TargetEvaluation {
  const line = metrics.find((m) => m.kind === "LINE");
  const branch = metrics.find((m) => m.kind === "BRANCH");
  if (!line) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", "LINE metrik degerlendirmesi zorunlu");
  }
  const requiredMetrics = requiredKinds.map((kind) => metrics.find((m) => m.kind === kind)).filter((metric): metric is MetricEvaluation => metric !== undefined);
  const applicableRequired = requiredMetrics.filter((metric) => metric.validity === "OK");
  // Gecerli total=0 counter hedefe uygulanamaz; diger metric OK ve hedefi
  // sagliyorsa bunu eksik/bozuk kanit gibi red etmeyiz. Tum metrikler N/A ise
  // yine otomatik basari yoktur (N27).
  const requiredMet = applicableRequired.length > 0
    && applicableRequired.every((metric) => metric.target_met)
    && requiredMetrics.every((metric) => metric.validity === "OK" || metric.validity === "NOT_APPLICABLE");
  const validity: TargetEvaluation["validity"] =
    line.validity === "INVALID_COVERAGE_EVIDENCE" || branch?.validity === "INVALID_COVERAGE_EVIDENCE"
      ? "INVALID"
      : requiredKinds.every((kind) => metrics.find((m) => m.kind === kind)?.validity === "OK")
        ? "OK"
        : "PARTIAL";
  return {
    target_id: targetId,
    fqn,
    line,
    branch: branch ?? line,
    all_required_met: requiredMet,
    validity,
  };
}

export function compareMetrics(before: CounterPair, after: CounterPair, kind: CounterKind): { gain_bps: number; improved: boolean } {
  const beforeEval = evaluateMetric(kind, before, true, 0);
  const afterEval = evaluateMetric(kind, after, true, 0);
  return {
    gain_bps: afterEval.basis_points - beforeEval.basis_points,
    improved: afterEval.basis_points > beforeEval.basis_points,
  };
}

export function formatPercentDisplay(bps: number): string {
  return (bps / 100).toFixed(2);
}
