import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { validateRestoreRecoveryReady } from "../../src/storage/windows-restore-session.js";
import type { RestoreJournalRecord, RestoreMoveReceipt } from "../../src/storage/restore-journal.js";

const name = (value: string) => Buffer.from(value, "utf16le").toString("hex");
const oldDb = { volumeSerial: "a".repeat(16), fileId: "b".repeat(32), bytes: 5, sha256: "c".repeat(64) };
const stagedDb = { volumeSerial: "a".repeat(16), fileId: "d".repeat(32), bytes: 7, sha256: "e".repeat(64) };
const snap = (value: typeof oldDb) => `${value.volumeSerial}:${value.fileId}:${value.bytes}:${value.sha256}`;
const dbName = "state.db";
const stageName = `${dbName}.restore-00000000-0000-0000-0000-000000000001`;
const preservedName = `${dbName}.restore-old-00000000-0000-0000-0000-000000000002`;

function record(): RestoreJournalRecord {
  const targetDbPath = join("C:\\", "owned", dbName);
  const receipt: RestoreMoveReceipt = { generation: "00000000-0000-0000-0000-000000000003", sequence: 1,
    operation: "rename", slot: "oldDb", fromName: dbName, toName: preservedName,
    before: oldDb, after: oldDb };
  return { formatVersion: 2, generation: receipt.generation, phase: "OLD_DB_MOVED", targetDbPath,
    artifactRoot: join("C:\\", "owned", "artifacts"), stagedDbPath: join("C:\\", "owned", stageName),
    preservedDbPath: join("C:\\", "owned", preservedName), publishedBlobs: [],
    nativeInitial: { oldDb, oldWal: null, oldShm: null, stagedDb }, moveReceipts: [receipt] };
}

function ready(count: number, oldName: string, newName: string, old = oldDb): string {
  return ["RECOVERY_READY", record().generation, String(count),
    `oldDb=${name(oldName)}:${snap(old)}`, "oldWal=-", "oldShm=-",
    `stagedDb=${name(newName)}:${snap(stagedDb)}`].join("\t");
}

describe("Windows restore recovery READY reconciliation", () => {
  it("accepts fresh count0/count1 and rejects invented old files or a changed staged FileId", () => {
    const journal: RestoreJournalRecord = { ...record(), phase: "FRESH_TARGET_CONFIRMED",
      nativeInitial: { oldDb: null, oldWal: null, oldShm: null, stagedDb }, moveReceipts: [] };
    const line = (count: number, fileName: string, snapshot = stagedDb, oldField = "oldDb=-") =>
      ["RECOVERY_READY", journal.generation, String(count), oldField, "oldWal=-", "oldShm=-",
        `stagedDb=${name(fileName)}:${snap(snapshot)}`].join("\t");
    expect(validateRestoreRecoveryReady(line(0, stageName), journal).physicalForwardCount).toBe(0);
    expect(validateRestoreRecoveryReady(line(1, dbName), journal).physicalForwardCount).toBe(1);
    expect(() => validateRestoreRecoveryReady(line(1, dbName,
      { ...stagedDb, fileId: "f".repeat(32) }), journal)).toThrow();
    expect(() => validateRestoreRecoveryReady(line(1, dbName, stagedDb,
      `oldDb=${name(preservedName)}:${snap(oldDb)}`), journal)).toThrow();
    expect(() => validateRestoreRecoveryReady(line(2, dbName), journal)).toThrow();
  });

  it("accepts durable receipt prefix and one physical MOVE ahead", () => {
    const journal = record();
    expect(validateRestoreRecoveryReady(ready(1, preservedName, stageName), journal).physicalForwardCount).toBe(1);
    expect(validateRestoreRecoveryReady(ready(2, preservedName, dbName), journal).physicalForwardCount).toBe(2);
  });

  it("rejects a changed FileId, two unjournaled moves and nonprefix layout before ACCEPT", () => {
    const journal = record();
    expect(() => validateRestoreRecoveryReady(ready(1, preservedName, stageName,
      { ...oldDb, fileId: "f".repeat(32) }), journal)).toThrow();
    expect(() => validateRestoreRecoveryReady(ready(3, preservedName, dbName), journal)).toThrow();
    expect(() => validateRestoreRecoveryReady(ready(1, dbName, dbName), journal)).toThrow();
  });

  it("accepts one reverse MOVE ahead of durable recovery receipts", () => {
    const journal = record();
    journal.phase = "RECOVERING";
    journal.recoveryBaseCount = 2;
    journal.recoveryReceipts = [];
    expect(validateRestoreRecoveryReady(ready(1, preservedName, stageName), journal).physicalForwardCount).toBe(1);
    journal.recoveryReceipts = [{ generation: journal.generation, step: 1, slot: "stagedDb",
      fromName: dbName, toName: stageName, identity: stagedDb, evidence: "RECOVERY_READY" }];
    expect(validateRestoreRecoveryReady(ready(0, dbName, stageName), journal).physicalForwardCount).toBe(0);
    expect(() => validateRestoreRecoveryReady(ready(2, preservedName, dbName), journal)).toThrow();
  });
});
