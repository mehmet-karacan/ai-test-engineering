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
}

export interface FileInventoryOptions {
  cursor?: string | null;
  pageSize?: number;
  generation?: number;
  requiredHashPaths?: string[];
  /** Directory reader override for deterministic permission fault injection. */
  readDir?: (path: string) => Dirent[];
}

export interface FileInventoryPage {
  entries: FileInventoryEntry[];
  nextCursor: string | null;
  complete: boolean;
  partial: boolean;
  errors: Array<{ relativePath: string; code: string }>;
}

/** A digest for a complete single-page scan. Paged/generation-stable digests await S04 persistence. */
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
  const canonical = ordered.map(({ relativePath, kind, size, mtimeMs, hash, hashStatus, readStatus, linkTarget }) =>
    [relativePath, kind, size, mtimeMs, hash, hashStatus, readStatus, linkTarget]);
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
}

async function* walk(root: string, relativePath: string, context: WalkContext): AsyncGenerator<FileInventoryEntry> {
  const absolute = join(root, ...relativePath.split("/"));
  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    yield { relativePath, kind: "unknown", size: null, mtimeMs: null, hash: null,
      hashStatus: "ERROR", readStatus: errorCode(error) === "EACCES" || errorCode(error) === "EPERM" ? "ACCESS_DENIED" : "ERROR", linkTarget: null };
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
  yield { relativePath, kind, size: info.size, mtimeMs: info.mtimeMs, hash, hashStatus, readStatus, linkTarget };
  if (kind === "directory" && readStatus === "OK") {
    for (const child of children) {
      yield* walk(root, `${relativePath}/${child.name}`, context);
    }
  }
}

function cursorState(cursor: string | null | undefined, root: string, generation: number,
    requiredDigest: string): { index: number; partial: boolean } {
  if (!cursor) return { index: 0, partial: false };
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) throw new Error("bad cursor");
    const parsed = value as Record<string, unknown>;
    if (parsed["v"] !== 2 || parsed["root"] !== root || parsed["generation"] !== generation ||
      parsed["requiredDigest"] !== requiredDigest ||
      !Number.isSafeInteger(parsed["index"]) || (parsed["index"] as number) < 0 || typeof parsed["partial"] !== "boolean") throw new Error("bad cursor");
    return { index: parsed["index"] as number, partial: parsed["partial"] as boolean };
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
  const start = previous.index;
  const requiredSeen = new Set<string>();
  const readDir = options.readDir ?? ((path: string) => readdirSync(path, { withFileTypes: true }));
  const entries: FileInventoryEntry[] = [];
  const errors: FileInventoryPage["errors"] = [];
  let seen = 0;
  let hasNext = false;
  let top: Dirent[];
  try { top = readDir(root).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
  catch (error) {
    return { entries: [], nextCursor: null, complete: false, partial: true, errors: [{ relativePath: ".", code: errorCode(error) }] };
  }
  for (const child of top) {
    for await (const entry of walk(root, child.name, { required, readDir })) {
      if (entry.readStatus !== "OK") errors.push({ relativePath: entry.relativePath, code: entry.readStatus });
      if (required.has(entry.relativePath)) {
        requiredSeen.add(entry.relativePath);
        if (entry.kind !== "file") errors.push({ relativePath: entry.relativePath, code: "REQUIRED_INPUT_UNSUPPORTED" });
        else if (entry.hashStatus !== "COMPUTED") errors.push({ relativePath: entry.relativePath, code: "REQUIRED_INPUT_UNHASHED" });
      }
      if (seen++ < start) continue;
      if (entries.length >= pageSize) { hasNext = true; break; }
      entries.push(entry);
    }
    if (hasNext) break;
  }
  if (!hasNext) for (const path of required) {
    if (!requiredSeen.has(path)) errors.push({ relativePath: path, code: "REQUIRED_INPUT_MISSING" });
  }
  const partial = previous.partial || errors.length > 0;
  const nextCursor = hasNext ? Buffer.from(JSON.stringify({ v: 2, root, generation, requiredDigest,
    index: start + entries.length, partial })).toString("base64url") : null;
  return { entries, nextCursor, complete: !hasNext && !partial, partial, errors };
}
