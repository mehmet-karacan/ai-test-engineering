import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
describe.skipIf(!process.env.AITEST_BROWSER_PACKAGES)("local UI real Chromium acceptance", () => {
  it("covers project/scan/selection/threshold/start/status/report/history/refresh/mobile and stale responses", () => {
    const result = spawnSync(process.execPath, ["scripts/local-ui-browser-smoke.mjs"], { encoding: "utf8", timeout: 90000, windowsHide: true });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('"workflow":"PASS"');
  }, 95000);
});
