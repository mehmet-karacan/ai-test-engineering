/**
 * S01 kirmizi test (WN restore atomikligi): restoreBackup, blob kopyama asamasinda
 * EEXIST ile karsilastiginda (hedefte ayni relative_path'te FARKLI baytli mevcut
 * destination blob), onceki aktif state.db ve blob icerikleri byte-ayni kalmali.
 *
 * Yontem: gercek Windows better-sqlite3 fixture'i + gercek createBackup ile
 * uretilmis tam backup. EEXIST, COPYFILE_EXCL semantigiyle simule edilir:
 * node:fs copyFileSync mock'u yalniz "hedef mevcut ve baytlar farkli" durumunda
 * EEXIST firlatir; aksi halde gercek fs'e delege eder. Cunku gercek fs'de plain
 * copyFileSync hedefi sessizce ezer ve EEXIST hic olusmaz; duzeltme ile restore'un
 * bu durumda onceki durumu bozmadan durmasi hedeflenir.
 */
import { describe, it, vi } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createBackup, restoreBackup, sha256Data } from "../../src/storage/lifecycle-ops.js";

type BlobEntry = { relative_path: string; sha256: string; bytes: number };
const faults = vi.hoisted(() => ({ stageCopy: false, dbPublish: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const { createHash } = await import("node:crypto");
  const hashOf = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
  const copyFileSync: typeof actual.copyFileSync = (src, dest, mode) => {
    if (faults.stageCopy && String(dest).includes(".restore-") && String(src).includes("blobs")) {
      const error: NodeJS.ErrnoException = new Error("ENOSPC: staged blob copy failed");
      error.code = "ENOSPC";
      throw error;
    }
    // COPYFILE_EXCL benzeri EEXIST: hedef mevcut ve baytlar farkliysa yazmadan dur.
    if (actual.existsSync(dest) && hashOf(actual.readFileSync(dest)) !== hashOf(actual.readFileSync(src))) {
      const error: NodeJS.ErrnoException = new Error(
        `EEXIST: file already exists, copyfile '${String(src)}' -> '${String(dest)}'`,
      );
      error.code = "EEXIST";
      error.syscall = "copyfile";
      throw error;
    }
    return actual.copyFileSync(src, dest, mode);
  };
  const renameSync: typeof actual.renameSync = (oldPath, newPath) => {
    if (faults.dbPublish && String(oldPath).includes(".restore-") && !String(oldPath).includes(".restore-old-") && String(newPath).endsWith("state.db")) {
      const error: NodeJS.ErrnoException = new Error("EACCES: database publish failed");
      error.code = "EACCES";
      throw error;
    }
    return actual.renameSync(oldPath, newPath);
  };
  return { ...actual, copyFileSync, renameSync };
});

const SCHEMA = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
  INSERT INTO schema_migrations VALUES (7);
  CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
  CREATE TABLE artifacts (
    id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
    relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL,
    bytes INTEGER NOT NULL, status TEXT NOT NULL
  );
`;

function makeBlob(artifactsRoot: string, text: string): BlobEntry {
  const sha256 = sha256Data(text);
  const relative_path = `blobs/sha256/${sha256}`;
  const destination = join(artifactsRoot, relative_path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, text);
  return { relative_path, sha256, bytes: Buffer.byteLength(text) };
}

describe("WN restore atomikligi", () => {
  it("restoreBackup EEXIST'te onceki aktif state.db ve blob'lari byte-ayni birakir", async () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "aitest-wn-restore-src-"));
    const runtimeRoot = mkdtempSync(join(tmpdir(), "aitest-wn-restore-run-"));
    let sourceDb: Database.Database | undefined;
    try {
      // Gercek better-sqlite3 fixture: yedegin alindigi canli runtime.
      const sourceDbPath = join(sourceRoot, "state.db");
      const sourceArtifacts = join(sourceRoot, "artifacts");
      sourceDb = new Database(sourceDbPath);
      sourceDb.pragma("foreign_keys = ON");
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const backupBlob = makeBlob(sourceArtifacts, "yedek icerigi");
      sourceDb
        .prepare("INSERT INTO artifacts VALUES ('backup-art', 'backup-job', ?, ?, ?, 'READY')")
        .run(backupBlob.relative_path, backupBlob.sha256, backupBlob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(sourceRoot, "backups"));
      sourceDb.close();
      sourceDb = undefined;

      // Onceki aktif runtime: gercek state.db + kendi READY blob'u + carpisan hedef.
      const runtimeDbPath = join(runtimeRoot, "state.db");
      const runtimeArtifacts = join(runtimeRoot, "artifacts");
      const runtimeDb = new Database(runtimeDbPath);
      runtimeDb.pragma("foreign_keys = ON");
      runtimeDb.exec(SCHEMA);
      runtimeDb.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      const activeBlob = makeBlob(runtimeArtifacts, "onceki aktif icerik");
      runtimeDb
        .prepare("INSERT INTO artifacts VALUES ('active-art', 'active-job', ?, ?, ?, 'READY')")
        .run(activeBlob.relative_path, activeBlob.sha256, activeBlob.bytes);
      runtimeDb.close();

      // EEXIST kaynagi: hedefte ayni relative_path'te FARKLI baytli mevcut destination blob.
      const destinationBlobPath = join(runtimeArtifacts, backupBlob.relative_path);
      mkdirSync(dirname(destinationBlobPath), { recursive: true });
      writeFileSync(destinationBlobPath, "hedefteki farkli eski baytlar");

      // Baseline: restore oncesi byte goruntusu (DB kapali; baytlar stabil).
      const dbBaselineHash = sha256Data(readFileSync(runtimeDbPath));
      const activeBlobBaselineHash = sha256Data(readFileSync(join(runtimeArtifacts, activeBlob.relative_path)));
      const destinationBaselineHash = sha256Data(readFileSync(destinationBlobPath));

      let thrown: unknown;
      try {
        restoreBackup(saved.backup_dir, runtimeDbPath, runtimeArtifacts);
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown, "restoreBackup farkli baytli mevcut hedef blob'da EEXIST ile durmali");
      const errorCode = (thrown as { code?: unknown }).code;
      assert.ok(
        errorCode === "EEXIST" || errorCode === "STORAGE_ERROR",
        `restoreBackup EEXIST benzeri kod beklerken alindi: ${String(errorCode)}`,
      );

      // Atomiklik iddiasi: onceki aktif state.db byte-ayni kalmali.
      assert.equal(
        sha256Data(readFileSync(runtimeDbPath)),
        dbBaselineHash,
        "restoreBackup EEXIST'te onceki aktif state.db'i byte olarak degistirmemeli",
      );

      // Blob icerikleri de byte-ayni kalmali.
      assert.equal(
        sha256Data(readFileSync(join(runtimeArtifacts, activeBlob.relative_path))),
        activeBlobBaselineHash,
        "onceki aktif READY blob byte-ayni kalmali",
      );
      assert.equal(
        sha256Data(readFileSync(destinationBlobPath)),
        destinationBaselineHash,
        "farkli baytli mevcut hedef blob EEXIST'te ezilmemeli",
      );
    } finally {
      sourceDb?.close();
      rmSync(sourceRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      rmSync(runtimeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("staged blob copy fails before the active database is published", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-io-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      const sourceArtifacts = join(root, "source", "artifacts");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const blob = makeBlob(sourceArtifacts, "backup payload");
      sourceDb.prepare("INSERT INTO artifacts VALUES ('backup-art', 'backup-job', ?, ?, ?, 'READY')")
        .run(blob.relative_path, blob.sha256, blob.bytes);
      const saved = await createBackup(sourceDb, sourceDbPath, sourceArtifacts, join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;

      const targetDbPath = join(root, "runtime", "state.db");
      const targetArtifacts = join(root, "runtime", "artifacts");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));

      faults.stageCopy = true;
      assert.throws(() => restoreBackup(saved.backup_dir, targetDbPath, targetArtifacts), /ENOSPC/);
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline, "copy failure must preserve active DB bytes");
    } finally {
      faults.stageCopy = false;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("database publish failure preserves the active database", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-db-"));
    let sourceDb: Database.Database | undefined;
    try {
      const sourceDbPath = join(root, "source", "state.db");
      mkdirSync(dirname(sourceDbPath), { recursive: true });
      sourceDb = new Database(sourceDbPath);
      sourceDb.exec(SCHEMA);
      sourceDb.prepare("INSERT INTO test_jobs VALUES ('backup-job', 'COMPLETED')").run();
      const saved = await createBackup(sourceDb, sourceDbPath, join(root, "source", "artifacts"), join(root, "backups"));
      sourceDb.close();
      sourceDb = undefined;
      const targetDbPath = join(root, "runtime", "state.db");
      mkdirSync(dirname(targetDbPath), { recursive: true });
      const active = new Database(targetDbPath);
      active.exec(SCHEMA);
      active.prepare("INSERT INTO test_jobs VALUES ('active-job', 'COMPLETED')").run();
      active.close();
      const baseline = sha256Data(readFileSync(targetDbPath));
      faults.dbPublish = true;
      assert.throws(() => restoreBackup(saved.backup_dir, targetDbPath, join(root, "runtime", "artifacts")), /EACCES/);
      assert.equal(sha256Data(readFileSync(targetDbPath)), baseline, "publish failure must preserve old DB bytes");
    } finally {
      faults.dbPublish = false;
      sourceDb?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
