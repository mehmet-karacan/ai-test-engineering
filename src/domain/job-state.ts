/**
 * Is durum semantigi: lifecycle, phase, outcome, verification ve apply ayri alanlardir.
 * 'Completed' her zaman hedef basarisi demek degildir.
 */
export const LIFECYCLE_VALUES = [
  "QUEUED",
  "RUNNING",
  "WAITING_INPUT",
  "PAUSED",
  "INTERRUPTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type Lifecycle = (typeof LIFECYCLE_VALUES)[number];

export const PHASE_VALUES = [
  "discovery",
  "preflight",
  "baseline",
  "analysis",
  "planning",
  "generation",
  "repair",
  "verification",
  "gap_review",
  "final_validation",
  "reporting",
] as const;

export type Phase = (typeof PHASE_VALUES)[number];

export const OUTCOME_VALUES = [
  "COVERAGE_ANALYZED",
  "TARGET_REACHED",
  "TARGET_ALREADY_MET",
  "TARGET_NOT_MET_PLATEAU",
  "TARGET_NOT_MET_BUDGET",
  "TARGET_NOT_MET_BLOCKED",
  "FINAL_VERIFICATION_FAILED",
  "BLOCKED_TESTABILITY",
  "BLOCKED_ENVIRONMENT",
  "BLOCKED_ISOLATION",
  "BLOCKED_DEPENDENCIES",
  "BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE",
  "BLOCKED_TARGET_RESOLUTION",
  "BLOCKED_COVERAGE_CONFIGURATION",
  "BASELINE_FAILED",
  "INVALID_COVERAGE_EVIDENCE",
  "POLICY_VIOLATION",
  "SOURCE_CHANGED",
  "QUALITY_REVIEW_REQUIRED",
] as const;

export type Outcome = (typeof OUTCOME_VALUES)[number];

export const VERIFICATION_VALUES = [
  "UNVERIFIED",
  "TARGET_ONLY",
  "AFFECTED_SCOPE",
  "FULL_DECLARED_SCOPE",
] as const;

export type VerificationLevel = (typeof VERIFICATION_VALUES)[number];

const AFFECTED_SCOPE_OUTCOMES = new Set<Outcome>([
  "TARGET_REACHED",
  "TARGET_ALREADY_MET",
  "TARGET_NOT_MET_PLATEAU",
  "TARGET_NOT_MET_BUDGET",
  "TARGET_NOT_MET_BLOCKED",
]);

/**
 * Terminal rapor kanitinin job status alanina yansiyan guven seviyesini
 * tek bir kurala baglar. Coverage raporu gercekten olculduyse etkilenmis
 * kapsam dogrulanir; final evidence veya typed blocker varsa status
 * unverified kalir.
 */
export function verificationLevelForReport(outcome: Outcome): VerificationLevel {
  return AFFECTED_SCOPE_OUTCOMES.has(outcome) ? "AFFECTED_SCOPE" : "UNVERIFIED";
}

export const APPLY_STATE_VALUES = [
  "NOT_REQUESTED",
  "READY_FOR_REVIEW",
  "APPLYING",
  "APPLIED",
  "CONFLICT",
  "REJECTED",
] as const;

export type ApplyState = (typeof APPLY_STATE_VALUES)[number];
