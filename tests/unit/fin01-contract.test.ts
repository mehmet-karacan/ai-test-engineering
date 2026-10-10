/**
 * FIN01: Immutable JobContract, model kimligi birebir, config guvenlik katmani testleri.
 * Kanit seviyesi: UNIT. Zorunlu cikis: typed schema/precedence/idempotency, immutable execution contract.
 */
import { describe, it, expect } from "vitest";
import {
  buildJobContract,
  assertContractImmutable,
  ContractConflictError,
  contractDigest,
  assertExactModelIdentity,
  type JobContract,
} from "../../src/domain/job-contract.js";
import {
  findSuspiciousKeys,
  buildSecretFreeConfigSnapshot,
  sanitizeRemoteUrl,
} from "../../src/configuration/config-security.js";

function validContractInput(overrides?: Partial<Parameters<typeof buildJobContract>[0]>) {
  return {
    job_id: "11111111-1111-4111-8111-111111111111",
    project_id: "22222222-2222-4222-8222-222222222222",
    location_id: "33333333-3333-4333-8333-333333333333",
    canonical_root: "C:/prj/fixture",
    request_digest: "a".repeat(64),
    idempotency_key: null,
    source_snapshot_digest: "b".repeat(64),
    resolved_targets: [
      { selector: "PaymentService", kind: "class" as const, resolved_fqn: "com.example.PaymentService", line_target_bps: 9000, branch_target_bps: 9000 },
    ],
    runner_kind: "docker" as const,
    model_profile: { provider_id: "litellm", model_id: "glm-4.7" },
    policy_digest: null,
    config_digest: "c".repeat(64),
    config_schema_version: 1,
    budget: { max_candidate_iterations: 20, max_repairs_per_candidate: 2, no_progress_window: 3, total_job_minutes: 120 },
    parent_contract_digest: null,
    revision: 1,
    ...overrides,
  };
}

describe("FIN01: immutable JobContract", () => {
  it("bos hedef listesiyle contract kurulamaz", () => {
    expect(() => buildJobContract(validContractInput({ resolved_targets: [] }))).toThrow();
  });

  it("contract olusturulur; scope TEST_ONLY ve schema_version sabit", () => {
    const contract = buildJobContract(validContractInput());
    expect(contract.scope).toBe("TEST_ONLY");
    expect(contract.schema_version).toBe(1);
    expect(contract.resolved_targets).toHaveLength(1);
  });

  it("sonradan gelen input immutable alanlari sessizce degistiremez (CONTRACT_CONFLICT)", () => {
    const existing: JobContract = buildJobContract(validContractInput());
    const incoming = buildJobContract(validContractInput({ revision: 2 }));
    // revision immutable degil; ayni kaynaklarla degisim yok:
    expect(() => assertContractImmutable(existing, incoming)).not.toThrow();
    // hedef esigi degistiginde conflict:
    const tampered = buildJobContract(validContractInput({
      resolved_targets: [
        { selector: "PaymentService", kind: "class", resolved_fqn: "com.example.PaymentService", line_target_bps: 5000, branch_target_bps: 9000 },
      ],
    }));
    expect(() => assertContractImmutable(existing, tampered)).toThrow(ContractConflictError);
    try {
      assertContractImmutable(existing, tampered);
    } catch (error) {
      expect((error as ContractConflictError).fields).toContain("resolved_targets");
    }
  });

  it("canonical_root degisimi CONTRACT_CONFLICT uretir (ayni job ID baska root ile eslestirilemez)", () => {
    const existing = buildJobContract(validContractInput());
    const tampered = buildJobContract(validContractInput({ canonical_root: "C:/prj/other" }));
    expect(() => assertContractImmutable(existing, tampered)).toThrow(ContractConflictError);
  });

  it("contract digest ayni kaynakla ayni; created_at/revision digest'i etkilemez", () => {
    const first = buildJobContract(validContractInput(), 1000);
    const second = buildJobContract(validContractInput(), 2000);
    expect(contractDigest(first)).toBe(contractDigest(second));
  });

  it("contract digest kaynak degisince degisir", () => {
    const first = buildJobContract(validContractInput());
    const second = buildJobContract(validContractInput({ canonical_root: "C:/prj/other" }));
    expect(contractDigest(first)).not.toBe(contractDigest(second));
  });
});

