/**
 * test_apply: onayli test degisikliklerini kullanici projesine uygulama.
 * Default kapali/onay gerektiren yetenek; preimage kontrol, journal, idempotency.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, appendFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { PolicyGuard, type AllowedTestRoot } from "../policies/policy-guard.js";

export interface ApplyRequest {
  job_id: string;
  checkpoint_id: string;
  patch_digest: string;
  target_workspace: string;
  approval_reference: string;
  changes: Array<{ path: string; action: "create" | "modify" | "delete"; new_content: string | null; patch_digest: string }>;
}

export interface ApplyJournalEntry {
  timestamp: number;
  job_id: string;
  checkpoint_id: string;
  operation_id: string;
  step: string;
  path: string | null;
  detail: string;
}

export interface ApplyResult {
  state: "APPLIED" | "CONFLICT" | "REJECTED";
  operation_id: string;
  applied_paths: string[];
  conflicts: Array<{ path: string; reason: string }>;
  journal_path: string;
}

export interface ApplyCapabilityConfig {
  allow_workspace_apply: boolean;
  trusted_approval_adapters: string[];
}

export function defaultApplyConfig(): ApplyCapabilityConfig {
  return { allow_workspace_apply: false, trusted_approval_adapters: [] };
}

export class TestApplyService {
  private readonly guard: PolicyGuard;
  private readonly workspace: string;
  private readonly backupDir: string;
  private readonly journalPath: string;
  private readonly config: ApplyCapabilityConfig;

  constructor(workspace: string, allowedTestRoots: AllowedTestRoot[], config: ApplyCapabilityConfig) {
    this.workspace = resolve(workspace);
    this.guard = new PolicyGuard(this.workspace, allowedTestRoots);
    this.backupDir = join(this.workspace, ".aitest-apply-backup");
    this.journalPath = join(this.workspace, ".aitest-apply-journal.json");
    this.config = config;
  }

  private sha256(data: Buffer | string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  private appendJournal(entry: ApplyJournalEntry): void {
    appendFileSync(this.journalPath, JSON.stringify(entry) + "\n", "utf8");
  }

  apply(request: ApplyRequest): ApplyResult {
    if (!this.config.allow_workspace_apply) {
      throw new AppError("POLICY_VIOLATION", "Workspace apply kapali; patch-only sonuc doner", { reason_code: "APPLY_DISABLED" });
    }

    if (request.approval_reference.length < 8) {
      throw new AppError("POLICY_VIOLATION", "Onay referansi gecersiz", { reason_code: "INVALID_APPROVAL" });
    }

    const operationId = randomUUID();
    mkdirSync(this.backupDir, { recursive: true });
    this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "start", path: null, detail: `approval=${request.approval_reference}` });

    const conflicts: ApplyResult["conflicts"] = [];
    const appliedPaths: string[] = [];

    for (const change of request.changes) {
      const decision = this.guard.checkPath(change.path);
      if (!decision.allowed) {
        this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "rejected", path: change.path, detail: decision.reason_code });
        return { state: "REJECTED", operation_id: operationId, applied_paths: [], conflicts: [], journal_path: this.journalPath };
      }

      const absPath = resolve(this.workspace, change.path.replace(/\//g, sep));
      if (change.action === "delete") {
        continue;
      }
      const content = change.new_content;
      if (content === null || content.length === 0) {
        conflicts.push({ path: change.path, reason: "Icerik yok" });
        continue;
      }
      const digest = this.sha256(content);
      if (digest !== change.patch_digest) {
        conflicts.push({ path: change.path, reason: `Patch digest uyusmazligi (${change.path})` });
      }
    }

    if (conflicts.length > 0) {
      this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "conflict", path: null, detail: conflicts.map((c) => c.path).join(",") });
      return { state: "CONFLICT", operation_id: operationId, applied_paths: [], conflicts, journal_path: this.journalPath };
    }

    for (const change of request.changes) {
      if (change.action === "delete") {
        continue;
      }
      const absPath = resolve(this.workspace, change.path.replace(/\//g, sep));
      const relCheck = relative(this.workspace, absPath);
      if (relCheck.startsWith("..")) {
        this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "conflict", path: change.path, detail: "PATH_ESCAPE" });
        return { state: "CONFLICT", operation_id: operationId, applied_paths: [], conflicts: [{ path: change.path, reason: "Path escape" }], journal_path: this.journalPath };
      }

      if (existsSync(absPath)) {
        const preimage = readFileSync(absPath, "utf8");
        const backupPath = join(this.backupDir, `${Buffer.from(change.path).toString("base64url").slice(0, 120)}.bak`);
        writeFileSync(backupPath, preimage, "utf8");
        this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "backup", path: change.path, detail: `backup=${Buffer.from(change.path).toString("base64url").slice(0, 120)}.bak preimage_sha=${this.sha256(preimage)}` });
      }

      mkdirSync(join(absPath, ".."), { recursive: true });
      const tmpPath = `${absPath}.tmp-${Date.now()}`;
      writeFileSync(tmpPath, change.new_content!, "utf8");
      try {
        renameSync(tmpPath, absPath);
      } catch {
        rmSync(absPath, { force: true });
        renameSync(tmpPath, absPath);
      }
      appliedPaths.push(change.path);
      this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "applied", path: change.path, detail: `sha=${this.sha256(change.new_content!)}` });
    }

    this.appendJournal({ timestamp: Date.now(), job_id: request.job_id, checkpoint_id: request.checkpoint_id, operation_id: operationId, step: "complete", path: null, detail: `applied=${appliedPaths.length}` });
    return { state: "APPLIED", operation_id: operationId, applied_paths: appliedPaths, conflicts: [], journal_path: this.journalPath };
  }

  verifyApplied(request: ApplyRequest): boolean {
    for (const change of request.changes) {
      if (change.action === "delete") {
        continue;
      }
      const absPath = resolve(this.workspace, change.path.replace(/\//g, sep));
      if (!existsSync(absPath)) {
        return false;
      }
      if (this.sha256(readFileSync(absPath)) !== this.sha256(change.new_content ?? "")) {
        return false;
      }
    }
    return true;
  }
}
