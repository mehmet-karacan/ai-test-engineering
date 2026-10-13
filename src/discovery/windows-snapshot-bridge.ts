/** One native session pins both roots through all file copies and manifest publication. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AppError } from "../domain/errors.js";
import type { SnapshotManifest } from "./source-snapshot.js";
import type { WindowsFileIdentity } from "./windows-file-bridge.js";

function digest(path: URL): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function packagedSnapshotHelper(): string {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../../native/windows-snapshot-helper.manifest.json", import.meta.url), "utf8")) as {
      schema_version?: number; source_sha256?: string; binary_sha256?: string;
    };
    const source = new URL("../../native/windows-snapshot-helper.cpp", import.meta.url);
    const binary = new URL("../../native/bin/windows-snapshot-helper.exe", import.meta.url);
    if (manifest.schema_version !== 1 || !/^[0-9a-f]{64}$/u.test(manifest.source_sha256 ?? "") ||
        !/^[0-9a-f]{64}$/u.test(manifest.binary_sha256 ?? "") ||
        manifest.source_sha256 !== digest(source) || manifest.binary_sha256 !== digest(binary)) throw new Error("digest");
    return fileURLToPath(binary);
  } catch {
    throw new AppError("BLOCKED_ISOLATION", "Windows snapshot helper provenance invalid", {
      reason_code: "WINDOWS_SNAPSHOT_HELPER_PROVENANCE",
    });
  }
}

function rootId(identity: WindowsFileIdentity): string {
  return identity.volumeSerial + identity.fileId;
}

function hexName(path: string): string {
  return Buffer.from(path, "utf16le").toString("hex");
}

export function publishWindowsSnapshot(sourceRoot: string, targetRoot: string, sourceRootIdentity: WindowsFileIdentity,
    targetRootIdentity: WindowsFileIdentity, manifest: SnapshotManifest): void {
  const helper = packagedSnapshotHelper();
  const publicManifest = JSON.stringify({
    ...manifest, entries: manifest.entries.map(({ source_location: _loc, ...entry }) => entry),
  }, null, 2);
  const input = manifest.entries.map((entry) =>
    `FILE\t${hexName(entry.relative_path)}\t${entry.bytes}\t${entry.sha256}\n`).join("") +
    `MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nEND\n`;
  const run = spawnSync(helper, ["snapshot", sourceRoot, targetRoot, rootId(sourceRootIdentity), rootId(targetRootIdentity)], {
    shell: false, windowsHide: true, encoding: "utf8", input, timeout: 10 * 60_000, maxBuffer: 64 * 1024,
  });
  if (run.error || run.status !== 0 || run.signal || run.stdout.replace(/\r\n/gu, "\n") !== "READY\nOK\n") {
    throw new AppError("BLOCKED_ISOLATION", "Windows snapshot copy failed", {
      reason_code: run.status === 4 ? "SNAPSHOT_PARTIAL_CLEANUP_FAILED" : "SNAPSHOT_COPY_FAILED",
      exit_code: run.status, signal: run.signal,
    });
  }
}
