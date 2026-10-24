/** Human consent and post-apply verification are separate from generation. */
export interface ApplyFile { path: string; sha256: string; bytes: number }
export interface ApplyPlan {
  schema_version: 1;
  job_id: string;
  project_id: string;
  checkpoint_id: string;
  project_root: string;
  source_digest: string;
  build_digest: string;
  patch_digest: string;
  files: ApplyFile[];
  verification_scope: "FULL_PROJECT_SNAPSHOT";
}
export interface ApplyApproval { action: "accept" | "decline" | "cancel"; approved: boolean }
export type RequestApplyApproval = (plan: ApplyPlan, signal?: AbortSignal) => Promise<ApplyApproval>;
export interface ApplyCallContext { requestApplyApproval?: RequestApplyApproval; signal?: AbortSignal }
export interface ApplyVerification {
  status: "PASSED" | "FAILED" | "CANCELLED" | "INTERRUPTED" | "BLOCKED";
  scope: "FULL_PROJECT_SNAPSHOT";
  total: number;
  passed: number;
  failures: number;
  errors: number;
  skipped: number;
  existing_tests_preserved: boolean;
  all_tests_present: boolean;
  exit_code: number | null;
  reason_code: string | null;
  execution_root: string;
}
export interface ApplyOperationView {
  operation_id: string;
  job_id: string;
  state: "APPLYING" | "APPLIED" | "ROLLED_BACK" | "RECOVERY_REQUIRED" | "CONFLICT" | "REJECTED";
  phase: "publishing" | "verification" | "rollback" | "done";
  checkpoint_id: string;
  patch_digest: string;
  applied_paths: string[];
  created_at: number;
  updated_at: number;
  verification: ApplyVerification | null;
  message: string;
}
