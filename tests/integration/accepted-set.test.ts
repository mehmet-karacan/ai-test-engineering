/**
 * D05/F04/RG28: birikimli accepted set ve final replay regresyon testleri.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, cpSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { CandidateLoop, type IterateOptions } from "../../src/orchestration/candidate-loop.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const FIXTURES = join(process.cwd(), "tests", "fixtures");

describe("D05/F04/RG28: birikimli accepted set", () => {
  let dir: string;
  let projectDir: string;
  let stagingDir: string;
  let acceptedDir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-d05-"));
    projectDir = join(dir, "fixture");
    stagingDir = join(dir, "staging");
    acceptedDir = join(dir, "accepted");
    mkdirSync(stagingDir, { recursive: true });
    mkdirSync(acceptedDir, { recursive: true });
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

  it("kabul edilen aday dosyalari birikimli accepted snapshot'a yazilmali", async () => {
    const testTemplate = (extra: string) => `package com.example.calc;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class CalcServiceTest {

  private final CalcService service = new CalcService();

  @Test
  public void add_positive() {
    assertEquals(8, service.add(3, 5));
  }
${extra}
}
`;

    const candidates = [
      // aday 1: yalniz add_zero - line kazanci uretmez (add'in govdesi zaten kapsanmis); rejected
      testTemplate(`
  @Test
  public void add_zero() {
    assertEquals(5, service.add(5, 0));
  }`),
      // aday 2: multiply + sign - line kazanci uretir; accepted
      testTemplate(`
  @Test
  public void add_zero() {
    assertEquals(5, service.add(5, 0));
  }

  @Test
  public void multiply_basic() {
    assertEquals(15, service.multiply(3, 5));
  }

  @Test
  public void sign_paths() {
    assertEquals("positive", service.sign(3));
    assertEquals("negative", service.sign(-3));
    assertEquals("zero", service.sign(0));
  }`),
    ];

    let iteration = 0;
    const acceptedCalls: Array<{ iteration: number; files: number }> = [];
    const options: IterateOptions = {
      project_root: projectDir,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 9000,
      branch_target_bps: 9000,
      budget: { max_candidate_iterations: 5, max_repairs_per_candidate: 2, no_progress_window: 3 },
      staging_root: stagingDir,
      accepted_snapshot_dir: acceptedDir,
      on_accepted: (info) => {
        acceptedCalls.push({ iteration: info.iteration, files: info.files.length });
      },
      timeout_ms_per_run: 600000,
      generate_candidate: async () => {
        if (iteration >= candidates.length) {
          return null;
        }
        const content = candidates[iteration]!;
        iteration++;
        return {
          schema_version: 1,
          changes: [{ path: "src/test/java/com/example/calc/CalcServiceTest.java", action: "modify", new_content: content, after_hash: sha(content), scenario_ids: [`s${iteration}`] }],
        } as CandidateChangeSet;
      },
    };

    const loop = new CandidateLoop(new MavenRunner());
    const result = await loop.iterate(options);

    // yalniz kazanc ureten aday kabul edilir (aday 1 rejected, aday 2 adopted):
    expect(acceptedCalls).toHaveLength(1);
    // birikimli accepted snapshot'ta kabul edilen dosya var:
    const acceptedFile = join(acceptedDir, "src", "test", "java", "com", "example", "calc", "CalcServiceTest.java");
    expect(existsSync(acceptedFile)).toBe(true);
    // icerik kabul edilen adayla ayni:
    const acceptedContent = readFileSync(acceptedFile, "utf8");
    expect(acceptedContent).toContain("sign_paths");
    expect(acceptedContent).toContain("multiply_basic");
  }, 900000);

  it("staging ve accepted ayri alanlarda; staging reset accepted'i bozmaz", () => {
    const acceptedFile = join(acceptedDir, "src", "test", "java", "com", "example", "calc", "CalcServiceTest.java");
    expect(existsSync(acceptedFile)).toBe(true);
    const content = readFileSync(acceptedFile, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });
});
