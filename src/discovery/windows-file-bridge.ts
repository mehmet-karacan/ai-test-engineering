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

/** Delete a DB-authorized blob by its pinned native FileId after the DB row is durably DELETED. */
export function deleteWindowsOwnedFile(helper: WindowsFileHelperSpec, root: string, relativePath: string,
  expectedRoot: WindowsFileIdentity, expectedFile: WindowsFileIdentity & { sha256: string }): void {
  assertTrustedWindowsFileHelper(helper);
  if (!isAbsolute(root) || !relativePath || isAbsolute(relativePath) ||
      !/^[a-f0-9]{64}$/u.test(expectedFile.sha256) ||
      !/^[a-f0-9]{16}$/u.test(expectedRoot.volumeSerial) || !/^[a-f0-9]{32}$/u.test(expectedRoot.fileId) ||
      !/^[a-f0-9]{16}$/u.test(expectedFile.volumeSerial) || !/^[a-f0-9]{32}$/u.test(expectedFile.fileId) ||
      !Number.isSafeInteger(expectedFile.bytes) || expectedFile.bytes < 0) {
    throw new AppError("BLOCKED_ISOLATION", "Invalid owned delete request", { reason_code: "WINDOWS_OWNED_DELETE_INVALID" });
  }
  const run = spawnSync(helper.path, ["delete-owned-session", root, relativePath,
    expectedFile.volumeSerial, expectedFile.fileId, String(expectedFile.bytes), expectedFile.sha256,
    expectedRoot.volumeSerial, expectedRoot.fileId], {
    input: "DELETE\n", shell: false, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 8192,
  });
  const expectedOutput = `DELETE_READY\t${expectedFile.volumeSerial}\t${expectedFile.fileId}\t` +
    `${expectedFile.bytes}\t${expectedFile.sha256}\nDELETED\t${expectedFile.volumeSerial}\t${expectedFile.fileId}\n`;
  if (run.error || run.status !== 0 || run.signal || run.stdout.replace(/\r\n/gu, "\n") !== expectedOutput) {
    throw new AppError("BLOCKED_ISOLATION", "Native owned delete was rejected or uncertain", {
      reason_code: "WINDOWS_OWNED_DELETE_UNCERTAIN", exit_code: run.status, signal: run.signal,
    });
  }
}

export function copyWindowsFile(helper: WindowsFileHelperSpec, sourceRoot: string, sourceRelativePath: string,
  targetRoot: string, targetRelativePath: string): WindowsCopyResult {
  const fields = invoke(helper, ["copy", sourceRoot, sourceRelativePath, targetRoot, targetRelativePath]);
  if (fields.length !== 6 || !/^[0-9a-f]{64}$/u.test(fields[5] ?? "")) {
    throw new AppError("BLOCKED_ISOLATION", "Invalid copy response", { reason_code: "WINDOWS_FILE_HELPER_PROTOCOL" });
  }
  return { ...identity(fields), sha256: fields[5]! };
}

function invokeOwned(helper: WindowsFileHelperSpec, args: string[], ready: string, command: string): WindowsCopyResult {
  assertTrustedWindowsFileHelper(helper);
  const run = spawnSync(helper.path, args, {
    input: `${command}\n`, shell: false, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 8192,
  });
  const lines = run.stdout.replace(/\r\n/gu, "\n").split("\n");
  if (run.error || run.status !== 0 || run.signal || lines.length !== 3 || lines[0] !== ready || lines[2] !== "") {
    throw new AppError("BLOCKED_ISOLATION", "Owned native file operation rejected or uncertain", {
      reason_code: "WINDOWS_OWNED_FILE_UNCERTAIN", exit_code: run.status, signal: run.signal,
    });
  }
  const fields = lines[1]!.split("\t");
  if (fields[0] !== "OK" || fields.length !== 6 || !/^[a-f0-9]{16}$/u.test(fields[1] ?? "") ||
      !/^[a-f0-9]{32}$/u.test(fields[2] ?? "") || !/^\d+$/u.test(fields[3] ?? "") ||
      !/^\d+$/u.test(fields[4] ?? "") || !/^[a-f0-9]{64}$/u.test(fields[5] ?? "")) {
    throw new AppError("BLOCKED_ISOLATION", "Invalid owned native receipt", { reason_code: "WINDOWS_OWNED_FILE_PROTOCOL" });
  }
  return { ...identity(fields), sha256: fields[5]! };
}

/** Copy into a new stage file under roots pinned and matched to restore preflight identities. */
export function copyWindowsOwnedFile(helper: WindowsFileHelperSpec, sourceRoot: string, sourceRelativePath: string,
  targetRoot: string, targetRelativePath: string, expectedSourceRoot: WindowsFileIdentity,
  expectedTargetRoot: WindowsFileIdentity): WindowsCopyResult {
  return invokeOwned(helper, ["copy-owned", sourceRoot, sourceRelativePath, targetRoot, targetRelativePath,
    expectedSourceRoot.volumeSerial, expectedSourceRoot.fileId,
    expectedTargetRoot.volumeSerial, expectedTargetRoot.fileId], "COPY_READY", "COPY");
}

