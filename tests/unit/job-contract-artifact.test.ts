import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import type { JobRow } from "../../src/storage/job-repository.js";
import type { SourceIdentity } from "../../src/discovery/source-snapshot.js";

describe("immutable job contract artifact byte identity", () => {
  let root: string, services: ReturnType<typeof createDefaultServicesForTest>, job: JobRow, goal: GoalContract;
  let dispatcher: JobDispatcher;
  const identity: SourceIdentity = { head_commit: null, dirty: false, dirty_digest: null, source_digest: "a".repeat(64), build_digest: "b".repeat(64) };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "contract-artifact-"));
    services = createDefaultServicesForTest(join(root, "state.db"), root);
    const { location } = new ProjectRepository(services.storage!.db).ensureLocation(join(root, "project"), "fixture", null);
    job = services.jobs!.createJob({ locationId: location.id, requestDigest: "contract-artifact" });
    goal = { job_id: job.id, project_root: join(root, "project"), targets: [], budget: { max_candidate_iterations: 3, max_repairs_per_candidate: 1, no_progress_window: 2 }, runner_kind: "host_dev_only", model_profile: "fixture/\u0131-model" };
    dispatcher = new JobDispatcher({ services, runnerKind: "host_dev_only", workerEnabled: false, workspaceRoot: root });
  });
  afterEach(() => { services.storage!.close(); rmSync(root, { recursive: true, force: true }); });
  const persist = () => (dispatcher as unknown as { persistJobContract: (storage: NonNullable<typeof services.storage>, job: JobRow, goal: GoalContract, identity: SourceIdentity) => { contractArtifactId: string; contractHash: string } }).persistJobContract(services.storage!, job, goal, identity);
  const artifact = () => services.storage!.db.prepare("SELECT id,job_id,kind,relative_store_path,sha256,bytes FROM artifacts WHERE kind='job_contract'").get() as { id: string; job_id: string; kind: string; relative_store_path: string; sha256: string; bytes: number };
  it("stores the file SHA and UTF-8 size while preserving the semantic contract hash and path", () => {
    const result = persist(), row = artifact(), bytes = readFileSync(join(root, row.relative_store_path));
    const body = JSON.parse(bytes.toString("utf8"));
    expect(row.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(row.bytes).toBe(bytes.length);
    expect(row.sha256).not.toBe(result.contractHash);
    expect(body.contract_hash).toBe(result.contractHash); expect(basename(row.relative_store_path)).toBe(result.contractHash);
  });
  it("reuses unchanged verified bytes and artifact identity without another artifact row", () => {
    const first = persist(), row = artifact(), path = join(root, row.relative_store_path), before = readFileSync(path), modified = statSync(path).mtimeMs;
    expect(persist()).toEqual(first);
    expect(readFileSync(path)).toEqual(before); expect(statSync(path).mtimeMs).toBe(modified);
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM artifacts WHERE kind='job_contract'").get()).toEqual({ n: 1 });
  });
  it.each([true, false])("rejects changed existing bytes without overwriting them (registered=%s)", registered => {
    persist(); const row = artifact(), path = join(root, row.relative_store_path);
    if (!registered) services.storage!.db.prepare("DELETE FROM artifacts WHERE id=?").run(row.id);
    writeFileSync(path, "user changed private contract");
    expect(() => persist()).toThrow();
    expect(readFileSync(path, "utf8")).toBe("user changed private contract");
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM artifacts WHERE kind='job_contract'").get()).toEqual({ n: registered ? 1 : 0 });
  });
  it("does not repair a legacy semantic artifact hash or insert a duplicate automatically", () => {
    const result = persist(), row = artifact();
    services.storage!.db.prepare("UPDATE artifacts SET sha256=? WHERE id=?").run(result.contractHash, row.id);
    expect(() => persist()).toThrow();
    expect(artifact().sha256).toBe(result.contractHash);
    expect(services.storage!.db.prepare("SELECT COUNT(*) n FROM artifacts WHERE kind='job_contract'").get()).toEqual({ n: 1 });
  });
});
