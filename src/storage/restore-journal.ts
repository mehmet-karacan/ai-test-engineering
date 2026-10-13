/** Append-only restore journal. File fsync is used; Windows directory fsync is unavailable here. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../domain/errors.js";
import { acquireRestoreDbLock } from "./maintenance-lock.js";

export type RestorePhase = "PREPARED" | "BLOBS_READY" | "OLD_DB_MOVED" | "OLD_WAL_MOVED" | "OLD_SHM_MOVED" |
  "OLD_DB_PRESERVED" | "FRESH_TARGET_CONFIRMED" | "NEW_DB_MOVED" | "NEW_DB_PUBLISHED" |
  "VERIFIED" | "RECOVERING" | "COMMITTED" | "ROLLED_BACK";

export interface RestoreMoveReceipt {
  generation: string;
  sequence: number;
  operation: "rename";
  slot: "oldDb" | "oldWal" | "oldShm" | "stagedDb";
  fromName: string;
  toName: string;
  before: { volumeSerial: string; fileId: string; bytes: number; sha256: string };
  after: { volumeSerial: string; fileId: string; bytes: number; sha256: string };
}

export type RestoreNativeInitial = {
  oldDb: RestoreMoveReceipt["before"] | null;
  oldWal: RestoreMoveReceipt["before"] | null;
  oldShm: RestoreMoveReceipt["before"] | null;
  stagedDb: RestoreMoveReceipt["before"];
};

export interface RestoreRecoveryReceipt {
  generation: string;
  step: number;
  slot: RestoreMoveReceipt["slot"];
  fromName: string;
  toName: string;
  identity: RestoreMoveReceipt["before"];
  evidence: "MOVED" | "RECOVERY_READY";
}

export interface RestoreJournalRecord {
  formatVersion?: 2;
  generation: string;
  phase: RestorePhase;
  targetDbPath: string;
  artifactRoot: string;
  stagedDbPath: string;
  preservedDbPath: string;
  publishedBlobs: Array<{ path: string; sha256: string }>;
  moveReceipts?: RestoreMoveReceipt[];
  nativeInitial?: RestoreNativeInitial;
  recoveryBaseCount?: number;
  recoveryReceipts?: RestoreRecoveryReceipt[];
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
  PREPARED: ["BLOBS_READY", "RECOVERING", "ROLLED_BACK"],
  BLOBS_READY: ["OLD_DB_MOVED", "OLD_WAL_MOVED", "OLD_SHM_MOVED", "OLD_DB_PRESERVED",
    "FRESH_TARGET_CONFIRMED", "RECOVERING", "ROLLED_BACK"],
  OLD_DB_MOVED: ["OLD_WAL_MOVED", "OLD_SHM_MOVED", "OLD_DB_PRESERVED", "RECOVERING", "ROLLED_BACK"],
  OLD_WAL_MOVED: ["OLD_SHM_MOVED", "OLD_DB_PRESERVED", "RECOVERING", "ROLLED_BACK"],
  OLD_SHM_MOVED: ["OLD_DB_PRESERVED", "RECOVERING", "ROLLED_BACK"],
  OLD_DB_PRESERVED: ["NEW_DB_MOVED", "RECOVERING", "ROLLED_BACK"],
  FRESH_TARGET_CONFIRMED: ["NEW_DB_MOVED", "RECOVERING", "ROLLED_BACK"],
  NEW_DB_MOVED: ["NEW_DB_PUBLISHED", "RECOVERING", "ROLLED_BACK"],
  NEW_DB_PUBLISHED: ["VERIFIED", "RECOVERING", "ROLLED_BACK"],
  VERIFIED: ["COMMITTED", "RECOVERING", "ROLLED_BACK"],
  RECOVERING: ["RECOVERING", "ROLLED_BACK"],
  COMMITTED: [],
  ROLLED_BACK: [],
};

const LEGACY_NEXT: Partial<Record<RestorePhase, RestorePhase[]>> = {
  PREPARED: ["BLOBS_READY", "ROLLED_BACK"],
  BLOBS_READY: ["OLD_DB_PRESERVED", "ROLLED_BACK"],
  OLD_DB_PRESERVED: ["NEW_DB_PUBLISHED", "ROLLED_BACK"],
  NEW_DB_PUBLISHED: ["VERIFIED", "ROLLED_BACK"],
  VERIFIED: ["COMMITTED", "ROLLED_BACK"],
  COMMITTED: [], ROLLED_BACK: [],
};

function recoveryError(detail: string): AppError {
  return new AppError("STORAGE_ERROR", `RESTORE_RECOVERY_REQUIRED: ${detail}`, { reason_code: "RESTORE_RECOVERY_REQUIRED" });
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && rel.length > 0;
}

function validMoveReceipts(record: RestoreJournalRecord): boolean {
  const receipts = record.moveReceipts;
  if (receipts === undefined) return true;
  if (record.formatVersion !== 2 || !Array.isArray(receipts)) return false;
  const dbName = basename(record.targetDbPath);
  const preservedName = basename(record.preservedDbPath);
  if (dirname(record.preservedDbPath) !== dirname(record.targetDbPath) ||
      dirname(record.stagedDbPath) !== dirname(record.targetDbPath) ||
      !preservedName.startsWith(`${dbName}.restore-old-`)) return false;
  const oldSuffix = preservedName.slice(dbName.length);
  const names = {
    oldDb: [dbName, preservedName],
    oldWal: [`${dbName}-wal`, `${dbName}-wal${oldSuffix}`],
    oldShm: [`${dbName}-shm`, `${dbName}-shm${oldSuffix}`],
    stagedDb: [basename(record.stagedDbPath), dbName],
  } as const;
  const slotOrder = ["oldDb", "oldWal", "oldShm", "stagedDb"] as const;
  let priorIndex = -1;
  return receipts.every((receipt, index) => {
    if (!receipt || receipt.operation !== "rename" || receipt.generation !== record.generation ||
        receipt.sequence !== index + 1 || !Object.hasOwn(names, receipt.slot)) return false;
    const slotIndex = slotOrder.indexOf(receipt.slot);
    if (slotIndex <= priorIndex) return false;
    priorIndex = slotIndex;
    const [from, to] = names[receipt.slot];
    const identity = receipt.before;
    return receipt.fromName === from && receipt.toName === to && !!identity &&
      /^[a-f0-9]{16}$/.test(identity.volumeSerial) && /^[a-f0-9]{32}$/.test(identity.fileId) &&
      Number.isSafeInteger(identity.bytes) && identity.bytes >= 0 && /^[a-f0-9]{64}$/.test(identity.sha256) &&
      receipt.after?.volumeSerial === identity.volumeSerial && receipt.after.fileId === identity.fileId &&
      receipt.after.bytes === identity.bytes && receipt.after.sha256 === identity.sha256;
  });
}

function validNativeInitial(record: RestoreJournalRecord): boolean {
  const initial = record.nativeInitial;
  if (initial === undefined) return true;
  const valid = (value: RestoreMoveReceipt["before"] | null): boolean => value === null ||
    !!value && /^[a-f0-9]{16}$/.test(value.volumeSerial) && /^[a-f0-9]{32}$/.test(value.fileId) &&
    Number.isSafeInteger(value.bytes) && value.bytes >= 0 && /^[a-f0-9]{64}$/.test(value.sha256);
  return record.formatVersion === 2 && valid(initial.oldDb) && valid(initial.oldWal) &&
    valid(initial.oldShm) && valid(initial.stagedDb) && initial.stagedDb !== null &&
    (initial.oldDb !== null || (initial.oldWal === null && initial.oldShm === null)) &&
    (record.moveReceipts === undefined || record.moveReceipts.every((receipt) => {
      const snapshot = initial[receipt.slot];
      return !!snapshot && JSON.stringify(snapshot) === JSON.stringify(receipt.before);
    }));
}

function validRecoveryProgress(record: RestoreJournalRecord): boolean {
  if (record.recoveryBaseCount === undefined && record.recoveryReceipts === undefined) {
    return record.phase !== "RECOVERING";
  }
  const initial = record.nativeInitial;
  const receipts = record.moveReceipts;
  const base = record.recoveryBaseCount;
  const reversed = record.recoveryReceipts;
  if (!initial || !receipts || !Number.isSafeInteger(base) || base! < 0 || !Array.isArray(reversed) ||
      (record.phase !== "RECOVERING" && record.phase !== "ROLLED_BACK")) return false;
  const forward = (["oldDb", "oldWal", "oldShm", "stagedDb"] as const)
    .filter((slot) => initial[slot] !== null);
  if (base! > forward.length || receipts.length > base! || base! > receipts.length + 1 ||
      reversed.length > base! || (record.phase === "ROLLED_BACK" && reversed.length !== base)) return false;
  const dbName = basename(record.targetDbPath);
  const suffix = basename(record.preservedDbPath).slice(dbName.length);
  const forwardNames = {
    oldDb: `${dbName}${suffix}`, oldWal: `${dbName}-wal${suffix}`,
    oldShm: `${dbName}-shm${suffix}`, stagedDb: dbName,
  };
  const initialNames = { oldDb: dbName, oldWal: `${dbName}-wal`,
    oldShm: `${dbName}-shm`, stagedDb: basename(record.stagedDbPath) };
  return reversed.every((receipt, index) => {
    const slot = forward[base! - index - 1];
    return !!receipt && receipt.generation === record.generation && receipt.step === index + 1 &&
      receipt.slot === slot && receipt.fromName === forwardNames[slot!] &&
      receipt.toName === initialNames[slot!] &&
      JSON.stringify(receipt.identity) === JSON.stringify(initial[slot!]) &&
      (receipt.evidence === "MOVED" || receipt.evidence === "RECOVERY_READY");
  });
}

function validate(record: RestoreJournalRecord): void {
  if (!record.generation || !Object.hasOwn(NEXT, record.phase) || !isAbsolute(record.targetDbPath) ||
      !isAbsolute(record.artifactRoot) || !isAbsolute(record.stagedDbPath) || !isAbsolute(record.preservedDbPath) ||
      !within(dirname(record.targetDbPath), record.stagedDbPath) || !within(dirname(record.targetDbPath), record.preservedDbPath) ||
      record.stagedDbPath === record.targetDbPath || record.preservedDbPath === record.targetDbPath ||
      !validMoveReceipts(record) || !validNativeInitial(record) || !validRecoveryProgress(record) ||
      !Array.isArray(record.publishedBlobs) || record.publishedBlobs.some((blob) =>
        !isAbsolute(blob.path) || !within(record.artifactRoot, blob.path) || !/^[a-f0-9]{64}$/.test(blob.sha256))) {
    throw recoveryError("journal path or record invalid");
  }
  if (record.formatVersion !== undefined && record.formatVersion !== 2) throw recoveryError("journal version invalid");
  if (record.phase === "FRESH_TARGET_CONFIRMED" && record.nativeInitial?.oldDb !== null ||
      record.phase === "OLD_DB_PRESERVED" && record.nativeInitial?.oldDb === null) {
    throw recoveryError("journal generation phase contradicts initial target");
  }
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
    if (record.nativeInitial && ((record.nativeInitial.oldDb === null) !== !e.oldDb.exists ||
        (record.nativeInitial.oldDb !== null && (record.nativeInitial.oldDb.bytes !== e.oldDb.bytes ||
          record.nativeInitial.oldDb.sha256 !== e.oldDb.sha256)) ||
        (record.nativeInitial.oldWal === null) !== !e.oldWal.exists ||
        (record.nativeInitial.oldWal && (record.nativeInitial.oldWal.bytes !== e.oldWal.bytes ||
          record.nativeInitial.oldWal.sha256 !== e.oldWal.sha256)) ||
        (record.nativeInitial.oldShm !== null) !== e.oldShmExists ||
        record.nativeInitial.stagedDb.sha256 !== e.sourceDbSha256)) {
      throw recoveryError("journal native initial identity contradicts evidence");
    }
  } else if (record.evidence !== undefined) throw recoveryError("journal version missing");
}

function transitionValid(previous: RestoreJournalRecord | null, next: RestoreJournalRecord): boolean {
  if (previous === null) return next.phase === "PREPARED" && (next.moveReceipts === undefined || next.moveReceipts.length === 0);
  if ((previous.phase === "COMMITTED" || previous.phase === "ROLLED_BACK") && next.phase === "PREPARED") {
    return next.generation !== previous.generation && next.targetDbPath === previous.targetDbPath &&
      (next.moveReceipts === undefined || next.moveReceipts.length === 0);
  }
  const priorMoves = previous.moveReceipts;
  const nextMoves = next.moveReceipts;
  const slotForPhase: Partial<Record<RestorePhase, RestoreMoveReceipt["slot"]>> = {
    OLD_DB_MOVED: "oldDb", OLD_WAL_MOVED: "oldWal", OLD_SHM_MOVED: "oldShm", NEW_DB_MOVED: "stagedDb",
  };
  const moveSlot = slotForPhase[next.phase];
  const receiptsValid = priorMoves === undefined ? nextMoves === undefined : nextMoves !== undefined &&
    nextMoves.length === priorMoves.length + (moveSlot ? 1 : 0) &&
    priorMoves.every((receipt, index) => JSON.stringify(receipt) === JSON.stringify(nextMoves[index])) &&
    (!moveSlot || nextMoves.at(-1)?.slot === moveSlot);
  const priorRecovery = previous.recoveryReceipts;
  const nextRecovery = next.recoveryReceipts;
  const recoveryValid = next.phase === "RECOVERING" && previous.phase !== "RECOVERING"
    ? previous.recoveryBaseCount === undefined && priorRecovery === undefined &&
      next.recoveryBaseCount !== undefined && nextRecovery?.length === 0
    : previous.phase === "RECOVERING" && next.phase === "RECOVERING"
      ? next.recoveryBaseCount === previous.recoveryBaseCount && priorRecovery !== undefined &&
        nextRecovery?.length === priorRecovery.length + 1 &&
        priorRecovery.every((receipt, index) => JSON.stringify(receipt) === JSON.stringify(nextRecovery[index]))
      : previous.phase === "RECOVERING" && next.phase === "ROLLED_BACK"
        ? next.recoveryBaseCount === previous.recoveryBaseCount && priorRecovery !== undefined &&
          JSON.stringify(nextRecovery) === JSON.stringify(priorRecovery)
        : next.recoveryBaseCount === previous.recoveryBaseCount &&
          JSON.stringify(nextRecovery) === JSON.stringify(priorRecovery);
  return next.generation === previous.generation && next.targetDbPath === previous.targetDbPath &&
    receiptsValid && recoveryValid &&
    next.formatVersion === previous.formatVersion &&
    JSON.stringify(next.evidence) === JSON.stringify(previous.evidence) &&
    JSON.stringify(next.nativeInitial) === JSON.stringify(previous.nativeInitial) &&
    next.artifactRoot === previous.artifactRoot && next.stagedDbPath === previous.stagedDbPath &&
    next.preservedDbPath === previous.preservedDbPath &&
    next.publishedBlobs.length === previous.publishedBlobs.length &&
    next.publishedBlobs.every((blob, index) => blob.path === previous.publishedBlobs[index]?.path &&
      blob.sha256 === previous.publishedBlobs[index]?.sha256) &&
    (previous.formatVersion === 2 ? NEXT[previous.phase] : LEGACY_NEXT[previous.phase] ?? []).includes(next.phase);
}

export function fileIdentity(path: string): { exists: boolean; bytes: number | null; sha256: string | null } {
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
  if (first?.nativeInitial && first.phase !== "COMMITTED" && first.phase !== "ROLLED_BACK") {
    for (const check of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, path, first.stagedDbPath,
      first.preservedDbPath, `${dbPath}-wal${first.preservedDbPath.slice(dbPath.length)}`,
      `${dbPath}-shm${first.preservedDbPath.slice(dbPath.length)}`]) assertNoReparseComponents(check);
    const worker = fileURLToPath(new URL("../../scripts/restore-recovery-worker.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [worker, dbPath], {
      encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 8192,
    });
    if (result.status !== 0 || result.stdout !== "RECOVERED_OLD\n") {
      throw recoveryError(`native old-generation recovery failed (${result.status ?? result.signal ?? "unknown"})`);
    }
    const last = readRestoreJournal(path);
    if (!last || last.generation !== first.generation || last.phase !== "ROLLED_BACK" ||
        JSON.stringify(fileIdentity(dbPath)) !== JSON.stringify(last.evidence?.oldDb) ||
        JSON.stringify(fileIdentity(`${dbPath}-wal`)) !== JSON.stringify(last.evidence?.oldWal) ||
        fileIdentity(last.stagedDbPath).sha256 !== last.evidence?.sourceDbSha256) {
      throw recoveryError("native old generation uncertain after worker exit");
    }
    return;
  }
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
export function assertRestoreReadyBeforeOpen(dbPath: string,
  options?: { allowFreshRollbackForRestore?: boolean }): void {
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
  if (last?.phase === "ROLLED_BACK" && last.nativeInitial?.oldDb === null &&
      !options?.allowFreshRollbackForRestore) {
    throw recoveryError("fresh restore rolled back to an empty target; explicit restore required");
  }
}
