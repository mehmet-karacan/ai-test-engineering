/**
 * P05/PR06: tek typed resolver ve frozen concrete hedef kontrati regresyonlari.
 * Bu testler model kalitesini veya canli Docker kabulunu iddia etmez.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "../../src/domain/errors.js";
import {
  buildFrozenTargetList,
  rebuildFrozenTargetDigest,
  type ConcreteTarget,
} from "../../src/discovery/target-resolver.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { Storage } from "../../src/storage/storage.js";
import { buildJobContract } from "../../src/domain/job-contract.js";
import { parseExactModelSpec } from "../../src/workers/opencode/profile-reader.js";
import { requestDigest } from "../../src/application/services.js";

function concrete(overrides?: Partial<ConcreteTarget>): ConcreteTarget {
  return {
    fqn: "com.example.app.PaymentService",
    module_path: "app",
    source_set: "main",
    relative_path: "app/src/main/java/com/example/app/PaymentService.java",
    snapshot_id: "snapshot-1",
    ...overrides,
  };
}

describe("P05: frozen concrete hedef listesi", () => {
  it("provider/model kimligini birebir ayirir ve gecersiz fallbacki reddeder", () => {
    expect(parseExactModelSpec("litellm/GLM-5.3-Flash-IT")).toEqual({ provider_id: "litellm", model_id: "GLM-5.3-Flash-IT" });
    expect(parseExactModelSpec("litellm/openai/Qwen/Qwen3.8-27B-IT")).toEqual({ provider_id: "litellm", model_id: "openai/Qwen/Qwen3.8-27B-IT" });
    expect(() => parseExactModelSpec("GLM-5.3-Flash-IT")).toThrow(/provider\/model/);
    expect(() => parseExactModelSpec("litellm/ GLM-5.3-Flash-IT")).toThrow(/birebir/);
  });

  it("farkli model profilleri idempotency digest'inde birbirine karismaz", () => {
    const common = { root: "C:/work", targets: [{ selector: "X", kind: "class" }], coverage: { percent: 90 }, mode: "TEST_ONLY", idempotency: "same-key" };
    expect(requestDigest({ ...common, model_profile: "litellm/GLM-5.3-Flash-IT" })).not.toBe(requestDigest({ ...common, model_profile: "litellm/Qwen3.8-27B-IT" }));
  });

  it("sirayi normalize eder ve ayni digest'i yeniden uretir", () => {
    const a = concrete();
    const b = concrete({ fqn: "com.example.app.AccountService", relative_path: "app/src/main/java/com/example/app/AccountService.java" });
    const frozen = buildFrozenTargetList([a, b], "snapshot-1", 1, 10);
    expect(frozen.targets.map((t) => t.fqn)).toEqual([
      "com.example.app.AccountService",
      "com.example.app.PaymentService",
    ]);
    expect(rebuildFrozenTargetDigest([a, b])).toBe(frozen.digest);
    expect(rebuildFrozenTargetDigest([b, a])).toBe(frozen.digest);
  });

  it("bos, duplicate, unknown source-set ve expansion limiti fail-closed olur", () => {
    expect(() => buildFrozenTargetList([], "snapshot-1", 1, 10)).toThrowError(AppError);
    expect(() => buildFrozenTargetList([concrete(), concrete()], "snapshot-1", 1, 10)).toThrowError(/Mukerrer/);
    expect(() => buildFrozenTargetList([concrete({ source_set: "unknown" })], "snapshot-1", 1, 10)).toThrowError(/Belirsiz/);
    expect(() => buildFrozenTargetList([concrete()], "snapshot-1", 1, 0)).toThrowError(/Expansion/);
    try {
      buildFrozenTargetList([concrete({ snapshot_id: "other" })], "snapshot-1", 1, 10);
      throw new Error("snapshot mismatch kabul edildi");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("BLOCKED_TARGET_RESOLUTION");
    }
  });

  it("concrete contract hedef listesi bos veya unknown olamaz", () => {
    const target = {
      selector: "PaymentService",
      kind: "class" as const,
      resolved_fqn: "com.example.app.PaymentService",
      concrete_targets: [concrete()],
      line_target_bps: 8000,
      branch_target_bps: 0,
    };
    expect(buildJobContract({
      job_id: "job-1",
      project_id: "project-1",
      location_id: "location-1",
      canonical_root: "C:/work/project",
      request_digest: "request-1",
      idempotency_key: null,
      source_snapshot_digest: "snapshot-1",
      resolved_targets: [target],
      runner_kind: "host_dev_only",
      model_profile: null,
      policy_digest: null,
      config_digest: "config-1",
      config_schema_version: 1,
      budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 1, no_progress_window: 1, total_job_minutes: 1 },
      parent_contract_digest: null,
      revision: 1,
    }).resolved_targets[0]!.concrete_targets).toHaveLength(1);
    expect(() => buildJobContract({
      job_id: "job-1",
      project_id: "project-1",
      location_id: "location-1",
      canonical_root: "C:/work/project",
      request_digest: "request-1",
      idempotency_key: null,
      source_snapshot_digest: "snapshot-1",
      resolved_targets: [{ ...target, concrete_targets: [] }],
      runner_kind: "host_dev_only",
      model_profile: null,
      policy_digest: null,
      config_digest: "config-1",
      config_schema_version: 1,
      budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 1, no_progress_window: 1, total_job_minutes: 1 },
      parent_contract_digest: null,
      revision: 1,
    })).toThrow(/Concrete hedef listesi bos/);
  });
});

describe("P05: InventoryRepository tek resolver", () => {
  let dir: string;
  let storage: Storage;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-p05-resolver-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
  });

  afterEach(() => {
    storage.close();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi: sonraki temp dizinde devam
    }
  });

  it("module/package/class selectorleri source-set ve module kimligiyle concrete doner", () => {
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/p05-project", "p05-project", null);
    const inventory = new InventoryRepository(storage.db);
    const snapshotId = inventory.writeSnapshot(location.id, "head-1", null, "source-1", "build-1", "parser-1");
    const moduleId = inventory.writeModule(snapshotId, {
      module_relative_path: "app",
      group_id: "com.example",
      artifact_id: "app",
      version: "1",
      packaging: "jar",
      parent_artifact_id: null,
      source_root: "app/src/main/java",
      test_root: "app/src/test/java",
      jacoco_configured: false,
      surefire_configured: true,
      junit4_present: false,
      junit5_present: true,
      mockito_present: false,
    });
    const mainPackage = inventory.writePackage(moduleId, "com.example.app", "main");
    inventory.writeSymbol(mainPackage, {
      kind: "class",
      fqn: "com.example.app.LoadTest",
      simple_name: "LoadTest",
      package_name: "com.example.app",
      relative_path: "app/src/main/java/com/example/app/LoadTest.java",
      source_sha256: "sha-load",
      line_start: 1,
      line_end: 4,
      enclosing: null,
    });
    inventory.writeSymbol(mainPackage, {
      kind: "class",
      fqn: "com.example.app.PaymentService",
      simple_name: "PaymentService",
      package_name: "com.example.app",
      relative_path: "app/src/main/java/com/example/app/PaymentService.java",
      source_sha256: "sha-payment",
      line_start: 1,
      line_end: 4,
      enclosing: null,
    });
    const testPackage = inventory.writePackage(moduleId, "com.example.app", "test");
    inventory.writeSymbol(testPackage, {
      kind: "class",
      fqn: "com.example.app.PaymentServiceTest",
      simple_name: "PaymentServiceTest",
      package_name: "com.example.app",
      relative_path: "app/src/test/java/com/example/app/PaymentServiceTest.java",
      source_sha256: "sha-test",
      line_start: 1,
      line_end: 4,
      enclosing: null,
    });

    const result = inventory.resolveFrozenTargets(snapshotId, [
      { selector: "app", kind: "module" },
      { selector: "com.example.app", kind: "package" },
      { selector: "PaymentService", kind: "class" },
    ]);
    expect(result.not_found).toEqual([]);
    expect(result.ambiguous).toEqual([]);
    expect(result.bySelector.find((g) => g.kind === "module")?.concrete.map((c) => c.fqn)).toEqual([
      "com.example.app.LoadTest",
      "com.example.app.PaymentService",
      "com.example.app.PaymentServiceTest",
    ]);
    expect(result.bySelector.find((g) => g.kind === "class")?.concrete[0]?.source_set).toBe("main");
    expect(result.targets.some((target) => target.source_set === "test")).toBe(true);
  });

  it("ayni simple name iki moduldeyse sessiz secim yapmaz", () => {
    const projects = new ProjectRepository(storage.db);
    const { location } = projects.ensureLocation("C:/work/p05-ambiguous", "p05-ambiguous", null);
    const inventory = new InventoryRepository(storage.db);
    const snapshotId = inventory.writeSnapshot(location.id, "head-2", null, "source-2", "build-2", "parser-1");
    for (const modulePath of ["app", "other"]) {
      const moduleId = inventory.writeModule(snapshotId, {
        module_relative_path: modulePath,
        group_id: "com.example",
        artifact_id: modulePath,
        version: "1",
        packaging: "jar",
        parent_artifact_id: null,
        source_root: `${modulePath}/src/main/java`,
        test_root: `${modulePath}/src/test/java`,
        jacoco_configured: false,
        surefire_configured: true,
        junit4_present: false,
        junit5_present: true,
        mockito_present: false,
      });
      const pkg = inventory.writePackage(moduleId, "com.example.same", "main");
      inventory.writeSymbol(pkg, {
        kind: "class",
        fqn: "com.example.same.PaymentService",
        simple_name: "PaymentService",
        package_name: "com.example.same",
        relative_path: `${modulePath}/src/main/java/com/example/same/PaymentService.java`,
        source_sha256: `sha-${modulePath}`,
        line_start: 1,
        line_end: 4,
        enclosing: null,
      });
    }
    const result = inventory.resolveFrozenTargets(snapshotId, [{ selector: "PaymentService", kind: "class" }]);
    expect(result.targets).toEqual([]);
    expect(result.ambiguous[0]?.selector).toBe("PaymentService");
  });
});
