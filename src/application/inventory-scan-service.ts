/** Durable caller for the metadata scanner. Source roots are read-only. */
import { createHash } from "node:crypto";
import { inspectWindowsPath, packagedWindowsFileHelper, type WindowsFileIdentity } from "../discovery/windows-file-bridge.js";
import {
  inventoryCursorForPath,
  scanFileInventory,
  type FileInventoryIdentityReceipt,
} from "../discovery/file-inventory.js";
import type { InventoryScanResult } from "../domain/agent-contracts.js";
import { InventoryRepository, type InventoryScanRow } from "../storage/inventory-repository.js";

export interface InventoryScanRequest {
  project_id: string;
  location_id: string;
  root_path: string;
  generation?: number;
  owner_id?: string;
  page_size?: number;
  required_hash_paths?: string[];
  /** Test/native adapter. A null result means identity evidence is unavailable. */
  file_identity?: (path: string) => FileInventoryIdentityReceipt | null;
  root_file_id?: string | null;
}

function requiredPathsDigest(paths: string[]): string {
  return createHash("sha256").update(JSON.stringify([...new Set(paths)].sort()), "utf8").digest("hex");
}

function identityString(identity: WindowsFileIdentity | FileInventoryIdentityReceipt): string {
  return `${identity.volumeSerial}:${identity.fileId}`;
}

function packagedIdentity(path: string): FileInventoryIdentityReceipt | null {
  if (process.platform !== "win32") return null;
  try {
    const identity = inspectWindowsPath(packagedWindowsFileHelper(), path);
    return { volumeSerial: identity.volumeSerial, fileId: identity.fileId, linkCount: identity.linkCount, bytes: identity.bytes };
  } catch {
    return null;
  }
}

function errorsFromScan(scan: InventoryScanRow): Array<{ relative_path: string; code: string }> {
  try {
    const parsed: unknown = JSON.parse(scan.errors_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is { relativePath: string; code: string } =>
      !!item && typeof item === "object" && typeof (item as Record<string, unknown>)["relativePath"] === "string" &&
      typeof (item as Record<string, unknown>)["code"] === "string",
    ).map((item) => ({ relative_path: item.relativePath, code: item.code })).slice(0, 512);
  } catch {
    return [];
  }
}

export class InventoryScanService {
  constructor(private readonly repository: InventoryRepository) {}

  async run(input: InventoryScanRequest): Promise<InventoryScanResult> {
    return this.scan(input);
  }

  async scan(input: InventoryScanRequest): Promise<InventoryScanResult> {
    const required = input.required_hash_paths ?? [];
    const ownerId = input.owner_id ?? `inventory-scanner:${process.pid}`;
    const generation = input.generation ?? this.repository.nextInventoryGeneration(input.location_id);
    // Native identity lookup is an expensive helper process on Windows. The
    // normal MCP inspect path needs a durable root receipt, while per-entry
    // FileId evidence is opt-in for a caller that can amortize/provide the
    // trusted reader. Do not turn a metadata scan into one helper launch per
    // file by default.
    const identityReader = input.file_identity;
    const rootReceipt = input.root_file_id ?? (identityReader ? identityReader(input.root_path) : packagedIdentity(input.root_path));
    const rootFileId = typeof rootReceipt === "string" || rootReceipt === null ? rootReceipt : identityString(rootReceipt);
    const previous = this.repository.getLatestSealedInventoryScan(input.location_id, generation);
    let scan = this.repository.beginInventoryScan({
      project_id: input.project_id,
      location_id: input.location_id,
      root_file_id: rootFileId,
      generation,
      required_paths_digest: requiredPathsDigest(required),
      owner_id: ownerId,
    });

    let cursor: string | null = scan.last_key === null
      ? null
      : inventoryCursorForPath(input.root_path, generation, required, scan.last_key, false,
        required.filter((path) => this.repository.listDurableInventory(scan.scan_id, null, 1000).some((row) => row.canonical_relative_path === path)));
    let terminalPageComplete = false;
    let terminalPagePartial = false;
    while (true) {
      const page = await scanFileInventory(input.root_path, {
        cursor,
        generation,
        requiredHashPaths: required,
        ...(identityReader ? { fileIdentity: identityReader } : {}),
        ...(input.page_size === undefined ? {} : { pageSize: input.page_size }),
      });
      scan = this.repository.appendInventoryPage(scan.scan_id, ownerId, scan.fence_token, page);
      terminalPageComplete = page.complete;
      terminalPagePartial = page.partial;
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
      if (page.entries.length === 0) {
        terminalPageComplete = false;
        terminalPagePartial = true;
        break;
      }
    }
    this.repository.appendInventoryTombstones(scan.scan_id, ownerId, scan.fence_token, previous?.scan_id ?? null);
    const state = terminalPageComplete && !terminalPagePartial ? "COMPLETE" : "PARTIAL";
    scan = this.repository.finishInventoryScan({
      scan_id: scan.scan_id,
      owner_id: ownerId,
      fence_token: scan.fence_token,
      state,
      digest: state === "COMPLETE" ? this.repository.inventoryDigest(scan.scan_id) : null,
    });
    return {
      schema_version: 1,
      scan_id: scan.scan_id,
      project_id: scan.project_id,
      location_id: scan.location_id,
      generation: scan.generation,
      scanned_count: scan.scanned_count,
      error_count: scan.error_count,
      complete: scan.state === "COMPLETE",
      partial: scan.state !== "COMPLETE",
      errors: errorsFromScan(scan),
      metadata_artifact_ref: null,
      next_cursor: scan.state === "STAGING" ? cursor : null,
    };
  }
}
