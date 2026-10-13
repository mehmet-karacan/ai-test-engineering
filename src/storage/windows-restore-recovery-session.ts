/** Pinned native rollback session. ACCEPT follows a validated RECOVERY_READY only. */
import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, relative, sep } from "node:path";
import { AppError } from "../domain/errors.js";
import { assertTrustedWindowsFileHelper, type WindowsFileHelperSpec } from "../discovery/windows-file-bridge.js";
import type { RestoreJournalRecord, RestoreMoveReceipt } from "./restore-journal.js";
import { decodeName, hexName, parseRestoreSnapshot, RestoreSessionLines, sameSnapshot,
  validateRestoreRecoveryReady } from "./windows-restore-session.js";

function protocolError(detail: string): AppError {
  return new AppError("BLOCKED_ISOLATION", `Windows recovery session protocol: ${detail}`, {
    reason_code: "WINDOWS_RESTORE_RECOVERY_PROTOCOL",
  });
}

export interface WindowsRestoreRecoverySession {
  readonly pid: number;
  remaining(): number;
  rollbackOne(): Promise<RestoreMoveReceipt>;
  guardEmptyBlob(): Promise<void>;
  commitEmptyRollback(journalPath: string, expected: RestoreMoveReceipt["before"], line: string): Promise<void>;
  close(): Promise<void>;
  abort(): void;
}

