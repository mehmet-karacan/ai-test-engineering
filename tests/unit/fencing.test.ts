/**
 * D06/F08/RG32: kalici monoton fencing regresyon testleri.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";

describe("D06/F08/RG32: kalici monoton fencing", () => {
  let dir: string;
  let storage: Storage;
  let jobs: JobRepository;
  let projects: ProjectRepository;
  let leases: LeaseManager;
  let jobId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-d06-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    jobs = new JobRepository(storage.db);
    projects = new ProjectRepository(storage.db);
    leases = new LeaseManager(storage.db);
    const { location } = projects.ensureLocation("C:/work/d06", "d06", null);
    jobId = jobs.createJob({ locationId: location.id, requestDigest: "digest-d06" }).id;
  });

  afterEach(() => {
    try {
      storage.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("release kaydi silmez; lease'i expire eder; token geri gitmez", () => {
    const lease = leases.acquire(jobId, "owner-1", 300000);
    leases.release(jobId, "owner-1");
    const after = leases.get(jobId);
    expect(after.fencing_token).toBe(lease.lease.fencing_token);
    expect(after.expires_at).toBeLessThan(Date.now());
    expect(leases.currentGeneration(jobId)).toBe(lease.lease.fencing_token);
  });

  it("release sonrasi yeni acquisition token'i ARTAR (gerilemez)", () => {
    leases.acquire(jobId, "owner-1", 300000);
    leases.release(jobId, "owner-1");
    const second = leases.acquire(jobId, "owner-2", 300000);
    expect(second.lease.fencing_token).toBe(2);
    expect(leases.currentGeneration(jobId)).toBe(2);
  });

  it("birden fazla release/acquire zincirinde token monoton artar", () => {
    for (let i = 1; i <= 5; i++) {
      const lease = leases.acquire(jobId, `owner-${i}`, 300000);
      expect(lease.lease.fencing_token).toBe(i);
      leases.release(jobId, `owner-${i}`);
    }
    expect(leases.currentGeneration(jobId)).toBe(5);
  });

  it("expired lease'ten gec eski worker sonucu kabul edilmez (assertFence)", () => {
    const lease = leases.acquire(jobId, "owner-1", 50);
    leases.release(jobId, "owner-1");
    expect(() => leases.assertFence(jobId, "owner-1", lease.lease.fencing_token)).toThrow();
  });
});
