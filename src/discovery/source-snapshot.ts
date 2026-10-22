/**
 * Kaynak snapshot'i: salt-okunur envanter + ownership'li kopya + hash manifest.
 * Symlink/junction ile izin disi path'e cikma engellenir; dirty kaynak goz ardi edilmez.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, openSync, readSync, closeSync, mkdirSync, copyFileSync, writeFileSync, constants } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { AppError } from "../domain/errors.js";
import { inspectWindowsPath, packagedWindowsFileHelper, type WindowsFileIdentity } from "./windows-file-bridge.js";
import { publishWindowsSnapshot } from "./windows-snapshot-bridge.js";

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
// Runtime/build output is not source input. Keep these directories out of the
// source manifest so an application log cannot block discovery or enter a
// snapshot just because it grew beyond the file-size policy limit.
const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", "target", "build"]);

export function sha256File(path: string): string {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new AppError("POLICY_VIOLATION", `Hash girdisi duzenli dosya degil: ${path}`);
  }
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(path, "r");
  try {
    let bytesRead: number;
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytesRead));
  } finally {
    closeSync(fd);
  }
  const after = lstatSync(path);
  if (!after.isFile() || after.isSymbolicLink() || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      before.dev !== after.dev || before.ino !== after.ino) {
    throw new AppError("POLICY_VIOLATION", `Hash sirasinda dosya degisti: ${path}`);
  }
  return hash.digest("hex");
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
  if (parts[0] === ".mvn" || normalized === "mvnw" || normalized === "mvnw.cmd" ||
    normalized.endsWith("pom.xml") || normalized.endsWith("build.gradle") || normalized.endsWith("settings.gradle") || normalized.endsWith(".kts")) {
    return "build_config";
  }
  return "resource";
}

function assertNoLinks(base: string, candidate: string): void {
  const rel = relative(base, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new AppError("POLICY_VIOLATION", `Snapshot yolu kok disina cikiyor: ${candidate}`);
  }
  let current = base;
  for (const part of ["", ...rel.split(sep).filter(Boolean)]) {
    current = part ? join(current, part) : current;
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new AppError("POLICY_VIOLATION", `Snapshot yolu baglanti iceriyor: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function sameWindowsRoot(a: WindowsFileIdentity, b: WindowsFileIdentity): boolean {
  return a.volumeSerial === b.volumeSerial && a.fileId === b.fileId;
}

function isWithinPath(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function assertManifestPaths(manifest: SnapshotManifest, root: string): void {
  if (manifest.schema_version !== 1 || manifest.root !== root) {
    throw new AppError("POLICY_VIOLATION", "Snapshot manifest kok kimligi uyusmuyor");
  }
  const seen = new Set<string>();
  // Native reopen accepts at most 64 MiB of durable session receipts.
  // Account for the fixed root header and final-manifest FileId receipt first.
  let receiptBytes = Buffer.byteLength("AITEST_SNAPSHOT_V1\n") + 2 * (48 + 1) + 51;
  for (const entry of manifest.entries) {
    const path = entry.relative_path;
    const parts = path.split("/");
    const folded = path.toLowerCase();
    const invalidWindowsName = process.platform === "win32" && parts.some((part) => {
      const stem = part.split(".", 1)[0]!.toUpperCase();
      return Array.from(part).some((character) => character.codePointAt(0)! < 32) ||
        /[:*?"<>|]/u.test(part) || /[. ]$/u.test(part) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(stem);
    });
    if (!path || path.includes("\\") || isAbsolute(path) || parts.some((part) => !part || part === "." || part === "..") ||
        invalidWindowsName || folded === "snapshot-manifest.json" || folded === ".aitest-snapshot-session" ||
        folded.startsWith("snapshot-manifest.json.tmp-") || seen.has(folded) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
        !/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      throw new AppError("POLICY_VIOLATION", `Snapshot manifest girdisi gecersiz: ${path}`);
    }
    receiptBytes += 52 + Buffer.byteLength(path, "utf16le") * 2;
    if (receiptBytes > 64 * 1024 * 1024) {
      throw new AppError("POLICY_VIOLATION", "Snapshot session receipt limit exceeded", {
        reason_code: "SNAPSHOT_JOURNAL_LIMIT",
      });
    }
    seen.add(folded);
  }
}

export class SourceSnapshot {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  get rootPath(): string {
    return this.root;
  }

  walk(dir?: string, depth = 0, maxFiles = 200000): string[] {
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 0) {
      throw new AppError("POLICY_VIOLATION", `Dosya sayisi siniri gecersiz: ${maxFiles}`);
    }
    const entries: string[] = [];
    const pending = [{ path: dir ?? this.root, depth }];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current.depth > 64) {
        throw new AppError("POLICY_VIOLATION", `Dizin derinligi siniri asildi: ${current.path}`);
      }
      const lstat = lstatSync(current.path);
      if (lstat.isSymbolicLink()) {
        throw new AppError("POLICY_VIOLATION", `Snapshot yolu baglanti iceriyor: ${current.path}`);
      }
      if (lstat.isDirectory()) {
        const children = readdirSync(current.path);
        // Reverse push preserves the former depth-first filesystem order.
        for (let index = children.length - 1; index >= 0; index--) {
          const name = children[index]!;
          const isMavenRoot = current.path === this.root || existsSync(join(current.path, "pom.xml"));
          if (IGNORED_DIRECTORY_NAMES.has(name) || (name === "logs" && isMavenRoot)) continue;
          pending.push({ path: join(current.path, name), depth: current.depth + 1 });
        }
        continue;
      }
      entries.push(current.path);
      if (entries.length > maxFiles) {
        throw new AppError("POLICY_VIOLATION", `Dosya sayisi siniri asildi: ${entries.length} > ${maxFiles}`);
      }
    }
    return entries;
  }

  buildManifest(options?: { maxFiles?: number; maxFileBytes?: number; requiredBuildInputPaths?: string[] }): SnapshotManifest {
    const maxFiles = options?.maxFiles ?? 200000;
    const maxFileBytes = options?.maxFileBytes ?? 64 * 1024 * 1024;
    const files = this.walk(undefined, 0, maxFiles);
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

    for (const required of options?.requiredBuildInputPaths ?? []) {
      if (typeof required !== "string" || !required || required.includes("\\") || isAbsolute(required) ||
          required.split("/").some((part) => !part || part === "." || part === "..") ||
          !entries.some((entry) => entry.relative_path === required && entry.classification === "build_config" &&
            /^[0-9a-f]{64}$/u.test(entry.sha256))) {
        throw new AppError("POLICY_VIOLATION", `Required build input missing or unhashed: ${required}`);
      }
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
    assertManifestPaths(manifest, this.root);
    if (isWithinPath(this.root, absTarget) || isWithinPath(absTarget, this.root)) {
      throw new AppError("POLICY_VIOLATION", "Snapshot source and target roots overlap");
    }
    if (process.platform === "win32") {
      // The native helper anchors every child to an already existing target root.
      // Creating that root through an unchecked path could write through a junction.
      if (!existsSync(absTarget) || !lstatSync(absTarget).isDirectory()) {
        throw new AppError("BLOCKED_ISOLATION", "Windows snapshot target root must already exist", {
          reason_code: "SNAPSHOT_TARGET_ROOT_UNOWNED",
        });
      }
      const helper = packagedWindowsFileHelper();
      const sourceIdentity = inspectWindowsPath(helper, this.root);
      const targetIdentity = inspectWindowsPath(helper, absTarget);
      if (sameWindowsRoot(sourceIdentity, targetIdentity)) {
        throw new AppError("POLICY_VIOLATION", "Snapshot source and target are the same physical root");
      }
      const assertRoots = (): void => {
        if (!sameWindowsRoot(sourceIdentity, inspectWindowsPath(helper, this.root)) ||
            !sameWindowsRoot(targetIdentity, inspectWindowsPath(helper, absTarget))) {
          throw new AppError("BLOCKED_ISOLATION", "Snapshot root identity changed", {
            reason_code: "SNAPSHOT_ROOT_CHANGED",
          });
        }
      };
      publishWindowsSnapshot(this.root, absTarget, sourceIdentity, targetIdentity, manifest);
      assertRoots();
      return;
    }
    mkdirSync(absTarget, { recursive: true });
    for (const entry of manifest.entries) {
      const targetPath = resolve(absTarget, entry.relative_path.replace(/\//g, sep));
      const sourcePath = resolve(this.root, entry.relative_path.replace(/\//g, sep));
      assertNoLinks(this.root, sourcePath);
      assertNoLinks(absTarget, targetPath);
      mkdirSync(join(targetPath, ".."), { recursive: true });
      assertNoLinks(absTarget, targetPath);
      copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL);
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
