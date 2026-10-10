/**
 * Guvenli runner factory: customer job'da tek runner kaynagi; host yolu urun girisinden secilemez (K01/B01).
 * Default verified izolasyon profili; worker disabled ile sessiz basari yolu kaldirilir.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppError } from "../domain/errors.js";
import { DockerRunner, DEFAULT_MAVEN_IMAGE, assertDockerPreflightUsable, type DockerPreflightResult } from "./docker-runner.js";
import { MavenRunner, type RunResult, type MavenRunOptions } from "./maven-runner.js";

export type RunnerKind = "docker" | "host_dev_only";

export interface VerifiedCapability {
  kind: RunnerKind;
  docker: DockerRunner | null;
  host: MavenRunner | null;
  preflight: DockerPreflightResult | null;
  verified_at: number;
}

/**
 * Customer job runner factory: yalniz docker (verified izolasyon) secen, host_dev_only'yi
 * urun girisinden gelen parametre olarak kabul etmeyen tek kaynak.
 */
export class CustomerRunnerFactory {
  private verified: VerifiedCapability | null = null;

  /**
   * RT01: env ayari olmayan normal kurulumda docker capability preflight ile verified izolasyon uretir.
   * Docker yoksa BLOCKED_ISOLATION; host'a dusmez.
   */
  async ensureVerified(): Promise<VerifiedCapability> {
    if (this.verified) {
      return this.verified;
    }
    const docker = new DockerRunner();
    const preflight = await docker.preflight();
    if (!preflight.docker_available || !preflight.maven_image_present) {
      throw new AppError("BLOCKED_ISOLATION", "Docker capability dogrulanamadi; customer job host'ta calistirilmaz", {
        reason_code: "CAPABILITY_UNVERIFIED",
        errors: preflight.errors,
      });
    }
    this.verified = { kind: "docker", docker, host: null, preflight, verified_at: Date.now() };
    return this.verified;
  }

  /**
   * host_dev_only yalniz urunun guvenilir gelistirme testlerinde acikca istenir;
   * customer job ve urun girisinden (env) GELEMEZ.
   */
  assertHostDevOnlyAllowed(requestedKind: RunnerKind | undefined, customerJob: boolean): void {
    if (requestedKind !== "host_dev_only") {
      return;
    }
    if (customerJob) {
      throw new AppError("BLOCKED_ISOLATION", "host_dev_only customer job'da kullanilamaz (K01/B01)", {
        reason_code: "HOST_RUNNER_CUSTOMER_FORBIDDEN",
      });
    }
  }

  get verifiedCapability(): VerifiedCapability | null {
    return this.verified;
  }
}

/**
 * Dagitilan entrypoint'ten gelen env degerlerini dogrular; bilinmeyen deger fail-closed.
 * RT02: tip donusumune guvenilmez.
 */
export function resolveRunnerKindFromEnv(envValue: string | undefined, customerJob: boolean): RunnerKind {
  if (envValue === undefined || envValue.length === 0) {
    return "docker";
  }
  if (envValue === "docker") {
    return "docker";
  }
  if (envValue === "host_dev_only" && !customerJob) {
    return "host_dev_only";
  }
  throw new AppError("BLOCKED_ISOLATION", `Bilinmeyen/izinli olmayan runner: ${envValue} (fail-closed)`, {
    reason_code: "INVALID_RUNNER_KIND",
  });
}

export function assertMavenRunPlanUsable(workingDir: string): void {
  const absPath = resolve(workingDir);
  const pomPath = join(absPath, "pom.xml");
  const mvnwCmd = join(absPath, "mvnw.cmd");
  const mvnwSh = join(absPath, "mvnw");
  if (!existsSync(pomPath) && !existsSync(mvnwCmd) && !existsSync(mvnwSh)) {
    throw new AppError("INVALID_PARAMETERS", `Maven calisma plani kullanilamaz (POM/wrapper yok): ${workingDir}`);
  }
}
