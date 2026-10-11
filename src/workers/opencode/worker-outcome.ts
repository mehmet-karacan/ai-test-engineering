/**
 * W01/F01: Typed worker state machine - OpenCode prompt yanit asamalari.
 * Her dolu finish degeri tamamlanma DEGILDIR; terminal state, ara tool adimi, bos cikti,
 * kesik cikti, HTTP/provider hatasi, cancel ve gercek elapsed timeout ayri tiplerdir.
 */
import type { PromptUsage } from "./worker-client.js";

export type WorkerOutcomeKind =
  | "REQUEST_ACCEPTED"
  | "IN_PROGRESS"
  | "TOOL_STEP"
  | "FINAL_TEXT"
  | "EMPTY_FINAL"
  | "OUTPUT_TRUNCATED"
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "AUTH_OR_PERMISSION_ERROR"
  | "TRANSPORT_ERROR"
  | "REQUEST_TIMEOUT"
  | "CANCELLED"
  | "SERVER_ERROR";

export const TERMINAL_OUTCOMES: readonly WorkerOutcomeKind[] = [
  "FINAL_TEXT",
  "EMPTY_FINAL",
  "OUTPUT_TRUNCATED",
  "INVALID_JSON",
  "SCHEMA_MISMATCH",
  "AUTH_OR_PERMISSION_ERROR",
  "TRANSPORT_ERROR",
  "REQUEST_TIMEOUT",
  "CANCELLED",
  "SERVER_ERROR",
] as const;

export interface WorkerPromptOutcome {
  kind: WorkerOutcomeKind;
  session_id: string;
  message_id: string | null;
  text: string | null;
  usage: PromptUsage;
  finish: string | null;
  elapsed_ms: number;
  aborted: boolean;
  timed_out: boolean;
  tool_names: string[];
  detail: string | null;
}

export function classifyFinish(finish: string | null | undefined): { completed: boolean; kind: WorkerOutcomeKind | null } {
  if (finish === null || finish === undefined || finish.length === 0) {
    return { completed: false, kind: null };
  }
  switch (finish) {
    case "stop":
      return { completed: true, kind: null };
    case "tool-calls":
      return { completed: false, kind: "TOOL_STEP" };
    case "length":
      return { completed: true, kind: "OUTPUT_TRUNCATED" };
    case "cancelled":
    case "abort":
      return { completed: true, kind: "CANCELLED" };
    case "error":
      return { completed: true, kind: "SERVER_ERROR" };
    default:
      return { completed: true, kind: null };
  }
}

export function classifyHttpFailure(status: number): WorkerOutcomeKind {
  if (status === 401 || status === 403) {
    return "AUTH_OR_PERMISSION_ERROR";
  }
  if (status === 429 || status >= 500) {
    return "SERVER_ERROR";
  }
  return "TRANSPORT_ERROR";
}

export function emptyOutcome(sessionId: string): PromptUsage {
  void sessionId;
  return { input_tokens: null, output_tokens: null };
}
