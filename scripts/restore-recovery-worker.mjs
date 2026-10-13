/** Sync-startup bridge target: recover only a journal-proven old generation in owned paths. */
import { resolve } from "node:path";
import { packagedWindowsFileHelper } from "../dist/discovery/windows-file-bridge.js";
import { acquireMaintenanceLock, acquireRestoreDbLock } from "../dist/storage/maintenance-lock.js";
import { appendRestorePhase, fileIdentity, journalPathForDb, readRestoreJournal } from "../dist/storage/restore-journal.js";
import { startWindowsRestoreRecoverySession } from "../dist/storage/windows-restore-recovery-session.js";

const dbPath = resolve(process.argv[2] ?? "");
let releaseDb;
let releaseArtifact;
let session;
try {
  if (!process.argv[2] || dbPath !== process.argv[2]) throw new Error("invalid DB path");
  releaseDb = acquireRestoreDbLock(dbPath);
  const journalPath = journalPathForDb(dbPath);
  let journal = readRestoreJournal(journalPath);
  if (!journal || journal.targetDbPath !== dbPath || journal.formatVersion !== 2 ||
      !journal.nativeInitial || !journal.moveReceipts ||
      journal.phase === "COMMITTED" || journal.phase === "ROLLED_BACK") throw new Error("native recovery journal unavailable");
  releaseArtifact = acquireMaintenanceLock(journal.artifactRoot, "restore-recovery");
  journal = readRestoreJournal(journalPath);
  if (!journal || journal.targetDbPath !== dbPath || !journal.nativeInitial || !journal.moveReceipts ||
      journal.phase === "COMMITTED" || journal.phase === "ROLLED_BACK") throw new Error("journal changed before recovery");
  session = await startWindowsRestoreRecoverySession(packagedWindowsFileHelper(), journal);
  const initial = journal.nativeInitial;
  const forward = ["oldDb", "oldWal", "oldShm", "stagedDb"].filter((slot) => initial[slot] !== null);
  const dbName = dbPath.slice(dbPath.lastIndexOf("\\") + 1);
  const suffix = journal.preservedDbPath.slice(dbPath.length);
  const forwardNames = { oldDb: `${dbName}${suffix}`, oldWal: `${dbName}-wal${suffix}`,
    oldShm: `${dbName}-shm${suffix}`, stagedDb: dbName };
  const initialNames = { oldDb: dbName, oldWal: `${dbName}-wal`, oldShm: `${dbName}-shm`,
    stagedDb: journal.stagedDbPath.slice(journal.stagedDbPath.lastIndexOf("\\") + 1) };
  if (journal.phase !== "RECOVERING") {
    journal = { ...journal, phase: "RECOVERING", recoveryBaseCount: session.remaining(), recoveryReceipts: [] };
    appendRestorePhase(journalPath, journal);
  } else {
    const expected = journal.recoveryBaseCount - journal.recoveryReceipts.length;
    if (session.remaining() === expected - 1) {
      const slot = forward[session.remaining()];
      const receipt = { generation: journal.generation, step: journal.recoveryReceipts.length + 1,
        slot, fromName: forwardNames[slot], toName: initialNames[slot],
        identity: initial[slot], evidence: "RECOVERY_READY" };
      journal = { ...journal, recoveryReceipts: [...journal.recoveryReceipts, receipt] };
      appendRestorePhase(journalPath, journal);
    } else if (session.remaining() !== expected) throw new Error("reverse receipt/layout mismatch");
  }
  while (session.remaining() > 0) {
    const moved = await session.rollbackOne();
    const receipt = { generation: journal.generation, step: journal.recoveryReceipts.length + 1,
      slot: moved.slot, fromName: moved.fromName, toName: moved.toName,
      identity: moved.before, evidence: "MOVED" };
    journal = { ...journal, recoveryReceipts: [...journal.recoveryReceipts, receipt] };
    appendRestorePhase(journalPath, journal);
  }
  const e = journal.evidence;
  if (!e || JSON.stringify(fileIdentity(dbPath)) !== JSON.stringify(e.oldDb) ||
      JSON.stringify(fileIdentity(`${dbPath}-wal`)) !== JSON.stringify(e.oldWal) ||
      fileIdentity(journal.stagedDbPath).sha256 !== e.sourceDbSha256) {
    throw new Error("old generation identity changed during recovery");
  }
  appendRestorePhase(journalPath, { ...journal, phase: "ROLLED_BACK" });
  await session.close();
  session = undefined;
  process.stdout.write(initial.oldDb === null ? "RECOVERED_EMPTY\n" : "RECOVERED_OLD\n");
} catch (error) {
  process.stderr.write(String(error?.stack ?? error));
  process.exitCode = 2;
} finally {
  session?.abort();
  releaseArtifact?.();
  releaseDb?.();
}
