/** Persistent Windows file owner. The helper's stdout is not durable; journal each receipt before the next MOVE. */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { basename, isAbsolute } from "node:path";
import { AppError } from "../domain/errors.js";
import { assertTrustedWindowsFileHelper, inspectWindowsPath, type WindowsFileHelperSpec } from "../discovery/windows-file-bridge.js";
import { fileIdentity, type RestoreJournalRecord, type RestoreMoveReceipt } from "./restore-journal.js";

export type RestoreFileSlot = RestoreMoveReceipt["slot"];
export type RestoreFileSnapshot = RestoreMoveReceipt["before"];
export interface RestoreMoveOptions {
  dbDirectory: string;
  dbName: string;
  stagedName: string;
  preservedSuffix: string;
  generation: string;
  expected: { oldDb: RestoreFileSnapshot; oldWal?: RestoreFileSnapshot | null;
    oldShm?: RestoreFileSnapshot | null; stagedDb: RestoreFileSnapshot };
}
export interface RestoreMoveSession {
  renameOwned(slot: RestoreFileSlot, toName: string): Promise<RestoreMoveReceipt>;
  enterReadVerify(): Promise<void>;
  close(): Promise<void>;
}

const SLOTS = ["oldDb", "oldWal", "oldShm", "stagedDb"] as const;
const TIMEOUT_MS = 30_000;

function protocolError(detail: string): AppError {
  return new AppError("BLOCKED_ISOLATION", `Windows restore session protocol: ${detail}`, {
    reason_code: "WINDOWS_RESTORE_SESSION_PROTOCOL",
  });
}

function component(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && !/[\\/:\0\r\n\t]/u.test(name) &&
    !/[. ]$/u.test(name);
}

function hexName(name: string): string {
  if (!component(name)) throw protocolError("invalid file name");
  return Buffer.from(name, "utf16le").toString("hex");
}

function decodeName(hex: string): string {
  if (!/^(?:[a-f0-9]{4})+$/u.test(hex)) throw protocolError("invalid UTF-16LE file name");
  const name = Buffer.from(hex, "hex").toString("utf16le");
  if (hexName(name) !== hex) throw protocolError("noncanonical UTF-16LE file name");
  return name;
}

export function parseRestoreSnapshot(value: string): RestoreFileSnapshot {
  const fields = value.split(":");
  if (fields.length !== 4 || !/^[a-f0-9]{16}$/u.test(fields[0] ?? "") ||
      !/^[a-f0-9]{32}$/u.test(fields[1] ?? "") || !/^(0|[1-9]\d*)$/u.test(fields[2] ?? "") ||
      !/^[a-f0-9]{64}$/u.test(fields[3] ?? "")) throw protocolError("invalid snapshot");
  const bytes = Number(fields[2]);
  if (!Number.isSafeInteger(bytes)) throw protocolError("snapshot size overflow");
  return { volumeSerial: fields[0]!, fileId: fields[1]!, bytes, sha256: fields[3]! };
}

function sameSnapshot(a: RestoreFileSnapshot, b: RestoreFileSnapshot): boolean {
  return a.volumeSerial === b.volumeSerial && a.fileId === b.fileId && a.bytes === b.bytes && a.sha256 === b.sha256;
}

export interface RestoreRecoveryReady {
  physicalForwardCount: number;
  acceptCommand: string;
  files: Partial<Record<RestoreFileSlot, { name: string; identity: RestoreFileSnapshot }>>;
}

