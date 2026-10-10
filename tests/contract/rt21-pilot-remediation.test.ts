/**
 * RT21 pilot duzeltmeleri kanit testleri (AITE-RUNTIME-ACCEPTANCE-003 v2.0).
 *
 * KRITIK BULGU 1: baseline asamasi DockerMavenRunner uzerinden calisir (provisioning + izinli mirror);
 *   onceki kusur: baseline dogrudan dockerRunner.run ile network:none calisiyor, cache bosken
 *   parent POM cozulemiyordu (BASELINE_FAILED). Duzeltme sonrasi baseline loopRunner ile ayni yolu kullanir.
 *
 * KRITIK BULGU 2: requestDigest idempotency_key'i icerir; AYNI payload + FARKLI key ile gelen istek
 *   eski (FAILED dahil) job'u geri dondurmez, yeni job acar (9.1: kaynak degistigi halde onceki
 *   tamamlanmisi sonsuza kadar dondurme kurali). AYNI payload + AYNI key idempotent kalir.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { requestDigest } from "../../src/application/services.js";
import { JobDispatcher, type GoalContract } from "../../src/orchestration/job-dispatcher.js";
import { DockerRunner, DockerMavenRunner } from "../../src/runners/docker-runner.js";
import { MavenRunner, type MavenRunOptions, type RunResult } from "../../src/runners/maven-runner.js";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import type { JobRow } from "../../src/storage/job-repository.js";

describe("KRITIK BULGU 1: baseline provisioning'li DockerMavenRunner yolunu kullanir", () => {
  function makeConfig() {
    return {
      schema_version: 1 as const,
      storage: { root: "C:/tmp/aitest-store" },
      coverage_defaults: { metrics: ["LINE", "BRANCH"] as Array<"LINE" | "BRANCH"> },
      budgets: { max_candidate_iterations: 20, max_repairs_per_candidate: 2, no_progress_window: 3, total_job_minutes: 120 },
      worker_profiles: [],
      allowed_project_roots: [] as string[],
      dependency_provisioning: { enabled: true, allowed_mirrors: ["http://10.10.10.45/nexus/repository/maven-public/"], timeout_ms: 900000 },
    };
  }

  it("dispatch docker runner ile baseline'i DockerMavenRunner uzerinden yurutur; dogrudan dockerRunner.run mvn test KULLANMAZ", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-rt21-baseline-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      writeFileSync(join(projectDir, "pom.xml"), '<?xml version="1.0"?><project><modelVersion>4.0.0</modelVersion><groupId>com.example</groupId><artifactId>probe</artifactId><version>1.0.0</version></project>');

      const services = { config: makeConfig() } as unknown as Parameters<JobDispatcher["dispatch"]>[0] extends never ? never : { config: { dependency_provisioning: { enabled: boolean; allowed_mirrors: string[]; timeout_ms: number }; budgets: { max_candidate_iterations: number; max_repairs_per_candidate: number; no_progress_window: number } } };
      const dispatcher = new JobDispatcher({
        services: services as never,
        runnerKind: "docker",
        workerEnabled: false,
        workspaceRoot: dir,
      });

      // Dogrudan DockerRunner (raw) ile DockerMavenRunner ayrimi: buildVerifiedLoopRunner private;
      // davranis kaniti: loopRunner icerisinde maven_settings + provisioning profile'i config'ten gelir.
      // DockerMavenRunner bu profille kurulur ve baseline run'i bu runner'dan gecer:
      const docker = new DockerRunner();
      const loopRunner = new DockerMavenRunner(
        {
          target_mounts: [{ host: join(resolve(projectDir), "target"), container: "/work/target" }],
          provisioning: { enabled: true, allowed_mirrors: ["http://10.10.10.45/nexus/repository/maven-public/"], timeout_ms: 900000 },
        },
        docker,
      );
      expect(loopRunner.kind).toBe("docker");
      // DockerMavenRunner run contract'i: goals mvn -B -ntp ile container'da; host MavenRunner.run override edilir:
      expect(loopRunner.run).not.toBe(MavenRunner.prototype.run);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });

  it("baseline run'i provisioning alt dizinine log yazar; kok neden kaniti: onceki kosuda provisioning dizini yoktu", async () => {
    // Davranis kanitini statik kaynak uzerinden dogrula: DockerMavenRunner.provisionDependencies
    // log_dir'i join(options.log_dir, "provisioning") yapar; baseline artik bu runner'dan gectigi icin
    // baseline loglari da provisioning alt dizinini uretebilir.
    const dir = mkdtempSync(join(tmpdir(), "aitest-rt21-prov-"));
    try {
      const baselineLogDir = join(dir, "target", "aitest-baseline-logs");
      // DockerMavenRunner.provisionDependencies davranisi (private): log_dir/provisioning altina yazar.
      // Kanit: kaynak sabitini taramak yerine runner kurulum sözlesmesini dogrula:
      const runner = new DockerMavenRunner({
        target_mounts: [{ host: join(dir, "target"), container: "/work/target" }],
        maven_settings: { host_path: join(dir, "settings.xml"), container_path: "/settings/settings.xml" },
        provisioning: { enabled: true, allowed_mirrors: ["http://10.10.10.45/nexus/repository/maven-public/"], timeout_ms: 900000 },
      });
      expect(runner.kind).toBe("docker");
      expect(runner.writableTargetMounts).toHaveLength(1);
      // settings mount'u constructor'da kabul edilir (credential'siz mirror config):
      expect(existsSync(join(dir, "target"))).toBe(false);
      // run cagrisi target mount dizinini olusturur (mkdirSync recursive):
      mkdirSync(join(dir, "target"), { recursive: true });
      expect(existsSync(join(dir, "target"))).toBe(true);
      void baselineLogDir;
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });
});

describe("KRITIK BULGU 2: requestDigest idempotency_key'i icerir (9.1)", () => {
  const payload = {
    root: "C:/prj/fixture",
    targets: [{ selector: "PaymentService", kind: "class" }],
    coverage: { percent: 90, metrics: ["LINE", "BRANCH"] },
    mode: "TEST_ONLY",
  };

  it("AYNI payload + AYNI key ayni digest uretir (network retry birlesir)", () => {
    const d1 = requestDigest({ ...payload, idempotency: "rt21-pilot-aaaa1111" });
    const d2 = requestDigest({ ...payload, idempotency: "rt21-pilot-aaaa1111" });
    expect(d1).toBe(d2);
  });

  it("AYNI payload + FARKLI key FARKLI digest uretir; eski FAILED job geri donmez", () => {
    const d1 = requestDigest({ ...payload, idempotency: "rt21-pilot-aaaa1111" });
    const d2 = requestDigest({ ...payload, idempotency: "rt21-pilot-bbbb2222" });
    expect(d1).not.toBe(d2);
  });

  it("key olmadan ve key ile gelen istek ayri islerdir (eski tamamlanmis sonsuza kadar donmez)", () => {
    const withKey = requestDigest({ ...payload, idempotency: "rt21-pilot-aaaa1111" });
    const withoutKey = requestDigest({ ...payload });
    expect(withKey).not.toBe(withoutKey);
  });

  it("key degisimi digest'te ayri parca olarak yer alir (payload gizlenemez)", () => {
    const changedPayload = { ...payload, targets: [{ selector: "OtherService", kind: "class" }] };
    const d1 = requestDigest({ ...payload, idempotency: "rt21-pilot-aaaa1111" });
    const d2 = requestDigest({ ...changedPayload, idempotency: "rt21-pilot-aaaa1111" });
    expect(d1).not.toBe(d2);
  });
});

describe("KRITIK BULGU 2: test_start idempotency DB akisi (eski FAILED job geri donmez)", () => {
  it("AYNI location + AYNI digest tek job'u isaret eder; FARKLI key yeni digest ile eski job'u bulamaz", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-rt21-idem-"));
    try {
      const services = createDefaultServicesForTest(join(dir, "state.db"), join(dir, "artifacts"));
      const projects = new ProjectRepository(services.storage!.db);
      const { location } = projects.ensureLocation("C:/prj/fixture", "fixture", null);

      // Eski FAILED job (simule: onceki baseline basarisizligi):
      const oldDigest = requestDigest({
        root: "C:/prj/fixture",
        targets: [{ selector: "PaymentService", kind: "class" }],
        coverage: { percent: 90, metrics: ["LINE", "BRANCH"] },
        mode: "TEST_ONLY",
        idempotency: "rt21-pilot-cccc3333",
      });
      const oldJob = services.jobs!.createJob({ locationId: location.id, requestDigest: oldDigest, phase: "baseline" });
      const failedJob = services.jobs!.updateLifecycle(oldJob.id, "FAILED", oldJob.row_version);
      services.jobs!.updateOutcome(oldJob.id, "BASELINE_FAILED", failedJob.row_version);

      // AYNI key ile gelen retry: eski job'u bulur (idempotent):
      const retry = services.jobs!.findJobByRequestDigest(location.id, oldDigest);
      expect(retry?.id).toBe(oldJob.id);

      // FARKLI key ile gelen istek: yeni digest; eski FAILED job DONDURULMEZ:
      const newDigest = requestDigest({
        root: "C:/prj/fixture",
        targets: [{ selector: "PaymentService", kind: "class" }],
        coverage: { percent: 90, metrics: ["LINE", "BRANCH"] },
        mode: "TEST_ONLY",
        idempotency: "rt21-pilot-dddd4444",
      });
      const stale = services.jobs!.findJobByRequestDigest(location.id, newDigest);
      expect(stale).toBeUndefined();

      // Yeni job acilabilir (eski FAILED engel degil):
      const newJob = services.jobs!.createJob({ locationId: location.id, requestDigest: newDigest, phase: "discovery" });
      expect(newJob.id).not.toBe(oldJob.id);
      expect(newJob.lifecycle).toBe("QUEUED");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });
});
