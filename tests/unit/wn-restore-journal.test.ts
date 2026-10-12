import { describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRestorePhase, assertRestoreReadyBeforeOpen, journalPathForDb, readRestoreJournal } from "../../src/storage/restore-journal.js";
import { Storage } from "../../src/storage/storage.js";

describe("S01 restore journal fail-closed", () => {
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
