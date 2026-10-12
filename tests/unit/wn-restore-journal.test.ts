import { describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRestorePhase, assertRestoreReadyBeforeOpen, captureRestoreEvidence, journalPathForDb, readRestoreJournal, recoverPreparedRestoreBeforeOpen } from "../../src/storage/restore-journal.js";
import { Storage } from "../../src/storage/storage.js";

describe("S01 restore journal fail-closed", () => {
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
      recoverPreparedRestoreBeforeOpen(db);
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
      expect(() => recoverPreparedRestoreBeforeOpen(db)).toThrow(/RESTORE_RECOVERY_REQUIRED/);
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