/** Pure pre-ACCEPT gate: a crash may leave exactly one physical move ahead of its fsynced receipt. */
export function validateRestoreRecoveryReady(line: string, journal: RestoreJournalRecord): RestoreRecoveryReady {
  const fields = line.split("\t");
  const initial = journal.nativeInitial;
  const receipts = journal.moveReceipts;
  if (fields.length !== 7 || fields[0] !== "RECOVERY_READY" || fields[1] !== journal.generation ||
      !initial || !receipts || !/^(0|[1-9]\d*)$/u.test(fields[2] ?? "")) {
    throw protocolError("invalid RECOVERY_READY");
  }
  const count = Number(fields[2]);
  const dbName = basename(journal.targetDbPath);
  const oldSuffix = basename(journal.preservedDbPath).slice(dbName.length);
  const names = {
    oldDb: [dbName, basename(journal.preservedDbPath)],
    oldWal: [`${dbName}-wal`, `${dbName}-wal${oldSuffix}`],
    oldShm: [`${dbName}-shm`, `${dbName}-shm${oldSuffix}`],
    stagedDb: [basename(journal.stagedDbPath), dbName],
  } as const;
  const present = SLOTS.filter((slot) => initial[slot] !== null);
  if ((journal.phase === "PREPARED" && count !== 0) || count > present.length ||
      receipts.length > count || count > receipts.length + 1 ||
      receipts.some((receipt, index) => receipt.slot !== present[index] ||
        !sameSnapshot(receipt.before, initial[receipt.slot]!))) throw protocolError("recovery receipt prefix mismatch");
  const files: RestoreRecoveryReady["files"] = {};
  for (const [index, slot] of SLOTS.entries()) {
    const field = fields[index + 3]!;
    if (!field.startsWith(`${slot}=`)) throw protocolError("recovery slot order");
    const value = field.slice(slot.length + 1);
    const expected = initial[slot];
    if (expected === null) {
      if (value !== "-") throw protocolError("unexpected recovery sidecar");
      continue;
    }
    const parts = value.split(":");
    if (parts.length !== 5) throw protocolError("invalid recovery slot");
    const fileName = decodeName(parts[0]!);
    const identity = parseRestoreSnapshot(parts.slice(1).join(":"));
    const forwardIndex = present.indexOf(slot);
    if (fileName !== names[slot][forwardIndex < count ? 1 : 0] || !sameSnapshot(identity, expected)) {
      throw protocolError("recovery file identity or layout mismatch");
    }
    files[slot] = { name: fileName, identity };
  }
  return { physicalForwardCount: count, files,
    acceptCommand: `ACCEPT\t${journal.generation}\t${count}\t${fields.slice(3).join("\t")}` };
}

/** JS hash and two native FileId reads narrow preflight races; session READY must recheck every field. */
export function captureExpectedWindowsRestoreFile(helper: WindowsFileHelperSpec, path: string): RestoreFileSnapshot {
  const before = inspectWindowsPath(helper, path);
  const digest = fileIdentity(path);
  const after = inspectWindowsPath(helper, path);
  if (!digest.exists || digest.bytes === null || digest.sha256 === null || before.linkCount !== 1 ||
      after.linkCount !== 1 || before.volumeSerial !== after.volumeSerial || before.fileId !== after.fileId ||
      before.bytes !== digest.bytes || after.bytes !== digest.bytes) throw protocolError("preflight file identity changed");
  return { volumeSerial: before.volumeSerial, fileId: before.fileId, bytes: digest.bytes, sha256: digest.sha256 };
}

