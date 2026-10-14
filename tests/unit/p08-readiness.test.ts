/** P08/PP43: MCP, model ve Maven readiness durumlari birbirine karismaz. */
import { describe, expect, it } from "vitest";
import { evaluateMavenReadiness, evaluateWorkerReadiness } from "../../src/configuration/readiness.js";

const profile = { profile_name: "local-glm", provider_id: "litellm", model_id: "GLM-5.3-Flash-IT" };

describe("P08/PP43 readiness siniflandirmasi", () => {
  it("handshake bilgisi olmadan worker kapaliysa model NOT_READY kalir", () => {
    const result = evaluateWorkerReadiness({
      enabled: false,
      profiles: [profile],
      default_profile: "local-glm",
      configured_model: "litellm/GLM-5.3-Flash-IT",
      configured_providers: { litellm: {} },
    });
    expect(result).toMatchObject({ capability: "model", status: "NOT_READY", reason_code: "WORKER_DISABLED" });
  });

  it("profil, provider ve model birebir eslesince model READY olur", () => {
    const result = evaluateWorkerReadiness({
      enabled: true,
      profiles: [profile],
      default_profile: "local-glm",
      configured_model: "litellm/GLM-5.3-Flash-IT",
      configured_providers: { litellm: { options: { apiKey: "{env:KEY}" } } },
    });
    expect(result).toMatchObject({ capability: "model", status: "READY", evidence_level: "CONFIGURED", reason_code: null });
    expect(result.detail).not.toContain("KEY");
  });

  it("Maven/Java version probe basarisizsa executable bulunsa bile Maven NOT_READY olur", () => {
    const result = evaluateMavenReadiness({
      platform: "win32",
      executable_found: true,
      version_probe_passed: false,
      failure_reason: "MAVEN_VERSION_UNVERIFIED",
    });
    expect(result).toMatchObject({ capability: "maven", status: "NOT_READY", reason_code: "MAVEN_VERSION_UNVERIFIED" });
  });

  it("Maven READY sonucu capability probe seviyesini tasir", () => {
    const result = evaluateMavenReadiness({
      platform: "win32",
      executable_found: true,
      version_probe_passed: true,
      maven_version: "3.9.16",
      java_version: "25.0.3",
    });
    expect(result).toMatchObject({ capability: "maven", status: "READY", evidence_level: "CAPABILITY_PROBED" });
  });
});
