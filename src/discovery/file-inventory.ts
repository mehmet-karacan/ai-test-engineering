/** Metadata inventory. It never follows reparse points or writes to the scanned root. */
import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readdirSync, readlinkSync, type Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { AppError } from "../domain/errors.js";

export type InventoryKind = "file" | "directory" | "symlink" | "other" | "unknown";
export type HashStatus = "COMPUTED" | "NOT_COMPUTED" | "NOT_APPLICABLE" | "ERROR";
export type ReadStatus = "OK" | "ACCESS_DENIED" | "ERROR" | "CHANGED_DURING_SCAN";

export interface FileInventoryEntry {
  relativePath: string;
  kind: InventoryKind;
  size: number | null;
  mtimeMs: number | null;
  hash: string | null;
  hashStatus: HashStatus;
  readStatus: ReadStatus;
  linkTarget: string | null;
  /** Native FileId evidence, when the caller supplies a trusted provider. */
  fileIdentity?: FileInventoryIdentityReceipt | null;
}

/** A compact, read-only identity receipt when a native provider can supply one. */
export interface FileInventoryIdentityReceipt {
  volumeSerial: string;
  fileId: string;
  linkCount: number;
  bytes: number;
}

export interface FileInventoryOptions {
  cursor?: string | null;
  pageSize?: number;
  generation?: number;
  requiredHashPaths?: string[];
  /** Directory reader override for deterministic permission fault injection. */
  readDir?: (path: string) => Dirent[];
  /** Optional native identity reader. It is never required for a metadata scan. */
  fileIdentity?: (path: string) => FileInventoryIdentityReceipt | null;
}

export interface FileInventoryPage {
  entries: FileInventoryEntry[];
  nextCursor: string | null;
  complete: boolean;
  partial: boolean;
  errors: Array<{ relativePath: string; code: string }>;
}

/** A digest for a complete single-page scan. Durable paged digests are computed by InventoryRepository. */
export function inventoryDigestFromCompletePage(page: FileInventoryPage): string {
  if (!page.complete || page.partial || page.nextCursor !== null || page.errors.length > 0 ||
      page.entries.some((entry) => entry.readStatus !== "OK")) {
    throw new AppError("POLICY_VIOLATION", "Incomplete inventory has no trusted digest");
  }
  const ordered = [...page.entries].sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  for (let index = 0; index < ordered.length; index++) {
    const entry = ordered[index]!;
    if (!entry.relativePath || entry.relativePath === "." || entry.relativePath.startsWith("/") ||
        entry.relativePath.includes("\\") || entry.relativePath.split("/").includes("..") ||
        (index > 0 && entry.relativePath === ordered[index - 1]!.relativePath)) {
      throw new AppError("INVALID_PARAMETERS", "Invalid or duplicate inventory path");
    }
  }
  const canonical = ordered.map(({ relativePath, kind, size, mtimeMs, hash, hashStatus, readStatus, linkTarget, fileIdentity }) =>
    [relativePath, kind, size, mtimeMs, hash, hashStatus, readStatus, linkTarget, fileIdentity ?? null]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? "UNKNOWN";
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

interface WalkContext {
  required: Set<string>;
  readDir: (path: string) => Dirent[];
  fileIdentity?: (path: string) => FileInventoryIdentityReceipt | null;
}

async function* walk(root: string, relativePath: string, context: WalkContext): AsyncGenerator<FileInventoryEntry> {
  const absolute = join(root, ...relativePath.split("/"));
  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    yield { relativePath, kind: "unknown", size: null, mtimeMs: null, hash: null,
      hashStatus: "ERROR", readStatus: errorCode(error) === "EACCES" || errorCode(error) === "EPERM" ? "ACCESS_DENIED" : "ERROR", linkTarget: null,
      fileIdentity: null };
    return;
  }
  const kind: InventoryKind = info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
  let children: Dirent[] = [];
  let readStatus: ReadStatus = "OK";
  let linkTarget: string | null = null;
  let hash: string | null = null;
  let hashStatus: HashStatus = kind === "file" ? "NOT_COMPUTED" : "NOT_APPLICABLE";
  if (kind === "directory") {
    try { children = context.readDir(absolute).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
    catch (error) { readStatus = errorCode(error) === "EACCES" || errorCode(error) === "EPERM" ? "ACCESS_DENIED" : "ERROR"; }
  } else if (kind === "symlink") {
    try { linkTarget = readlinkSync(absolute); }
    catch (error) { readStatus = errorCode(error) === "EACCES" || errorCode(error) === "EPERM" ? "ACCESS_DENIED" : "ERROR"; }
  } else if (kind === "file" && context.required.has(relativePath)) {
    try {
      hash = await hashFile(absolute);
      const after = lstatSync(absolute);
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || !after.isFile()) {
        hash = null;
        hashStatus = "ERROR";
        readStatus = "CHANGED_DURING_SCAN";
      } else hashStatus = "COMPUTED";
    } catch (error) {
      hashStatus = "ERROR";
      readStatus = errorCode(error) === "EACCES" || errorCode(error) === "EPERM" ? "ACCESS_DENIED" : "ERROR";
    }
  }
  let fileIdentity: FileInventoryIdentityReceipt | null = null;
  if (context.fileIdentity && readStatus === "OK" && kind !== "symlink") {
    try { fileIdentity = context.fileIdentity(absolute); }
    catch { fileIdentity = null; }
  }
  yield { relativePath, kind, size: info.size, mtimeMs: info.mtimeMs, hash, hashStatus, readStatus, linkTarget, fileIdentity };
  if (kind === "directory" && readStatus === "OK") {
    for (const child of children) {
      yield* walk(root, `${relativePath}/${child.name}`, context);
    }
  }
}

export function inventoryCursorForPath(rootPath: string, generation: number, requiredHashPaths: string[],
    afterPath: string | null, partial = false, requiredSeen: string[] = []): string {
  const root = resolve(rootPath);
  const requiredDigest = createHash("sha256").update(JSON.stringify([...new Set(requiredHashPaths)].sort())).digest("hex");
  return Buffer.from(JSON.stringify({ v: 3, root, generation, requiredDigest, afterPath, partial,
    requiredSeen: [...new Set(requiredSeen)].sort() })).toString("base64url");
}

function cursorState(cursor: string | null | undefined, root: string, generation: number,
    requiredDigest: string): { afterPath: string | null; partial: boolean; requiredSeen: Set<string> } {
  if (!cursor) return { afterPath: null, partial: false, requiredSeen: new Set() };
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) throw new Error("bad cursor");
    const parsed = value as Record<string, unknown>;
    if (parsed["v"] !== 3 || parsed["root"] !== root || parsed["generation"] !== generation ||
      parsed["requiredDigest"] !== requiredDigest ||
      (parsed["afterPath"] !== null && typeof parsed["afterPath"] !== "string") || typeof parsed["partial"] !== "boolean" ||
      !Array.isArray(parsed["requiredSeen"]) || parsed["requiredSeen"].some((path) => typeof path !== "string")) throw new Error("bad cursor");
    return { afterPath: parsed["afterPath"] as string | null, partial: parsed["partial"] as boolean,
      requiredSeen: new Set(parsed["requiredSeen"] as string[]) };
  } catch {
    throw new AppError("INVALID_PARAMETERS", "Invalid inventory cursor");
  }
}

