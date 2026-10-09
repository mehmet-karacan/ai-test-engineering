/**
 * PatchApplier: CandidateChangeSet'i staging alanna kontrollu uygulama.
 * PolicyGuard once kontrol eder; hash butunligi dogrulanir; rejected adaylar best set'e karismaz.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, renameSync, copyFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { PolicyGuard, type AllowedTestRoot } from "../policies/policy-guard.js";
import type { CandidateChangeSet } from "../workers/opencode/model-schemas.js";

export interface ApplyResult {
  applied: Array<{ path: string; action: string; sha256: string | null }>;
  failed: Array<{ path: string; reason: string; reason_code: string }>;
}

export class PatchApplier {
  private readonly guard: PolicyGuard;
  private readonly stagingRoot: string;

  constructor(projectRoot: string, allowedTestRoots: AllowedTestRoot[], stagingRoot: string) {
    this.guard = new PolicyGuard(projectRoot, allowedTestRoots);
    this.stagingRoot = resolve(stagingRoot);
  }

  private stagingPath(relativePath: string): string {
    const normalized = relativePath.replace(/\//g, sep);
    const absPath = resolve(this.stagingRoot, normalized);
    const relCheck = relative(this.stagingRoot, absPath);
    if (relCheck.startsWith("..")) {
      throw new AppError("POLICY_VIOLATION", `Staging hedefi kok disina cikiyor: ${relativePath}`, { reason_code: "PATH_ESCAPE" });
    }
    return absPath;
  }

  sha256(data: Buffer | string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  apply(changeset: CandidateChangeSet): ApplyResult {
    const applied: ApplyResult["applied"] = [];
    const failed: ApplyResult["failed"] = [];

    for (const change of changeset.changes) {
      try {
        const decision = this.guard.checkPath(change.path);
        if (!decision.allowed) {
          throw new AppError("POLICY_VIOLATION", decision.reason, { reason_code: decision.reason_code });
        }

        const targetPath = this.stagingPath(change.path);

        if (change.action === "delete") {
          if (existsSync(targetPath)) {
            rmSync(targetPath, { force: true });
          }
          applied.push({ path: change.path, action: "delete", sha256: null });
          continue;
        }

        const content = change.new_content ?? change.patch;
        if (content === undefined || content.length === 0) {
          throw new AppError("INVALID_PARAMETERS", `Icerik yok: ${change.path}`, { reason_code: "EMPTY_CONTENT" });
        }

        if (change.after_hash !== undefined) {
          const actualHash = this.sha256(content);
          if (actualHash !== change.after_hash) {
            throw new AppError("INVALID_PARAMETERS", `Hash uyusmazligi: ${change.path}`, { reason_code: "HASH_MISMATCH" });
          }
        }

        mkdirSync(join(targetPath, ".."), { recursive: true });
        const tmpPath = `${targetPath}.tmp-${Date.now()}`;
        writeFileSync(tmpPath, content, "utf8");
        const writtenHash = this.sha256(readFileSync(tmpPath));
        if (change.after_hash !== undefined && writtenHash !== change.after_hash) {
          rmSync(tmpPath, { force: true });
          throw new AppError("STORAGE_ERROR", `Yazma sonrasi hash uyusmazligi: ${change.path}`, { reason_code: "HASH_MISMATCH" });
        }
        rmSync(targetPath, { force: true });
        renameOrCopy(tmpPath, targetPath);

        applied.push({ path: change.path, action: change.action, sha256: writtenHash });
      } catch (error) {
        const reasonCode = error instanceof AppError && error.details && typeof error.details["reason_code"] === "string"
          ? error.details["reason_code"]
          : error instanceof AppError
            ? error.code
            : "UNKNOWN";
        const message = error instanceof AppError ? error.message : String(error);
        failed.push({ path: change.path, reason: message, reason_code: reasonCode });
      }
    }

    return { applied, failed };
  }

  reset(): void {
    if (existsSync(this.stagingRoot)) {
      rmSync(this.stagingRoot, { recursive: true, force: true });
    }
    mkdirSync(this.stagingRoot, { recursive: true });
  }
}

function renameOrCopy(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
    rmSync(from, { force: true });
  }
}
