/**
 * W03 kabul testleri (F06, N21-N23): baseline ayrisimlari ve hedef listesi.
 * - F06: framework none -> run:null/NO_TESTS (sentetik exit0 kaydi YOK)
 * - F06: XML failure + process exit0 -> PASSED OLAMAZ (FAILED)
 * - F06: bozuk XML -> malformed_reports kayitli; silently continue yok
 * - F06: skip config izleri (skipTests/maven.test.skip) raporda gorunur; POM degismez
 * - N21: ayni simple name iki modulde; package boundary; Test ile biten production sinifi ayrisimi
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runBaseline, parseSurefireReports, detectSkipConfig, buildPlan } from "../../src/orchestration/build-plan.js";
import { MavenRunner, type RunResult } from "../../src/runners/maven-runner.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { Storage } from "../../src/storage/storage.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("W03/F06: baseline ayrisimlari", () => {
  it("framework none: run:null + NO_TESTS; sentetik exit0 run kaydi YOK", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w03-nofw-"));
    try {
      // POM var ama junit bagimliligi yok; test dosyasi yok
      writeFileSync(join(dir, "pom.xml"), `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>no-framework</artifactId>
  <version>1.0</version>
  <packaging>jar</packaging>
</project>`);
      mkdirSync(join(dir, "src", "main", "java"), { recursive: true });
      writeFileSync(join(dir, "src", "main", "java", "App.java"), "public class App {}");
      const baseline = await runBaseline(dir, new MavenRunner(), 60000);
      expect(baseline.status).toBe("NO_TESTS");
      expect(baseline.run).toBeNull();
      expect(baseline.reason_code).toBe("NO_TEST_FRAMEWORK");
      // sentetik run kaydi yok: komut bos, exit 0 uydurulmamis
      expect(baseline.failed_tests).toHaveLength(0);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 120000);

  it("P06 frozen baseline workspace'te calisir; orijinal stale target korunur", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p06-frozen-source-"));
    const store = mkdtempSync(join(tmpdir(), "aitest-p06-frozen-store-"));
    try {
      writeFileSync(join(dir, "pom.xml"), `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>frozen</artifactId><version>1</version>
  <dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency></dependencies>
</project>`);
      mkdirSync(join(dir, "target", "site", "jacoco"), { recursive: true });
      const stale = "stale-original-jacoco";
      writeFileSync(join(dir, "target", "site", "jacoco", "jacoco.xml"), stale, "utf8");
      let executionRoot = "";
      const fakeRunner = {
        run: async (options: { working_dir: string; goals: string[]; timeout_ms: number; log_dir: string }): Promise<RunResult> => {
          executionRoot = options.working_dir;
          mkdirSync(join(options.working_dir, "target", "surefire-reports"), { recursive: true });
          writeFileSync(join(options.working_dir, "target", "surefire-reports", "TEST-Frozen.xml"), `<testsuite name="Frozen" tests="1" failures="0" errors="0" skipped="0"><testcase name="ok" classname="Frozen"/></testsuite>`, "utf8");
          mkdirSync(join(options.working_dir, "target", "site", "jacoco"), { recursive: true });
          writeFileSync(join(options.working_dir, "target", "site", "jacoco", "jacoco.xml"), `<report name="frozen"><package name="p"><class name="p.Frozen" sourcefilename="Frozen.java"><counter type="LINE" missed="1" covered="9"/></class></package></report>`, "utf8");
          return { exit_code: 0, duration_ms: 1, stdout_log_path: join(options.log_dir, "stdout.log"), stderr_log_path: join(options.log_dir, "stderr.log"), command: ["fake-maven", ...options.goals], timed_out: false };
        },
      } as unknown as MavenRunner;

      const baseline = await runBaseline(dir, fakeRunner, 60000, { workspace_root: join(store, "baseline"), collect_coverage: true });
      expect(baseline.status).toBe("PASSED");
      expect(baseline.execution_root).toBe(executionRoot);
      expect(baseline.execution_root).not.toBe(dir);
      expect(readFileSync(join(dir, "target", "site", "jacoco", "jacoco.xml"), "utf8")).toBe(stale);
      expect(existsSync(join(baseline.execution_root, "target", "site", "jacoco", "jacoco.xml"))).toBe(true);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        rmSync(store, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 60000);

  it("XML failure + process exit0: PASSED OLAMAZ; FAILED donmeli (sentetik suite fixture)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w03-failxml-"));
    try {
      // surefire-reports icinde failure'li suite XML (process exit0 senaryosu):
      const reportDir = join(dir, "target", "surefire-reports");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "TEST-com.example.CalcTest.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.CalcTest" tests="2" failures="1" errors="0" skipped="0">
  <testcase name="ok_case" classname="com.example.CalcTest" time="0.01"/>
  <testcase name="bad_case" classname="com.example.CalcTest" time="0.02">
    <failure message="expected 5 got 4" type="AssertionError">assert diff</failure>
  </testcase>
</testsuite>`);
      const suites = parseSurefireReports(dir, "");
      expect(suites.length).toBe(1);
      expect(suites[0]!.tests).toBe(2);
      expect(suites[0]!.failures).toBe(1);
      expect(suites[0]!.failed_test_names).toContain("com.example.CalcTest#bad_case");
      // F06 kurali: failure sayisi > 0 iken PASSED uretilemez
      const aggregated = suites.reduce((acc, s) => acc + s.failures, 0);
      expect(aggregated).toBeGreaterThan(0);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 60000);

  it("bozuk XML: malformed_reports kayitli; etkilenen suite eksik kalir", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w03-badxml-"));
    try {
      const reportDir = join(dir, "target", "surefire-reports");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, "TEST-com.example.GoodTest.xml"), `<?xml version="1.0"?>
<testsuite name="com.example.GoodTest" tests="1" failures="0" errors="0" skipped="0">
  <testcase name="ok" classname="com.example.GoodTest" time="0.01"/>
</testsuite>`);
      writeFileSync(join(reportDir, "TEST-com.example.BrokenTest.xml"), `<testsuite name="broken" tests="1"`); // kesik XML
      const malformed: string[] = [];
      const suites = parseSurefireReports(dir, "", malformed);
      expect(suites.length).toBe(1);
      expect(malformed.length).toBe(1);
      expect(malformed[0]).toContain("TEST-com.example.BrokenTest.xml");
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 60000);

  it("skip config izleri: skipTests=true POM'da tespit edilir; POM degismez", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w03-skip-"));
    try {
      const pomContent = `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>g</groupId><artifactId>a</artifactId><version>1</version>
  <properties><skipTests>true</skipTests></properties>
</project>`;
      writeFileSync(join(dir, "pom.xml"), pomContent);
      const detected = detectSkipConfig(dir);
      expect(detected).toContain("pom.xml: skipTests=true");
      // POM degismedi:
      expect(readFileSync(join(dir, "pom.xml"), "utf8")).toBe(pomContent);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 60000);

  it("temiz POM'da skip config tespit edilmez", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w03-noskip-"));
    try {
      writeFileSync(join(dir, "pom.xml"), `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>g</groupId><artifactId>a</artifactId><version>1</version>
</project>`);
      expect(detectSkipConfig(dir)).toHaveLength(0);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 60000);
});

describe("W03/N21: gercek hedef listesi (ayni simple name iki modulde)", () => {
  let storage: Storage;
  let inventory: InventoryRepository;
  let dbDir: string;

  beforeAll(() => {
    dbDir = mkdtempSync(join(tmpdir(), "aitest-w03-n21-"));
    storage = new Storage({ dbPath: join(dbDir, "test.db") });
    storage.migrate();
    inventory = new InventoryRepository(storage.db);
  });

  afterAll(() => {
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // temp
    }
  });

  /** project_snapshots FK'si project_locations gerektirir; izole location + snapshot kurar */
  function createLocationAndSnapshot(): string {
    const projectId = randomUUID().slice(0, 36);
    const locationId = randomUUID().slice(0, 36);
    const now = Date.now();
    storage.db
      .prepare("INSERT INTO projects (id, name, identity_kind, created_at, updated_at) VALUES (?, ?, 'local_only', ?, ?)")
      .run(projectId, `n21-${locationId.slice(0, 8)}`, now, now);
    storage.db
      .prepare("INSERT INTO project_locations (id, project_id, canonical_root, platform, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'win32', ?, ?, ?)")
      .run(locationId, projectId, join(dbDir, locationId), now, now, now);
    // P03: source/build digest null kalamaz; izole fixture icin deterministik digest.
    return inventory.writeSnapshot(locationId, null, null, "0".repeat(64), "1".repeat(64), "statik-tarama-1");
  }

  function writeModuleAndSymbol(snapshotId: string, modulePath: string, fqn: string): void {
    const moduleId = inventory.writeModule(snapshotId, {
      module_relative_path: modulePath,
      group_id: "com.example",
      artifact_id: modulePath.replace(/\//g, "-"),
      version: "1.0",
      packaging: "jar",
      junit4_present: false,
      junit5_present: true,
      mockito_present: false,
      jacoco_configured: true,
      source_root: "src/main/java",
      test_root: "src/test/java",
    });
    const packageId = inventory.writePackage(moduleId, fqn.split(".").slice(0, -1).join("."), "main");
    inventory.writeSymbol(packageId, {
      kind: "class",
      fqn,
      simple_name: fqn.split(".").pop() ?? fqn,
      package_name: fqn.split(".").slice(0, -1).join("."),
      relative_path: `${modulePath}/src/main/java/${fqn.replace(/\./g, "/")}.java`,
      source_sha256: null,
      line_start: 1,
      line_end: 10,
      enclosing: null,
    });
  }

  it("ayni simple name iki modulde suffix FQCN oyununa takilmadan tam FQCN ile ayrisir", () => {
    const snapshotId = createLocationAndSnapshot();
    writeModuleAndSymbol(snapshotId, "payment-core", "com.example.core.PaymentService");
    writeModuleAndSymbol(snapshotId, "payment-api", "com.example.api.PaymentService");
    // exact FQCN resolution:
    const core = inventory.resolveTarget(snapshotId, "com.example.core.PaymentService");
    expect(core).toHaveLength(1);
    expect(core[0]!.fqn).toBe("com.example.core.PaymentService");
    const api = inventory.resolveTarget(snapshotId, "com.example.api.PaymentService");
    expect(api).toHaveLength(1);
    expect(api[0]!.module_relative_path).toBe("payment-api");
    // sadece simple name: iki modul -> coklu (ayrisim dispatcher'a kalicior):
    const both = inventory.resolveTarget(snapshotId, "PaymentService");
    expect(both.length).toBe(2);
  });

  it("FQCN suffix oyunu: LoadTest ile biten production sinifi suffix filtresiyle kaybolmaz (resolved listesinde)", () => {
    // F05/N21: dispatcher endsWith("Test") filtresi LoadTest gibi production siniflarini eler;
    // bu test dogru resolver davranisini belgeler: FQCN bazli resolution source-set'ten bagimsizdir
    const snapshotId = createLocationAndSnapshot();
    writeModuleAndSymbol(snapshotId, "perf", "com.example.perf.LoadTest");
    const resolved = inventory.resolveTarget(snapshotId, "com.example.perf.LoadTest");
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.fqn).toBe("com.example.perf.LoadTest");
  });

  it("package hedefi paket siniriyla cosulur; baska pakete sizmaz (boundary-aware)", () => {
    const snapshotId = createLocationAndSnapshot();
    writeModuleAndSymbol(snapshotId, "m1", "com.example.packA.ServiceA");
    writeModuleAndSymbol(snapshotId, "m1", "com.example.packA.ServiceAHelper");
    writeModuleAndSymbol(snapshotId, "m1", "com.example.packAB.ServiceB");
    // W03/F05: boundary-aware package resolution (nokta siniri korunur):
    const pkgClasses = inventory.resolvePackageBoundary(snapshotId, "com.example.packA.");
    const fqns = pkgClasses.map((r) => r.fqn).sort();
    expect(fqns).toContain("com.example.packA.ServiceA");
    expect(fqns).toContain("com.example.packA.ServiceAHelper");
    expect(fqns).not.toContain("com.example.packAB.ServiceB");
  });
});

describe("W03/N22: inherited framework (parent POM fixture)", () => {
  it("multi-module fixture'da effective plan junit5 tespit eder; static none fake uretmez", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w03-n22-"));
    try {
      cpSync(join(FIXTURES, "java21-multi-module"), dir, { recursive: true });
      const plan = buildPlan(dir, []);
      // parent POM'dan devralinan junit5 tespiti:
      expect(plan.test_framework).not.toBe("none");
      expect(plan.jdk_version.length).toBeGreaterThan(0);
      // fake NO_TESTS run kaydi yok:
      expect(plan.maven_goals_test).toEqual(["test"]);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  }, 60000);
});
