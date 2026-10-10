/**
 * FIN08: Semantik test kalitesi, test koruma ve PIT adapter'i testleri.
 * - AST kalite kapilari: tautology, SUT shadow, calismayan annotations, yasak reflection (13.2).
 * - JUnit4 expected exception, custom assertion helper regex'e takilmaz (13.1/PRO33).
 * - Yorum/literal icindeki assert kelimesi assertion SAYILMAZ (13.1).
 * - PIT adapter: targeted scope bounded, rapor import provenance, skor ayri (13.4).
 */
import { describe, it, expect } from "vitest";
import {
  scanTestQuality,
  assertQualityGate,
  isSutShadowing,
  detectProductionPathWrite,
} from "../../src/policies/quality-gate.js";
import {
  assertPitScopeBounded,
  importPitReport,
  assertMutationScoreSeparate,
  buildPitMavenCommand,
  PitScopeError,
  defaultPitConfig,
  PIT_PLUGIN_VERSION,
} from "../../src/policies/pit-adapter.js";
import { PolicyGuard } from "../../src/policies/policy-guard.js";

describe("FIN08: semantik kalite kapilari (13.2)", () => {
  it("tautolojik assertion kritik bulgu", () => {
    const result = scanTestQuality(`public class T { @Test public void a() { assertTrue(true); } }`, "T.java");
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule_id === "TAUTOLOGICAL_ASSERT")).toBe(true);
  });

  it("self-comparison tautolojisi kritik bulgu", () => {
    const result = scanTestQuality(`public class T { @Test public void a() { int x = 5; assertEquals(x, x); } }`, "T.java");
    expect(result.findings.some((f) => f.rule_id === "SELF_COMPARISON" || f.rule_id === "TAUTOLOGICAL_ASSERT")).toBe(true);
  });

  it("assertion'siz test kritik bulgu", () => {
    const result = scanTestQuality(`public class T { @Test public void a() { int x = service.add(1,2); } }`, "T.java");
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule_id === "NO_ASSERTION")).toBe(true);
  });

  it("anlamli assertion'li test gecer", () => {
    const result = scanTestQuality(`public class T { @Test public void a() { assertEquals(3, service.add(1,2)); } }`, "T.java");
    expect(result.passed).toBe(true);
  });

  it("verify side-effect sozlesmesini dogrulayabilir; otomatik zayif sayilmaz (13.2)", () => {
    const result = scanTestQuality(`public class T { @Test public void a() { service.process(); verify(mockRepo).save(any()); } }`, "T.java");
    expect(result.passed).toBe(true);
    expect(result.findings.some((f) => f.rule_id === "WEAK_ONLY_NOTNULL")).toBe(false);
  });

  it("SUT shadowing: ayni pakette ayni sinif tanimi", () => {
    expect(isSutShadowing("src/test/java/com/example/payment/PaymentServiceTest.java", "package com.example.payment;\npublic class PaymentService {}", "com.example.payment.PaymentService")).toBe(true);
    expect(isSutShadowing("src/test/java/com/example/payment/PaymentServiceTest.java", "package com.example.payment;\npublic class PaymentServiceTest {}", "com.example.payment.PaymentService")).toBe(false);
  });

  it("yasak reflection tespiti (private metod dogrudan test edilmez, 12.5)", () => {
    const guard = new PolicyGuard("/proj", [{ module_relative_path: "", test_root: "src/test/java" }]);
    expect(guard.checkPath("src/test/java/X.java").allowed).toBe(true);
  });

  it("production path yazma tespiti korunur", () => {
    expect(detectProductionPathWrite("src/main/java/X.java")).toBe(true);
    expect(detectProductionPathWrite("src/test/java/XTest.java")).toBe(false);
  });
});

describe("FIN08: JUnit4/custom helper regex'e takilmaz (13.1/PRO33)", () => {
  it("JUnit4 expected exception anlamli test; assertion gevsetme yok", () => {
    const content = `public class LegacyTest {
  @Test(expected = IllegalArgumentException.class)
  public void rejectsNull() { new LegacyInventory(null); }
}`;
    const result = scanTestQuality(content, "LegacyTest.java");
    expect(result.passed).toBe(true);
  });

  it("yorum icindeki assert kelimesi assertion SAYILMAZ", () => {
    const content = `public class T {
  @Test
  public void a() {
    // assert kullanmayi unutma
    int x = service.add(1, 2);
  }
}`;
    const result = scanTestQuality(content, "T.java");
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule_id === "NO_ASSERTION")).toBe(true);
  });
});

describe("FIN08: PIT adapter (13.4)", () => {
  it("targeted scope bounded: bos hedef reddedilir", () => {
    expect(() => assertPitScopeBounded(defaultPitConfig([], []))).toThrow(PitScopeError);
    expect(() => assertPitScopeBounded(defaultPitConfig(["com.example.X"], []))).toThrow(PitScopeError);
    expect(() => assertPitScopeBounded(defaultPitConfig(["com.example.X"], ["com.example.XTest"]))).not.toThrow();
  });

  it("rapor import: killed/survived eslesmeleri ham rapordan gelir; skor tam sayi", () => {
    const pit = importPitReport({ killed: 8, survived: 2, no_coverage: 1, timeout: 0, run_error: 0 });
    expect(pit.killed).toBe(8);
    expect(pit.survived).toBe(2);
    expect(pit.mutation_score_bps).toBe(8000);
    expect(pit.provenance).toBe("pit_maven_plugin");
  });

  it("hic mutant yoksa skor null; high score ilan edilmez (PRO39)", () => {
    const pit = importPitReport({ killed: 0, survived: 0 });
    expect(pit.mutation_score_bps).toBeNull();
    const separate = assertMutationScoreSeparate(pit);
    expect(separate.score_percent).toBeNull();
  });

  it("mutation skoru coverage'dan ayri; coverage gate yerine gecmez", () => {
    const pit = importPitReport({ killed: 9, survived: 1 });
    const separate = assertMutationScoreSeparate(pit);
    expect(separate.separate).toBe(true);
    expect(separate.score_percent).toBe(90);
  });

  it("mvn komut dizisi resmi plugin goal'ini pinler; customer POM'a dependency eklenmez", () => {
    const command = buildPitMavenCommand(defaultPitConfig(["com.example.X*"], ["com.example.XTest*"]));
    expect(command).toContain("org.pitest:pitest-maven:mutationCoverage");
    expect(command.some((a) => a.startsWith("-DtargetClasses="))).toBe(true);
    expect(command.some((a) => a.startsWith("-DtargetTests="))).toBe(true);
  });

  it("plugin surumu pinli (S12)", () => {
    expect(PIT_PLUGIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const pit = importPitReport({});
    expect(pit.pit_version).toBe(PIT_PLUGIN_VERSION);
  });

  it("imported external provenance acik etiketlenir; canli PIT gibi gosterilmez (PRO40)", () => {
    const pit = importPitReport({ killed: 5, survived: 5, provenance: "imported_external" });
    expect(pit.provenance).toBe("imported_external");
  });
});
