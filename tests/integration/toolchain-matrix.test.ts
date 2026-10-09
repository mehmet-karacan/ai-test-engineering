/**
 * Java8/JUnit4 ve Java21/cok modul fixture toolchain kanitlari (AC13/AC15).
 * Her hedefin toolchain'i kendi build kurallarina uyar; gercek Maven run ile dogrulanir.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseJacocoXml, findClassInReport } from "../../src/coverage/jacoco-parser.js";
import { discoverModules } from "../../src/discovery/pom-discovery.js";
import { collectJavaFiles, scanJavaFile, scanTestFile } from "../../src/discovery/java-inventory.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("Java8/JUnit4 fixture (AC13)", () => {
  let projectDir: string;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-j8-"));
    projectDir = join(dir, "fixture");
    cpSync(join(FIXTURES, "java8-junit4-project"), projectDir, { recursive: true });
    execSync("mvn -B -ntp test", { cwd: projectDir, stdio: "pipe", timeout: 600000 });
  }, 900000);

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("gercek Maven run + JaCoCo sayaclari uretilmeli", () => {
    const xmlPath = join(projectDir, "target", "site", "jacoco", "jacoco.xml");
    expect(existsSync(xmlPath)).toBe(true);
    const report = parseJacocoXml(xmlPath);
    const cls = findClassInReport(report, "com.example.legacy.LegacyInventory");
    expect(cls).toBeDefined();
    expect(cls!.line!.covered + cls!.line!.missed).toBeGreaterThan(0);
    expect(cls!.branch!.covered + cls!.branch!.missed).toBeGreaterThan(0);
  });

  it("JUnit4 test envanteri dogru siniflanmali", () => {
    const files = collectJavaFiles(projectDir, "src/test/java");
    expect(files).toHaveLength(1);
    const result = scanTestFile(files[0]!, projectDir);
    expect(result.testClass?.kind).toBe("junit4");
    expect(result.methods.length).toBe(3);
  });

  it("pom discovery junit4 tespit etmeli", () => {
    const result = discoverModules(projectDir);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]!.junit4_present).toBe(true);
    expect(result.modules[0]!.junit5_present).toBe(false);
    expect(result.modules[0]!.jacoco_configured).toBe(true);
  });
});

describe("Java21/cok modul fixture (AC15)", () => {
  let projectDir: string;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-j21-"));
    projectDir = join(dir, "fixture");
    cpSync(join(FIXTURES, "java21-multi-module"), projectDir, { recursive: true });
    execSync("mvn -B -ntp test", { cwd: projectDir, stdio: "pipe", timeout: 600000 });
  }, 900000);

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("cok modullu reactor kesfi dogru olmali", () => {
    const result = discoverModules(projectDir);
    expect(result.modules).toHaveLength(3);
    const artifactIds = result.modules.map((m) => m.artifact_id);
    expect(artifactIds).toContain("core");
    expect(artifactIds).toContain("app");
  });

  it("test calisan modulde gercek JaCoCo sayaclari uretilmeli", () => {
    const xmlPath = join(projectDir, "app", "target", "site", "jacoco", "jacoco.xml");
    expect(existsSync(xmlPath)).toBe(true);
    const report = parseJacocoXml(xmlPath);
    const svc = findClassInReport(report, "com.example.app.PaymentAppService");
    expect(svc).toBeDefined();
    expect(svc!.line!.covered).toBeGreaterThan(0);
  });

  it("test olmayan modulde report uretilmez (JaCoCo gercek davranisi; tek goal tum modul verisini uretir kabul edilmez)", () => {
    expect(existsSync(join(projectDir, "core", "target", "site", "jacoco", "jacoco.xml"))).toBe(false);
  });

  it("record siniflari (Java 21 feature) dogru cozulmali", () => {
    const files = collectJavaFiles(join(projectDir, "core"), "src/main/java");
    expect(files).toHaveLength(1);
    const result = scanJavaFile(files[0]!, join(projectDir, "core"));
    expect(result.symbols[0]!.fqn).toBe("com.example.core.PaymentRecord");
  });
});
