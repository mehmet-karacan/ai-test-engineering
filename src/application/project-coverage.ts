import { projectNativeExecution } from "../configuration/project-native-execution.js";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ProjectCoverageInputSchema } from "../domain/tool-schemas.js";
import { AppError } from "../domain/errors.js";
import { canonicalProjectRoot, assertAllowedRoot, requestDigest, PARSER_VERSION, type Services } from "./services.js";
import { SourceSnapshot, computeSourceIdentity } from "../discovery/source-snapshot.js";
import { ProjectRepository } from "../storage/project-repository.js";
import { InventoryRepository } from "../storage/inventory-repository.js";
import { JobDispatcher } from "../orchestration/job-dispatcher.js";
import { resolveRunnerKindFromEnv } from "../runners/runner-factory.js";

export async function handleProjectCoverage(input: unknown, services: Services) {
  const parsed = ProjectCoverageInputSchema.parse(input);
  let root = canonicalProjectRoot(parsed.project_root);
  assertAllowedRoot(services.config, root);
  if (!existsSync(join(root, "pom.xml"))) {
    const candidates = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && existsSync(join(root, entry.name, "pom.xml")));
    if (candidates.length !== 1) throw new AppError("INVALID_PARAMETERS", "Tek Maven koku secilemedi; pom.xml iceren proje yolunu belirtin", { candidates: candidates.map((entry) => entry.name) });
    root = canonicalProjectRoot(join(root, candidates[0]!.name));
    assertAllowedRoot(services.config, root);
  }
  if (!services.storage || !services.jobs) throw new AppError("STORAGE_ERROR", "Kalici coverage scan storage gerekli");
  const { project, location } = new ProjectRepository(services.storage.db).ensureLocation(root, root.split(/[\\/]/).pop()!, null);
  const manifest = new SourceSnapshot(root).buildManifest();
  const identity = computeSourceIdentity(root, manifest);
  const digest = requestDigest({ intent: "project_coverage", root, native_execution: projectNativeExecution(services.config, root), source_digest: identity.source_digest, below_percent: parsed.below_percent,
    recommendation_limit: parsed.recommendation_limit, idempotency_key: parsed.idempotency_key });
  const existing = services.jobs.findJobByRequestDigest(location.id, digest);
  if (existing) return { job_id: existing.id, project_root: root, lifecycle: existing.lifecycle, created: false };
  const snapshotId = new InventoryRepository(services.storage.db).writeSnapshot(location.id, identity.head_commit, identity.dirty_digest, identity.source_digest, identity.build_digest, PARSER_VERSION);
  const job = services.jobs.createJob({ locationId: location.id, requestDigest: digest, sourceSnapshotId: snapshotId });
  const dispatcher = new JobDispatcher({ services, runnerKind: resolveRunnerKindFromEnv(process.env.AITEST_RUNNER, true), workerEnabled: false, workspaceRoot: services.config.storage.root });
  const goal = dispatcher.buildGoalContract(job, [], root);
  goal.coverage_scan = { below_percent: parsed.below_percent, recommendation_limit: parsed.recommendation_limit, source_digest: identity.source_digest, build_digest: identity.build_digest, project_id: project.id };
  goal.coverage_mode = "cli";
  services.jobs.appendEvent({ job_id: job.id, event_type: "project_coverage_requested", phase: "discovery", origin: "handleProjectCoverage" });
  services.jobs.updateLifecycle(job.id, "RUNNING", services.jobs.getJob(job.id).row_version);
  setImmediate(() => {
    if (services.jobs!.getJob(job.id).lifecycle !== "RUNNING") return;
    void dispatcher.dispatch(job, goal, root).catch((error: unknown) => process.stderr.write(`[aitest-coverage] ${String(error)}\n`));
  });
  return { job_id: job.id, project_root: root, lifecycle: services.jobs.getJob(job.id).lifecycle, created: true };
}
