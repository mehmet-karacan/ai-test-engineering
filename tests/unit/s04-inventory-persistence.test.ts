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
});
