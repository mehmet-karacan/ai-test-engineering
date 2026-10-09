import { describe, it, expect } from "vitest";
import { evaluateMetric, evaluateTarget, compareMetrics, formatPercentDisplay } from "../../src/coverage/coverage-math.js";

describe("coverage-math", () => {
  it("%90 hedefi bps ile dogru degerlendirilmeli", () => {
    const eval90 = evaluateMetric("LINE", { covered: 90, missed: 10 }, true, 9000);
    expect(eval90.validity).toBe("OK");
    expect(eval90.basis_points).toBe(9000);
    expect(eval90.target_met).toBe(true);
  });

  it("%89.96 sonucu rounded %90 gibi gorunse de hedef saglanmamis olmali (AC21)", () => {
    const evalResult = evaluateMetric("LINE", { covered: 8996, missed: 1004 }, true, 9000);
    expect(evalResult.basis_points).toBe(8996);
    expect(evalResult.percent_display).toBe(89.96);
    expect(evalResult.target_met).toBe(false);
  });

  it("BRANCH toplam 0 ise NOT_APPLICABLE olmali, %100 yazilmamali (AC22)", () => {
    const evalResult = evaluateMetric("BRANCH", { covered: 0, missed: 0 }, true, 9000);
    expect(evalResult.validity).toBe("NOT_APPLICABLE");
    expect(evalResult.target_met).toBe(false);
    expect(evalResult.percent_display).toBeNull();
  });

  it("sayaclar negatif ise INVALID_COVERAGE_EVIDENCE olmali", () => {
    const evalResult = evaluateMetric("LINE", { covered: -5, missed: 10 }, true, 9000);
    expect(evalResult.validity).toBe("INVALID_COVERAGE_EVIDENCE");
    expect(evalResult.target_met).toBe(false);
  });

  it("sayaclar yok ise UNAVAILABLE olmali", () => {
    const evalResult = evaluateMetric("LINE", undefined, false, 9000);
    expect(evalResult.validity).toBe("UNAVAILABLE");
    expect(evalResult.target_met).toBe(false);
  });

  it("cok hedefte %100 ve %80 ortalama ile basari ilan edilmemeli (AC23)", () => {
    const target1 = evaluateTarget("t1", "com.X", [evaluateMetric("LINE", { covered: 100, missed: 0 }, true, 9000), evaluateMetric("BRANCH", { covered: 10, missed: 0 }, true, 9000)], ["LINE", "BRANCH"]);
    const target2 = evaluateTarget("t2", "com.Y", [evaluateMetric("LINE", { covered: 80, missed: 20 }, true, 9000), evaluateMetric("BRANCH", { covered: 8, missed: 2 }, true, 9000)], ["LINE", "BRANCH"]);
    expect(target1.all_required_met).toBe(true);
    expect(target2.all_required_met).toBe(false);
    const jobSuccess = target1.all_required_met && target2.all_required_met;
    expect(jobSuccess).toBe(false);
  });

  it("BRANCH UNAVAILABLE ise hedef tam saglanmis olmamali", () => {
    const targetEval = evaluateTarget("t3", "com.Z", [evaluateMetric("LINE", { covered: 95, missed: 5 }, true, 9000), evaluateMetric("BRANCH", undefined, false, 9000)], ["LINE", "BRANCH"]);
    expect(targetEval.all_required_met).toBe(false);
    expect(targetEval.validity).toBe("PARTIAL");
  });

  it("compareMetrics bps kazanci hesaplamali", () => {
    const before = { covered: 50, missed: 50 };
    const after = { covered: 70, missed: 30 };
    const result = compareMetrics(before, after, "LINE");
    expect(result.gain_bps).toBe(2000);
    expect(result.improved).toBe(true);
  });

  it("formatPercentDisplay iki ondalik gostermeli", () => {
    expect(formatPercentDisplay(8996)).toBe("89.96");
    expect(formatPercentDisplay(9000)).toBe("90.00");
  });
});
