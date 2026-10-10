/**
 * FIN04/7.4: Hedef cozumleme kurallari - exact FQCN, suffix oyunu reddi, package boundary,
 * test siniflari production hedef listesine giremez, nested binary ad kimligi.
 */
import { describe, it, expect } from "vitest";
import {
  matchesClassSelector,
  matchesPackageSelector,
  matchesPackageWithSubpackages,
  filterProductionSymbols,
  resolveTargets,
  type ResolvableSymbol,
} from "../../src/discovery/target-resolver.js";

function symbol(overrides?: Partial<ResolvableSymbol>): ResolvableSymbol {
  return {
    symbol_id: "s1",
    fqn: "com.example.payment.PaymentService",
    simple_name: "PaymentService",
    package_name: "com.example.payment",
    module_relative_path: "payment-core",
    relative_path: "payment-core/src/main/java/com/example/payment/PaymentService.java",
    source_set: "main",
    kind: "class",
    ...overrides,
  };
}

describe("FIN04: class selector kurallari (7.4)", () => {
  it("exact FQCN eslesir", () => {
    expect(matchesClassSelector(symbol(), "com.example.payment.PaymentService")).toBe(true);
  });

  it("simple name exact eslesir", () => {
    expect(matchesClassSelector(symbol(), "PaymentService")).toBe(true);
  });

  it("FQCN suffix oyunu: OtherPaymentService PaymentService'i eslestirMEZ", () => {
    const other = symbol({ fqn: "com.example.payment.OtherPaymentService", simple_name: "OtherPaymentService" });
    expect(matchesClassSelector(other, "PaymentService")).toBe(false);
    expect(matchesClassSelector(other, "com.example.payment.OtherPaymentService")).toBe(true);
  });

  it("selector PaymentService iken OtherPaymentService eslesmez (suffix son-ek aramasi yasak)", () => {
    expect(matchesClassSelector(symbol(), "OtherPaymentService")).toBe(false);
  });

  it("nested binary ad $ ile source FQCN eslesir", () => {
    const nested = symbol({ fqn: "com.example.Outer.Inner", simple_name: "Inner" });
    expect(matchesClassSelector(nested, "com.example.Outer$Inner")).toBe(true);
  });
});

describe("FIN04: package boundary kurallari", () => {
  it("exact package eslesir", () => {
    expect(matchesPackageSelector(symbol(), "com.example.payment")).toBe(true);
  });

  it("son-ek oyunu: paymentOther paketi payment'i eslestirMEZ", () => {
    const other = symbol({ package_name: "com.example.paymentOther", fqn: "com.example.paymentOther.X" });
    expect(matchesPackageSelector(other, "com.example.payment")).toBe(false);
  });

  it("alt paket explicit policy ile dahil edilir (subpackages=true)", () => {
    const sub = symbol({ package_name: "com.example.payment.sub", fqn: "com.example.payment.sub.Y" });
    expect(matchesPackageSelector(sub, "com.example.payment")).toBe(false);
    expect(matchesPackageWithSubpackages(sub, "com.example.payment")).toBe(true);
  });
});

describe("FIN04: test siniflari production hedef listesine giremez", () => {
  it("test source_set filtrelenir", () => {
    const symbols = [
      symbol(),
      symbol({ symbol_id: "s2", fqn: "com.example.payment.PaymentServiceTest", simple_name: "PaymentServiceTest", source_set: "test", relative_path: "payment-core/src/test/java/com/example/payment/PaymentServiceTest.java" }),
    ];
    const production = filterProductionSymbols(symbols);
    expect(production).toHaveLength(1);
    expect(production[0]!.fqn).toBe("com.example.payment.PaymentService");
  });

  it("resolveTargets package hedefinde test siniflarini donmeZ", () => {
    const symbols = [
      symbol(),
      symbol({ symbol_id: "s2", fqn: "com.example.payment.PaymentServiceTest", simple_name: "PaymentServiceTest", source_set: "test" }),
    ];
    const result = resolveTargets(symbols, [{ selector: "com.example.payment", kind: "package" }]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]!.fqn).toBe("com.example.payment.PaymentService");
  });
});

describe("FIN04: resolveTargets tum akisi", () => {
  it("module selector canonical relative path ile exact eslesir", () => {
    const symbols = [
      symbol(),
      symbol({ symbol_id: "s2", module_relative_path: "payment-api", fqn: "com.example.api.PaymentApi", simple_name: "PaymentApi", package_name: "com.example.api" }),
    ];
    const result = resolveTargets(symbols, [{ selector: "payment-core", kind: "module" }]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]!.fqn).toBe("com.example.payment.PaymentService");
    expect(result.resolved[0]!.module_relative_path).toBe("payment-core");
  });

  it("bulunamayan hedef not_found listesine girer", () => {
    const result = resolveTargets([symbol()], [{ selector: "YokService", kind: "class" }]);
    expect(result.resolved).toHaveLength(0);
    expect(result.not_found).toContain("YokService");
  });

  it("ayni simple name farkli modullerde belirsiz; typed candidates doner", () => {
    const symbols = [
      symbol(),
      symbol({ symbol_id: "s2", module_relative_path: "other-module", relative_path: "other-module/src/main/java/com/example/payment/PaymentService.java" }),
    ];
    const result = resolveTargets(symbols, [{ selector: "PaymentService", kind: "class" }]);
    expect(result.resolved).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.candidates).toHaveLength(2);
  });

  it("subpackages=false package hedefi yalniz exact paketi alir", () => {
    const symbols = [
      symbol(),
      symbol({ symbol_id: "s3", package_name: "com.example.payment.sub", fqn: "com.example.payment.sub.Deep" }),
    ];
    const result = resolveTargets(symbols, [{ selector: "com.example.payment", kind: "package" }]);
    expect(result.resolved).toHaveLength(1);
    // subpackages=true ile alt paket de gelir:
    const withSub = resolveTargets(symbols, [{ selector: "com.example.payment", kind: "package", subpackages: true }]);
    expect(withSub.resolved).toHaveLength(2);
  });
});
