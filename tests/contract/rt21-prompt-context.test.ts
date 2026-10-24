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

  it("class_body 12000 karakterden uzunsa kontrollu truncation uygulanir (W01/F04: acik KESILDI isareti)", () => {
    const longBody = "a".repeat(20000);
    const prompt = buildWorkerPrompt(baseContext({ class_body: longBody }));
    const bodyIndex = prompt.indexOf("## Hedef sinifin gercek govdesi");
    expect(bodyIndex).toBeGreaterThan(0);
    const bodySection = prompt.slice(bodyIndex);
    // W01/F04: acik truncation isareti; sessiz 'birebir' iddiasi yok:
    expect(bodySection).toContain("KESILDI");
    expect(bodySection).toContain("TOPLAM 20000");
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

  it("mevcut test dosyalarini koruyan candidate kurali prompt'a gider", () => {
    const prompt = buildWorkerPrompt(baseContext({ class_body: "public class Y {}" }));
    expect(prompt).toContain("Mevcut test dosyalarini modify veya delete etme");
    expect(prompt).toContain("Yeni testleri yeni bir dosyada create et");
  });

  it("candidate modeline arac cagrisi ve tam test yolu kurallari acikca verilir", () => {
    const prompt = buildWorkerPrompt(baseContext({ class_body: "public class Y {}" }));
    expect(prompt).toContain("Tool veya arac cagrisi yapma; dosya arama/okuma isteme; yalniz verilen baglami kullan.");
    expect(prompt).toContain("changes[].path degeri mutlaka src/test/java/ ile baslamali");
    expect(prompt).toContain("path alani src/test/java/<...>.java biciminde olmali; src/test/java oneki olmadan yol gecersizdir.");
  });

  it("candidate cikti boyutu ve dogrudan JSON kurali truncation riskini azaltir", () => {
    const prompt = buildWorkerPrompt(baseContext({ class_body: "public class Y {}" }));
    expect(prompt).toContain("Tek bir kucuk test dosyasi olustur; yeni adayda en fazla 3 @Test metodu ve 160 satir yaz. Onarimda onceki testleri silme.");
    expect(prompt).toContain("Gereken davranis analizini, test tasarimini, gelistirmeyi ve son kontrolu yap");
    expect(prompt).toContain("nihai teslimi dogrudan JSON olarak ver");
    expect(prompt).toContain("new_content 12000 karakteri gecmemeli.");
    expect(prompt).toContain("Yeni test dosyasi adi mevcut test siniflarindan farkli olmali; mevcut sinif yolunu tekrar kullanma.");
  });

  it("mevcut JUnit major surumu promptta sabitlenir", () => {
    const prompt = buildWorkerPrompt(baseContext({ class_body: "public class Y {}", test_framework: "junit5" }));
    expect(prompt).toContain("Mevcut test frameworku: JUnit 5 (org.junit.jupiter.api).");
    expect(prompt).toContain("Yeni testlerde bu frameworku ve import stilini koru; baska JUnit major surumune gecme.");
  });
});
