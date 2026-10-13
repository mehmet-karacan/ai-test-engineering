import { describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRestorePhase, assertRestoreReadyBeforeOpen, captureRestoreEvidence, journalPathForDb, readRestoreJournal,
  recoverIntactOldRestoreBeforeOpen, type RestoreMoveReceipt } from "../../src/storage/restore-journal.js";
import { Storage } from "../../src/storage/storage.js";

describe("S01 restore journal fail-closed", () => {
  it("fsyncs a reverse recovery receipt before terminal rollback", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-native-reverse-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.restore-stage");
      const manifest = join(root, "manifest.json");
      const preserved = join(root, "state.db.restore-old-generation");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "manifest");
      const evidence = captureRestoreEvidence(db, stage, manifest, []);
      const oldDb = { volumeSerial: "a".repeat(16), fileId: "b".repeat(32),
        bytes: evidence.oldDb.bytes!, sha256: evidence.oldDb.sha256! };
      const stagedDb = { volumeSerial: "a".repeat(16), fileId: "c".repeat(32),
        bytes: evidence.oldDb.bytes!, sha256: evidence.sourceDbSha256 };
      const generation = "native-reverse-generation";
      const receipt: RestoreMoveReceipt = { generation, sequence: 1, operation: "rename", slot: "oldDb",
        fromName: "state.db", toName: "state.db.restore-old-generation", before: oldDb, after: oldDb };
      const base = { formatVersion: 2 as const, generation, targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage, preservedDbPath: preserved,
        publishedBlobs: [], evidence, nativeInitial: { oldDb, oldWal: null, oldShm: null, stagedDb } };
      const path = journalPathForDb(db);
      appendRestorePhase(path, { ...base, phase: "PREPARED", moveReceipts: [] });
      appendRestorePhase(path, { ...base, phase: "BLOBS_READY", moveReceipts: [] });
      appendRestorePhase(path, { ...base, phase: "OLD_DB_MOVED", moveReceipts: [receipt] });
      appendRestorePhase(path, { ...base, phase: "RECOVERING", moveReceipts: [receipt],
        recoveryBaseCount: 1, recoveryReceipts: [] });
      const reverse = { generation, step: 1, slot: "oldDb" as const,
        fromName: "state.db.restore-old-generation", toName: "state.db", identity: oldDb,
        evidence: "MOVED" as const };
      expect(() => appendRestorePhase(path, { ...base, phase: "ROLLED_BACK", moveReceipts: [receipt],
        recoveryBaseCount: 1, recoveryReceipts: [] })).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      appendRestorePhase(path, { ...base, phase: "RECOVERING", moveReceipts: [receipt],
        recoveryBaseCount: 1, recoveryReceipts: [reverse] });
      expect(() => appendRestorePhase(path, { ...base, phase: "ROLLED_BACK", moveReceipts: [receipt],
        recoveryBaseCount: 1, recoveryReceipts: [{ ...reverse, identity: { ...oldDb, fileId: "d".repeat(32) } }] }))
        .toThrow(/RESTORE_RECOVERY_REQUIRED/);
      appendRestorePhase(path, { ...base, phase: "ROLLED_BACK", moveReceipts: [receipt],
        recoveryBaseCount: 1, recoveryReceipts: [reverse] });
      expect(readRestoreJournal(path)?.phase).toBe("ROLLED_BACK");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("freezes native FileId snapshots from PREPARED through the journal", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-native-initial-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.restore-00000000-0000-0000-0000-000000000001");
      const manifest = join(root, "manifest.json");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "manifest");
      const evidence = captureRestoreEvidence(db, stage, manifest, []);
      const snapshot = (fileId: string, bytes: number, sha256: string) =>
        ({ volumeSerial: "a".repeat(16), fileId, bytes, sha256 });
      const nativeInitial = {
        oldDb: snapshot("b".repeat(32), evidence.oldDb.bytes!, evidence.oldDb.sha256!),
        oldWal: null, oldShm: null,
        stagedDb: snapshot("c".repeat(32), evidence.oldDb.bytes!, evidence.sourceDbSha256),
      };
      const base = { formatVersion: 2 as const, generation: "native-initial-generation", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-00000000-0000-0000-0000-000000000001"),
        publishedBlobs: [], evidence, nativeInitial, moveReceipts: [] };
      const path = journalPathForDb(db);
      appendRestorePhase(path, { ...base, phase: "PREPARED" });
      expect(() => appendRestorePhase(path, { ...base, phase: "BLOBS_READY",
        nativeInitial: { ...nativeInitial, oldDb: { ...nativeInitial.oldDb, fileId: "d".repeat(32) } } }))
        .toThrow(/RESTORE_RECOVERY_REQUIRED/);
      appendRestorePhase(path, { ...base, phase: "BLOBS_READY" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("receipt-enabled v2 journal rejects a move without receipt and changed receipt history", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-receipt-order-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      const generation = "receipt-generation";
      const base = { formatVersion: 2 as const, generation, targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-receipt"), publishedBlobs: [],
        evidence: captureRestoreEvidence(db, stage, manifest, []) };
      const path = journalPathForDb(db);
      appendRestorePhase(path, { ...base, phase: "PREPARED", moveReceipts: [] });
      appendRestorePhase(path, { ...base, phase: "BLOBS_READY", moveReceipts: [] });
      expect(() => appendRestorePhase(path, { ...base, phase: "OLD_DB_MOVED", moveReceipts: [] }))
        .toThrow(/RESTORE_RECOVERY_REQUIRED/);
      const before = { volumeSerial: "a".repeat(16), fileId: "b".repeat(32), bytes: 12, sha256: "c".repeat(64) };
      const receipt: RestoreMoveReceipt = { generation, sequence: 1, operation: "rename", slot: "oldDb",
        fromName: "state.db", toName: "state.db.restore-old-receipt", before, after: { ...before } };
      expect(() => appendRestorePhase(path, { ...base, phase: "OLD_DB_MOVED",
        moveReceipts: [{ ...receipt, generation: "other-generation" }] }))
        .toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(() => appendRestorePhase(path, { ...base, phase: "OLD_DB_MOVED",
        moveReceipts: [{ ...receipt, toName: "state.db" }] }))
        .toThrow(/RESTORE_RECOVERY_REQUIRED/);
      appendRestorePhase(path, { ...base, phase: "OLD_DB_MOVED", moveReceipts: [receipt] });
      expect(() => appendRestorePhase(path, { ...base, phase: "OLD_DB_PRESERVED",
        moveReceipts: [{ ...receipt, before: { ...before, fileId: "d".repeat(32) } }] }))
        .toThrow(/RESTORE_RECOVERY_REQUIRED/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("v2 per-move journal DB/WAL/SHM ve yeni DB yayin sirasi disina cikamaz", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-move-order-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      const base = { formatVersion: 2 as const, generation: "generation-v2-move-order", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-v2"), publishedBlobs: [],
        evidence: captureRestoreEvidence(db, stage, manifest, []) };
      const path = journalPathForDb(db);
      for (const phase of ["PREPARED", "BLOBS_READY", "OLD_DB_MOVED", "OLD_WAL_MOVED", "OLD_SHM_MOVED",
        "OLD_DB_PRESERVED", "NEW_DB_MOVED", "NEW_DB_PUBLISHED", "VERIFIED", "COMMITTED"] as const) {
        appendRestorePhase(path, { ...base, phase });
      }
      expect(readRestoreJournal(path)?.phase).toBe("COMMITTED");
      expect(() => appendRestorePhase(path, { ...base, phase: "OLD_DB_MOVED" })).toThrow(/RESTORE_RECOVERY_REQUIRED/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("v2 BLOBS_READY eski DB/WAL hedefte ayniyken blob silmeden eskiyi acar", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-blobs-ready-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      const orphan = join(root, "artifacts", "blob");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(`${db}-wal`, "old-wal-bytes");
      writeFileSync(`${db}-shm`, "old-shm-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      const base = { formatVersion: 2 as const, generation: "generation-v2-blobs", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-v2"), publishedBlobs: [],
        evidence: captureRestoreEvidence(db, stage, manifest, []) };
      const path = journalPathForDb(db);
      appendRestorePhase(path, { ...base, phase: "PREPARED" });
      appendRestorePhase(path, { ...base, phase: "BLOBS_READY" });
      mkdirSync(join(root, "artifacts"));
      writeFileSync(orphan, "linked-orphan");
      recoverIntactOldRestoreBeforeOpen(db);
      expect(readRestoreJournal(path)?.phase).toBe("ROLLED_BACK");
      expect(() => assertRestoreReadyBeforeOpen(db)).not.toThrow();
      expect(existsSync(orphan)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each(["db-changed", "wal-changed", "shm-missing", "old-db-preserved", "old-wal-preserved", "old-shm-preserved"])(
    "v2 BLOBS_READY %s kaniti bozulunca fail-closed kalir", (fault) => {
      const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-blobs-negative-"));
      try {
        const db = join(root, "state.db");
        const stage = join(root, "state.db.stage");
        const manifest = join(root, "manifest.json");
        const preserved = join(root, "state.db.restore-old-v2");
        writeFileSync(db, "old-db-bytes");
        writeFileSync(`${db}-wal`, "old-wal-bytes");
        writeFileSync(`${db}-shm`, "old-shm-bytes");
        writeFileSync(stage, "new-db-bytes");
        writeFileSync(manifest, "new-manifest");
        const base = { formatVersion: 2 as const, generation: `generation-v2-${fault}`, targetDbPath: db,
          artifactRoot: join(root, "artifacts"), stagedDbPath: stage, preservedDbPath: preserved,
          publishedBlobs: [], evidence: captureRestoreEvidence(db, stage, manifest, []) };
        const path = journalPathForDb(db);
        appendRestorePhase(path, { ...base, phase: "PREPARED" });
        appendRestorePhase(path, { ...base, phase: "BLOBS_READY" });
        if (fault === "db-changed") writeFileSync(db, "changed-db-bytes");
        if (fault === "wal-changed") writeFileSync(`${db}-wal`, "changed-wal-bytes");
        if (fault === "shm-missing") rmSync(`${db}-shm`);
        if (fault === "old-db-preserved") writeFileSync(preserved, "other-db");
        if (fault === "old-wal-preserved") writeFileSync(`${db}-wal.restore-old-v2`, "other-wal");
        if (fault === "old-shm-preserved") writeFileSync(`${db}-shm.restore-old-v2`, "other-shm");
        expect(() => recoverIntactOldRestoreBeforeOpen(db)).toThrow(/RESTORE_RECOVERY_REQUIRED/);
        expect(readRestoreJournal(path)?.phase).toBe("BLOBS_READY");
      } finally { rmSync(root, { recursive: true, force: true }); }
    });

  it("v2 PREPARED'da eski DB kimligi dogrulanir, yetim blob silinmeden eski generation acilir", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-prepared-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      const orphan = join(root, "artifacts", "blob");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      const evidence = captureRestoreEvidence(db, stage, manifest, []);
      const base = { formatVersion: 2 as const, generation: "generation-v2", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-v2"), publishedBlobs: [], evidence };
      appendRestorePhase(journalPathForDb(db), { ...base, phase: "PREPARED" });
      mkdirSync(join(root, "artifacts"));
      writeFileSync(orphan, "new-orphan");
      recoverIntactOldRestoreBeforeOpen(db);
      expect(readRestoreJournal(journalPathForDb(db))?.phase).toBe("ROLLED_BACK");
      expect(() => assertRestoreReadyBeforeOpen(db)).not.toThrow();
      expect(existsSync(orphan)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("v2 PREPARED eski DB kimligi degisirse recovery fail-closed kalir", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-mismatch-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      const base = { formatVersion: 2 as const, generation: "generation-v2-mismatch", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-v2"), publishedBlobs: [],
        evidence: captureRestoreEvidence(db, stage, manifest, []) };
      appendRestorePhase(journalPathForDb(db), { ...base, phase: "PREPARED" });
      writeFileSync(db, "other-db-bytes");
      expect(() => recoverIntactOldRestoreBeforeOpen(db)).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(readRestoreJournal(journalPathForDb(db))?.phase).toBe("PREPARED");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("v2 PREPARED oncesinde eski DB yoksa bos DB olusturmaz", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-no-old-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      appendRestorePhase(journalPathForDb(db), { formatVersion: 2, generation: "generation-v2-no-old",
        phase: "PREPARED", targetDbPath: db, artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-v2"), publishedBlobs: [],
        evidence: captureRestoreEvidence(db, stage, manifest, []) });
      expect(() => new Storage({ dbPath: db })).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(existsSync(db)).toBe(false);
      expect(readRestoreJournal(journalPathForDb(db))?.phase).toBe("PREPARED");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("v2 snapshot kimligi ayni generation icinde degistirilemez", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-v2-immutable-"));
    try {
      const db = join(root, "state.db");
      const stage = join(root, "state.db.stage");
      const manifest = join(root, "manifest.json");
      writeFileSync(db, "old-db-bytes");
      writeFileSync(stage, "new-db-bytes");
      writeFileSync(manifest, "new-manifest");
      const base = { formatVersion: 2 as const, generation: "generation-v2-immutable", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: stage,
        preservedDbPath: join(root, "state.db.restore-old-v2"), publishedBlobs: [],
        evidence: captureRestoreEvidence(db, stage, manifest, []) };
      const path = journalPathForDb(db);
      appendRestorePhase(path, { ...base, phase: "PREPARED" });
      expect(() => appendRestorePhase(path, { ...base, phase: "BLOBS_READY",
        evidence: { ...base.evidence, sourceDbSha256: "f".repeat(64) } })).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(readRestoreJournal(path)?.phase).toBe("PREPARED");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects a changed planned blob set within one restore generation", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-blob-identity-"));
    try {
      const db = join(root, "state.db");
      const artifactRoot = join(root, "artifacts");
      const base = { generation: "generation-blob-identity", targetDbPath: db, artifactRoot,
        stagedDbPath: join(root, "state.db.stage"), preservedDbPath: join(root, "state.db.old"),
        publishedBlobs: [{ path: join(artifactRoot, "blobs", "first"), sha256: "a".repeat(64) }] };
      const path = journalPathForDb(db);
      appendRestorePhase(path, { ...base, phase: "PREPARED" });
      expect(() => appendRestorePhase(path, { ...base, phase: "BLOBS_READY",
        publishedBlobs: [{ path: join(artifactRoot, "blobs", "second"), sha256: "b".repeat(64) }] })).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(readRestoreJournal(path)?.phase).toBe("PREPARED");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("requires ordered, checksummed transitions and blocks unfinished startup", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-"));
    try {
      const db = join(root, "state.db");
      const path = journalPathForDb(db);
      const base = { generation: "generation-1", targetDbPath: db, artifactRoot: join(root, "artifacts"),
        stagedDbPath: join(root, "state.db.stage"), preservedDbPath: join(root, "state.db.old"),
        publishedBlobs: [] as Array<{ path: string; sha256: string }> };
      appendRestorePhase(path, { ...base, phase: "PREPARED" });
      expect(() => assertRestoreReadyBeforeOpen(db)).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(() => appendRestorePhase(path, { ...base, phase: "COMMITTED" })).toThrow();
      for (const phase of ["BLOBS_READY", "OLD_DB_PRESERVED", "NEW_DB_PUBLISHED", "VERIFIED", "COMMITTED"] as const) {
        appendRestorePhase(path, { ...base, phase });
      }
      expect(readRestoreJournal(path)?.phase).toBe("COMMITTED");
      expect(() => assertRestoreReadyBeforeOpen(db)).not.toThrow();
      appendFileSync(path, "truncated");
      expect(() => assertRestoreReadyBeforeOpen(db)).toThrow(/RESTORE_RECOVERY_REQUIRED/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("blocks Storage before SQLite can create an empty state.db", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-open-"));
    let opened: Storage | undefined;
    try {
      const db = join(root, "state.db");
      appendRestorePhase(journalPathForDb(db), { generation: "generation-2", phase: "PREPARED", targetDbPath: db,
        artifactRoot: join(root, "artifacts"), stagedDbPath: join(root, "state.db.stage"),
        preservedDbPath: join(root, "state.db.old"), publishedBlobs: [] });
      expect(() => { opened = new Storage({ dbPath: db }); }).toThrow(/RESTORE_RECOVERY_REQUIRED/);
      expect(existsSync(db)).toBe(false);
    } finally { opened?.close(); rmSync(root, { recursive: true, force: true }); }
  });

  it("blocks startup when an old DB is stranded but the journal file is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "wn-journal-lost-"));
    try {
      const db = join(root, "state.db");
      writeFileSync(`${db}.restore-old-generation`, "old database bytes");
      expect(() => assertRestoreReadyBeforeOpen(db)).toThrow(/RESTORE_RECOVERY_REQUIRED/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
