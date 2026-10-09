/**
 * D03/F05/F06 regresyon testleri: fail-closed runner, canonical path containment, supervisor semantigi.
 */
import { describe, it, expect } from "vitest";
import { FailClosedRunner, assertProcessFullyTerminated } from "../../src/runners/failclosed-runner.js";
import { PolicyGuard } from "../../src/policies/policy-guard.js";

describe("D03/F05: fail-closed runner", () => {
  it("capability dogrulanmamis run ACCEPT ETMEZ (BLOCKED_ISOLATION)", async () => {
    const runner = new FailClosedRunner({ kind: "docker", verified: false, verified_at: null, preflight: null });
    await expect(runner.run({ customer_job: true })).rejects.toThrow();
    try {
      await runner.run({ customer_job: true });
    } catch (error) {
      expect((error as { code?: string }).code).toBe("BLOCKED_ISOLATION");
      expect((error as { details?: { reason_code?: string } }).details?.reason_code).toBe("CAPABILITY_UNVERIFIED");
    }
  });

  it("host_dev_only runner customer job'da KULLANILAMAZ", async () => {
    const runner = new FailClosedRunner({ kind: "host_dev_only", verified: true, verified_at: Date.now(), preflight: null });
    try {
      await runner.run({ customer_job: true });
    } catch (error) {
      expect((error as { details?: { reason_code?: string } }).details?.reason_code).toBe("HOST_RUNNER_CUSTOMER_FORBIDDEN");
    }
  });

  it("host_dev_only + urunun gelistirme testi (customer_job: false) kullanilabilir", async () => {
    const runner = new FailClosedRunner({ kind: "host_dev_only", verified: true, verified_at: Date.now(), preflight: null });
    await expect(runner.run({ customer_job: false })).rejects.toThrow("somut run uygulamasI yok");
  });
});

describe("D03/F06: canonical path containment", () => {
  const guard = new PolicyGuard("C:/proj", [{ module_relative_path: "", test_root: "src/test/java" }]);

  it("src/test/java/../../../README.md RED EDILMELI (test root disina canonical yazi)", () => {
    const decision = guard.checkPath("src/test/java/../../../README.md");
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("NOT_TEST_ROOT");
  });

  it("src/test/java/../../pom.xml RED EDILMELI (POM + canonical test root disi)", () => {
    const decision = guard.checkPath("src/test/java/../../pom.xml");
    expect(decision.allowed).toBe(false);
  });

  it("src/test/java/com/XTest.java izinli", () => {
    expect(guard.checkPath("src/test/java/com/XTest.java").allowed).toBe(true);
  });

  it("src/test/java/../X.java RED EDILMELI (test root disi)", () => {
    expect(guard.checkPath("src/test/java/../X.java").allowed).toBe(false);
  });
});

describe("D03/F05: supervisor semantigi", () => {
  it("exit -1 ile BASARI SAYILMAZ (process beklenmeden sonlandi)", () => {
    expect(() => assertProcessFullyTerminated({ exit_code: -1, stdout_complete: true, stderr_complete: true }, "test")).toThrow();
  });

  it("stdout/stderr tamamlanmadiysa sonuc READY OLMAMALI", () => {
    expect(() => assertProcessFullyTerminated({ exit_code: 0, stdout_complete: true, stderr_complete: false }, "test")).toThrow();
  });

  it("tamamlanmis kosu gecer", () => {
    expect(() => assertProcessFullyTerminated({ exit_code: 0, stdout_complete: true, stderr_complete: true }, "test")).not.toThrow();
  });
});
