/** P08: backup authority gercek SQLite snapshot ve disk dosyalariyla dogrulanir. */
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createBackup, restoreBackup, verifyBackup } from "../../src/storage/lifecycle-ops.js";

type BlobEntry = { relative_path: string; sha256: string; bytes: number };
type Manifest = { schema_version: number; backup_id: string; blobs: BlobEntry[] };

async function withStore(run: (f: {
  db: Database.Database; root: string; dbPath: string; artifacts: string; backups: string;
  add: (text: string, id?: string) => BlobEntry;
  backup: () => ReturnType<typeof createBackup>;
}) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "aitest-p08-authority-"));
  const dbPath = join(root, "state.db");
  const db = new Database(dbPath);
  const artifacts = join(root, "artifacts");
  const backups = join(root, "backups");
  mkdirSync(artifacts);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
    INSERT INTO schema_migrations VALUES (7);
    CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL);
    INSERT INTO test_jobs VALUES ('trusted-job', 'COMPLETED');
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id),
      relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL, status TEXT NOT NULL
    );
  `);
  const add = (text: string, id = randomUUID()): BlobEntry => {
    const sha256 = createHash("sha256").update(text).digest("hex");
    const relative_path = `blobs/sha256/${sha256}`;
    const destination = join(artifacts, relative_path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
    const bytes = Buffer.byteLength(text);
    db.prepare("INSERT INTO artifacts VALUES (?, 'trusted-job', ?, ?, ?, 'READY')")
      .run(id, relative_path, sha256, bytes);
    return { relative_path, sha256, bytes };
  };
  try {
    await run({ db, root, dbPath, artifacts, backups, add, backup: () => createBackup(db, dbPath, artifacts, backups) });
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function manifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, "blob-manifest.json"), "utf8")) as Manifest;
}
function writeManifest(dir: string, value: Manifest): void {
  writeFileSync(join(dir, "blob-manifest.json"), JSON.stringify(value));
}

// Testler production create/verify/restore fonksiyonlarini cagirir; sonuc mock'lanmaz.
describe("P08: backup snapshot authority", () => {
  it("gecerli backup'i gercek DB ve blob ile restore eder", async () => withStore(async (f) => {
    const blob = f.add("dogrulanmis veri");
    const saved = await f.backup();
    assert.equal(verifyBackup(saved.backup_dir).valid, true);
    const target = join(f.root, "restored", "state.db");
    const targetArtifacts = join(f.root, "restored", "artifacts");
    mkdirSync(targetArtifacts, { recursive: true });
    const existing = new Database(target);
    existing.exec("CREATE TABLE test_jobs (id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL)");
    existing.close();
    await restoreBackup(saved.backup_dir, target, targetArtifacts);
    const restored = new Database(target, { readonly: true });
    try {
      assert.equal(restored.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM test_jobs").get()?.n, 1);
      assert.equal(readFileSync(join(targetArtifacts, blob.relative_path), "utf8"), "dogrulanmis veri");
    } finally { restored.close(); }
  }));

  it("gercekten READY kaydi olmayan bos backup'i kabul eder", async () => withStore(async (f) => {
    const saved = await f.backup();
    assert.equal(saved.blob_count, 0);
    assert.equal(verifyBackup(saved.backup_dir).valid, true);
  }));

  it("manifestten cikarilmis READY blob'u reddeder", async () => withStore(async (f) => {
    const blob = f.add("silinmemesi gereken");
    const saved = await f.backup();
    const changed = manifest(saved.backup_dir);
    changed.blobs = [];
    writeManifest(saved.backup_dir, changed);
    rmSync(join(saved.backup_dir, "blobs", blob.relative_path));
    const result = verifyBackup(saved.backup_dir);
    assert.equal(result.valid, false);
    assert.equal(result.blob_check_ok, false);
    assert.ok(result.missing_blobs.includes(blob.relative_path));
    const target = join(f.root, "must-not-change.db");
    writeFileSync(target, "onceki runtime");
    await assert.rejects(restoreBackup(saved.backup_dir, target, join(f.root, "restore-artifacts")));
    assert.equal(readFileSync(target, "utf8"), "onceki runtime");
  }));

  it("manifest ve dosya birlikte degistirilse de snapshot hash'ini esas alir", async () => withStore(async (f) => {
    f.add("orijinal");
    const saved = await f.backup();
    const changed = manifest(saved.backup_dir);
    const replacement = "degistirilmis";
    const entry = changed.blobs[0]!;
    entry.sha256 = createHash("sha256").update(replacement).digest("hex");
    entry.bytes = Buffer.byteLength(replacement);
    writeFileSync(join(saved.backup_dir, "blobs", entry.relative_path), replacement);
    writeManifest(saved.backup_dir, changed);
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("complete=false marker'ini tamamlanmis backup saymaz", async () => withStore(async (f) => {
    const saved = await f.backup();
    writeFileSync(join(saved.backup_dir, "complete.json"), JSON.stringify({ schema_version: 1, backup_id: saved.backup_id, complete: false }));
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("baska backup kimligine ait complete marker'ini reddeder", async () => withStore(async (f) => {
    const saved = await f.backup();
    writeFileSync(join(saved.backup_dir, "complete.json"), JSON.stringify({ schema_version: 1, backup_id: "baska", complete: true }));
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("bozuk complete JSON icin false doner", async () => withStore(async (f) => {
    const saved = await f.backup();
    writeFileSync(join(saved.backup_dir, "complete.json"), "{");
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("foreign key ihlalini integrity_check=ok olsa bile reddeder", async () => withStore(async (f) => {
    const saved = await f.backup();
    const backupDb = new Database(saved.db_path);
    try {
      backupDb.pragma("foreign_keys = OFF");
      backupDb.exec("CREATE TABLE proof (job_id TEXT REFERENCES test_jobs(id)); INSERT INTO proof VALUES ('missing-job');");
      assert.equal(backupDb.pragma("integrity_check", { simple: true }), "ok");
      assert.equal((backupDb.pragma("foreign_key_check") as unknown[]).length, 1);
    } finally { backupDb.close(); }
    const result = verifyBackup(saved.backup_dir);
    assert.equal(result.valid, false);
    assert.equal(result.integrity_ok, false);
  }));

  it("backup sonrasi canli DB degisirse manifest snapshot'tan uretilir", async () => withStore(async (f) => {
    const original = f.add("snapshot icindeki dosya", "before");
    const realBackup = f.db.backup.bind(f.db);
    // Gercek SQLite backup tamamlandiktan sonraki writer yarisi deterministik tetiklenir.
    f.db.backup = async (destination, options) => {
      const result = await realBackup(destination, options);
      f.db.prepare("DELETE FROM artifacts WHERE id = 'before'").run();
      f.add("yalniz canli DB'deki dosya", "after");
      return result;
    };
    const saved = await f.backup();
    const content = manifest(saved.backup_dir);
    assert.deepEqual(content.blobs, [original]);
    assert.equal(existsSync(join(saved.backup_dir, "blobs", original.relative_path)), true);
    assert.equal(verifyBackup(saved.backup_dir).valid, true);
  }));

  it("bozuk SQLite dosyasinda exception yerine typed gecersiz sonuc doner", async () => withStore(async (f) => {
    const saved = await f.backup();
    writeFileSync(saved.db_path, "SQLite degil");
    const result = verifyBackup(saved.backup_dir);
    assert.equal(result.valid, false);
    assert.equal(result.integrity_ok, false);
    assert.ok(result.reason);
  }));

  it("gecersiz manifest blob alaninda exception yerine false doner", async () => withStore(async (f) => {
    const saved = await f.backup();
    writeFileSync(join(saved.backup_dir, "blob-manifest.json"), JSON.stringify({ schema_version: 1, backup_id: saved.backup_id, blobs: [null] }));
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("ayni icerige birden cok READY kaydi kayipsiz yedekler", async () => withStore(async (f) => {
    f.add("ortak blob", "bir");
    f.add("ortak blob", "iki");
    const saved = await f.backup();
    assert.equal(verifyBackup(saved.backup_dir).valid, true);
  }));

  it("eksik blob'da yarim backup'i temizler", async () => withStore(async (f) => {
    const blob = f.add("eksik blob");
    rmSync(join(f.artifacts, blob.relative_path));
    await assert.rejects(f.backup(), { code: "STORAGE_ERROR" });
    assert.deepEqual(readdirSync(f.backups), []);
  }));

  it("snapshot'ta olmayan ek manifest blob'unu reddeder", async () => withStore(async (f) => {
    const saved = await f.backup();
    const extra = f.add("snapshot disinda");
    const changed = manifest(saved.backup_dir);
    changed.blobs.push(extra);
    const destination = join(saved.backup_dir, "blobs", extra.relative_path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, "snapshot disinda");
    writeManifest(saved.backup_dir, changed);
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("desteklenmeyen manifest surumunu reddeder", async () => withStore(async (f) => {
    const saved = await f.backup();
    const changed = manifest(saved.backup_dir);
    changed.schema_version = 999;
    writeManifest(saved.backup_dir, changed);
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("eksik marker'da yapilmamis DB kontrollerini basarili gostermez", async () => withStore(async (f) => {
    const saved = await f.backup();
    rmSync(join(saved.backup_dir, "complete.json"));
    const result = verifyBackup(saved.backup_dir);
    assert.equal(result.valid, false);
    assert.equal(result.schema_ok, false);
    assert.equal(result.integrity_ok, false);
  }));

  it("artifact tablosu olmayan DB'yi bos gecerli backup saymaz", async () => withStore(async (f) => {
    const saved = await f.backup();
    const backupDb = new Database(saved.db_path);
    try { backupDb.exec("DROP TABLE artifacts"); } finally { backupDb.close(); }
    assert.equal(verifyBackup(saved.backup_dir).valid, false);
  }));

  it("FK ihlalli snapshot icin createBackup complete marker yayinlamaz", async () => withStore(async (f) => {
    f.db.pragma("foreign_keys = OFF");
    f.db.exec("CREATE TABLE proof (job_id TEXT REFERENCES test_jobs(id)); INSERT INTO proof VALUES ('missing-job');");
    await assert.rejects(f.backup(), { code: "STORAGE_ERROR" });
    assert.deepEqual(readdirSync(f.backups), []);
  }));
});
