import { describe, expect, it } from "vitest";
import { buildWorkerPrompt, DEFAULT_POLICY_RULES, WORKER_ROLES, type WorkerPromptContext } from "../../src/workers/opencode/role-prompts.js";
import { AnalysisArtifactSchema, CandidateChangeSetSchema, ReviewArtifactSchema, GapAnalysisSchema } from "../../src/workers/opencode/model-schemas.js";

function context(role: WorkerPromptContext["role"]): WorkerPromptContext {
  return {role,class_name:"Ledger",package_name:"demo",class_body:"class Ledger { int total(int n) { return n < 0 ? 0 : n; } }",
    dependencies_signatures:["int total(int n)"],existing_tests_summary:[],uncovered_areas:["ODAK: total"],policy_rules:[...DEFAULT_POLICY_RULES]};
}

describe("task instructions without fixed professional identities",()=>{
  it("uses the explicit delivery instead of treating the stage label as a capability limit",()=>{
    const assignment={objective:"Create a test candidate for the specified behavior",deliverables:["Candidate changeset"],acceptance_criteria:["Use the real source"]};
    const prompts=WORKER_ROLES.map(role=>buildWorkerPrompt({...context(role),assignment,delivery_kind:"candidate"}));
    expect(new Set(prompts.map(prompt=>prompt.replace(/^Asama etiketi.*\n/gm,""))).size).toBe(1);
    for(const prompt of prompts) expect(prompt).toContain('"changes":[');
    const analysis=buildWorkerPrompt({...context("test_designer"),delivery_kind:"analysis"});
    expect(analysis).toContain("observed_behaviors");expect(analysis).not.toContain("changes[].path");
  });
  it.each(WORKER_ROLES)("gives %s an explicit objective, deliverable and acceptance criteria",role=>{
    const prompt=buildWorkerPrompt(context(role));
    expect(prompt).toContain("## Gorevin amaci");
    expect(prompt).toContain("## Beklenen teslim");
    expect(prompt).toContain("## Kabul olcutleri");
    expect(prompt).not.toMatch(/Sen bir|KOD YAZMA|sadece analiz yap/i);
    expect(prompt).toContain("analiz, tasarim, gelistirme ve inceleme");
  });

  it.each(["analyzer","reviewer","gap_analyzer"] as const)("does not force %s to return a Java changeset",role=>{
    const prompt=buildWorkerPrompt(context(role));
    expect(prompt).not.toContain("changes[].path");
    expect(prompt).not.toContain('"changes":[');
    expect(prompt).not.toContain("3 @Test");
    expect(prompt).toContain(role === "analyzer" ? "observed_behaviors" : role === "reviewer" ? "suggested_fix" : "next_strategy");
  });

  it.each(WORKER_ROLES)("returns a valid existing output-schema example for %s",role=>{
    const prompt=buildWorkerPrompt(context(role));
    const line=prompt.split("\n").find(l=>l.startsWith("Beklenen yapis: "));
    const example=JSON.parse(line!.slice("Beklenen yapis: ".length));
    const schema=role === "analyzer" ? AnalysisArtifactSchema : role === "reviewer" ? ReviewArtifactSchema : role === "gap_analyzer" ? GapAnalysisSchema : CandidateChangeSetSchema;
    expect(schema.safeParse(example).success).toBe(true);
  });

  it.each(["analyzer","reviewer","gap_analyzer"] as const)("states the actual field types to prevent incompatible structured output for %s",role=>{
    const prompt=buildWorkerPrompt(context(role));
    const line=prompt.split("\n").find(l=>l.startsWith("JSON Schema: "));
    expect(line).toBeDefined();
    const schema=JSON.parse(line!.slice("JSON Schema: ".length));
    const field=role === "analyzer" ? "observed_behaviors" : role === "reviewer" ? "findings" : "remaining_areas";
    expect(schema.properties[field].items.type).toBe(role === "reviewer" ? "object" : "string");
  });

  it("keeps generation delivery and test policy while treating focus as priority",()=>{
    const prompt=buildWorkerPrompt({...context("test_designer"),previous_candidate:"class BrokenFixture {}"});
    expect(prompt).toContain('"changes":[');
    expect(prompt).toContain("Production kaynak dosyalarini degistiremezsin.");
    expect(prompt).not.toContain("Bagimlilik imzalari (sadece bunlari kullan)");
    expect(prompt).not.toContain("baska public metot testlerini bu dosyaya ekleme");
    expect(prompt).not.toContain("Yeni test paketi tasarlama");
    expect(prompt).toContain("ODAK");
    expect(prompt).toContain("12000");
  });
});
