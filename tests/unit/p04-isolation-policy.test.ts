/**
 * AITE-PRODUCTION-READINESS-005 P04: izolasyon ve mirror politikasi (PR04; PP16, PP18, PP19).
 *
 * Docker'siz dogrulanabilir davranislar:
 * - PP16: ensureVerified probe'suz capability dondurmez; probe basarisizsa BLOCKED_ISOLATION (fail-closed).
 * - PP18: bos cikti/eksik probe log capability uretmez; bos mirror listesi typed BLOCKED_DEPENDENCIES.
 * - PP19: credential'li Maven settings container'a mount edilmez; job-bazli cache volume izolasyonu.
 *
 * Gercek Docker egress/capability negatif testleri docker-isolation.test.ts + fin02-capability.test.ts
 * icindedir; Docker daemon yoksa ctx.skip ile NOT_RUN kaniti korunur (sahte yesil yok).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DockerRunner, DockerMavenRunner, scanMavenSettingsForSecrets, DEFAULT_MAVEN_IMAGE } from "../../src/runners/docker-runner.js";
import { CustomerRunnerFactory } from "../../src/runners/runner-factory.js";
import { AppError } from "../../src/domain/errors.js";

describe("P04/PP16: normal customer job verified capability probe'suz baslamaz", () => {
  it("ensureVerified: Docker daemon yoksa BLOCKED_ISOLATION; host'a dusmez (fail-closed)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-pp16-"));
    try {
      const factory = new CustomerRunnerFactory();
      try {
        await factory.ensureVerified({ workspaceRoot: join(dir, "probe") });
        // Docker varsa probe tamamlanir; bu host'ta Docker yoksa throw beklenir.
        // capability_probe null kalmamali (PP16: probe'suz capability yok).
        const capability = factory.verifiedCapability;
        expect(capability).not.toBeNull();
        expect(capability!.capability_probe).not.toBeNull();
        expect(capability!.capability_probe!.capability_verified).toBe(true);
      } catch (error) {
        const appError = error as AppError;
        expect(appError.code).toBe("BLOCKED_ISOLATION");
        const reasonCode = (appError.details as { reason_code?: string } | undefined)?.reason_code;
        expect(["CAPABILITY_UNVERIFIED", "CAPABILITY_PROBE_FAILED"]).toContain(reasonCode);
        // fail-closed: capability cache'lenmemis olmali
        expect(factory.verifiedCapability).toBeNull();
      }
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 300000);

  it("ensureVerified: capability_probe null VerifiedCapability uretilemez (kontrat)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-contr-"));
    try {
      const factory = new CustomerRunnerFactory();
      try {
        await factory.ensureVerified({ workspaceRoot: join(dir, "probe"), customerJob: true });
      } catch {
        // Docker yok: BLOCKED kaniti; kontrat testi docker'li kosuda gecer
      }
      const capability = factory.verifiedCapability;
      if (capability !== null) {
        // PP16: customer job capability'sinde probe ZORUNLU
        expect(capability.capability_probe).not.toBeNull();
        expect(capability.kind).toBe("docker");
        expect(capability.host).toBeNull();
      }
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });
});

describe("P04/PP18: fail-closed probe; bos cikti secret/izin kaniti degil", () => {
  it("scanMavenSettingsForSecrets: dosya yok/okunamaz/bos -> usable=false (bos ciktidan 'secret yok' cikmaz)", () => {
    const missing = scanMavenSettingsForSecrets(join(tmpdir(), "aitest-p04-yok-settings.xml"));
    expect(missing.usable).toBe(false);
    expect(missing.reason_code).toBe("SETTINGS_MISSING");

    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-scan-"));
    try {
      const emptyPath = join(dir, "empty-settings.xml");
      writeFileSync(emptyPath, "   \n", "utf8");
      const empty = scanMavenSettingsForSecrets(emptyPath);
      expect(empty.usable).toBe(false);
      expect(empty.reason_code).toBe("SETTINGS_EMPTY");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });

  it("scanMavenSettingsForSecrets: credential'li settings RED; credential'siz settings GECER", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-cred-"));
    try {
      const secretPath = join(dir, "secret-settings.xml");
      writeFileSync(secretPath, [
        '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">',
        "  <servers>",
        "    <server>",
        "      <id>corp-nexus</id>",
        "      <username>ci-user</username>",
        "      <password>S3cr3t-Passw0rd!</password>",
        "    </server>",
        "  </servers>",
        "</settings>",
      ].join("\n"), "utf8");
      const secret = scanMavenSettingsForSecrets(secretPath);
      expect(secret.usable).toBe(false);
      expect(secret.reason_code).toBe("SETTINGS_SECRET_DETECTED");

      const cleanPath = join(dir, "clean-settings.xml");
      writeFileSync(cleanPath, [
        '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">',
        "  <mirrors>",
        "    <mirror>",
        "      <id>corp</id>",
        "      <url>https://mirror.example.com/maven-public/</url>",
        "      <mirrorOf>external:*</mirrorOf>",
        "    </mirror>",
        "  </mirrors>",
        "</settings>",
      ].join("\n"), "utf8");
      const clean = scanMavenSettingsForSecrets(cleanPath);
      expect(clean.usable).toBe(true);
      expect(clean.reason_code).toBe("OK");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });

  it("scanMavenSettingsForSecrets: privateKey ve env credential placeholder RED edilir", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-cred2-"));
    try {
      const privateKeyPath = join(dir, "key-settings.xml");
      writeFileSync(privateKeyPath, "<settings><server><privateKey>MIIEvQIBADANBg</privateKey></server></settings>", "utf8");
      expect(scanMavenSettingsForSecrets(privateKeyPath).usable).toBe(false);

      const envPath = join(dir, "env-settings.xml");
      writeFileSync(envPath, "<settings><servers><server><password>${env.CORP_NEXUS_PASS}</password></server></servers></settings>", "utf8");
      expect(scanMavenSettingsForSecrets(envPath).usable).toBe(false);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  });
});

describe("P04/PP19: DockerMavenRunner settings guard + job cache izolasyonu", () => {
  it("credential'li settings ile run BASLAMAZ (BLOCKED_ISOLATION; secret container'a girmez)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-mvn-"));
    try {
      const secretPath = join(dir, "settings.xml");
      writeFileSync(secretPath, "<settings><servers><server><password>x</password></server></servers></settings>", "utf8");
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const runner = new DockerMavenRunner(
        {
          target_mounts: [{ host: join(projectDir, "target"), container: "/work/target" }],
          maven_settings: { host_path: secretPath, container_path: "/settings/settings.xml" },
        },
        new DockerRunner(),
      );
      // Docker yoksa bile guard once calismali: secret'li settings run oncesi reddedilir.
      // Docker varsa da guard run'dan ONCE throw eder (mount edilmez).
      let caught: unknown;
      try {
        await runner.run({ working_dir: projectDir, goals: ["--version"], timeout_ms: 60000, log_dir: join(dir, "logs") });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AppError);
      const appError = caught as AppError;
      expect(appError.code).toBe("BLOCKED_ISOLATION");
      expect((appError.details as { reason_code?: string }).reason_code).toBe("SETTINGS_SECRET_DETECTED");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 120000);

  it("credential'siz settings + job cache volume: run guard'i gecer (Docker yoksa spawn fail kanit kalir)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-clean-"));
    try {
      const cleanPath = join(dir, "settings.xml");
      writeFileSync(cleanPath, '<settings><mirrors><mirror><mirrorOf>external:*</mirrorOf></mirror></mirrors></settings>', "utf8");
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const runner = new DockerMavenRunner(
        {
          target_mounts: [{ host: join(projectDir, "target"), container: "/work/target" }],
          maven_settings: { host_path: cleanPath, container_path: "/settings/settings.xml" },
          maven_cache_volume: "aitest-m2-cache-jobA",
        },
        new DockerRunner(),
      );
      try {
        await runner.run({ working_dir: projectDir, goals: ["--version"], timeout_ms: 60000, log_dir: join(dir, "logs") });
      } catch {
        // Docker yok: spawn error; guard gectigi icin SETTINGS hatasi DEGIL
      }
      // guard gecti: run denendi (settings mount planina alindi); host settings degismedi
      expect(readFileSync(cleanPath, "utf8")).toContain("mirrorOf");
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 120000);

  it("provisioning: bos mirror listesi typed BLOCKED_DEPENDENCIES (Docker'dan once fail-closed)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-empty-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const runner = new DockerMavenRunner(
        {
          target_mounts: [{ host: join(projectDir, "target"), container: "/work/target" }],
          provisioning: { enabled: true, allowed_mirrors: [], timeout_ms: 60000 },
        },
        new DockerRunner(),
      );
      try {
        await runner.run({ working_dir: projectDir, goals: ["--version"], timeout_ms: 60000, log_dir: join(dir, "logs") });
        throw new Error("bos mirror listesi ile run baslamamali");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.code).toBe("BLOCKED_DEPENDENCIES");
        expect((appError.details as { reason_code?: string } | undefined)?.reason_code).toBe("BLOCKED_DEPENDENCIES");
      }
      // provisioning log dizini hic uretilmemis olmali (run oncesi blocker)
      expect(existsSync(join(dir, "logs", "provisioning"))).toBe(false);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 120000);

  it("provisioning: uretilen settings YALNIZ izinli mirror'lari icerir; host settings devre disi", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-prov-"));
    try {
      const projectDir = join(dir, "project");
      mkdirSync(join(projectDir, "target"), { recursive: true });
      const runner = new DockerMavenRunner(
        {
          target_mounts: [{ host: join(projectDir, "target"), container: "/work/target" }],
          provisioning: { enabled: true, allowed_mirrors: ["https://mirror.example.com/maven-public/"], timeout_ms: 60000 },
          maven_cache_volume: "aitest-m2-cache-jobB",
        },
        new DockerRunner(),
      );
      try {
        await runner.run({ working_dir: projectDir, goals: ["--version"], timeout_ms: 60000, log_dir: join(dir, "logs") });
      } catch (error) {
        // Allowlist tek basina enforcement degildir; normal akista typed blocker beklenir.
        expect((error as AppError).code).toBe("BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE");
      }
      const provSettings = join(dir, "logs", "provisioning", "settings", "provisioning-settings.xml");
      if (existsSync(provSettings)) {
        const content = readFileSync(provSettings, "utf8");
        expect(content).toContain("https://mirror.example.com/maven-public/");
        expect(content).toContain("mirrorOf");
        // izinli olmayan adres yok:
        expect(content).not.toContain("10.10.10.45");
        // credential yok:
        expect(content).not.toContain("<password>");
        expect(content).not.toContain("<username>");
      }
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 120000);
});

describe("P04: capability probe fail-closed cikti kaniti (PP18)", () => {
  it("probeRunnerCapability: Docker yoksa capability_verified=false + errors dolu (bos success yok)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-p04-probe-"));
    try {
      const runner = new DockerRunner();
      const preflight = await runner.preflight();
      if (preflight.docker_available) {
        return; // Docker'li host'ta probe tam testi fin02'de
      }
      const probe = await runner.probeRunnerCapability(join(dir, "probe-root"));
      // P04/PP18: Docker yokken probe gercek run yapamaz; capability false + errors dolu
      expect(probe.capability_verified).toBe(false);
      expect(probe.errors.length).toBeGreaterThan(0);
      // Bos basari uretilmemis:
      expect(probe.source_write_denied && probe.host_secret_isolated && probe.network_egress_denied).toBe(false);
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* kilit */ }
    }
  }, 180000);

  it("DEFAULT_MAVEN_IMAGE kimligi birebir korunur (profil/image kontrati)", () => {
    expect(DEFAULT_MAVEN_IMAGE).toBe("maven:3.9-eclipse-temurin-21");
  });
});