export async function scanFileInventory(rootPath: string, options: FileInventoryOptions = {}): Promise<FileInventoryPage> {
  const root = resolve(rootPath);
  if (lstatSync(root).isSymbolicLink()) {
    throw new AppError("INVALID_PARAMETERS", "Inventory root cannot be a reparse point");
  }
  const pageSize = options.pageSize ?? 100;
  const generation = options.generation ?? 1;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000 || !Number.isSafeInteger(generation) || generation < 1) {
    throw new AppError("INVALID_PARAMETERS", "Invalid inventory page size or generation");
  }
  const requiredPaths = options.requiredHashPaths ?? [];
  if (!Array.isArray(requiredPaths) || requiredPaths.some((path) => typeof path !== "string" || !path ||
      path.includes("\\") || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === ".."))) {
    throw new AppError("INVALID_PARAMETERS", "Invalid required inventory path");
  }
  const required = new Set(requiredPaths);
  const requiredDigest = createHash("sha256").update(JSON.stringify([...required].sort())).digest("hex");
  const previous = cursorState(options.cursor, root, generation, requiredDigest);
  const afterPath = previous.afterPath;
  const requiredSeen = new Set(previous.requiredSeen);
  const readDir = options.readDir ?? ((path: string) => readdirSync(path, { withFileTypes: true }));
  const entries: FileInventoryEntry[] = [];
  const errors: FileInventoryPage["errors"] = [];
  let hasNext = false;
  let top: Dirent[];
  try { top = readDir(root).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
  catch (error) {
    return { entries: [], nextCursor: null, complete: false, partial: true, errors: [{ relativePath: ".", code: errorCode(error) }] };
  }
  for (const child of top) {
    for await (const entry of walk(root, child.name, options.fileIdentity ? { required, readDir, fileIdentity: options.fileIdentity } : { required, readDir })) {
      const isAfterCursor = entry.relativePath > (afterPath ?? "");
      if (isAfterCursor && entry.readStatus !== "OK") errors.push({ relativePath: entry.relativePath, code: entry.readStatus });
      if (required.has(entry.relativePath)) {
        const wasSeen = requiredSeen.has(entry.relativePath);
        requiredSeen.add(entry.relativePath);
        if (isAfterCursor || !wasSeen) {
          if (entry.kind !== "file") errors.push({ relativePath: entry.relativePath, code: "REQUIRED_INPUT_UNSUPPORTED" });
          else if (entry.hashStatus !== "COMPUTED") errors.push({ relativePath: entry.relativePath, code: "REQUIRED_INPUT_UNHASHED" });
        }
      }
      if (!isAfterCursor) continue;
      if (entries.length >= pageSize) { hasNext = true; break; }
      entries.push(entry);
    }
    if (hasNext) break;
  }
  if (!hasNext) for (const path of required) {
    if (!requiredSeen.has(path)) errors.push({ relativePath: path, code: "REQUIRED_INPUT_MISSING" });
  }
  const partial = previous.partial || errors.length > 0;
  const nextCursor = hasNext ? inventoryCursorForPath(root, generation, [...required], entries.at(-1)?.relativePath ?? afterPath,
    partial, [...requiredSeen]) : null;
  return { entries, nextCursor, complete: !hasNext && !partial, partial, errors };
}
