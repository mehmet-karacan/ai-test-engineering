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
  "TARGET_REACHED",
  "TARGET_ALREADY_MET",
  "TARGET_NOT_MET_PLATEAU",
  "TARGET_NOT_MET_BUDGET",
  "BLOCKED_TESTABILITY",
  "BLOCKED_ENVIRONMENT",
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

export const APPLY_STATE_VALUES = [
  "NOT_REQUESTED",
  "READY_FOR_REVIEW",
  "APPLYING",
  "APPLIED",
  "CONFLICT",
  "REJECTED",
] as const;

export type ApplyState = (typeof APPLY_STATE_VALUES)[number];
