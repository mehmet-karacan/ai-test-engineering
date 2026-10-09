/**
 * Kaynak snapshot'i: salt-okunur envanter + ownership'li kopya + hash manifest.
 * Symlink/junction ile izin disi path'e cikma engellenir; dirty kaynak goz ardi edilmez.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { AppError } from "../domain/errors.js";

export type FileClassification = "production_source" | "test_source" | "build_config" | "resource" | "other";

export interface ManifestEntry {
  relative_path: string;
  bytes: number;
  sha256: string;
  classification: FileClassification;
  source_location: string;
}

export interface SnapshotManifest {
  schema_version: 1;
  root: string;
  created_at: number;
  entries: ManifestEntry[];
  head_commit: string | null;
  dirty: boolean;
}

const JAVA_DIRS = new Set(["java"]);
const CLASSIFICATION_EXTS = new Set([".java", ".xml", ".properties", ".gradle", ".kts", ".json", ".yaml", ".yml"]);

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Data(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function classify(relativePath: string): FileClassification {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.includes("src") && parts.includes("test")) {
    return "test_source";
  }
  if (parts.includes("src") && parts.includes("java")) {
    return "production_source";
  }
  if (normalized.endsWith("pom.xml") || normalized.endsWith("build.gradle") || normalized.endsWith("settings.gradle") || normalized.endsWith(".kts")) {
    return "build_config";
  }
  return "resource";
}

function isWithinRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel.length > 0 && !rel.startsWith("..") && !resolve(root, rel).startsWith(process.cwd() === "" ? "\0" : "");
}

export class SourceSnapshot {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  get rootPath(): string {
    return this.root;
  }

  walk(dir?: string, depth = 0): string[] {
    const base = dir ?? this.root;
    if (depth > 64) {
      throw new AppError("POLICY_VIOLATION", `Dizin derinligi siniri asildi: ${base}`);
    }
    const entries: string[] = [];
    const lstat = lstatSync(base);
    if (lstat.isSymbolicLink()) {
      const target = resolve(base);
      if (!isWithinRoot(this.root, target)) {
        return entries;
      }
    }
    if (!lstat.isDirectory()) {
      return [base];
    }
    for (const name of readdirSync(base)) {
      const full = join(base, name);
      const l = lstatSync(full);
      if (l.isSymbolicLink()) {
        const target = resolve(full);
        if (!isWithinRoot(this.root, target)) {
          continue;
        }
      }
      if (name === ".git" || name === "node_modules" || name === "target" || name === "build" || name === ".mvn") {
        continue;
      }
      if (l.isDirectory()) {
        entries.push(...this.walk(full, depth + 1));
      } else {
        entries.push(full);
      }
    }
    return entries;
  }

  buildManifest(options?: { maxFiles?: number; maxFileBytes?: number }): SnapshotManifest {
    const maxFiles = options?.maxFiles ?? 200000;
    const maxFileBytes = options?.maxFileBytes ?? 64 * 1024 * 1024;
    const files = this.walk();
    if (files.length > maxFiles) {
      throw new AppError("POLICY_VIOLATION", `Dosya sayisi siniri asildi: ${files.length} > ${maxFiles}`);
    }
    const entries: ManifestEntry[] = [];
    let headCommit: string | null = null;
    let dirty = false;

    const gitHead = join(this.root, ".git", "HEAD");
    if (existsSync(gitHead)) {
      try {
        const headContent = readFileSync(gitHead, "utf8").trim();
        const refMatch = /^ref: (.+)$/.exec(headContent);
        if (refMatch) {
          const refPath = join(this.root, ".git", refMatch[1]!);
          if (existsSync(refPath)) {
            headCommit = readFileSync(refPath, "utf8").trim();
          }
        } else {
          headCommit = headContent;
        }
      } catch {
        headCommit = null;
      }
    }

    for (const file of files) {
      const lstat = lstatSync(file);
      if (!lstat.isFile()) {
        continue;
      }
      if (lstat.size > maxFileBytes) {
        throw new AppError("POLICY_VIOLATION", `Dosya boyutu siniri asildi: ${file} (${lstat.size} > ${maxFileBytes})`);
      }
      const rel = relative(this.root, file);
      entries.push({
        relative_path: rel.replace(/\\/g, "/"),
        bytes: lstat.size,
        sha256: sha256File(file),
        classification: classify(rel),
        source_location: file,
      });
    }

    return {
      schema_version: 1,
      root: this.root,
      created_at: Date.now(),
      entries,
      head_commit: headCommit,
      dirty,
    };
  }

  copyTo(targetRoot: string, manifest: SnapshotManifest): void {
    const absTarget = resolve(targetRoot);
    mkdirSync(absTarget, { recursive: true });
    for (const entry of manifest.entries) {
      const targetPath = resolve(absTarget, entry.relative_path.replace(/\//g, sep));
      const relCheck = relative(absTarget, targetPath);
      if (relCheck.startsWith("..")) {
        throw new AppError("POLICY_VIOLATION", `Snapshot kopya hedefi kok disina cikiyor: ${entry.relative_path}`);
      }
      mkdirSync(join(targetPath, ".."), { recursive: true });
      copyFileSync(resolve(this.root, entry.relative_path.replace(/\//g, sep)), targetPath);
      const copiedHash = sha256File(targetPath);
      if (copiedHash !== entry.sha256) {
        throw new AppError("STORAGE_ERROR", `Snapshot kopya hash uyusmazligi: ${entry.relative_path}`);
      }
    }
    writeFileSync(
      join(absTarget, "snapshot-manifest.json"),
      JSON.stringify({ ...manifest, entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) }, null, 2),
      "utf8",
    );
  }
}

export function isJavaExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  return CLASSIFICATION_EXTS.has(name.slice(dot).toLowerCase()) || name.slice(dot).toLowerCase() === ".java";
}

export function effectiveSourceSet(relativePath: string): "main" | "test" | "unknown" {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.includes("/src/test/") || normalized.startsWith("src/test/")) {
    return "test";
  }
  if (normalized.includes("/src/main/") || normalized.startsWith("src/main/")) {
    return "main";
  }
  return "unknown";
}
