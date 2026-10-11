/**
 * W04 kabul testleri (F10, N26-N27): tek evaluator kazanc karari.
 * - N26: branch-only kazanc kabul edilir; LINE ayni + BRANCH artmis -> adopted.
 * - N26: LINE artarken BRANCH gerileyen aday koruma kuralina takilir (red).
 * - N27: branch total=0 NOT_APPLICABLE; kayip veri UNAVAILABLE; otomatik basari yok.
 * - N28: kesin esik: 89.96 bps hedef 90 altinda -> met.
 */
import { describe, it, expect } from "vitest";
import { evaluateCandidateGain } from "../../src/orchestration/candidate-loop.js";
import { evaluateMetric, evaluateTarget } from "../../src/coverage/coverage-math.js";

describe("W04/F10/N26: tek evaluator kazanc karari", () => {
  it("branch-only kazanc kabul edilir (LINE ayni, BRANCH artmis)", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: 2000 },
      { line: 5000, branch: 4000 },
      true,
    );
    expect(gain.accepted).toBe(true);
    expect(gain.line_improved).toBe(false);
    expect(gain.branch_improved).toBe(true);
    expect(gain.reason).toContain("BRANCH artti");
  });

  it("LINE ayni + BRANCH ayni: kabul edilmez (kazanc yok)", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: 2000 },
      { line: 5000, branch: 2000 },
      true,
    );
    expect(gain.accepted).toBe(false);
    expect(gain.reason).toContain("kazanc yok");
  });

  it("LINE artarken BRANCH gerileyen aday koruma kuralina takilir", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: 4000 },
      { line: 6000, branch: 3000 },
      true,
    );
    expect(gain.accepted).toBe(false);
    expect(gain.line_regressed).toBe(false);
    expect(gain.branch_regressed).toBe(true);
    expect(gain.reason).toContain("BRANCH geriledi");
  });

  it("LINE gerileyen aday red edilir (BRANCH artsalar bile)", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: 2000 },
      { line: 4000, branch: 5000 },
      true,
    );
    expect(gain.accepted).toBe(false);
    expect(gain.line_regressed).toBe(true);
    expect(gain.reason).toContain("LINE geriledi");
  });

  it("branch non-applicable: yalniz LINE kazanci yeterli", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: null },
      { line: 6000, branch: null },
      false,
    );
    expect(gain.accepted).toBe(true);
    expect(gain.reason).toContain("non-applicable");
  });

  it("LINE olcumu yok: kabul edilmez (N27 kayip veri)", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: 2000 },
      { line: null, branch: 4000 },
      true,
    );
    expect(gain.accepted).toBe(false);
    expect(gain.reason).toContain("LINE olcumu yok");
  });

  it("BRANCH hedefi isteniyorsa kayip branch kaniti LINE artisini kabul ettirmez", () => {
    const gain = evaluateCandidateGain(
      { line: 5000, branch: null },
      { line: 6000, branch: null },
      true,
    );
    expect(gain.accepted).toBe(false);
    expect(gain.reason).toContain("BRANCH olcumu yok");
  });
});

describe("W04/F10/N27-N28: coverage metrik ayrisimi (tek evaluator)", () => {
  it("branch total=0 gercek counter ile NOT_APPLICABLE; kayip veri UNAVAILABLE", () => {
    // dal yok: total=0 -> NOT_APPLICABLE
    const noBranch = evaluateMetric("BRANCH", { covered: 0, missed: 0 }, true, 4000);
    expect(noBranch.validity).toBe("NOT_APPLICABLE");
    expect(noBranch.target_met).toBe(false);
    // veri yok: counter undefined -> UNAVAILABLE (0 ile ortulmez)
    const missing = evaluateMetric("BRANCH", undefined, false, 4000);
    expect(missing.validity).toBe("UNAVAILABLE");
    expect(missing.covered).toBe(0);
    expect(missing.percent_display).toBeNull();
  });

  it("kesin esik: %89.96 hedef 90 altinda -> met=false (yuvarlama sonucu etkilemez)", () => {
    // 8996 bps = %89.96; hedef 9000 bps = %90
    const eval89_96 = evaluateMetric("LINE", { covered: 8996, missed: 1004 }, true, 9000);
    expect(eval89_96.basis_points).toBe(8996);
    expect(eval89_96.percent_display).toBe(89.96);
    expect(eval89_96.target_met).toBe(false);
    // 9000 bps tam esik: met
    const eval90 = evaluateMetric("LINE", { covered: 9000, missed: 1000 }, true, 9000);
    expect(eval90.target_met).toBe(true);
  });

  it("raw counter agirlikli toplama: sinif ortalamasi degil ham toplam", () => {
    // iki hedef: 90% (900/1000) ve 50% (500/1000); ortalamasi %70 degil, toplam 1400/2000 = %70
    // ama 10% (10/100) + 90% (900/1000): agirlikli 910/1100 = %82.7; ortalamasi %50 olurdu
    const agg = evaluateMetric("LINE", { covered: 910, missed: 190 }, true, 8000);
    expect(agg.basis_points).toBe(Math.floor((910 * 10000) / 1100));
    expect(agg.target_met).toBe(910 * 10000 >= 8000 * 1100);
  });

  it("evaluateTarget: tum applicable hedefler required; LINE+BRANCH birlikte", () => {
    const line = evaluateMetric("LINE", { covered: 9500, missed: 500 }, true, 9000);
    const branch = evaluateMetric("BRANCH", { covered: 4500, missed: 5500 }, true, 4000);
    const target = evaluateTarget("t1", "com.example.X", [line, branch], ["LINE", "BRANCH"]);
    expect(target.all_required_met).toBe(true);
    expect(target.validity).toBe("OK");
    // branch hedefi saglanmiyor:
    const branchLow = evaluateMetric("BRANCH", { covered: 3000, missed: 7000 }, true, 4000);
    const targetLow = evaluateTarget("t2", "com.example.X", [line, branchLow], ["LINE", "BRANCH"]);
    expect(targetLow.all_required_met).toBe(false);
  });

  it("tum istenen metrikler N/A ise otomatik basari yok (N27)", () => {
    const lineNA = evaluateMetric("LINE", { covered: 0, missed: 0 }, true, 9000);
    const branchNA = evaluateMetric("BRANCH", { covered: 0, missed: 0 }, true, 4000);
    expect(lineNA.validity).toBe("NOT_APPLICABLE");
    expect(branchNA.validity).toBe("NOT_APPLICABLE");
    const target = evaluateTarget("t3", "com.example.Empty", [lineNA, branchNA], ["LINE", "BRANCH"]);
    expect(target.all_required_met).toBe(false);
    expect(target.validity).toBe("PARTIAL");
  });

  it("gecerli LINE hedefi, total=0 BRANCH ile birlikte basari sayilabilir", () => {
    const line = evaluateMetric("LINE", { covered: 95, missed: 5 }, true, 9000);
    const branchNA = evaluateMetric("BRANCH", { covered: 0, missed: 0 }, true, 4000);
    const target = evaluateTarget("t4", "com.example.NoBranch", [line, branchNA], ["LINE", "BRANCH"]);
    expect(target.all_required_met).toBe(true);
    expect(branchNA.validity).toBe("NOT_APPLICABLE");
  });
});
