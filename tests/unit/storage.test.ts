import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";

describe("SQLite storage kalicilik", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-storage-"));
    dbPath = join(dir, "state.db");
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi: sonraki temp dizinde devam
    }
  });

  it("migration sonrasi schema version 2 olmali (FIN03: coverage/worker/candidate/benchmark tablolari)", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    expect(storage.schemaVersion()).toBe(2);
    storage.close();
  });

  it("DB yeniden acilinca veri kalmali (kalicilik)", () => {
    const first = new Storage({ dbPath });
    first.migrate();
    const jobs1 = new JobRepository(first.db);
    const projects1 = new ProjectRepository(first.db);
    const { location } = projects1.ensureLocation("C:/work/demo-project", "demo-project", null);
    const job = jobs1.createJob({ locationId: location.id, requestDigest: "digest-abc-123" });
    jobs1.updateLifecycle(job.id, "RUNNING", 0);
    first.close();

    const second = new Storage({ dbPath });
    const jobs2 = new JobRepository(second.db);
    const reloaded = jobs2.getJob(job.id);
    expect(reloaded.lifecycle).toBe("RUNNING");
    expect(reloaded.request_digest).toBe("digest-abc-123");
    second.close();
  });

  it("ayni request digest icin idempotent job bulunmali", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    const jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/demo-project-2", "demo-project-2", null);
    const created = jobs.createJob({ locationId: location.id, requestDigest: "digest-same-1" });
    const found = jobs.findJobByRequestDigest(location.id, "digest-same-1");
    expect(found?.id).toBe(created.id);
    storage.close();
  });

  it("job event'leri append-only sirayla kaydedilmeli", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    const jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/demo-project-3", "demo-project-3", null);
    const job = jobs.createJob({ locationId: location.id, requestDigest: "digest-evt-1" });
    const s1 = jobs.appendEvent({ job_id: job.id, event_type: "e1", origin: "test" });
    const s2 = jobs.appendEvent({ job_id: job.id, event_type: "e2", origin: "test" });
    expect(s2).toBe(s1 + 1);
    const events = jobs.listEvents(job.id);
    expect(events.map((e) => e.event_type)).toEqual(["job_created", "e1", "e2"]);
    storage.close();
  });

  it("row_version cakismasinda lifecycle guncellemesi reddedilmeli (optimistic locking)", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    const jobs = new JobRepository(storage.db);
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/demo-project-4", "demo-project-4", null);
    const job = jobs.createJob({ locationId: location.id, requestDigest: "digest-row-1" });
    jobs.updateLifecycle(job.id, "RUNNING", 0);
    expect(() => jobs.updateLifecycle(job.id, "PAUSED", 0)).toThrow();
    storage.close();
  });

  it("ensureLocation ayni kok icin ayni location donmeli (idempotent)", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    const projects = new ProjectRepository(storage.db);
    const first = projects.ensureLocation("C:/work/same-root", "same-root", null);
    const second = projects.ensureLocation("C:/work/same-root", "same-root", null);
    expect(second.location.id).toBe(first.location.id);
    expect(second.project.id).toBe(first.project.id);
    storage.close();
  });

  it("foreign_keys acik olmali", () => {
    const storage = new Storage({ dbPath });
    storage.migrate();
    expect(storage.db.pragma("foreign_keys", { simple: true })).toBe(1);
    storage.close();
  });
});

describe("ArtifactStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-artifacts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("ayni icerik ayni hash ile publish edilmeli ve geri okunmali", () => {
    const store = new ArtifactStore({ root: dir });
    const record = store.publish("test-artifact", "icerik-1");
    expect(record.sha256).toHaveLength(64);
    expect(record.status).toBe("READY");
    expect(store.exists(record.sha256)).toBe(true);
    expect(store.read(record.sha256).toString("utf8")).toBe("icerik-1");
    expect(store.verify(record.sha256)).toBe(true);
  });

  it("gecersiz sha256 reddedilmeli", () => {
    const store = new ArtifactStore({ root: dir });
    expect(() => store.blobPath("../etc/passwd")).toThrow();
  });

  it("buyuk veri publish edilmeli", () => {
    const store = new ArtifactStore({ root: dir });
    const data = Buffer.alloc(1024 * 1024, 7);
    const record = store.publish("big", data);
    expect(record.bytes).toBe(1024 * 1024);
    expect(store.verify(record.sha256)).toBe(true);
  });
});
