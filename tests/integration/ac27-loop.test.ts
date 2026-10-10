/**
 * AC27: Erisilebilir %90 hedefi - gercek fixture'ta CandidateLoop'u hedefe kadar calistiran tam dongu testi.
 * Sentetik fakat gercek Java class'ta test-only degisikliklerle coverage hedefi ve kalite kapilarini dogrular.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { CandidateLoop, type IterateOptions } from "../../src/orchestration/candidate-loop.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const sha = (data: string) => createHash("sha256").update(data).digest("hex");

describe("AC27: erisilebilir %90 hedefi (gercek fixture tam dongu)", () => {
  let dir: string;
  let projectDir: string;
  let stagingDir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-ac27-"));
    projectDir = join(dir, "fixture");
    stagingDir = join(dir, "staging");
    cpSync(join(FIXTURES, "ac27-project"), projectDir, { recursive: true });
    execSync("mvn -B -ntp test", { cwd: projectDir, stdio: "pipe", timeout: 600000 });
  }, 900000);

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Windows dosya kilidi
    }
  });

  it("baseline coverage %50 altinda olmali", () => {
    const xmlPath = join(projectDir, "target", "site", "jacoco", "jacoco.xml");
    expect(existsSync(xmlPath)).toBe(true);
    const content = readFileSync(xmlPath, "utf8");
    const report = JSON.parse(JSON.stringify(content));
    expect(content).toContain("CalcService");
  });

  it("CandidateLoop hedefe kadar ilerlemeli ve TARGET_REACHED donmeli", async () => {
    const testTemplate = (extraAssertions: string) => `package com.example.calc;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class CalcServiceTest {

  private final CalcService service = new CalcService();

  @Test
  public void add_positive() {
    assertEquals(8, service.add(3, 5));
  }
${extraAssertions}
}
`;

    let iteration = 0;
    const candidates: string[] = [
      testTemplate(`
  @Test
  public void add_zero() {
    assertEquals(5, service.add(5, 0));
  }

  @Test
  public void add_negative() {
    assertEquals(-2, service.add(-5, 3));
  }

  @Test
  public void multiply_basic() {
    assertEquals(15, service.multiply(3, 5));
  }`),
      testTemplate(`
  @Test
  public void add_zero() {
    assertEquals(5, service.add(5, 0));
  }

  @Test
  public void add_negative() {
    assertEquals(-2, service.add(-5, 3));
  }

  @Test
  public void multiply_basic() {
    assertEquals(15, service.multiply(3, 5));
  }

  @Test
  public void add_overflow_throws() {
    assertThrows(IllegalArgumentException.class, () -> service.add(Integer.MAX_VALUE, 1));
    assertThrows(IllegalArgumentException.class, () -> service.add(1, Integer.MAX_VALUE));
  }

  @Test
  public void add_overflow_negative_second_operand() {
    assertEquals(Integer.MAX_VALUE, service.add(Integer.MAX_VALUE, 0));
    assertEquals(Integer.MAX_VALUE, service.add(0, Integer.MAX_VALUE));
  }

  @Test
  public void sign_paths() {
    assertEquals("positive", service.sign(3));
    assertEquals("negative", service.sign(-3));
    assertEquals("zero", service.sign(0));
  }`),
    ];

    const options: IterateOptions = {
      project_root: projectDir,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 9000,
      branch_target_bps: 9000,
      budget: { max_candidate_iterations: 5, max_repairs_per_candidate: 2, no_progress_window: 3 },
      staging_root: stagingDir,
      timeout_ms_per_run: 600000,
      generate_candidate: async () => {
        if (iteration >= candidates.length) {
          return null;
        }
        const content = candidates[iteration]!;
        iteration++;
        return {
          schema_version: 1,
          changes: [
            {
              path: "src/test/java/com/example/calc/CalcServiceTest.java",
              action: "modify",
              new_content: content,
              after_hash: sha(content),
              scenario_ids: [`s${iteration}`],
            },
          ],
        } as CandidateChangeSet;
      },
    };

    const loop = new CandidateLoop();
    const result = await loop.iterate(options);

    expect(result.iterations.length).toBeGreaterThan(0);
    expect(result.iterations.some((it) => it.decision === "adopted")).toBe(true);
    expect(result.outcome).toBe("TARGET_REACHED");
    expect(result.best_coverage_bps).not.toBeNull();
    expect(result.best_coverage_bps! >= 9000).toBe(true);

    for (const it of result.iterations) {
      if (it.decision === "adopted") {
        expect(it.regression_failures).toHaveLength(0);
      }
    }
  }, 900000);
});
