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

  it("accepts an exact proven terminal cleanup receipt after expiry without renewing execution authority", () => {
    const lease=leases.acquire(jobId,"old",300000).lease;
    const registry=new NativeProcessRegistry(storage.db,jobId,"old",lease.fencing_token);
    registry.beforeSpawn(plan);registry.afterSpawn(4242);leases.release(jobId,"old");
    expect(()=>registry.afterTerminal(done)).not.toThrow();
    expect(leases.get(jobId).expires_at).toBeLessThanOrEqual(Date.now());
    expect(()=>leases.assertFence(jobId,"old",lease.fencing_token)).toThrow();
    expect(storage.db.prepare("SELECT cleanup_state FROM owned_processes WHERE job_id = ?").get(jobId)).toEqual({cleanup_state:"CLOSED"});
    expect(leases.acquireNative(jobId,"new",300000).lease.fencing_token).toBe(2);
  });

  it("cannot use an expired terminal receipt to clear a successor's fence", () => {
    const lease=leases.acquire(jobId,"old",300000).lease;
    const registry=new NativeProcessRegistry(storage.db,jobId,"old",lease.fencing_token);
    registry.beforeSpawn(plan);registry.afterSpawn(4242);
    storage.db.prepare("UPDATE job_leases SET owner_id = 'successor', fencing_token = fencing_token + 1 WHERE job_id = ?").run(jobId);
    expect(()=>registry.afterTerminal(done)).toThrow(/terminal fence changed/);
    expect(storage.db.prepare("SELECT cleanup_state FROM owned_processes WHERE job_id = ?").get(jobId)).toEqual({cleanup_state:"ACTIVE"});
    expect(leases.get(jobId).owner_id).toBe("successor");
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

  it("rolls back the lease when the owned process record cannot enter spawned state", () => {
    const lease = leases.acquireNative(jobId, "old", 300000).lease;
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    registry.beforeSpawn(plan);
    storage.db.exec("CREATE TRIGGER reject_owned_spawn BEFORE UPDATE ON owned_processes BEGIN SELECT RAISE(ABORT, 'fixture owned process failure'); END");

    expect(() => registry.afterSpawn(4242)).toThrow(/fixture owned process failure/);
    const leaseIdentity = storage.db.prepare<[string], { process_identity: string }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId)!.process_identity;
    const processIdentity = storage.db.prepare<[string], { process_identity: string; cleanup_state: string }>("SELECT process_identity, cleanup_state FROM owned_processes WHERE job_id = ?").get(jobId)!;
    expect(JSON.parse(leaseIdentity)).toMatchObject({ state: "starting", helper_pid: null });
    expect(JSON.parse(processIdentity.process_identity)).toMatchObject({ state: "starting", helper_pid: null });
    expect(processIdentity.cleanup_state).toBe("ACTIVE");
  });

  it("rolls back lease clearing when the owned process cannot close", () => {
    const lease = leases.acquireNative(jobId, "old", 300000).lease;
    const registry = new NativeProcessRegistry(storage.db, jobId, "old", lease.fencing_token);
    registry.beforeSpawn(plan);
    registry.afterSpawn(4242);
    storage.db.exec("CREATE TRIGGER reject_owned_close BEFORE UPDATE ON owned_processes WHEN NEW.cleanup_state = 'CLOSED' BEGIN SELECT RAISE(ABORT, 'fixture owned close failure'); END");

    expect(() => registry.afterTerminal(done)).toThrow(/fixture owned close failure/);
    const leaseIdentity = storage.db.prepare<[string], { process_identity: string }>("SELECT process_identity FROM job_leases WHERE job_id = ?").get(jobId)!.process_identity;
    const process = storage.db.prepare<[string], { process_identity: string; cleanup_state: string }>("SELECT process_identity, cleanup_state FROM owned_processes WHERE job_id = ?").get(jobId)!;
    expect(JSON.parse(leaseIdentity)).toMatchObject({ state: "spawned", helper_pid: 4242 });
    expect(JSON.parse(process.process_identity)).toMatchObject({ state: "spawned", helper_pid: 4242 });
    expect(process.cleanup_state).toBe("ACTIVE");
  });
});
