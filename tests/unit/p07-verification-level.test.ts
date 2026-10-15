import { describe, expect, it } from "vitest";
import { verificationLevelForReport } from "../../src/domain/job-state.js";

describe("P07 terminal verification projection", () => {
  it("tamamlanmis final replay'i affected scope olarak yansitir", () => {
    expect(verificationLevelForReport("TARGET_REACHED")).toBe("AFFECTED_SCOPE");
    expect(verificationLevelForReport("TARGET_ALREADY_MET")).toBe("AFFECTED_SCOPE");
    expect(verificationLevelForReport("TARGET_NOT_MET_PLATEAU")).toBe("AFFECTED_SCOPE");
    expect(verificationLevelForReport("TARGET_NOT_MET_BUDGET")).toBe("AFFECTED_SCOPE");
    expect(verificationLevelForReport("TARGET_NOT_MET_BLOCKED")).toBe("AFFECTED_SCOPE");
  });

  it("eksik final evidence veya typed blocker'i unverified birakir", () => {
    expect(verificationLevelForReport("FINAL_VERIFICATION_FAILED")).toBe("UNVERIFIED");
    expect(verificationLevelForReport("INVALID_COVERAGE_EVIDENCE")).toBe("UNVERIFIED");
    expect(verificationLevelForReport("BLOCKED_ENVIRONMENT")).toBe("UNVERIFIED");
  });
});