describe("FIN01: model kimligi birebir (6.1)", () => {
  it("birebir provider/model kabul edilir", () => {
    expect(() => assertExactModelIdentity("litellm", "glm-4.7")).not.toThrow();
  });

  it("bosluklu kimlik duzeltilmeden reddedilir (duzeltme yok)", () => {
    expect(() => assertExactModelIdentity("litellm", " glm-4.7")).toThrow();
    expect(() => assertExactModelIdentity("litellm ", "glm-4.7")).toThrow();
  });

  it("bos kimlik reddedilir", () => {
    expect(() => assertExactModelIdentity("", "glm-4.7")).toThrow();
    expect(() => assertExactModelIdentity("litellm", "")).toThrow();
  });
});

describe("FIN01: config guvenlik katmani (6.1)", () => {
  it("trailing-space anahtar supheli tespit edilir; normalize edilen anahtarla karismaz", () => {
    const config = {
      model: "x",
      "reasoning_effort ": "max",
      nested: { "bad key ": 1 },
    };
    const findings = findSuspiciousKeys(config);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.key).toBe("reasoning_effort ");
    expect(findings[0]!.normalized_key).toBe("reasoning_effort");
  });

  it("temiz config supheli anahtar uretmez", () => {
    expect(findSuspiciousKeys({ model: "x", reasoning_effort: "max" })).toHaveLength(0);
  });

  it("secretsiz config snapshot deterministic digest uretir; secret degeri tasimaz", () => {
    const config = {
      schema_version: 1,
      budgets: { max_candidate_iterations: 20 },
      coverage_defaults: { metrics: ["LINE", "BRANCH"] },
      worker_profiles: [{ profile_name: "p", provider_id: "litellm", model_id: "glm", secret_reference_names: ["env:KEY"] }],
      allowed_project_roots: [],
      storage: { root: "C:/tmp/store" },
    };
    const first = buildSecretFreeConfigSnapshot(config);
    const second = buildSecretFreeConfigSnapshot(config);
    expect(first.digest).toBe(second.digest);
    expect(JSON.stringify(first.snapshot)).not.toContain("C:/tmp/store");
    expect(JSON.stringify(first.snapshot)).not.toContain("sk-");
  });

  it("farkli config farkli digest uretir (job politikalari sonradan sessiz degismez)", () => {
    const first = buildSecretFreeConfigSnapshot({
      schema_version: 1,
      budgets: { max_candidate_iterations: 20 },
      coverage_defaults: { metrics: ["LINE"] },
      worker_profiles: [],
      allowed_project_roots: [],
      storage: { root: "C:/tmp/store" },
    });
    const second = buildSecretFreeConfigSnapshot({
      schema_version: 1,
      budgets: { max_candidate_iterations: 30 },
      coverage_defaults: { metrics: ["LINE"] },
      worker_profiles: [],
      allowed_project_roots: [],
      storage: { root: "C:/tmp/store" },
    });
    expect(first.digest).not.toBe(second.digest);
  });
});

describe("FIN01: remote credential temizligi (7.1)", () => {
  it("https URL credential'i temizlenir", () => {
    expect(sanitizeRemoteUrl("https://user:ghp_token123@github.com/org/repo.git")).toBe("https://github.com/org/repo.git");
  });

  it("scp formati korunur; kullanici adi temizlenmez format bozulmaz", () => {
    expect(sanitizeRemoteUrl("git@github.com:org/repo.git")).toBe("git@github.com:org/repo.git");
  });

  it("credential'siz URL aynen kalir", () => {
    expect(sanitizeRemoteUrl("https://github.com/org/repo.git")).toBe("https://github.com/org/repo.git");
  });
});
