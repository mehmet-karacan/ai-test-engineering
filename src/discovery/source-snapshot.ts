/**
 * Kaynak snapshot'i: salt-okunur envanter + ownership'li kopya + hash manifest.
 * Symlink/junction ile izin disi path'e cikma engellenir; dirty kaynak goz ardi edilmez.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { AppError } from "../domain/errors.js";

export type FileClassification = "production_source" | "test_source" | "build_config" | "resource" | "other";

/**
 * PR03/P03: kaynak kimligi (source identity).
 * - git repository'de HEAD birebir `git rev-parse HEAD` ile okunur (symbolic ref dahil).
 * - `dirty` git status --porcelain ile belirlenir; git fail olursa dirty bilinmiyor
 *   sayilip fail-closed davranilir (false-clean uretilmez).
 * - `source_digest` sirali canonical relative path + bayt digest'i: null/bilinmeyen
 *   ile degismeyen kaynak ayrisini kapatir (R04/PP11).
 * - `build_digest` POM/profile dosyalarinin canonical path + bayt digest'i: rename ve
 *   build config degisikligi kaynak kontrolunden kacamaz (PP12).
 */
export interface SourceIdentity {
  head_commit: string | null;
  dirty: boolean;
  dirty_digest: string | null;
  source_digest: string;
  build_digest: string;
}

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

function gitRun(root: string, args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    return { ok: false, stdout: "" };
  }
  return { ok: true, stdout: result.stdout ?? "" };
}

function isGitRepository(root: string): boolean {
  // .git dosya (worktree/submodule) ya da dizin olabilir.
  const gitEntry = join(root, ".git");
  if (!existsSync(gitEntry)) {
    return false;
  }
  try {
    return lstatSync(gitEntry).isDirectory() || lstatSync(gitEntry).isFile();
  } catch {
    return false;
  }
}

/**
 * P03: Gercek git HEAD'i. `.git/HEAD` byte okuma yerine `git rev-parse HEAD` kullanilir;
 * git fail olursa null (bilinmeyen) - tahmin uretilmez.
 */
export function gitHeadCommit(root: string): string | null {
  if (!isGitRepository(root)) {
    return null;
  }
  const result = gitRun(root, ["rev-parse", "HEAD"]);
  if (!result.ok) {
    return null;
  }
  const value = result.stdout.trim();
  return /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function buildConfigEntryPaths(manifest: SnapshotManifest): Array<{ relative_path: string; sha256: string }> {
  return manifest.entries
    .filter((entry) => entry.classification === "build_config")
    .map((entry) => ({ relative_path: entry.relative_path, sha256: entry.sha256 }))
    .sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

/**
 * P03: canonical source/build digest. Manifest entries sirali (path artan) kullanilir.
 * source_digest: TUM dosyalarin path+sha256; build_digest: yalniz build_config dosyalar.
 */
export function sourceDigestFromManifest(manifest: SnapshotManifest): string {
  const ordered = [...manifest.entries].sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  return sha256Data(JSON.stringify(ordered.map((entry) => [entry.relative_path, entry.sha256])));
}

export function buildDigestFromManifest(manifest: SnapshotManifest): string {
  const ordered = buildConfigEntryPaths(manifest);
  return sha256Data(JSON.stringify(ordered.map((entry) => [entry.relative_path, entry.sha256])));
}

/**
 * P03: snapshot manifest + git status ile tam source identity.
 * Git repository'de dirty tespiti git basarisiz olursa fail-closed: dirty=true.
 * Non-git root'ta dirty=false ancak source_digest boylece bilinmeyen kaynak da
 * deterministik olarak ayrisir (null source_digest uretilmez).
 */
export function computeSourceIdentity(root: string, manifest: SnapshotManifest): SourceIdentity {
  const git = isGitRepository(root);
  const headCommit = git ? gitHeadCommit(root) : null;
  let dirty = false;
  if (git) {
    const status = gitRun(root, ["status", "--porcelain"]);
    // git yok/erisilemez/hata: false-clean kabul edilmez (fail-closed).
    dirty = !status.ok || status.stdout.trim().length > 0;
  }
  const dirtyDigest = dirty ? sourceDigestFromManifest(manifest) : null;
  return {
    head_commit: headCommit,
    dirty,
    dirty_digest: dirtyDigest,
    source_digest: sourceDigestFromManifest(manifest),
    build_digest: buildDigestFromManifest(manifest),
  };
}

/**
 * P03: iki source identity karsilastirmasi. R04/PP11: recorded tarafinda null/bos alan
 * varken (eski kayit, bilinmeyen kaynak) degisim OLDUGU kabul edilir - unchanged
 * sayilmaz. Iki taraf da dolu ise alan bazli birebir karsilastirma.
 *
 * - source_digest/build_digest her zaman kaydedilmelidir (null/bos = bilinmeyen kaynak).
 * - head_commit: non-git root'ta iki taraf da null ise stabil; recorded null iken
 *   current dolu ise (git ortama girdi) kanitlanamayan degisim sayilir.
 * - recorded dirty=true iken dirty_digest null ise eski/eksik kayit -> bilinmeyen.
 */
export function computeSourceChange(recorded: SourceIdentity, current: SourceIdentity): { changed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (recorded.source_digest === "" || recorded.build_digest === "") {
    reasons.push("RECORDED_SOURCE_IDENTITY_UNKNOWN");
  }
  if (recorded.dirty === true && recorded.dirty_digest === null) {
    reasons.push("RECORDED_DIRTY_DIGEST_UNKNOWN");
  }
  if (recorded.head_commit === null && current.head_commit !== null) {
    reasons.push("HEAD_UNKNOWN");
  }
  if (reasons.length > 0) {
    return { changed: true, reasons };
  }
  if (recorded.head_commit !== current.head_commit) {
    reasons.push("HEAD_COMMIT");
  }
  if (recorded.source_digest !== current.source_digest) {
    reasons.push("SOURCE_DIGEST");
  }
  if (recorded.build_digest !== current.build_digest) {
    reasons.push("BUILD_DIGEST");
  }
  return { changed: reasons.length > 0, reasons };
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
  // D08/F10: normal cwd'de startsWith("") nedeniyle false donen acik duzeltildi;
  // sadece relative containment kontrol edilir.
  const rel = relative(root, candidate);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
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
    const git = isGitRepository(this.root);
    const headCommit = git ? gitHeadCommit(this.root) : null;
    // P03: git status basarisiz/erisilemez ise false-clean kabul edilmez (fail-closed).
    // (computeSourceIdentity ayni kurali identity uzerine de uygular.)
    let dirty = false;
    if (git) {
      const status = gitRun(this.root, ["status", "--porcelain"]);
      dirty = !status.ok || status.stdout.trim().length > 0;
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