export class RestoreSessionLines {
  private buffer = "";
  private readonly ready: string[] = [];
  private waiting: { resolve: (line: string) => void; reject: (error: Error) => void } | null = null;
  private ended: Error | null = null;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (data: Buffer) => {
      this.buffer += data.toString("utf8");
      if (this.buffer.length > 8192) return this.fail(protocolError("response too long"));
      for (;;) {
        const end = this.buffer.indexOf("\n");
        if (end < 0) break;
        const line = this.buffer.slice(0, end).replace(/\r$/u, "");
        this.buffer = this.buffer.slice(end + 1);
        if (this.waiting) {
          const waiting = this.waiting;
          this.waiting = null;
          waiting.resolve(line);
        } else {
          this.ready.push(line);
          if (this.ready.length > 4) return this.fail(protocolError("unsolicited responses"));
        }
      }
    });
    child.on("error", (error) => this.fail(error));
    // Node can emit exit before the final stdout data event. Only close means
    // the pipe has drained, so preserve complete queued receipts until then.
    child.on("close", (code, signal) => {
      this.end(protocolError(this.buffer.length > 0 ? "truncated child response" :
        `child closed ${code ?? signal ?? "unknown"}`));
    });
    child.stderr.on("data", () => { /* Drain diagnostic pipe; never trust it as a protocol response. */ });
  }

  private fail(error: Error): void {
    this.end(error);
    this.ready.length = 0;
    this.child.kill();
  }

  private end(error: Error): void {
    if (this.ended) return;
    this.ended = error;
    if (this.waiting) {
      const waiting = this.waiting;
      this.waiting = null;
      waiting.reject(error);
    }
  }

  async next(): Promise<string> {
    if (this.ready.length > 0) return this.ready.shift()!;
    if (this.ended) throw this.ended;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        this.child.kill();
        reject(protocolError("response timeout"));
      }, TIMEOUT_MS);
      this.waiting = {
        resolve: (line) => { clearTimeout(timer); resolve(line); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      };
    });
  }
}

function assertOptions(options: RestoreMoveOptions): void {
  if (!isAbsolute(options.dbDirectory) || !component(options.dbName) || !component(options.stagedName) ||
      !options.preservedSuffix.startsWith(".restore-old-") || !component(`x${options.preservedSuffix}`) ||
      !/^[a-zA-Z0-9-]{1,128}$/u.test(options.generation)) throw protocolError("invalid session options");
  for (const slot of SLOTS) {
    const snapshot = options.expected[slot] ?? null;
    if (((slot === "stagedDb" || slot === "oldDb") && !snapshot) || (snapshot && !sameSnapshot(parseRestoreSnapshot(
      `${snapshot.volumeSerial}:${snapshot.fileId}:${snapshot.bytes}:${snapshot.sha256}`), snapshot))) {
      throw protocolError("invalid expected snapshot");
    }
  }
}

