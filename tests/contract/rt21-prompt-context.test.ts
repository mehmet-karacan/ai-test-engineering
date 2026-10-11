/**
 * RT21 pilot prompt baglami kanit testleri (AITE-RUNTIME-ACCEPTANCE-003 v2.0).
 *
 * Bulgu (INVALID_MODEL_OUTPUT): hedef sinifin gercek govdesi prompt'ta yokken model, kaynak kodu
 * isteyen aciklama yaziyor (JSON uretemiyor; "dosya sistemi erisim araclarim yok" tarzi metin).
 * Duzeltme (10.2): generateCandidateFromWorker hedef dosyanin gercek govdesini okuyup
 * WorkerPromptContext.class_body alanina ekliyor; buildWorkerPrompt govdeyi prompt'a giriyor.
 * Govde 12000 karakter ile sinirli (buyuk siniflarda kontrollu truncation).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkerPrompt, DEFAULT_POLICY_RULES, type WorkerPromptContext } from "../../src/workers/opencode/role-prompts.js";

function baseContext(overrides?: Partial<WorkerPromptContext>): WorkerPromptContext {
  return {
    role: "test_designer",
    class_name: "HakedisHesaplaJobService",
    package_name: "SKY.report.services.quartzService",
    dependencies_signatures: [
      "public void execute() throws org.quartz.JobExecutionException",
      "public void executeAllActiveGoals()",
    ],
    existing_tests_summary: ["bilinmiyor"],
    uncovered_areas: ["Tum public yontemler: coverage olcumu yok"],
    policy_rules: [...DEFAULT_POLICY_RULES],
    ...overrides,
  };
}

describe("RT21: prompt baglaminda hedef sinifin gercek govdesi (10.2)", () => {
  it("class_body verildiginde govde prompt'ta birebir yer alir", () => {
    const body = "package SKY.report.services.quartzService;\npublic class HakedisHesaplaJobService { public void execute() { } }\n";
    const prompt = buildWorkerPrompt(baseContext({ class_body: body }));
    expect(prompt).toContain("## Hedef sinifin gercek govdesi (birebir)");
    expect(prompt).toContain(body);
  });

  it("class_body bosken govde bolumu prompt'ta yer almaz (yalan soyleyen baglam yok)", () => {
    const prompt = buildWorkerPrompt(baseContext({ class_body: "" }));
    expect(prompt).not.toContain("## Hedef sinifin gercek govdesi");
  });

  it("class_body 12000 karakterden uzunsa kontrollu truncation uygulanir", () => {
    const longBody = "a".repeat(20000);
    const prompt = buildWorkerPrompt(baseContext({ class_body: longBody }));
    const bodyIndex = prompt.indexOf("## Hedef sinifin gercek govdesi (birebir)");
    expect(bodyIndex).toBeGreaterThan(0);
    const bodySection = prompt.slice(bodyIndex);
    // govde bolumu truncation sonrasi en fazla 12000 karakter govde icerir:
    expect(bodySection.includes("a".repeat(12001))).toBe(false);
    expect(bodySection.includes("a".repeat(12000))).toBe(true);
  });

  it("govdesiz prompt kaynak kodu isteyen model davranisini tetikleyen eski bicimde degil (imza + govde birlikte)", () => {
    const body = "public class X { public int add(int a, int b) { return a + b; } }";
    const prompt = buildWorkerPrompt(baseContext({
      class_body: body,
      dependencies_signatures: ["public int add(int a, int b)"],
    }));
    // hem imza hem govde birlikte:
    expect(prompt).toContain("public int add(int a, int b)");
    expect(prompt).toContain(body);
    // govde bolumu imza bolumunden once:
    expect(prompt.indexOf("## Hedef sinifin gercek govdesi")).toBeLessThan(prompt.indexOf("## Bagimlilik imzalari"));
  });

  it("zorunlu kurallar ve cikti beklentisi korunur (govde eklense de politika degismez)", () => {
    const prompt = buildWorkerPrompt(baseContext({ class_body: "public class Y {}" }));
    for (const rule of DEFAULT_POLICY_RULES) {
      expect(prompt).toContain(`- ${rule}`);
    }
  });
});
