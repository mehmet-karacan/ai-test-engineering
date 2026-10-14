import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { AppError } from "../../domain/errors.js";
import type { AgentRole, AgentTaskContract, ModelBinding } from "../../domain/agent-contracts.js";

export interface AgentContextPackage {
  task_id: string;
  job_id: string;
  source_snapshot_id: string;
  role: AgentRole;
  model: ModelBinding;
  root_digest: string;
  manifest_digest: string;
  text: string;
  omitted: string[];
  bytes: number;
}

export interface AgentContextProvider {
  provide(contract: AgentTaskContract): Promise<AgentContextPackage>;
}

export interface FileSystemContextProviderOptions {
  rootPath: string;
  rootDigest: string;
  maxFileBytes?: number;
}

function isSecretPath(relativePath: string): boolean {
  return relativePath
    .toLowerCase()
    .split(/[\\/]/u)
    .some((part) => /(^|\.)(env|pem|key|p12|pfx)$|secret|credential|password|token/u.test(part));
}

function safeRelativePath(rootPath: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw new AppError("POLICY_VIOLATION", "Context yolu relatif olmali", { reason_code: "CONTEXT_PATH_INVALID" });
  }
  const normalized = relativePath.replace(/\\/g, "/");
  const candidate = resolve(rootPath, normalized);
  const rel = relative(resolve(rootPath), candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new AppError("POLICY_VIOLATION", "Context yolu snapshot kokunun disina cikiyor", { reason_code: "CONTEXT_PATH_ESCAPE" });
  }
  return rel.split(sep).join("/");
}

function lineSelection(path: string, text: string, ranges: AgentTaskContract["allowed_context_scope"]["line_ranges"]): string {
  const selected = ranges.filter((range) => range.relative_path.replace(/\\/g, "/") === path);
  if (selected.length === 0) return text;
  const lines = text.split(/\r?\n/u);
  const indexes = new Set<number>();
  for (const range of selected) {
    for (let index = range.start - 1; index < Math.min(range.end, lines.length); index += 1) indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b).map((index) => lines[index]).join("\n");
}

export class FileSystemContextProvider implements AgentContextProvider {
  private readonly rootPath: string;
  private readonly rootDigest: string;
  private readonly maxFileBytes: number;

  constructor(options: FileSystemContextProviderOptions) {
    this.rootPath = resolve(options.rootPath);
    this.rootDigest = options.rootDigest;
    this.maxFileBytes = options.maxFileBytes ?? 4 * 1024 * 1024;
    if (!/^[a-f0-9]{64}$/u.test(this.rootDigest) || this.maxFileBytes <= 0) {
      throw new AppError("INVALID_PARAMETERS", "Context provider ayarlari gecersiz", { reason_code: "CONTEXT_PROVIDER_CONFIG_INVALID" });
    }
  }

  async provide(contract: AgentTaskContract): Promise<AgentContextPackage> {
    const scope = contract.allowed_context_scope;
    if (scope.snapshot_id !== contract.source_snapshot_id) {
      throw new AppError("POLICY_VIOLATION", "Context snapshot kimligi task source snapshot ile uyusmuyor", { reason_code: "CONTEXT_SNAPSHOT_MISMATCH" });
    }
    if (scope.root_digest !== this.rootDigest || scope.secrets_excluded !== true) {
      throw new AppError("POLICY_VIOLATION", "Context root veya secret dislama kimligi uyusmuyor", { reason_code: "CONTEXT_SCOPE_MISMATCH" });
    }
    const paths = [...new Set(scope.relative_paths.map((path) => safeRelativePath(this.rootPath, path)))].sort();
    const selectedPaths = new Set(paths);
    if (scope.line_ranges.some((range) => !selectedPaths.has(safeRelativePath(this.rootPath, range.relative_path)))) {
      throw new AppError("POLICY_VIOLATION", "Context line range izinli dosya listesinde degil", { reason_code: "CONTEXT_RANGE_OUTSIDE_SCOPE" });
    }
    const chunks: string[] = [];
    const manifest: Array<{ relative_path: string; bytes: number; sha256: string }> = [];
    let bytes = 0;
    for (const path of paths) {
      if (isSecretPath(path)) {
        throw new AppError("POLICY_VIOLATION", `Secret dosya context'e alinamaz: ${path}`, { reason_code: "CONTEXT_SECRET_PATH" });
      }
      const absolute = resolve(this.rootPath, path);
      if (!existsSync(absolute) || !lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) {
        throw new AppError("POLICY_VIOLATION", `Context dosyasi normal dosya degil: ${path}`, { reason_code: "CONTEXT_FILE_INVALID" });
      }
      const source = readFileSync(absolute);
      if (source.byteLength > this.maxFileBytes) {
        throw new AppError("POLICY_VIOLATION", `Context dosyasi boyut sinirini asiyor: ${path}`, { reason_code: "CONTEXT_FILE_TOO_LARGE" });
      }
      const selected = lineSelection(path, source.toString("utf8"), scope.line_ranges);
      const section = `## ${path}\n${selected}`;
      const selectedBytes = Buffer.byteLength(section, "utf8") + (chunks.length > 0 ? Buffer.byteLength("\n\n", "utf8") : 0);
      bytes += selectedBytes;
      if (bytes > scope.max_bytes) {
        throw new AppError("POLICY_VIOLATION", "Context toplam byte sinirini asiyor", { reason_code: "CONTEXT_BUDGET_EXCEEDED" });
      }
      const sha256 = createHash("sha256").update(source).digest("hex");
      manifest.push({ relative_path: path, bytes: source.byteLength, sha256 });
      chunks.push(section);
    }
    const manifestDigest = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
    return {
      task_id: contract.task_id,
      job_id: contract.job_id,
      source_snapshot_id: contract.source_snapshot_id,
      role: contract.role,
      model: contract.model_binding,
      root_digest: this.rootDigest,
      manifest_digest: manifestDigest,
      text: chunks.join("\n\n"),
      omitted: [],
      bytes,
    };
  }
}
