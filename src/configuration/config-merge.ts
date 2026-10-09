/**
 * Config merge: JSON/JSONC icindeki diger MCP'ler, provider/model/agent/plugin/permission
 * alanlari ve bilinmeyen alanlar korunur. Yalniz urunun sahipligi bilinen kaydi degisir.
 * Atomik temp+replace; preimage kontrolu; kalici backup.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";

export interface MergeResult {
  changed: boolean;
  backup_path: string | null;
  preimage_sha256: string;
  postimage_sha256: string;
  preserved_keys: string[];
}

export interface MergeOptions {
  /** Degistirilecek tek kayit yolu (orn. mcp["ai-test-engineering"]) */
  record_path: Array<string | number>;
  /** Yazilacak yeni deger (undefined ise kayit silinir) */
  new_value: unknown | undefined;
  /** Kalici backup dizini (bos ise backup yok) */
  backup_dir?: string | undefined;
}

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** JSONC yorumlarini soyar (stringleri koruyarak) */
export function stripJsonComments(content: string): string {
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    if (inString) {
      result += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    if (ch === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (ch === "/" && content[i + 1] === "*") {
      i += 2;
      while (i < content.length - 1 && !(content[i] === "*" && content[i + 1] === "/")) {
        i++;
      }
      i++;
      continue;
    }
    result += ch;
  }
  return result;
}

export function readConfigFile(path: string): { raw: string; parsed: Record<string, unknown>; jsonc: boolean } {
  if (!existsSync(path)) {
    throw new AppError("INVALID_PARAMETERS", `Config bulunamadi: ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  const jsonc = /\/\/|\/\*/.test(stripStrings(raw));
  try {
    const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
    return { raw, parsed, jsonc };
  } catch (error) {
    throw new AppError("INVALID_PARAMETERS", `Desteklenmeyen config formati (parse hatasi; bozulmadan birakilir): ${path}`, {
      cause: String(error),
    });
  }
}

function stripStrings(content: string): string {
  return content.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function setNested(obj: Record<string, unknown>, path: Array<string | number>, value: unknown | undefined): { changed: boolean; preserved: string[] } {
  const topKeys = Object.keys(obj);
  if (path.length === 0) {
    return { changed: false, preserved: topKeys };
  }
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const next = current[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1]!;
  if (value === undefined) {
    if (lastKey in current) {
      delete current[lastKey];
      return { changed: true, preserved: topKeys };
    }
    return { changed: false, preserved: topKeys };
  }
  const existing = current[lastKey];
  if (JSON.stringify(existing) === JSON.stringify(value)) {
    return { changed: false, preserved: topKeys };
  }
  current[lastKey] = value;
  return { changed: true, preserved: topKeys };
}

export function mergeConfigRecord(configPath: string, options: MergeOptions): MergeResult {
  const absPath = resolve(configPath);
  const { raw, parsed } = readConfigFile(absPath);
  const preimageHash = sha256(raw);

  const { changed, preserved } = setNested(parsed, options.record_path, options.new_value);
  const postimageJson = JSON.stringify(parsed, null, 2) + "\n";
  const postimageHash = sha256(postimageJson);

  if (!changed) {
    return { changed: false, backup_path: null, preimage_sha256: preimageHash, postimage_sha256: preimageHash, preserved_keys: preserved };
  }

  let backupPath: string | null = null;
  if (options.backup_dir) {
    mkdirSync(options.backup_dir, { recursive: true });
    backupPath = join(options.backup_dir, `config-backup-${Date.now()}-${preimageHash.slice(0, 12)}.json`);
    copyFileSync(absPath, backupPath);
  }

  mkdirSync(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, postimageJson, "utf8");
  try {
    renameSync(tmpPath, absPath);
  } catch {
    rmSync(absPath, { force: true });
    renameSync(tmpPath, absPath);
  }

  const verify = readConfigFile(absPath);
  if (sha256(verify.raw) !== postimageHash) {
    if (backupPath) {
      copyFileSync(backupPath, absPath);
    }
    throw new AppError("STORAGE_ERROR", "Config merge dogrulama hatasi; rollback yapildi", { reason_code: "MERGE_VERIFY_FAILED" });
  }

  return { changed: true, backup_path: backupPath, preimage_sha256: preimageHash, postimage_sha256: postimageHash, preserved_keys: preserved };
}

export function sentinelHash(configPath: string): string {
  return sha256(readFileSync(configPath, "utf8"));
}

export function removeConfigRecord(configPath: string, recordPath: Array<string | number>, backupDir?: string): MergeResult {
  return mergeConfigRecord(configPath, { record_path: recordPath, new_value: undefined, backup_dir: backupDir });
}
