/**
 * D07/F09/RG30: tautoloji acigi ve SUT shadowing regresyon testleri.
 */
import { describe, it, expect } from "vitest";
import { scanTestQuality, isSutShadowing } from "../../src/policies/quality-gate.js";

describe("D07/F09/RG30: tautoloji acigi", () => {
  it("assertTrue(true) tautolojik siniflanmali (acik regex)", () => {
    const result = scanTestQuality(
      "class T { @Test\n void a() { org.junit.jupiter.api.Assertions.assertTrue(true); } }",
      "X.java",
    );
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule_id === "TAUTOLOGICAL_ASSERT")).toBe(true);
  });

  it("assertTrue(1 + 1 == 2) anlamli sayilir; tautolojik degil", () => {
    const result = scanTestQuality(
      "class T { @Test\n void a() { org.junit.jupiter.api.Assertions.assertTrue(1 + 1 == 2); } }",
      "X.java",
    );
    expect(result.findings.every((f) => f.rule_id !== "TAUTOLOGICAL_ASSERT")).toBe(true);
    expect(result.passed).toBe(true);
  });
});

describe("D07/F09: SUT shadowing tespiti", () => {
  it("ayni pakette ayni sinif adi SHADOW tespit edilir", () => {
    const shadow = isSutShadowing(
      "src/test/java/com/example/payment/PaymentService.java",
      "package com.example.payment;\npublic class PaymentService {}",
      "com.example.payment.PaymentService",
    );
    expect(shadow).toBe(true);
  });

  it("farkli pakette ayni sinif adi shadow DEGIL", () => {
    const notShadow = isSutShadowing(
      "src/test/java/com/example/test/PaymentService.java",
      "package com.example.test;\npublic class PaymentService {}",
      "com.example.payment.PaymentService",
    );
    expect(notShadow).toBe(false);
  });

  it("farkli sinif adi shadow DEGIL", () => {
    const different = isSutShadowing(
      "src/test/java/com/example/payment/PaymentServiceTest.java",
      "package com.example.payment;\npublic class PaymentServiceTest {}",
      "com.example.payment.PaymentService",
    );
    expect(different).toBe(false);
  });
});
