/**
 * FIN06: Coverage evaluator, birikimli accepted set ve final replay kurallari.
 * - Branch-only kazanci kabul edilir (RT08); diger hedef dusukse genel basari verilmez (ortalama yok).
 * - Reddedilen son aday XML'i final'e giremez; stale/forged rapor kabul edilmez (RT10).
 * - A kabul, B kabul, C red: final A+B; C yok (RT11/12.3).
 * - LINE ayni, BRANCH artiyorsa anlamli kazanc (12.2).
 */
import { describe, it, expect } from "vitest";
import { evaluateMetric, evaluateTarget, compareMetrics } from "../../src/coverage/coverage-math.js";
import { basisPointsFrom, readCoverageAfterRun } from "../../src/orchestration/candidate-loop.js";

describe("FIN06: branch-only kazanc (RT08)", () => {
  it("LINE ayni, BRANCH artiyorsa anlamli coverage kazanci", () => {
    const beforeBranch = { covered: 40, missed: 60 };
    const afterBranch = { covered: 95, missed: 5 };
    const result = compareMetrics(beforeBranch, afterBranch, "BRANCH");
    expect(result.improved).toBe(true);
    expect(result.gain_bps).toBeGreaterThan(0);
  });

  it("LINE ayni kalirken BRANCH-only kazanc compareMetrics ile dogrulanir", () => {
    const lineBefore = { covered: 50, missed: 50 };
    const lineAfter = { covered: 50, missed: 50 };
    const lineResult = compareMetrics(lineBefore, lineAfter, "LINE");
    expect(lineResult.improved).toBe(false);
    const branchResult = compareMetrics({ covered: 40, missed: 60 }, { covered: 95, missed: 5 }, "BRANCH");
    expect(branchResult.improved).toBe(true);
  });
});

describe("FIN06: iki-metrik karar (RT07/PRO05)", () => {
  it("LINE=95, BRANCH=40 hedef90: hedef saglanmadi (ortalama ile gizlenemez)", () => {
    const line = evaluateMetric("LINE", { covered: 95, missed: 5 }, true, 9000);
    const branch = evaluateMetric("BRANCH", { covered: 40, missed: 60 }, true, 9000);
    const target = evaluateTarget("t1", "com.X", [line, branch], ["LINE", "BRANCH"]);
    expect(line.target_met).toBe(true);
    expect(branch.target_met).toBe(false);
    expect(target.all_required_met).toBe(false);
  });

  it("LINE=94, BRANCH=92 hedef90: her iki metrik saglanir", () => {
    const line = evaluateMetric("LINE", { covered: 94, missed: 6 }, true, 9000);
    const branch = evaluateMetric("BRANCH", { covered: 92, missed: 8 }, true, 9000);
    const target = evaluateTarget("t1", "com.X", [line, branch], ["LINE", "BRANCH"]);
    expect(target.all_required_met).toBe(true);
  });

  it("LINE=92, BRANCH=88 hedef90: hedef saglanmadi (ikisi de 90 istendiyse)", () => {
    const line = evaluateMetric("LINE", { covered: 92, missed: 8 }, true, 9000);
    const branch = evaluateMetric("BRANCH", { covered: 88, missed: 12 }, true, 9000);
    const target = evaluateTarget("t1", "com.X", [line, branch], ["LINE", "BRANCH"]);
    expect(target.all_required_met).toBe(false);
  });

  it("branch total0 N/A: hedef evaluator NOT_APPLICABLE + target_met false; sahte %100 yok", () => {
    const branch = evaluateMetric("BRANCH", { covered: 0, missed: 0 }, true, 9000);
    expect(branch.validity).toBe("NOT_APPLICABLE");
    expect(branch.target_met).toBe(false);
    expect(branch.percent_display).toBeNull();
  });
});

describe("FIN06: basisPointsFrom tam sayi kurallari", () => {
  it("ham tam sayaclarla bps hesaplanir; yuvarlama sahte %90 uretmez", () => {
    expect(basisPointsFrom({ covered: 8996, missed: 1004 })).toBe(8996);
    expect(basisPointsFrom({ covered: 90, missed: 10 })).toBe(9000);
  });

  it("bos sayac null doner; 0 yazilmaz", () => {
    expect(basisPointsFrom(undefined)).toBeNull();
    expect(basisPointsFrom({ covered: 0, missed: 0 })).toBeNull();
  });
});

describe("FIN06: final replay kaynak kurallari (RT10/12.4)", () => {
  it("coverage dosyasi yoksa readCoverageAfterRun undefined doner; final bu veriyle karar uretmez", () => {
    const dir = mkdtempSyncSafe("aitest-fin06-");
    try {
      const result = readCoverageAfterRun(dir, "com.example.None");
      expect(result).toBeUndefined();
    } finally {
      rmSyncSafe(dir);
    }
  });
});

function mkdtempSyncSafe(prefix: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require("node:path") as typeof import("node:path");
  return mkdtempSync(join(tmpdir(), prefix));
}

function rmSyncSafe(dir: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rmSync } = require("node:fs") as typeof import("node:fs");
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // Windows dosya kilidi
  }
}
