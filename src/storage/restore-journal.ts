/** Append-only restore journal. File fsync is used; Windows directory fsync is unavailable here. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { AppError } from "../domain/errors.js";

export type RestorePhase = "PREPARED" | "BLOBS_READY" | "OLD_DB_PRESERVED" | "NEW_DB_PUBLISHED" | "VERIFIED" | "COMMITTED" | "ROLLED_BACK";

export interface RestoreJournalRecord {
  generation: string;
  phase: RestorePhase;
  targetDbPath: string;
  artifactRoot: string;
  stagedDbPath: string;
  preservedDbPath: string;
  publishedBlobs: Array<{ path: string; sha256: string }>;
}

const NEXT: Record<RestorePhase, RestorePhase[]> = {
  PREPARED: ["BLOBS_READY", "ROLLED_BACK"],
  BLOBS_READY: ["OLD_DB_PRESERVED", "ROLLED_BACK"],
  OLD_DB_PRESERVED: ["NEW_DB_PUBLISHED", "ROLLED_BACK"],
  NEW_DB_PUBLISHED: ["VERIFIED", "ROLLED_BACK"],
  VERIFIED: ["COMMITTED", "ROLLED_BACK"],
  COMMITTED: [],
  ROLLED_BACK: [],
};

function recoveryError(detail: string): AppError {
  return new AppError("STORAGE_ERROR", `RESTORE_RECOVERY_REQUIRED: ${detail}`, { reason_code: "RESTORE_RECOVERY_REQUIRED" });
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && rel.length > 0;
}

function validate(record: RestoreJournalRecord): void {
  if (!record.generation || !Object.hasOwn(NEXT, record.phase) || !isAbsolute(record.targetDbPath) ||
      !isAbsolute(record.artifactRoot) || !isAbsolute(record.stagedDbPath) || !isAbsolute(record.preservedDbPath) ||
      !within(dirname(record.targetDbPath), record.stagedDbPath) || !within(dirname(record.targetDbPath), record.preservedDbPath) ||
      record.stagedDbPath === record.targetDbPath || record.preservedDbPath === record.targetDbPath ||
      !Array.isArray(record.publishedBlobs) || record.publishedBlobs.some((blob) =>
        !isAbsolute(blob.path) || !within(record.artifactRoot, blob.path) || !/^[a-f0-9]{64}$/.test(blob.sha256))) {
    throw recoveryError("journal path or record invalid");
  }
}

function transitionValid(previous: RestoreJournalRecord | null, next: RestoreJournalRecord): boolean {
  if (previous === null) return next.phase === "PREPARED";
  if ((previous.phase === "COMMITTED" || previous.phase === "ROLLED_BACK") && next.phase === "PREPARED") {
    return next.generation !== previous.generation && next.targetDbPath === previous.targetDbPath;
  }
  return next.generation === previous.generation && next.targetDbPath === previous.targetDbPath &&
    next.artifactRoot === previous.artifactRoot && next.stagedDbPath === previous.stagedDbPath &&
    next.preservedDbPath === previous.preservedDbPath && NEXT[previous.phase].includes(next.phase);
}

export function journalPathForDb(dbPath: string): string {
  return `${resolve(dbPath)}.restore-journal.jsonl`;
}

export function readRestoreJournal(path: string): RestoreJournalRecord | null {
  if (!existsSync(path)) return null;
  let text: string;
  try { text = readFileSync(path, "utf8"); }
  catch { throw recoveryError("journal unreadable"); }
  if (!text || !text.endsWith("\n")) throw recoveryError("journal truncated");
  let previous: RestoreJournalRecord | null = null;
  for (const line of text.trimEnd().split("\n")) {
    try {
      const wrapper = JSON.parse(line) as { json?: unknown; checksum?: unknown };
      if (typeof wrapper.json !== "string" || typeof wrapper.checksum !== "string" ||
          createHash("sha256").update(wrapper.json).digest("hex") !== wrapper.checksum) throw new Error("checksum");
      const value = JSON.parse(wrapper.json) as RestoreJournalRecord;
      validate(value);
      if (!transitionValid(previous, value)) throw new Error("transition");
      previous = value;
    } catch { throw recoveryError("journal corrupt or transition invalid"); }
  }
  return previous;
}

export function appendRestorePhase(path: string, record: RestoreJournalRecord): void {
  validate(record);
  const previous = readRestoreJournal(path);
  if (!transitionValid(previous, record)) {
    throw recoveryError("journal transition invalid");
  }
  const json = JSON.stringify(record);
  const checksum = createHash("sha256").update(json).digest("hex");
  const fd = openSync(path, "a", 0o600);
  try {
    writeFileSync(fd, JSON.stringify({ json, checksum }) + "\n", "utf8");
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

/** Called before SQLite can create/open state.db; incomplete restore is a hard blocker. */
export function assertRestoreReadyBeforeOpen(dbPath: string): void {
  const last = readRestoreJournal(journalPathForDb(dbPath));
  if (last && last.phase !== "COMMITTED" && last.phase !== "ROLLED_BACK") {
    throw recoveryError(`unfinished generation ${last.generation}, phase ${last.phase}`);
  }
}
