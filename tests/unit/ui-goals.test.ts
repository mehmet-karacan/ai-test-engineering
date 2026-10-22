import { describe, it, expect } from "vitest";
import { TestStartInputSchema } from "../../src/domain/tool-schemas.js";

describe("local UI independent coverage goals", () => {
  const input = { project_root: "C:/project", targets: [{ selector: "a.Service", kind: "class" }], coverage: { percent: 80, branch_percent: 70 } };
  it("retains an explicit branch goal while preserving legacy common percent", () => {
    expect(TestStartInputSchema.parse(input).coverage).toMatchObject({ percent: 80, branch_percent: 70 });
    expect(TestStartInputSchema.parse({ ...input, coverage: { percent: 80 } }).coverage).toEqual({ percent: 80, metrics: ["LINE", "BRANCH"] });
  });
  it.each([-1, 101, 70.123, NaN])("rejects invalid branch percent %s", branch_percent => {
    expect(TestStartInputSchema.safeParse({ ...input, coverage: { percent: 80, branch_percent } }).success).toBe(false);
  });
  it.each([80.01, 70.01, 99.99])("accepts valid hundredth goals %s", percent => {
    expect(TestStartInputSchema.safeParse({ ...input, coverage: { percent, branch_percent: percent } }).success).toBe(true);
  });
});
