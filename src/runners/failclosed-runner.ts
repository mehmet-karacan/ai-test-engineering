/**
 * Fail-closed Runner arayuzu: guvenli capability/preflight olmadan run kabul etmez (D03/F05).
 * Customer job'da host MavenRunner otomatik kullanilamaz; yalniz urunun guvenilir gelistirme testleri icin acikca sinirlidir.
 */
import type { MavenRunOptions, RunResult } from "../runners/maven-runner.js";
import type { DockerRunOptions, DockerPreflightResult } from "../runners/docker-runner.js";
import { AppError } from "../domain/errors.js";

export interface RunnerCapability {
  kind: "docker" | "host_dev_only";
  verified: boolean;
  verified_at: number | null;
  preflight: DockerPreflightResult | null;
}

export interface RunnerRunRequest {
  customer_job: boolean;
  maven?: MavenRunOptions;
  docker?: DockerRunOptions;
}

export interface RunnerInterface {
  run(request: RunnerRunRequest): Promise<RunResult>;
}

export class FailClosedRunner implements RunnerInterface {
  private capability: RunnerCapability;

  constructor(capability: RunnerCapability) {
    this.capability = capability;
  }

  setCapability(capability: RunnerCapability): void {
    this.capability = capability;
  }

  async run(request: RunnerRunRequest): Promise<RunResult> {
    if (!this.capability.verified) {
      throw new AppError("BLOCKED_ISOLATION", "Runner capability dogrulanmamis; customer job calismaz (fail-closed)", {
        reason_code: "CAPABILITY_UNVERIFIED",
        kind: this.capability.kind,
      });
    }

    if (request.customer_job && this.capability.kind === "host_dev_only") {
      throw new AppError("BLOCKED_ISOLATION", "host_dev_only runner customer job'da kullanilamaz; izole runner gereklidir", {
        reason_code: "HOST_RUNNER_CUSTOMER_FORBIDDEN",
      });
    }

    throw new AppError("INTERNAL_ERROR", "FailClosedRunner somut run uygulamasI yok; alt sinif kullanmalidir");
  }
}

export interface CloseAwareRunResult extends RunResult {
  stdout_complete: boolean;
  stderr_complete: boolean;
  process_identity: { pid: number; started_at: number } | null;
}

export function assertProcessFullyTerminated(result: { exit_code: number; stdout_complete: boolean; stderr_complete: boolean }, phase: string): void {
  if (result.exit_code < 0) {
    throw new AppError("BLOCKED_ISOLATION", `${phase}: process beklenmeden sonlandi (exit ${result.exit_code})`);
  }
  if (!result.stdout_complete || !result.stderr_complete) {
    throw new AppError("STORAGE_ERROR", `${phase}: stdout/stderr bitmeden sonuc alindi (supervisor semantigi)`);
  }
}
