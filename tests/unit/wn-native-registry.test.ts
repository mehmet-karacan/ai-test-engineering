import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { NativeProcessRegistry } from "../../src/orchestration/native-process-registry.js";
import type { NativeProcessPlan, NativeProcessResult } from "../../src/runners/windows-process-supervisor.js";

const plan: NativeProcessPlan = {
  executable: "C:\\fixture\\mvn.cmd", cwd: "C:\\fixture", argv: ["-v"], timeoutMs: 1000, env: {},
};
const done: NativeProcessResult = {
  status: "success", exitCode: 0, stdout: "", stderr: "", stdoutTruncatedBytes: 0, stderrTruncatedBytes: 0, durationMs: 1, ownedTreeDrained: true,
};

describe("S02 durable native process registry", () => {
  let root: string;
  let storage: Storage;
  let leases: LeaseManager;
  let jobId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aitest-native-registry-"));
    storage = new Storage({ dbPath: join(root, "state.db") });
    storage.migrate();
    const { location } = new ProjectRepository(storage.db).ensureLocation(join(root, "project"), "fixture", null);
    jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "native-registry" }).id;
    leases = new LeaseManager(storage.db);
  });
  afterEach(() => {
    storage.close();
    const target = resolve(root);
    const inside = relative(resolve(tmpdir()), target);
    if (!inside || inside.startsWith("..") || isAbsolute(inside) || !basename(target).startsWith("aitest-native-registry-") ||
        lstatSync(target).isSymbolicLink() || realpathSync.native(target).toLowerCase() !== target.toLowerCase()) {
      throw new Error("Registry fixture cleanup outside owned Temp root");
    }
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it("fences an expired owner with an unresolved helper without killing a remembered PID", () => {
    const lease = leases.acquire(jobId, "old", 300000).lease;
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    registry.beforeSpawn(plan);
    registry.afterSpawn(4242);
    expect(() => leases.acquire(jobId, "old", 300000)).toThrowError();
    const before = storage.db.prepare<[string], { process_identity: string }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId)!.process_identity;
    expect(JSON.parse(before)).toMatchObject({ job_id: jobId, helper_pid: 4242, parent_pid: process.pid, state: "spawned" });
    expect(storage.db.prepare<[string], { cleanup_state: string }>("SELECT cleanup_state FROM owned_processes WHERE job_id = ?").get(jobId)?.cleanup_state).toBe("ACTIVE");
    leases.release(jobId, "old");
    expect(() => leases.acquire(jobId, "new", 300000)).toThrowError();
    expect(storage.db.prepare<[string], { process_identity: string }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId)!.process_identity).toBe(before);
  });

  it("clears only trusted terminal evidence, then permits a new fenced owner", () => {
    const lease = leases.acquire(jobId, "old", 300000).lease;
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    registry.beforeSpawn(plan);
    registry.afterSpawn(4242);
    registry.afterTerminal({ ...done, status: "spawn_error" });
    registry.afterTerminal({ ...done, status: "timeout", ownedTreeDrained: false });
    registry.afterTerminal({ ...done, status: "cancelled", ownedTreeDrained: false });
    expect(() => leases.acquire(jobId, "new", 300000)).toThrowError();
    registry.afterTerminal(done);
    expect(storage.db.prepare<[string], { cleanup_state: string }>("SELECT cleanup_state FROM owned_processes WHERE job_id = ?").get(jobId)?.cleanup_state).toBe("CLOSED");
    leases.release(jobId, "old");
    expect(leases.acquire(jobId, "new", 300000).lease.fencing_token).toBe(2);
  });

  it("clears only a proven pre-spawn no-child pin failure", () => {
    const lease = leases.acquire(jobId, "old", 300000).lease;
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    registry.beforeSpawn(plan);
    registry.afterSpawn(4242);
    registry.afterTerminal({ ...done, status: "spawn_error", exitCode: null, errorCode: "pin_unavailable",
      preSpawnNoChild: false, ownedTreeDrained: true });
    expect(() => leases.acquire(jobId, "new", 300000)).toThrowError();
    registry.afterTerminal({ ...done, status: "spawn_error", exitCode: null, errorCode: "pin_unavailable",
      preSpawnNoChild: true, ownedTreeDrained: true });
    leases.release(jobId, "old");
    expect(leases.acquire(jobId, "new", 300000).lease.fencing_token).toBe(2);
  });

  it("rejects a stale registry before it writes a process record", () => {
    const lease = leases.acquire(jobId, "old", 300000).lease;
    leases.release(jobId, "old");
    leases.acquire(jobId, "new", 300000);
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    expect(() => registry.beforeSpawn(plan)).toThrowError();
  });

  it("native takeover preserves an expired legacy process marker for explicit migration", () => {
    leases.acquire(jobId, "old", 300000, "dispatcher-123");
    leases.release(jobId, "old");
    const before = storage.db.prepare<[string], { process_identity: string }>(
      "SELECT process_identity FROM job_leases WHERE job_id = ?",
    ).get(jobId)!.process_identity;
    expect(() => leases.acquireNative(jobId, "new", 300000)).toThrowError();
    expect(storage.db.prepare<[string], { process_identity: string }>(
      "SELECT process_identity FROM job_leases WHERE job_id = ?",
    ).get(jobId)!.process_identity).toBe(before);
  });

  it("registry refuses a damaged marker even under its current lease", () => {
    const lease = leases.acquireNative(jobId, "old", 300000).lease;
    storage.db.prepare("UPDATE job_leases SET process_identity = ? WHERE job_id = ?").run("!damaged", jobId);
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    expect(() => registry.beforeSpawn(plan)).toThrowError();
    expect(storage.db.prepare<[string], { process_identity: string }>(
      "SELECT process_identity FROM job_leases WHERE job_id = ?",
    ).get(jobId)!.process_identity).toBe("!damaged");
  });
});
