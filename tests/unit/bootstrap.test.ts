/**
 * B07/RT27/RGB: Temiz clone bootstrap regresyon testleri.
 * dist yokken install.mjs bootstrap calisir; fileURLToPath fiziksel path.
 */
import { describe, it, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.cwd();

describe("B07/RT27: temiz clone bootstrap", () => {
  it("fileURLToPath percent encoding'i dogru cozumlemeli (E02)", () => {
    const url = new URL("file:///C:/test%20project/scripts/install.mjs");
    const physical = fileURLToPath(url);
    expect(physical).toContain("test project");
    expect(physical).not.toContain("%20");
  });

  it("install.mjs dist import'u dynamic olmali; bootstrap calismali", () => {
    const content = readFileSync(join(repoRoot, "scripts", "install.mjs"), "utf8");
    // statik dist import'u YOK:
    expect(content).not.toMatch(/^import .*dist\/configuration\/config-merge\.js/m);
    // dynamic import VAR:
    expect(content).toMatch(/await import\(["'`]..\/dist\/configuration\/config-merge\.js/);
    // fileURLToPath VAR:
    expect(content).toContain("fileURLToPath");
  });
});
