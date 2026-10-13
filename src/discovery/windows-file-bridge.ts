/** Small Windows helper boundary. All paths are passed as typed argv, never a shell. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../domain/errors.js";

/** Expected digest must come from a trusted release manifest, not the helper. */
export interface WindowsFileHelperSpec { path: string; sha256: string }

export interface WindowsFileIdentity {
  volumeSerial: string;
  fileId: string;
  linkCount: number;
  bytes: number;
}

export interface WindowsCopyResult extends WindowsFileIdentity {
  sha256: string;
}

export function assertTrustedWindowsFileHelper(helper: WindowsFileHelperSpec): void {
  if (process.platform !== "win32") throw new AppError("POLICY_VIOLATION", "Windows file helper requires Windows");
  try {
    if (!isAbsolute(helper.path) || !/^[0-9a-f]{64}$/u.test(helper.sha256) || lstatSync(helper.path).isSymbolicLink() ||
        realpathSync(helper.path).toLowerCase() !== helper.path.toLowerCase() ||
        createHash("sha256").update(readFileSync(helper.path)).digest("hex") !== helper.sha256) {
      throw new Error("identity mismatch");
    }
  } catch {
    throw new AppError("BLOCKED_ISOLATION", "Windows file helper identity is not trusted", { reason_code: "WINDOWS_FILE_HELPER_IDENTITY" });
  }
}

/** Resolve the packaged binary from its checked source/binary manifest. */
export function packagedWindowsFileHelper(): WindowsFileHelperSpec {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../../native/windows-file-helper.manifest.json", import.meta.url), "utf8")) as unknown;
    if (!manifest || typeof manifest !== "object" || !("schema_version" in manifest) || manifest.schema_version !== 1 ||
        !("source_sha256" in manifest) || typeof manifest.source_sha256 !== "string" ||
        !("binary_sha256" in manifest) || typeof manifest.binary_sha256 !== "string") throw new Error("invalid manifest");
    const sourceSha = createHash("sha256").update(readFileSync(new URL("../../native/windows-file-helper.cpp", import.meta.url))).digest("hex");
    if (sourceSha !== manifest.source_sha256) throw new Error("source mismatch");
    const helper = { path: fileURLToPath(new URL("../../native/bin/windows-file-helper.exe", import.meta.url)),
      sha256: manifest.binary_sha256 };
    assertTrustedWindowsFileHelper(helper);
    return helper;
  } catch {
    throw new AppError("BLOCKED_ISOLATION", "Packaged Windows file helper provenance is invalid", {
      reason_code: "WINDOWS_FILE_HELPER_PROVENANCE",
    });
  }
}

function invoke(helper: WindowsFileHelperSpec, args: string[]): string[] {
  assertTrustedWindowsFileHelper(helper);
  const run = spawnSync(helper.path, args, { shell: false, windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 });
  if (run.error || run.status !== 0 || run.signal) {
    if (run.status === 3) {
      throw new AppError("BLOCKED_ISOLATION", "Windows file helper refuses cross-volume copy", {
        reason_code: "WINDOWS_FILE_CROSS_VOLUME",
      });
    }
    throw new AppError("BLOCKED_ISOLATION", "Windows file helper rejected path or failed", {
      reason_code: "WINDOWS_FILE_HELPER_FAILED", exit_code: run.status, signal: run.signal,
    });
  }
  const fields = run.stdout.trim().split("\t");
  if (fields[0] !== "OK" || fields.length < 5 || !/^[0-9a-f]{16}$/u.test(fields[1] ?? "") ||
      !/^[0-9a-f]{32}$/u.test(fields[2] ?? "") || !/^\d+$/u.test(fields[3] ?? "") ||
      !/^\d+$/u.test(fields[4] ?? "")) {
    throw new AppError("BLOCKED_ISOLATION", "Windows file helper returned invalid identity", { reason_code: "WINDOWS_FILE_HELPER_PROTOCOL" });
  }
  return fields;
}

function identity(fields: string[]): WindowsFileIdentity {
  const linkCount = Number(fields[3]);
  const bytes = Number(fields[4]);
  if (!Number.isSafeInteger(linkCount) || linkCount < 1 || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new AppError("BLOCKED_ISOLATION", "Windows file helper returned invalid numbers", { reason_code: "WINDOWS_FILE_HELPER_PROTOCOL" });
  }
  return { volumeSerial: fields[1]!, fileId: fields[2]!, linkCount, bytes };
}

export function inspectWindowsPath(helper: WindowsFileHelperSpec, path: string): WindowsFileIdentity {
  const fields = invoke(helper, ["inspect", path]);
  if (fields.length !== 5) throw new AppError("BLOCKED_ISOLATION", "Invalid inspect response", { reason_code: "WINDOWS_FILE_HELPER_PROTOCOL" });
  return identity(fields);
}

export function copyWindowsFile(helper: WindowsFileHelperSpec, sourceRoot: string, sourceRelativePath: string,
  targetRoot: string, targetRelativePath: string): WindowsCopyResult {
  const fields = invoke(helper, ["copy", sourceRoot, sourceRelativePath, targetRoot, targetRelativePath]);
  if (fields.length !== 6 || !/^[0-9a-f]{64}$/u.test(fields[5] ?? "")) {
    throw new AppError("BLOCKED_ISOLATION", "Invalid copy response", { reason_code: "WINDOWS_FILE_HELPER_PROTOCOL" });
  }
  return { ...identity(fields), sha256: fields[5]! };
}
