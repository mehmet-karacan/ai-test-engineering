import { describe, expect, it } from "vitest";
import { compareApplyTestInventory } from "../../src/application/test-apply-plan.js";
import type { SurefireSuite } from "../../src/orchestration/build-plan.js";

const suite = (module = "", names = ["ExampleTest#case"], skipped: string[] = []): SurefireSuite => ({
  module_relative_path: module, name: "ExampleTest", tests: names.length, failures: 0, errors: 0,
  skipped: skipped.length, test_names: names, skipped_test_names: skipped, failed_test_names: [],
});
describe("apply test inventory retention", () => {
  it("detects a lost invocation even when a parameterized name repeats", () => {
    const repeated = suite("", ["ExampleTest#case", "ExampleTest#case"]);
    expect(compareApplyTestInventory([repeated], [repeated], [suite()]).missing_tests).toHaveLength(1);
  });
  it("merges baseline and final references without double counting the same invocation", () => {
    expect(compareApplyTestInventory([suite()], [suite()], [suite()])).toEqual({ missing_tests: [], newly_skipped_tests: [] });
  });
  it("preserves a pre-existing skip in an unrelated module", () => {
    const other = suite("other", ["ExampleTest#case"], ["ExampleTest#case"]);
    expect(compareApplyTestInventory([suite(), other], [suite()], [suite(), other])).toEqual({ missing_tests: [], newly_skipped_tests: [] });
  });
  it("rejects skipping a previously active invocation despite a skipped final reference", () => {
    const skipped = suite("", ["ExampleTest#case"], ["ExampleTest#case"]);
    expect(compareApplyTestInventory([suite()], [skipped], [skipped]).newly_skipped_tests).toHaveLength(1);
  });
});