/** The child must retain its pinned handles until close; stdout receipts are checked but not themselves durable. */
export async function startWindowsRestoreMoveSession(helper: WindowsFileHelperSpec,
  options: RestoreMoveOptions): Promise<RestoreMoveSession> {
  assertOptions(options);
  assertTrustedWindowsFileHelper(helper);
  const child = spawn(helper.path, ["session", options.dbDirectory, hexName(options.dbName),
    hexName(options.stagedName), options.generation], { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
  const lines = new RestoreSessionLines(child);
  const current: Partial<Record<RestoreFileSlot, { name: string; identity: RestoreFileSnapshot }>> = {};
  let sequence = 0;
  let busy = false;
  let closed = false;
  let rollingBack = false;
  let verified = false;
  const movedForward: RestoreFileSlot[] = [];
  const send = async (command: string): Promise<string[]> => {
    if (busy || closed) throw protocolError("session unavailable");
    busy = true;
    try {
      await new Promise<void>((resolve, reject) => child.stdin.write(`${command}\n`, (error) => error ? reject(error) : resolve()));
      return (await lines.next()).split("\t");
    } catch (error) {
      closed = true;
      child.kill();
      throw error;
    } finally { busy = false; }
  };
  try {
    const ready = (await lines.next()).split("\t");
    if (ready.length !== 6 || ready[0] !== "READY" || ready[1] !== options.generation) throw protocolError("invalid READY");
    const initialNames = { oldDb: options.dbName, oldWal: `${options.dbName}-wal`,
      oldShm: `${options.dbName}-shm`, stagedDb: options.stagedName };
    for (const [index, slot] of SLOTS.entries()) {
      const field = ready[index + 2]!;
      if (!field.startsWith(`${slot}=`)) throw protocolError("READY slot order");
      const encoded = field.slice(slot.length + 1);
      const received = encoded === "-" ? null : parseRestoreSnapshot(encoded);
      const expected = options.expected[slot] ?? null;
      if ((received === null) !== (expected === null) || (received && expected && !sameSnapshot(received, expected))) {
        throw protocolError("READY identity mismatch");
      }
      if (received) current[slot] = { name: initialNames[slot], identity: received };
    }
    const forwardSlots = SLOTS.filter((slot) => current[slot] !== undefined);
    const forwardNames = { oldDb: `${options.dbName}${options.preservedSuffix}`,
      oldWal: `${options.dbName}-wal${options.preservedSuffix}`,
      oldShm: `${options.dbName}-shm${options.preservedSuffix}`, stagedDb: options.dbName };
    return {
      async renameOwned(slot, toName) {
        try {
        const owned = current[slot];
        if (!owned) throw protocolError("missing slot");
        const nextForward = forwardSlots[movedForward.length];
        const forward = !rollingBack && !verified && slot === nextForward && toName === forwardNames[slot];
        const reverse = movedForward.at(-1) === slot && toName === initialNames[slot];
        if (!forward && !reverse) throw protocolError("MOVE phase order");
        if (reverse) rollingBack = true;
        const response = await send(`MOVE\t${slot}\t${hexName(owned.name)}\t${hexName(toName)}\t` +
          `${owned.identity.volumeSerial}\t${owned.identity.fileId}\t${owned.identity.bytes}\t${owned.identity.sha256}`);
        if (response.length !== 8 || response[0] !== "MOVED" || response[1] !== options.generation ||
            response[2] !== String(sequence + 1) || response[3] !== slot ||
            decodeName(response[4]!) !== owned.name || decodeName(response[5]!) !== toName) {
          throw protocolError("invalid MOVED response");
        }
        const before = parseRestoreSnapshot(response[6]!);
        const after = parseRestoreSnapshot(response[7]!);
        if (!sameSnapshot(before, owned.identity) || !sameSnapshot(after, before)) throw protocolError("MOVED identity mismatch");
        sequence++;
        current[slot] = { name: toName, identity: after };
        if (reverse) movedForward.pop();
        else movedForward.push(slot);
        return { generation: options.generation, sequence, operation: "rename", slot,
          fromName: owned.name, toName, before, after };
        } catch (error) { closed = true; child.kill(); throw error; }
      },
      async enterReadVerify() {
        try {
        if (rollingBack || verified || movedForward.length !== forwardSlots.length ||
            movedForward.at(-1) !== "stagedDb") throw protocolError("VERIFY phase order");
        const response = await send("VERIFY");
        if (response.length !== 4 || response[0] !== "VERIFY_READY" || response[1] !== options.generation ||
            response[2] !== String(sequence) || !current.stagedDb ||
            !sameSnapshot(parseRestoreSnapshot(response[3]!), current.stagedDb.identity)) {
          throw protocolError("invalid VERIFY_READY");
        }
        verified = true;
        } catch (error) { closed = true; child.kill(); throw error; }
      },
      async close() {
        if (closed) return;
        try {
          if (movedForward.length !== 0 && !(verified && !rollingBack &&
              movedForward.length === forwardSlots.length)) throw protocolError("CLOSE phase order");
          const response = await send("CLOSE");
          if (response.length !== 3 || response[0] !== "CLOSED" || response[1] !== options.generation ||
              response[2] !== String(sequence)) throw protocolError("invalid CLOSED");
          child.stdin.end();
          const exitCode = child.exitCode === null ? await new Promise<number | null>((resolve, reject) => {
            const timer = setTimeout(() => { child.kill(); reject(protocolError("close timeout")); }, TIMEOUT_MS);
            child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
          }) : child.exitCode;
          if (exitCode !== 0) throw protocolError("nonzero child exit");
          closed = true;
        } catch (error) { closed = true; child.kill(); throw error; }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}
