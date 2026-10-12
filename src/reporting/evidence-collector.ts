/** P07-B: final replay workspace'inden byte-dogrulanmis facts kaniti toplar. */
import { existsSync, lstatSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { AppError } from "../domain/errors.js";
import { buildPatchArtifact, redactSensitive, redactUserPath, sha256Hex } from "./patch-artifact.js";
import type { ReportEvidenceKind, ReportStageName } from "./report-generator.js";

export interface EvidenceFile {
  relative_path: string;
  kind: ReportEvidenceKind;
  stage: ReportStageName | "checkpoint";
  run_id: string | null;
  content: Buffer;
  redacted: boolean;
  required: boolean;
}

export interface MissingEvidence {
  relative_path: string;
  kind: ReportEvidenceKind;
  reason: string;
  required: boolean;
}

export interface FinalReplayEvidence {
  files: EvidenceFile[];
  missing: MissingEvidence[];
}

export interface AcceptedChangeEvidenceInput {
  project_root: string;
  accepted_dir: string;
  job_id: string;
  checkpoint_id: string | null;
  changes: Array<{ path: string; sha256: string; action: string }>;
  home_dir?: string;
}

interface CollectorInput {
  workspace: string;
  module_paths: string[];
  run_id: string;
  job_id: string;
  home_dir?: string;
}

function safeRelativePath(value: string, field: string): string {
  if (value.length === 0 || value.includes("\0") || value.includes("\\") || isAbsolute(value)) {
    throw new AppError("POLICY_VIOLATION", `${field} yolu containment disi: ${value}`, { reason_code: "PATH_ESCAPE" });
  }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new AppError("POLICY_VIOLATION", `${field} yolu containment disi: ${value}`, { reason_code: "PATH_ESCAPE" });
  }
  return value;
}

function containedWorkspaceFile(workspace: string, relativePath: string): string {
  const root = resolve(workspace);
  const candidate = resolve(root, relativePath);
  const rel = relative(root, candidate);
  if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) {
    throw new AppError("POLICY_VIOLATION", `Evidence yolu workspace disina cikiyor: ${relativePath}`, { reason_code: "PATH_ESCAPE" });
  }
  return candidate;
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const result: string[] = [];
  const visit = (directory: string): void => {
    const entries: Dirent[] = readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new AppError("POLICY_VIOLATION", `Evidence symlink yolu reddedildi: ${path}`, { reason_code: "SYMLINK_ESCAPE" });
      }
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        result.push(path);
      }
    }
  };
  visit(root);
  return result.sort((a, b) => a.localeCompare(b));
}

function textEvidence(content: Buffer, homeDir: string | undefined): Buffer {
  let value = content.toString("utf8");
  value = redactSensitive(value);
  if (homeDir) {
    value = redactUserPath(value, homeDir);
  }
  return Buffer.from(value, "utf8");
}

function redactSource(content: Buffer, homeDir: string | undefined): { content: Buffer; redacted: boolean } {
  // Java/source files are text; binary accepted assets stay byte-exact and are
  // never passed through UTF-8 conversion.
  if (content.includes(0)) {
    return { content, redacted: false };
  }
  return { content: textEvidence(content, homeDir), redacted: true };
}

function addFile(result: FinalReplayEvidence, input: CollectorInput, filePath: string, relativePath: string, kind: ReportEvidenceKind, required: boolean, redacted: boolean): void {
  const content = readFileSync(filePath);
  result.files.push({
    relative_path: safeRelativePath(relativePath, "Evidence hedefi"),
    kind,
    stage: "final",
    run_id: input.run_id,
    content: redacted ? textEvidence(content, input.home_dir) : content,
    redacted,
    required,
  });
}

function addMissing(result: FinalReplayEvidence, relativePath: string, kind: ReportEvidenceKind, reason: string, required = true): void {
  result.missing.push({ relative_path: safeRelativePath(relativePath, "Eksik evidence hedefi"), kind, reason, required });
}

/**
 * Every required claim is backed by the final replay workspace. A missing
 * JaCoCo or test result is returned explicitly and is never converted to an
 * empty/zero measurement.
 */