export async function startWindowsRestoreRecoverySession(helper: WindowsFileHelperSpec,
  journal: RestoreJournalRecord): Promise<WindowsRestoreRecoverySession> {
  if (!journal.nativeInitial || !journal.moveReceipts || journal.formatVersion !== 2) {
    throw protocolError("journal lacks native initial identity");
  }
  assertTrustedWindowsFileHelper(helper);
  const dbName = basename(journal.targetDbPath);
  const stagedName = basename(journal.stagedDbPath);
  const preservedName = basename(journal.preservedDbPath);
  const child = spawn(helper.path, [journal.nativeInitial.oldDb === null ? "recover-fresh" : "recover-session",
    dirname(journal.targetDbPath), hexName(dbName),
    hexName(stagedName), hexName(preservedName), journal.generation],
    { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
  const lines = new RestoreSessionLines(child);
  // A hard-killed helper closes stdin before a pending write callback runs.
  // The callback rejects the command; consume the stream error as well.
  child.stdin.on("error", () => {});
  let closed = false;
  let busy = false;
  const send = async (command: string): Promise<string[]> => {
    if (busy || closed) throw protocolError("session unavailable");
    busy = true;
    try {
      await new Promise<void>((resolve, reject) => child.stdin.write(`${command}\n`, (error) => error ? reject(error) : resolve()));
      return (await lines.next()).split("\t");
    } catch (error) { closed = true; child.kill(); throw error; }
    finally { busy = false; }
  };
  try {
    const ready = validateRestoreRecoveryReady(await lines.next(), journal);
    let count = ready.physicalForwardCount;
    let sequence = count;
    const current = ready.files;
    const response = await send(ready.acceptCommand);
    if (response.length !== 3 || response[0] !== "ACCEPTED" || response[1] !== journal.generation ||
        response[2] !== String(count)) throw protocolError("invalid ACCEPTED");
    const slots = (["oldDb", "oldWal", "oldShm", "stagedDb"] as const)
      .filter((slot) => journal.nativeInitial![slot] !== null);
    const origin = { oldDb: dbName, oldWal: `${dbName}-wal`, oldShm: `${dbName}-shm`, stagedDb: stagedName };
    let emptyGuarded = false;
    let emptyCommitted = false;
    return {
      pid: child.pid ?? 0,
      remaining: () => count,
      async guardEmptyBlob() {
        if (count !== 0 || emptyGuarded || journal.phase !== "PREPARED" ||
            journal.publishedBlobs.length !== 1 || journal.stageIntents?.length !== 1 ||
            !journal.emptyBlobGuard?.parents[0] ||
            !journal.nativeInitial?.oldDb) throw protocolError("empty blob recovery unavailable");
        const destination = journal.publishedBlobs[0]!.path;
        const stage = journal.stageIntents[0]!.path;
        const parent = dirname(destination);
        if (dirname(stage) !== parent) throw protocolError("stage parent mismatch");
        const parentRelative = relative(journal.artifactRoot, parent);
        if (isAbsolute(parentRelative) || parentRelative === ".." || parentRelative.startsWith(`..${sep}`)) {
          throw protocolError("parent outside artifact root");
        }
        const root = journal.emptyBlobGuard.root;
        const parentId = journal.emptyBlobGuard.parents[0]!;
        const hexPath = (value: string) => Buffer.from(value, "utf16le").toString("hex");
        const owned = journal.stageIntents[0]!.identity;
        const command = owned ? "OWNED_GUARD" : "EMPTY_GUARD";
        const reply = await send(`${command}\t${hexPath(journal.artifactRoot)}\t` +
          `${parentRelative ? hexPath(parentRelative) : "-"}\t${hexName(basename(destination))}\t` +
          `${hexName(basename(stage))}\t${root.volumeSerial}\t${root.fileId}\t` +
          `${parentId.volumeSerial}\t${parentId.fileId}` +
          (owned ? `\t${owned.volumeSerial}\t${owned.fileId}\t${owned.bytes}\t${owned.sha256}` : ""));
        if (reply.length !== 1 || reply[0] !== (owned ? "OWNED_GUARDED" : "EMPTY_GUARDED")) {
          throw protocolError("invalid blob guard receipt");
        }
        emptyGuarded = true;
      },
      async commitEmptyRollback(journalPath, expected, line) {
        if (!emptyGuarded || emptyCommitted || count !== 0 || !line.endsWith("\n")) {
          throw protocolError("empty rollback unavailable");
        }
        const hexPath = Buffer.from(journalPath, "utf16le").toString("hex");
        const hexLine = Buffer.from(line, "utf8").toString("hex");
        const reply = await send(`ROLLBACK_COMMIT\t${hexPath}\t${expected.volumeSerial}\t` +
          `${expected.fileId}\t${expected.bytes}\t${expected.sha256}\t${hexLine}`);
        if (reply.length !== 1 || reply[0] !== "ROLLBACK_COMMITTED") throw protocolError("invalid rollback ACK");
        emptyCommitted = true;
      },
      async rollbackOne() {
        if (count <= 0) throw protocolError("rollback complete");
        const slot = slots[count - 1]!;
        const owned = current[slot];
        if (!owned) throw protocolError("missing rollback slot");
        const toName = origin[slot];
        const reply = await send(`MOVE\t${slot}\t${hexName(owned.name)}\t${hexName(toName)}\t` +
          `${owned.identity.volumeSerial}\t${owned.identity.fileId}\t${owned.identity.bytes}\t${owned.identity.sha256}`);
        if (reply.length !== 8 || reply[0] !== "MOVED" || reply[1] !== journal.generation ||
            reply[2] !== String(sequence + 1) || reply[3] !== slot ||
            decodeName(reply[4]!) !== owned.name || decodeName(reply[5]!) !== toName ||
            !sameSnapshot(parseRestoreSnapshot(reply[6]!), owned.identity) ||
            !sameSnapshot(parseRestoreSnapshot(reply[7]!), owned.identity)) {
          throw protocolError("invalid recovery MOVED receipt");
        }
        sequence++;
        count--;
        current[slot] = { name: toName, identity: owned.identity };
        return { generation: journal.generation, sequence, operation: "rename" as const, slot,
          fromName: owned.name, toName, before: owned.identity, after: owned.identity };
      },
      async close() {
        if (count !== 0) throw protocolError("rollback incomplete");
        if (emptyGuarded && !emptyCommitted) throw protocolError("empty rollback not committed");
        const reply = await send("CLOSE");
        if (reply.length !== 3 || reply[0] !== "CLOSED" || reply[1] !== journal.generation ||
            reply[2] !== String(sequence)) throw protocolError("invalid recovery CLOSED");
        child.stdin.end();
        const code = child.exitCode === null ? await new Promise<number | null>((resolve, reject) => {
          const timer = setTimeout(() => { child.kill(); reject(protocolError("close timeout")); }, 30_000);
          child.once("exit", (value) => { clearTimeout(timer); resolve(value); });
        }) : child.exitCode;
        if (code !== 0) throw protocolError("recovery helper exit failure");
        closed = true;
      },
      abort() { closed = true; child.kill(); },
    };
  } catch (error) { child.kill(); throw error; }
}
