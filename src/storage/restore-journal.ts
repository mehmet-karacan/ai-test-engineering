/** Append-only restore journal. File fsync is used; Windows directory fsync is unavailable here. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { AppError } from "../domain/errors.js";
import { acquireRestoreDbLock } from "./maintenance-lock.js";

export type RestorePhase = "PREPARED" | "BLOBS_READY" | "OLD_DB_PRESERVED" | "NEW_DB_PUBLISHED" | "VERIFIED" | "COMMITTED" | "ROLLED_BACK";

export interface RestoreJournalRecord {
  formatVersion?: 2;
  generation: string;
  phase: RestorePhase;
  targetDbPath: string;
  artifactRoot: string;
  stagedDbPath: string;
  preservedDbPath: string;
  publishedBlobs: Array<{ path: string; sha256: string }>;
  evidence?: {
    oldDb: { exists: boolean; bytes: number | null; sha256: string | null };
    oldWal: { exists: boolean; bytes: number | null; sha256: string | null };
    oldShmExists: boolean;
    sourceDbSha256: string;
    sourceManifestSha256: string;
    expectedBlobs: Array<{ path: string; sha256: string; bytes: number; existedBefore: boolean }>;
  };
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
  if (record.formatVersion !== undefined && record.formatVersion !== 2) throw recoveryError("journal version invalid");
  if (record.formatVersion === 2) {
    const e = record.evidence;
    const validFile = (file: { exists: boolean; bytes: number | null; sha256: string | null } | undefined): boolean =>
      !!file && typeof file.exists === "boolean" &&
      (file.exists ? Number.isSafeInteger(file.bytes) && file.bytes! >= 0 && /^[a-f0-9]{64}$/.test(file.sha256 ?? "")
        : file.bytes === null && file.sha256 === null);
    if (!e || !validFile(e.oldDb) || !validFile(e.oldWal) || typeof e.oldShmExists !== "boolean" ||
        !/^[a-f0-9]{64}$/.test(e.sourceDbSha256) || !/^[a-f0-9]{64}$/.test(e.sourceManifestSha256) ||
        !Array.isArray(e.expectedBlobs) || e.expectedBlobs.some((blob) => !isAbsolute(blob.path) ||
          !within(record.artifactRoot, blob.path) || !/^[a-f0-9]{64}$/.test(blob.sha256) ||
          !Number.isSafeInteger(blob.bytes) || blob.bytes < 0 || typeof blob.existedBefore !== "boolean")) {
      throw recoveryError("journal v2 evidence invalid");
    }
  } else if (record.evidence !== undefined) throw recoveryError("journal version missing");
}

function transitionValid(previous: RestoreJournalRecord | null, next: RestoreJournalRecord): boolean {
  if (previous === null) return next.phase === "PREPARED";
  if ((previous.phase === "COMMITTED" || previous.phase === "ROLLED_BACK") && next.phase === "PREPARED") {
    return next.generation !== previous.generation && next.targetDbPath === previous.targetDbPath;
  }
  return next.generation === previous.generation && next.targetDbPath === previous.targetDbPath &&
    next.formatVersion === previous.formatVersion &&
    JSON.stringify(next.evidence) === JSON.stringify(previous.evidence) &&
    next.artifactRoot === previous.artifactRoot && next.stagedDbPath === previous.stagedDbPath &&
    next.preservedDbPath === previous.preservedDbPath &&
    next.publishedBlobs.length === previous.publishedBlobs.length &&
    next.publishedBlobs.every((blob, index) => blob.path === previous.publishedBlobs[index]?.path &&
      blob.sha256 === previous.publishedBlobs[index]?.sha256) &&
    NEXT[previous.phase].includes(next.phase);
}

function fileIdentity(path: string): { exists: boolean; bytes: number | null; sha256: string | null } {
  let fd: number;
  try { fd = openSync(path, "r"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, bytes: null, sha256: null };
    throw error;
  }
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) throw recoveryError("identity path is not a file");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0;
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.byteLength, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
      bytes += read;
    }
    const after = fstatSync(fd);
    if (before.size !== bytes || after.size !== bytes || before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs) throw recoveryError("file changed during identity read");
    return { exists: true, bytes, sha256: hash.digest("hex") };
  } finally { closeSync(fd); }
}

function assertNoReparseComponents(path: string): void {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components: string[] = [];
  for (let cursor = absolute; cursor !== root; cursor = dirname(cursor)) components.push(cursor);
  for (const component of components.reverse()) {
    try {
      if (lstatSync(component).isSymbolicLink()) throw recoveryError("reparse path at recovery");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function captureRestoreEvidence(dbPath: string, sourceDbPath: string, manifestPath: string,
  expectedBlobs: NonNullable<RestoreJournalRecord["evidence"]>["expectedBlobs"]): NonNullable<RestoreJournalRecord["evidence"]> {
  return {
    oldDb: fileIdentity(dbPath), oldWal: fileIdentity(`${dbPath}-wal`), oldShmExists: existsSync(`${dbPath}-shm`),
    sourceDbSha256: fileIdentity(sourceDbPath).sha256!, sourceManifestSha256: fileIdentity(manifestPath).sha256!,
    expectedBlobs,
  };
}

/** Only an intact old generation before any DB/sidecar move can be reopened without file mutation. */
export function recoverIntactOldRestoreBeforeOpen(dbPath: string): void {
  dbPath = resolve(dbPath);
  const path = journalPathForDb(dbPath);
  const first = readRestoreJournal(path);
  if (first?.formatVersion !== 2 || (first.phase !== "PREPARED" && first.phase !== "BLOBS_READY")) return;
  const release = acquireRestoreDbLock(dbPath);
  try {
    const last = readRestoreJournal(path);
    if (!last || last.generation !== first.generation || last.phase !== first.phase || last.targetDbPath !== dbPath) return;
    // Reject a changed path shape or any old-generation move. No cleanup occurs here.
    for (const check of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, path, last.stagedDbPath,
      last.preservedDbPath, `${dbPath}-wal${last.preservedDbPath.slice(dbPath.length)}`,
      `${dbPath}-shm${last.preservedDbPath.slice(dbPath.length)}`]) {
      assertNoReparseComponents(check);
    }
    if (!last.evidence!.oldDb.exists || existsSync(last.preservedDbPath) ||
        existsSync(`${dbPath}-wal${last.preservedDbPath.slice(dbPath.length)}`) ||
        existsSync(`${dbPath}-shm${last.preservedDbPath.slice(dbPath.length)}`) ||
        JSON.stringify(fileIdentity(dbPath)) !== JSON.stringify(last.evidence!.oldDb) ||
        JSON.stringify(fileIdentity(`${dbPath}-wal`)) !== JSON.stringify(last.evidence!.oldWal) ||
        existsSync(`${dbPath}-shm`) !== last.evidence!.oldShmExists ||
        fileIdentity(last.stagedDbPath).sha256 !== last.evidence!.sourceDbSha256) {
      throw recoveryError("old generation identity uncertain");
    }
    appendRestorePhase(path, { ...last, phase: "ROLLED_BACK" });
  } finally { release(); }
}

export function journalPathForDb(dbPath: string): string {
  return `${resolve(dbPath)}.restore-journal.jsonl`;
}

export function readRestoreJournal(path: string): RestoreJournalRecord | null {
  let text: string;
  try { text = readFileSync(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw recoveryError("journal unreadable");
  }
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
  if (last === null) {
    try {
      const prefix = `${basename(dbPath)}.restore-old-`;
      if (readdirSync(dirname(resolve(dbPath))).some((name) => name.startsWith(prefix))) {
        throw recoveryError("preserved DB exists without journal");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (last && last.phase !== "COMMITTED" && last.phase !== "ROLLED_BACK") {
    throw recoveryError(`unfinished generation ${last.generation}, phase ${last.phase}`);
  }
}
