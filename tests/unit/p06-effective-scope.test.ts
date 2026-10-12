import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildPlan } from "../../src/orchestration/build-plan.js";
import { AppError } from "../../src/domain/errors.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("P06-B2 effective Maven affected-module scope", () => {
  it("cok modullu reactor'da -pl/-am gercek coverage komutuna tasinir", () => {
    const plan = buildPlan(join(FIXTURES, "java21-multi-module"), ["app"]);

    expect(plan.affected_modules).toEqual(["app"]);
    expect(plan.maven_goals_build).toEqual(["-pl", "app", "-am", "test-compile"]);
    expect(plan.maven_goals_test).toEqual(["-pl", "app", "-am", "test"]);
    expect(plan.maven_goals_coverage).toEqual(["-pl", "app", "-am", "test", "jacoco:report"]);
  });

  it("Windows path ayiracini normalize eder ve duplicate scope'u tekilleştirir", () => {
    const plan = buildPlan(join(FIXTURES, "java21-multi-module"), ["app\\", "app", "core"]);

    expect(plan.affected_modules).toEqual(["app", "core"]);
    expect(plan.maven_goals_test).toEqual(["-pl", "app,core", "-am", "test"]);
  });

  it("reactor disi affected module'u typed blocker ile reddeder", () => {
    try {
      buildPlan(join(FIXTURES, "java21-multi-module"), ["missing-module"]);
      throw new Error("AFFECTED_MODULE_UNKNOWN bekleniyordu");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("BLOCKED_TARGET_RESOLUTION");
      expect((error as AppError).details?.reason_code).toBe("AFFECTED_MODULE_UNKNOWN");
    }
  });

  it("tek modullu projede gereksiz -pl/-am eklemez", () => {
    const plan = buildPlan(join(FIXTURES, "sample-maven-project"), [""]);

    expect(plan.maven_goals_coverage).toEqual(["test", "jacoco:report"]);
  });
});
