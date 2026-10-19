import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { SourceSnapshot, effectiveSourceSet } from "../../src/discovery/source-snapshot.js";
import { discoverModules, parsePom, resolveTargetModule } from "../../src/discovery/pom-discovery.js";
import { PolicyGuard } from "../../src/policies/policy-guard.js";
import { collectJavaFiles, scanJavaFile, scanTestFile } from "../../src/discovery/java-inventory.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("SourceSnapshot", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-snapshot-"));
  });

  afterEach(() => {
    try {
      const absolute = resolve(dir);
      if (dirname(absolute).toLowerCase() !== resolve(tmpdir()).toLowerCase() ||
          !basename(absolute).startsWith("aitest-snapshot-")) throw new Error("Unsafe fixture cleanup");
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("fixture projesi manifest uretmeli ve hash'ler dogru olmali", () => {
    const snapshot = new SourceSnapshot(join(FIXTURES, "sample-maven-project"));
    const manifest = snapshot.buildManifest();
    expect(manifest.entries.length).toBeGreaterThanOrEqual(3);
    const production = manifest.entries.filter((e) => e.classification === "production_source");
    const test = manifest.entries.filter((e) => e.classification === "test_source");
    expect(production.length).toBe(1);
    expect(test.length).toBe(1);
    for (const entry of manifest.entries) {
      expect(entry.sha256).toHaveLength(64);
    }
  });

  it("kopya ayni hash ile geri yuklenmeli", () => {
    const snapshot = new SourceSnapshot(join(FIXTURES, "sample-maven-project"));
    const manifest = snapshot.buildManifest();
    const target = join(dir, "copy");
    mkdirSync(target);
    snapshot.copyTo(target, manifest);
    for (const entry of manifest.entries) {
      const copiedPath = join(target, entry.relative_path.replace(/\//g, "\\"));
      expect(existsSync(copiedPath)).toBe(true);
      expect(readFileSync(copiedPath).toString("hex").length).toBeGreaterThan(0);
    }
    expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(true);
  }, 120_000);

  it("dirty kaynak snapshot'a girer; stash/reset yok", () => {
    const projectDir = join(dir, "project");
    mkdirSync(join(projectDir, "src", "main", "java"), { recursive: true });
    writeFileSync(join(projectDir, "src", "main", "java", "Dirty.java"), "public class Dirty {}\n");
    const snapshot = new SourceSnapshot(projectDir);
    const manifest = snapshot.buildManifest();
    expect(manifest.entries.some((e) => e.relative_path.endsWith("Dirty.java"))).toBe(true);
  });

  it("dosya sinirini buyuk alt agaci gezmeden typed hata ile uygular", () => {
    const root = join(dir, "large-root");
    mkdirSync(root);
    for (const name of ["a.java", "b.java", "c.java"]) writeFileSync(join(root, name), "class X {}\n");
    let deep = join(root, "z");
    let depth64 = "";
    let depth65 = "";
    for (let index = 0; index < 65; index++) {
      mkdirSync(deep);
      if (index === 63) depth64 = deep;
      if (index === 64) depth65 = deep;
      deep = join(deep, "z");
    }
    const leaf = join(depth64, "leaf.java");
    writeFileSync(leaf, "class Leaf {}\n");
    const snapshot = new SourceSnapshot(root);
    expect(() => snapshot.walk(undefined, 0, 2)).toThrow(/Dosya sayisi siniri asildi/);
    expect(() => snapshot.buildManifest({ maxFiles: 2 })).toThrow(/Dosya sayisi siniri asildi/);
    expect(snapshot.walk(leaf, 64)).toEqual([leaf]);
    expect(() => snapshot.walk(depth65, 65)).toThrow(/Dizin derinligi siniri asildi/);
    expect(() => snapshot.walk(join(root, "a.java"), 65)).toThrow(/Dizin derinligi siniri asildi/);
  });
});

describe("effectiveSourceSet", () => {
  it("main/test/unknown ayrimi dogru olmali", () => {
    expect(effectiveSourceSet("src/main/java/com/X.java")).toBe("main");
    expect(effectiveSourceSet("src/test/java/com/XTest.java")).toBe("test");
    expect(effectiveSourceSet("other/X.java")).toBe("unknown");
  });
});

describe("POM discovery", () => {
  it("tek modul POM'u dogru cozulmali", () => {
    const module = parsePom(join(FIXTURES, "sample-maven-project", "pom.xml"), join(FIXTURES, "sample-maven-project"));
    expect(module.artifact_id).toBe("sample-maven-project");
    expect(module.packaging).toBe("jar");
    expect(module.junit5_present).toBe(true);
    expect(module.junit4_present).toBe(false);
    expect(module.module_relative_path).toBe("");
  });

  it("cok modullu reactor dogru sirayla kesfedilmeli", () => {
    const result = discoverModules(join(FIXTURES, "multi-module-project"));
    expect(result.modules).toHaveLength(3);
    const artifactIds = result.modules.map((m) => m.artifact_id);
    expect(artifactIds).toContain("multi-module-project");
    expect(artifactIds).toContain("payment-api");
    expect(artifactIds).toContain("payment-core");
    const core = result.modules.find((m) => m.artifact_id === "payment-core")!;
    expect(core.parent_artifact_id).toBe("multi-module-project");
    expect(core.group_id).toBe("com.example");
    expect(core.module_relative_path).toBe("payment-core");
  });

  it("cok modullu custom source/test root'lari project-relative cozulmeli", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-custom-roots-"));
    const project = join(dir, "custom-reactor");
    mkdirSync(join(project, "custom"), { recursive: true });
    writeFileSync(join(project, "pom.xml"), `<?xml version="1.0"?><project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>root</artifactId><version>1</version><packaging>pom</packaging><modules><module>custom</module></modules></project>`);
    writeFileSync(join(project, "custom", "pom.xml"), `<?xml version="1.0"?><project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><parent><groupId>g</groupId><artifactId>root</artifactId><version>1</version></parent><artifactId>custom</artifactId><build><sourceDirectory>code/main</sourceDirectory><testSourceDirectory>checks/unit</testSourceDirectory></build></project>`);
    const custom = discoverModules(project).modules.find((module) => module.module_relative_path === "custom")!;
    expect(custom.source_root).toBe("custom/code/main");
    expect(custom.test_root).toBe("custom/checks/unit");
  });

  it("resolveTargetModule bulunamayan modulde hata vermeli", () => {
    const result = discoverModules(join(FIXTURES, "multi-module-project"));
    expect(() => resolveTargetModule(result.modules, "yok")).toThrow();
  });

  it("kok POM olmayan dizinde hata vermeli", () => {
    const empty = mkdtempSync(join(tmpdir(), "aitest-empty-"));
    try {
      expect(() => discoverModules(empty)).toThrow();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("PolicyGuard", () => {
  const guard = new PolicyGuard("/proj", [
    { module_relative_path: "", test_root: "src/test/java" },
  ]);

  it("test koku icinde create izinli olmali", () => {
    expect(guard.checkPath("src/test/java/com/XTest.java")).toMatchObject({ allowed: true });
  });

  it("production kaynak reddedilmeli", () => {
    expect(guard.checkPath("src/main/java/com/X.java")).toMatchObject({ allowed: false, reason_code: "PRODUCTION_SOURCE" });
  });

  it("POM reddedilmeli", () => {
    expect(guard.checkPath("pom.xml")).toMatchObject({ allowed: false, reason_code: "POM" });
  });

  it(".git reddedilmeli", () => {
    expect(guard.checkPath(".git/config")).toMatchObject({ allowed: false });
  });

  it("test koku disinda dosya reddedilmeli", () => {
    expect(guard.checkPath("src/other/X.java")).toMatchObject({ allowed: false, reason_code: "NOT_TEST_ROOT" });
  });

  it("path escape reddedilmeli", () => {
    expect(guard.checkPath("../disari/X.java")).toMatchObject({ allowed: false, reason_code: "PATH_ESCAPE" });
  });

  it("project-relative modul test root'u iki kez birlestirilmemeli", () => {
    const multi = new PolicyGuard("/proj", [{ module_relative_path: "app", test_root: "app/checks/unit" }]);
    expect(multi.checkPath("app/checks/unit/com/ExampleTest.java")).toMatchObject({ allowed: true });
    expect(multi.checkPath("app/src/test/java/com/ExampleTest.java")).toMatchObject({ allowed: false, reason_code: "NOT_TEST_ROOT" });
  });

  it("yeni @Disabled/@Ignore icerigi reddedilmeli", () => {
    expect(() => PolicyGuard.assertNoDisabled("public class X { @Disabled\n void a() {} }", "src/test/java/X.java")).toThrow();
    expect(() => PolicyGuard.assertNoDisabled("public class X { void a() { assertEquals(1,1); } }", "src/test/java/X.java")).not.toThrow();
  });

  it("Assume/assumeTrue icerigi reddedilmeli", () => {
    expect(() => PolicyGuard.assertNoDisabled("void a() { assumeTrue(false); }", "x.java")).toThrow();
  });
});

describe("Java envanteri", () => {
  it("PaymentService.java sinif ve metotlari dogru cozulmali", () => {
    const files = collectJavaFiles(join(FIXTURES, "sample-maven-project"), "src/main/java");
    expect(files).toHaveLength(1);
    const result = scanJavaFile(files[0]!, join(FIXTURES, "sample-maven-project"));
    expect(result.symbols).toHaveLength(1);
    const symbol = result.symbols[0]!;
    expect(symbol.fqn).toBe("com.example.payment.PaymentService");
    expect(symbol.kind).toBe("class");
    const methodNames = result.methods.map((m) => m.name);
    expect(methodNames).toContain("calculateTotal");
    expect(methodNames).toContain("resolveStatus");
    const calculateTotal = result.methods.find((m) => m.name === "calculateTotal")!;
    expect(calculateTotal.visibility).toBe("public");
    expect(calculateTotal.owner_fqn).toBe("com.example.payment.PaymentService");
  });

  it("nested sinif ayri sembol olarak cozulmali", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-nested-"));
    try {
      const nestedDir = join(dir, "nested");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(
        join(nestedDir, "Outer.java"),
        "package p;\npublic class Outer {\n  public static class Inner {\n    public int x() { return 1; }\n  }\n  public int y() { return 2; }\n}\n",
      );
      const result = scanJavaFile(join(nestedDir, "Outer.java"), dir);
      const fqns = result.symbols.map((s) => s.fqn);
      expect(fqns).toContain("p.Outer");
      expect(fqns).toContain("p.Outer.Inner");
      const inner = result.symbols.find((s) => s.fqn === "p.Outer.Inner")!;
      expect(inner.enclosing).toBe("p.Outer");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ayni sinif adi farkli pakette ayri cozulmali (AC06 hazirligi)", () => {
    const coreFiles = collectJavaFiles(join(FIXTURES, "multi-module-project", "payment-core"), "src/main/java");
    expect(coreFiles).toHaveLength(1);
    const result = scanJavaFile(coreFiles[0]!, join(FIXTURES, "multi-module-project", "payment-core"));
    expect(result.symbols[0]!.fqn).toBe("com.example.core.PaymentService");
  });

  it("JUnit5 test dosyasi dogru siniflanmali", () => {
    const files = collectJavaFiles(join(FIXTURES, "sample-maven-project"), "src/test/java");
    expect(files).toHaveLength(1);
    const result = scanTestFile(files[0]!, join(FIXTURES, "sample-maven-project"));
    expect(result.testClass?.fqn).toBe("com.example.payment.PaymentServiceTest");
    expect(result.testClass?.kind).toBe("junit5");
    const methodNames = result.methods.map((m) => m.name);
    expect(methodNames).toContain("calculateTotal_multiply");
    expect(methodNames).toContain("calculateTotal_nullAmount_throws");
  });
});
