import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import type { FileInventoryPage } from "../../src/discovery/file-inventory.js";

describe("S03/S04 durable inventory generation", () => {
  let dir: string;
  let storage: Storage;
  let inventory: InventoryRepository;
  let projectId: string;
  let locationId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-s04-inventory-"));
    storage = new Storage({ dbPath: join(dir, "state.db") });
    storage.migrate();
    const projects = new ProjectRepository(storage.db);
    const result = projects.ensureLocation("C:/work/s04-inventory", "s04-inventory", null);
    projectId = result.project.id;
    locationId = result.location.id;
    inventory = new InventoryRepository(storage.db);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const page = (): FileInventoryPage => ({
    entries: [
      { relativePath: "a.txt", kind: "file", size: 3, mtimeMs: 10, hash: "a".repeat(64), hashStatus: "COMPUTED", readStatus: "OK", linkTarget: null },
      { relativePath: "src", kind: "directory", size: 0, mtimeMs: 11, hash: null, hashStatus: "NOT_APPLICABLE", readStatus: "OK", linkTarget: null },
    ],
    nextCursor: null,
    complete: true,
    partial: false,
    errors: [],
  });

  it("page retry ayni satirlari cogaltmaz, keyset sirasi korunur ve seal fence ister", () => {
    const scan = inventory.beginInventoryScan({ project_id: projectId, location_id: locationId, generation: 3, required_paths_digest: "b".repeat(64), owner_id: "scanner-a" });
    inventory.appendInventoryPage(scan.scan_id, "scanner-a", scan.fence_token, page());
    const retried = inventory.appendInventoryPage(scan.scan_id, "scanner-a", scan.fence_token, page());
    expect(retried.scanned_count).toBe(2);
    expect(inventory.listDurableInventory(scan.scan_id, null, 1).map((row) => row.canonical_relative_path)).toEqual(["a.txt"]);
    expect(inventory.listDurableInventory(scan.scan_id, "a.txt", 10).map((row) => row.canonical_relative_path)).toEqual(["src"]);
    const complete = inventory.finishInventoryScan({
      scan_id: scan.scan_id,
      owner_id: "scanner-a",
      fence_token: scan.fence_token,
      state: "COMPLETE",
      digest: createHash("sha256").update("inventory").digest("hex"),
    });
    expect(complete.state).toBe("COMPLETE");
    expect(() => inventory.appendInventoryPage(scan.scan_id, "scanner-a", scan.fence_token, page())).toThrow(/sealed/i);
    expect(inventory.finishInventoryScan({ scan_id: scan.scan_id, owner_id: "other", fence_token: 99, state: "COMPLETE", digest: complete.digest })).toEqual(complete);
  });

  it("ayni location+generation farkli required digest ile yeniden acilamaz", () => {
    inventory.beginInventoryScan({ project_id: projectId, location_id: locationId, generation: 4, required_paths_digest: "c".repeat(64), owner_id: "scanner-a" });
    expect(() => inventory.beginInventoryScan({ project_id: projectId, location_id: locationId, generation: 4, required_paths_digest: "d".repeat(64), owner_id: "scanner-a" })).toThrow(/generation identity/i);
  });

  it("trusted native FileId makbuzunu satirda, retry'da ve tombstone'da korur", () => {
    const first = inventory.beginInventoryScan({ project_id: projectId, location_id: locationId, generation: 5, required_paths_digest: "e".repeat(64), owner_id: "scanner-a" });
    const identity = { volumeSerial: "0000000000000001", fileId: "f".repeat(32), linkCount: 1, bytes: 3 };
    const identityPage: FileInventoryPage = {
      entries: [{ relativePath: "identity.txt", kind: "file", size: 3, mtimeMs: 12, hash: "c".repeat(64), hashStatus: "COMPUTED", readStatus: "OK", linkTarget: null, fileIdentity: identity }],
      nextCursor: null,
      complete: true,
      partial: false,
      errors: [],
    };
    inventory.appendInventoryPage(first.scan_id, "scanner-a", first.fence_token, identityPage);
    inventory.appendInventoryPage(first.scan_id, "scanner-a", first.fence_token, identityPage);
    const row = inventory.listDurableInventory(first.scan_id, null, 10).find((item) => item.canonical_relative_path === "identity.txt");
    expect(row).toMatchObject({ native_volume_serial: identity.volumeSerial, native_file_id: identity.fileId, native_link_count: 1, native_bytes: 3 });
    inventory.finishInventoryScan({ scan_id: first.scan_id, owner_id: "scanner-a", fence_token: first.fence_token, state: "COMPLETE", digest: inventory.inventoryDigest(first.scan_id) });

    const second = inventory.beginInventoryScan({ project_id: projectId, location_id: locationId, generation: 6, required_paths_digest: "e".repeat(64), owner_id: "scanner-b" });
    inventory.appendInventoryTombstones(second.scan_id, "scanner-b", second.fence_token, first.scan_id);
    const tombstone = inventory.listDurableInventory(second.scan_id, null, 10).find((item) => item.canonical_relative_path === "identity.txt");
    expect(tombstone).toMatchObject({ tombstone: 1, native_volume_serial: identity.volumeSerial, native_file_id: identity.fileId, native_bytes: 3 });
  });
});
