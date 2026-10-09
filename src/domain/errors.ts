/**
 * Urun geneli hata siniflari.
 * Parametre hatasi, policy ihlali ve is sonucu farkli hata siniflaridir.
 */
export type ErrorCode =
  | "INVALID_PARAMETERS"
  | "INVALID_MODEL_OUTPUT"
  | "POLICY_VIOLATION"
  | "BLOCKED_ISOLATION"
  | "BLOCKED_TEST_FRAMEWORK"
  | "BLOCKED_COVERAGE_CONFIGURATION"
  | "INVALID_COVERAGE_EVIDENCE"
  | "INTERNAL_ERROR"
  | "STORAGE_ERROR"
  | "SCHEMA_MIGRATION_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
