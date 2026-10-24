import { describe, expect, it } from "vitest";
import { resolve, sep, parse } from "node:path";
import { assertAllowedRoot } from "../../src/application/services.js";
import { defaultConfig } from "../../src/configuration/config-loader.js";

describe("allowed project root identity", () => {
  const config = defaultConfig();
  const root = resolve("allowed-project");
  it("accepts the exact root and a child", () => {
    const scoped = { ...config, allowed_project_roots: [root] };
    expect(() => assertAllowedRoot(scoped, root)).not.toThrow();
    expect(() => assertAllowedRoot(scoped, `${root}${sep}module`)).not.toThrow();
  });
  it("rejects a sibling with the same prefix", () => {
    expect(() => assertAllowedRoot({ ...config, allowed_project_roots: [root] }, `${root}-other`)).toThrow();
  });
  it("accepts canonical Windows separators and case", () => {
    const candidate = process.platform === "win32" ? root.toUpperCase().replace(/\\/g, "/") : root;
    expect(() => assertAllowedRoot({ ...config, allowed_project_roots: [root] }, candidate)).not.toThrow();
  });
  it("accepts descendants when the allowed location is a volume root", () => {
    expect(() => assertAllowedRoot({ ...config, allowed_project_roots: [parse(root).root] }, root)).not.toThrow();
  });
});