/** NO_REPLACE rename of the captured stage FileId within its pinned directory. */
export function renameWindowsOwnedFile(helper: WindowsFileHelperSpec, root: string,
  sourceRelativePath: string, targetRelativePath: string, expectedRoot: WindowsFileIdentity,
  expectedFile: WindowsCopyResult): WindowsCopyResult {
  const result = invokeOwned(helper, ["rename-owned", root, sourceRelativePath, targetRelativePath,
    expectedRoot.volumeSerial, expectedRoot.fileId,
    expectedFile.volumeSerial, expectedFile.fileId, String(expectedFile.bytes), expectedFile.sha256],
  "RENAME_READY", "RENAME");
  if (result.volumeSerial !== expectedFile.volumeSerial || result.fileId !== expectedFile.fileId ||
      result.bytes !== expectedFile.bytes || result.sha256 !== expectedFile.sha256) {
    throw new AppError("BLOCKED_ISOLATION", "Owned rename identity changed", { reason_code: "WINDOWS_OWNED_RENAME_UNCERTAIN" });
  }
  return result;
}

/** Hash a blob through a no-follow held handle under a known artifact root. */
export function verifyWindowsOwnedFile(helper: WindowsFileHelperSpec, root: string, relativePath: string,
  expectedRoot: WindowsFileIdentity, expected: { bytes: number; sha256: string; identity?: WindowsFileIdentity }): WindowsCopyResult {
  const fields = invoke(helper, ["verify-owned", root, relativePath,
    expectedRoot.volumeSerial, expectedRoot.fileId,
    expected.identity?.volumeSerial ?? "-", expected.identity?.fileId ?? "-",
    String(expected.bytes), expected.sha256]);
  if (fields.length !== 6 || !/^[a-f0-9]{64}$/u.test(fields[5] ?? "") ||
      Number(fields[4]) !== expected.bytes || fields[5] !== expected.sha256 ||
      (expected.identity && (fields[1] !== expected.identity.volumeSerial || fields[2] !== expected.identity.fileId))) {
    throw new AppError("BLOCKED_ISOLATION", "Owned file verification failed", { reason_code: "WINDOWS_OWNED_VERIFY_FAILED" });
  }
  return { ...identity(fields), sha256: fields[5]! };
}

/** Exclusive empty-file creation and identity capture use the same held native handle. */
export function createWindowsOwnedEmptyFile(helper: WindowsFileHelperSpec, root: string, relativePath: string,
  expectedRoot: WindowsFileIdentity): WindowsCopyResult {
  const fields = invoke(helper, ["create-empty-owned", root, relativePath, expectedRoot.volumeSerial, expectedRoot.fileId]);
  if (fields.length !== 6 || fields[5] !== createHash("sha256").update("").digest("hex") || fields[4] !== "0" || fields[3] !== "1") {
    throw new AppError("BLOCKED_ISOLATION", "Invalid owned empty create receipt", { reason_code: "WINDOWS_OWNED_CREATE_UNCERTAIN" });
  }
  return { ...identity(fields), sha256: fields[5]! };
}

/** Append one JSON journal line while a no-follow, single-link native handle pins the leaf. */
export function appendWindowsOwnedFile(helper: WindowsFileHelperSpec, root: string, relativePath: string,
  expectedRoot: WindowsFileIdentity, expectedFile: WindowsCopyResult, jsonLine: string): WindowsCopyResult {
  if (!jsonLine.startsWith("{") || !jsonLine.endsWith("}") || /[\r\n]/u.test(jsonLine) ||
      Buffer.byteLength(jsonLine, "utf8") > 1024 * 1024 || expectedFile.linkCount !== 1) {
    throw new AppError("BLOCKED_ISOLATION", "Invalid owned journal append", { reason_code: "WINDOWS_OWNED_APPEND_INVALID" });
  }
  const result = invokeOwned(helper, ["append-owned", root, relativePath,
    expectedRoot.volumeSerial, expectedRoot.fileId, expectedFile.volumeSerial, expectedFile.fileId,
    String(expectedFile.bytes), expectedFile.sha256], "APPEND_READY", jsonLine);
  if (result.volumeSerial !== expectedFile.volumeSerial || result.fileId !== expectedFile.fileId || result.linkCount !== 1 ||
      result.bytes !== expectedFile.bytes + Buffer.byteLength(jsonLine, "utf8") + 1) {
    throw new AppError("BLOCKED_ISOLATION", "Owned append identity changed", { reason_code: "WINDOWS_OWNED_APPEND_UNCERTAIN" });
  }
  return result;
}
