import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { CheckpointStore, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import { SourceSnapshot, computeSourceIdentity } from "../../src/discovery/source-snapshot.js";
import { ReportExporter, type ReportData } from "../../src/reporting/report-generator.js";

export const applyTestPath = "src/test/java/com/example/payment/ApprovedPaymentTest.java";
export const applyTestContent = `package com.example.payment;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
public class ApprovedPaymentTest {
  @Test public void unpaidRemainsPending() { assertEquals("PENDING", new PaymentService().resolveStatus(false, false)); }
}
`;
export const originalSuite = { module_relative_path: "", name: "com.example.payment.PaymentServiceTest", tests: 3, failures: 0, errors: 0, skipped: 0,
  test_names: ["calculateTotal_multiply", "calculateTotal_nullAmount_throws", "resolveStatus_completed"].map(name => `com.example.payment.PaymentServiceTest#${name}`), skipped_test_names: [], failed_test_names: [] };
export const acceptedSuite = { module_relative_path: "", name: "com.example.payment.ApprovedPaymentTest", tests: 1, failures: 0, errors: 0, skipped: 0,
  test_names: ["com.example.payment.ApprovedPaymentTest#unpaidRemainsPending"], skipped_test_names: [], failed_test_names: [] };
export function approvedApplyFixture(root: string, action = "create") {
  const project = join(root, "project"), runtime = join(root, "runtime");
  cpSync(join(process.cwd(), "tests/fixtures/sample-maven-project"), project, { recursive: true });
  const services = createDefaultServicesForTest(join(runtime, "state.db"), runtime); services.config.storage.root = runtime;
  services.config.allowed_project_roots = [project];
  const { location } = new ProjectRepository(services.storage!.db).ensureLocation(project, "apply-fixture", null);
  const jobId = services.jobs!.createJob({ locationId: location.id, requestDigest: randomUUID() }).id;
  services.jobs!.updateLifecycle(jobId, "RUNNING", services.jobs!.getJob(jobId).row_version);
  const identity = computeSourceIdentity(project, new SourceSnapshot(project).buildManifest());
  const file = { path: applyTestPath, action, sha256: createHash("sha256").update(applyTestContent).digest("hex"), content: applyTestContent };
  const checkpoints = new CheckpointStore(services.storage!.db, runtime);
  const accepted = checkpoints.publishAcceptedBlobs(jobId, [file]);
  const receiptRoot = join(runtime, "jobs", jobId, "fixture-receipt"); mkdirSync(receiptRoot, { recursive: true });
  writeFileSync(join(receiptRoot, "stdout.log"), "fixture"); writeFileSync(join(receiptRoot, "stderr.log"), "");
  const baselineRunId = new InventoryRepository(services.storage!.db).writeTestRunProvenance({ job_id: jobId, stage: "baseline", attempt_ordinal: null,
    iteration_ordinal: null, execution_root: receiptRoot, command: ["mvn", "test"], stdout_log_path: join(receiptRoot, "stdout.log"),
    stderr_log_path: join(receiptRoot, "stderr.log"), exit_code: 0, timed_out: false, test_inventory: [originalSuite],
    coverage_report_path: "", coverage_report_sha256: null, coverage_report_paths: [], started_at: Date.now() - 2, finished_at: Date.now() - 1 });
  const manifest: CheckpointManifest = { schema_version: 1, job_id: jobId, project_id: location.project_id, location_id: location.id,
    target_ids: [], user_goal: "80/80", source_snapshot_id: randomUUID(), head_commit: null, source_digest: identity.source_digest,
    dirty_digest: null, build_digest: identity.build_digest, policy_digest: null, parser_version: "fixture", toolchain: {},
    accepted_changes: accepted.map(({ path, sha256, action }) => ({ path, sha256, action })), parent_checkpoint_id: null,
    baseline_run_id: baselineRunId, last_trusted_run_id: null, active_phase: "verification", next_action: "apply", remaining_budget: {},
    requested_model: "fixture/model", resolved_model: "fixture/model", worker_session_ref: null, generation: 1, created_at: Date.now() };
  const checkpoint = checkpoints.publishCheckpoint(manifest, null, null, accepted);
  const runId = new InventoryRepository(services.storage!.db).writeTestRunProvenance({ job_id: jobId, stage: "final_replay", attempt_ordinal: null,
    iteration_ordinal: null, execution_root: receiptRoot, command: ["mvn", "test"], stdout_log_path: join(receiptRoot, "stdout.log"),
    stderr_log_path: join(receiptRoot, "stderr.log"), exit_code: 0, timed_out: false, test_inventory: [originalSuite, acceptedSuite],
    coverage_report_path: "", coverage_report_sha256: null, coverage_report_paths: [], started_at: Date.now() - 1, finished_at: Date.now() });
  const jobs = services.jobs!;
  jobs.updateOutcome(jobId, "TARGET_REACHED", jobs.getJob(jobId).row_version);
  jobs.updateVerificationLevel(jobId, "AFFECTED_SCOPE", jobs.getJob(jobId).row_version);
  jobs.updateLifecycle(jobId, "COMPLETED", jobs.getJob(jobId).row_version);
  const report: ReportData = { schema_version: 1, job_id: jobId, project_root: project, head_commit: null, snapshot_id: manifest.source_snapshot_id,
    outcome: "TARGET_REACHED", verification_scope: "AFFECTED_SCOPE", apply_state: "READY_FOR_REVIEW", targets: [], iterations: [],
    tests_added: 1, tests_modified: 0, run_summary: { total: 4, passed: 4, failed: 0, skipped: 0 },
    gates: [{ name: "test_only_policy", status: "PASSED", detail: "fixture" }], gaps: [], models: [], production_changed_files: 0,
    final_run_id: runId, checkpoint_id: checkpoint.checkpoint_id, generated_at: Date.now() };
  new ReportExporter(join(runtime, "jobs", jobId, "reports")).export(report, { "evidence/fixture.txt": "fixture-only; not real model evidence" });
  return { project, runtime, services, jobId, baselineRunId, checkpointId: checkpoint.checkpoint_id, identity, manifest, file };
}