export function collectFinalReplayEvidence(input: CollectorInput): FinalReplayEvidence {
  const result: FinalReplayEvidence = { files: [], missing: [] };
  const workspace = resolve(input.workspace);
  if (!existsSync(workspace) || !lstatSync(workspace).isDirectory()) {
    throw new AppError("REPORT_EXPORT_FAILED", `Final replay workspace yok: ${workspace}`, { reason_code: "FINAL_REPLAY_WORKSPACE_MISSING", job_id: input.job_id });
  }

  for (const rawModulePath of [...new Set(input.module_paths)].sort()) {
    const modulePath = rawModulePath === "." || rawModulePath === "" ? "root" : safeRelativePath(rawModulePath.replace(/\\/g, "/"), "Module");
    const moduleRoot = rawModulePath === "." || rawModulePath === "" ? workspace : containedWorkspaceFile(workspace, rawModulePath);
    const jacocoRoot = join(moduleRoot, "target", "site", "jacoco");
    const jacocoXml = join(jacocoRoot, "jacoco.xml");
    const jacocoDestination = `evidence/final-replay/${modulePath}/jacoco.xml`;
    if (existsSync(jacocoXml) && lstatSync(jacocoXml).isFile()) {
      addFile(result, input, jacocoXml, jacocoDestination, "jacoco_xml", true, false);
    } else {
      addMissing(result, jacocoDestination, "jacoco_xml", "JACOCO_XML_MISSING");
    }
    for (const asset of walkFiles(jacocoRoot)) {
      if (asset === jacocoXml) {
        continue;
      }
      const assetRel = relative(jacocoRoot, asset).replace(/\\/g, "/");
      addFile(result, input, asset, `evidence/final-replay/${modulePath}/jacoco/${assetRel}`, "jacoco_asset", false, false);
    }

    let testReportCount = 0;
    for (const [directory, kind, directoryName] of [
      [join(moduleRoot, "target", "surefire-reports"), "surefire_xml", "surefire"] as const,
      [join(moduleRoot, "target", "failsafe-reports"), "failsafe_xml", "failsafe"] as const,
    ]) {
      for (const report of walkFiles(directory).filter((path) => path.split(/[\\/]/).pop()?.startsWith("TEST-") && path.endsWith(".xml"))) {
        testReportCount += 1;
        const reportName = relative(directory, report).replace(/\\/g, "/");
        addFile(result, input, report, `evidence/final-replay/${modulePath}/${directoryName}/${reportName}`, kind, true, false);
      }
    }
    if (testReportCount === 0) {
      addMissing(result, `evidence/final-replay/${modulePath}/test-reports`, "surefire_xml", "SUREFIRE_FAILSAFE_XML_MISSING");
    }
  }

  const logRoot = join(workspace, "target", "aitest-final-replay-logs");
  for (const [name, destination] of [["stdout.log", "stdout.log"], ["stderr.log", "stderr.log"]] as const) {
    const path = join(logRoot, name);
    const relativePath = `evidence/final-replay/logs/${destination}`;
    if (existsSync(path) && lstatSync(path).isFile()) {
      addFile(result, input, path, relativePath, "run_log", true, true);
    } else {
      addMissing(result, relativePath, "run_log", "FINAL_REPLAY_LOG_MISSING");
    }
  }

  result.files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  result.missing.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  return result;
}

/** Accepted checkpoint content and its deterministic patch are export facts. */
export function collectAcceptedChangeEvidence(input: AcceptedChangeEvidenceInput): FinalReplayEvidence {
  const result: FinalReplayEvidence = { files: [], missing: [] };
  const patchInputs: Array<{ path: string; action: "create" | "modify" | "delete"; before: Buffer | null; after: Buffer | null }> = [];
  for (const change of [...input.changes].sort((a, b) => a.path.localeCompare(b.path))) {
    const path = safeRelativePath(change.path, "Accepted change");
    const action = change.action === "delete" ? "delete" : change.action === "create" ? "create" : "modify";
    const beforePath = containedWorkspaceFile(input.project_root, path);
    const afterPath = containedWorkspaceFile(input.accepted_dir, path);
    const before = action === "create" ? null : existsSync(beforePath) && lstatSync(beforePath).isFile() ? readFileSync(beforePath) : null;
    const after = action === "delete" ? null : existsSync(afterPath) && lstatSync(afterPath).isFile() ? readFileSync(afterPath) : null;
    if (action !== "create" && before === null) {
      result.missing.push({ relative_path: `evidence/accepted/${path}`, kind: "accepted_source", reason: "ACCEPTED_BEFORE_MISSING", required: true });
    }
    if (action !== "delete" && after === null) {
      result.missing.push({ relative_path: `evidence/accepted/${path}`, kind: "accepted_source", reason: "ACCEPTED_AFTER_MISSING", required: true });
      continue;
    }
    if (after !== null && sha256Hex(after) !== change.sha256) {
      result.missing.push({ relative_path: `evidence/accepted/${path}`, kind: "accepted_source", reason: "ACCEPTED_AFTER_HASH_MISMATCH", required: true });
      continue;
    }
    const redactedBefore = before === null ? null : redactSource(before, input.home_dir).content;
    const redactedAfter = after === null ? null : redactSource(after, input.home_dir).content;
    patchInputs.push({ path, action, before: redactedBefore, after: redactedAfter });
    if (redactedAfter !== null) {
      result.files.push({
        relative_path: `evidence/accepted/${path}`,
        kind: "accepted_source",
        stage: "final",
        run_id: null,
        content: redactedAfter,
        redacted: after !== null && !after.includes(0),
        required: true,
      });
    }
  }
  if (patchInputs.length > 0) {
    const patch = buildPatchArtifact({ job_id: input.job_id, checkpoint_id: input.checkpoint_id, files: patchInputs });
    result.files.push({
      relative_path: "evidence/accepted/changes.patch",
      kind: "patch",
      stage: "final",
      run_id: null,
      content: Buffer.from(patch.unified_diff, "utf8"),
      redacted: true,
      required: true,
    });
    result.files.push({
      relative_path: "evidence/accepted/patch-metadata.json",
      kind: "patch",
      stage: "final",
      run_id: null,
      content: Buffer.from(`${JSON.stringify(patch, null, 2)}\n`, "utf8"),
      redacted: true,
      required: true,
    });
  }
  result.files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  result.missing.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  return result;
}
