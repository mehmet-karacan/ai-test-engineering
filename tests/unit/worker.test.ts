import { describe, it, expect } from "vitest";
import { buildWorkerPrompt, candidateTestClassName, DEFAULT_POLICY_RULES, WORKER_ROLES } from "../../src/workers/opencode/role-prompts.js";
import { defaultWorkerConfig, workerToolFlags, workerRequestBudget } from "../../src/workers/opencode/worker-config.js";
import {
  TestPlanSchema,
  CandidateChangeSetSchema,
  AnalysisArtifactSchema,
  ReviewArtifactSchema,
  GapAnalysisSchema,
  WorkerHandoffSchema,
  parseModelOutput,
  extractJsonCandidate,
} from "../../src/workers/opencode/model-schemas.js";

describe("role prompts", () => {
  it("chooses a test class name unused by baseline and accepted tests", () => {
    const first = candidateTestClassName("Service", "aaaaaaaa-1234", 1, []);
    const otherJob = candidateTestClassName("Service", "bbbbbbbb-1234", 1, []);
    expect(otherJob).not.toBe(first);
    const collision = candidateTestClassName("Service", "aaaaaaaa-1234", 1, [first]);
    expect(collision).not.toBe(first);
    expect(collision).toMatch(/^[A-Za-z][A-Za-z0-9_]*Test$/);
  });
  it("includes the full large target when the caller supplies a bounded larger context", () => {
    const body = "x".repeat(24500) + "TAIL_VALIDATION_METHOD";
    const prompt = buildWorkerPrompt({ role: "test_designer", class_name: "LargeService", package_name: "a", dependencies_signatures: [], existing_tests_summary: [], uncovered_areas: [], policy_rules: [], class_body: body }, 32768);
    expect(prompt).toContain("TAIL_VALIDATION_METHOD");
    expect(prompt).not.toContain("KESILDI");
  });
  it("dort rol tanimli olmali", () => {
    expect(WORKER_ROLES).toEqual(["analyzer", "test_designer", "reviewer", "gap_analyzer"]);
  });

  it("analyzer prompt'u kod yazma iceren olmali", () => {
    const prompt = buildWorkerPrompt({
      role: "analyzer",
      class_name: "PaymentService",
      package_name: "com.example.payment",
      dependencies_signatures: ["public BigDecimal calculateTotal(BigDecimal, int)"],
      existing_tests_summary: ["PaymentServiceTest: 3 test"],
      uncovered_areas: ["resolveStatus false/false"],
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    expect(prompt).toContain("KOD YAZMA");
    expect(prompt).toContain("PaymentService");
    expect(prompt).toContain("resolveStatus false/false");
    expect(prompt).toContain("Production kaynak dosyalarini degistiremezsin");
  });

  it("test_designer prompt'u test-only kurallari iceren olmali", () => {
    const prompt = buildWorkerPrompt({
      role: "test_designer",
      class_name: "PaymentService",
      package_name: "com.example.payment",
      dependencies_signatures: [],
      existing_tests_summary: [],
      uncovered_areas: [],
      policy_rules: [...DEFAULT_POLICY_RULES],
    });
    expect(prompt).toContain("Yalniz TEST dosyalari uret");
    expect(prompt).toContain("DEGISTIRME");
  });

  it("onceki denemeler prompt'a dahil olmali", () => {
    const prompt = buildWorkerPrompt({
      role: "test_designer",
      class_name: "X",
      package_name: "p",
      dependencies_signatures: [],
      existing_tests_summary: [],
      uncovered_areas: [],
      previous_attempts: [{ scenario: "null-girdi", result: "reddedildi", error: "compile hatasi" }],
      previous_candidate: "class PriorTest { void workingFixture() {} }",
      policy_rules: [],
    });
    expect(prompt).toContain("null-girdi");
    expect(prompt).toContain("compile hatasi");
    expect(prompt).toContain("tekrar etme");
    expect(prompt).toContain("workingFixture()");
    expect(prompt).toContain("calisan fixture");
    expect(prompt).toContain("Yalniz ODAK");
  });
});

describe("worker config", () => {
  it("bash/edit/task/web kapali olmali (AC42 hazirligi)", () => {
    const config = defaultWorkerConfig("http://127.0.0.1:14096");
    const flags = workerToolFlags(config);
    expect(flags["bash"]).toBe(false);
    expect(flags["write"]).toBe(false);
    expect(flags["edit"]).toBe(false);
    expect(flags["task"]).toBe(false);
    expect(flags["webfetch"]).toBe(false);
  });

  it("password env kaynakli olmali; config'de deger tasimaz", () => {
    const config = defaultWorkerConfig("http://127.0.0.1:14096");
    expect(config.password_source).toBe("env:OPENCODE_SERVER_PASSWORD");
    expect(JSON.stringify(config)).not.toContain("password\":");
  });

  it("model timeout'i task lease tamamlanma payindan once bitmeli", () => {
    const budget = workerRequestBudget(15 * 60_000);
    expect(budget.request_timeout_ms).toBe(14 * 60_000);
    expect(budget.task_lease_ttl_ms).toBe(15 * 60_000);
    expect(budget.task_lease_ttl_ms).toBeGreaterThan(budget.request_timeout_ms);
    expect(() => workerRequestBudget(-1)).toThrow("Worker kalan job suresi gecersiz");
  });
});

describe("model cikti semalari", () => {
  it("TestPlan gecerli senaryoyu kabul etmeli", () => {
    const result = TestPlanSchema.safeParse({
      schema_version: 1,
      scenarios: [
        { scenario_id: "s1", target_behavior: "null girdi", expected_outcome: "IllegalArgumentException", priority: "high" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("TestPlan scenario'suz reddetmeli", () => {
    const result = TestPlanSchema.safeParse({ schema_version: 1, scenarios: [] });
    expect(result.success).toBe(false);
  });

  it("CandidateChangeSet path/action zorunlu", () => {
    const result = CandidateChangeSetSchema.safeParse({
      schema_version: 1,
      changes: [{ path: "src/test/java/XTest.java", action: "create", new_content: "class XTest {}" }],
    });
    expect(result.success).toBe(true);
  });

  it("CandidateChangeSet changes bos reddetmeli", () => {
    const result = CandidateChangeSetSchema.safeParse({ schema_version: 1, changes: [] });
    expect(result.success).toBe(false);
  });

  it("GapAnalysis blocker sinifi kisitli olmali", () => {
    const good = GapAnalysisSchema.safeParse({ schema_version: 1, remaining_areas: ["x"], blocker_class: "CONFIGURATION_BARRIER" });
    const bad = GapAnalysisSchema.safeParse({ schema_version: 1, remaining_areas: ["x"], blocker_class: "BILINMEYEN_SINIF" });
    expect(good.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it("ReviewArtifact verdict kisitli olmali", () => {
    const good = ReviewArtifactSchema.safeParse({ schema_version: 1, findings: [], verdict: "accept", reason: "ok" });
    const bad = ReviewArtifactSchema.safeParse({ schema_version: 1, findings: [], verdict: "maybe", reason: "ok" });
    expect(good.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it("WorkerHandoff next_single_action zorunlu", () => {
    const bad = WorkerHandoffSchema.safeParse({ schema_version: 1, last_verified_snapshot: "s1" });
    expect(bad.success).toBe(false);
  });

  it("AnalysisArtifact minimum alanlarla kabul", () => {
    const result = AnalysisArtifactSchema.safeParse({
      schema_version: 1,
      observed_behaviors: ["calculateTotal carpma"],
      existing_test_status: "3 test var",
    });
    expect(result.success).toBe(true);
  });
});

describe("parseModelOutput", () => {
  const testPlanSchema = TestPlanSchema;

  it("kesilmis JSON reddedilmeli (INVALID_MODEL_OUTPUT)", () => {
    expect(() => parseModelOutput(testPlanSchema, '{"schema_version":1,"scenarios":[')).toThrow("INVALID_MODEL_OUTPUT");
  });

  it("schema ihlali reddedilmeli", () => {
    expect(() => parseModelOutput(testPlanSchema, '{"schema_version":2,"scenarios":[]}')).toThrow("INVALID_MODEL_OUTPUT");
  });

  it("gecerli JSON kabul edilmeli", () => {
    const plan = parseModelOutput(
      testPlanSchema,
      '{"schema_version":1,"scenarios":[{"scenario_id":"s1","target_behavior":"null","expected_outcome":"throw","priority":"high"}]}',
    );
    expect(plan.scenarios).toHaveLength(1);
  });

  it("markdown fence icindeki JSON cikarilmali", () => {
    const candidate = extractJsonCandidate('Iste plan:\n```json\n{"schema_version":1,"scenarios":[]}\n```');
    expect(candidate).toBe('{"schema_version":1,"scenarios":[]}');
  });

  it("tek ters tirnakla sarilmis JSON cikarilmali", () => {
    const candidate = extractJsonCandidate('`{"schema_version":1,"scenarios":[]}`');
    expect(candidate).toBe('{"schema_version":1,"scenarios":[]}');
  });

  it("JSON bulunamayinca hata vermeli", () => {
    expect(() => extractJsonCandidate("plan yok, ozur")).toThrow("INVALID_MODEL_OUTPUT");
  });

  it("rastgele ilk code block valid patch kabul edilmez: fence icinde JSON olmayan icerik reddedilir", () => {
    expect(() => extractJsonCandidate("```java\npublic class X {}\n```")).toThrow();
  });
});
