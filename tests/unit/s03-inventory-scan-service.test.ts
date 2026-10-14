import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Storage } from "../../src/storage/storage.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { InventoryRepository } from "../../src/storage/inventory-repository.js";
import { InventoryScanService } from "../../src/application/inventory-scan-service.js";

describe("S03 durable inventory scanner caller", () => {
  const roots: string[] = [];
  const stores: Storage[] = [];
  afterEach(() => {
    for (const storage of stores.splice(0)) storage.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("persists every page and records a native root FileId receipt when supplied", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-s03-service-"));
    roots.push(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "00-a.txt"), "a");
    writeFileSync(join(root, "10-b.txt"), "b");
    writeFileSync(join(root, "src", "20-c.txt"), "c");
    const dbRoot = mkdtempSync(join(tmpdir(), "aitest-s03-service-db-"));
    roots.push(dbRoot);
    const storage = new Storage({ dbPath: join(dbRoot, "state.db") });
    stores.push(storage);
    storage.migrate();
    const location = new ProjectRepository(storage.db).ensureLocation(root, "s03-service", null).location;
    const repository = new InventoryRepository(storage.db);
    const service = new InventoryScanService(repository);
    const result = await service.scan({
      project_id: location.project_id,
      location_id: location.id,
      root_path: root,
      generation: 1,
      owner_id: "scanner-test",
      page_size: 1,
      file_identity: () => ({ volumeSerial: "0000000000000001", fileId: "a".repeat(32), linkCount: 1, bytes: 0 }),
    });
    expect(result.complete).toBe(true);
    expect(result.partial).toBe(false);
    expect(result.scanned_count).toBe(4);
    const scan = repository.getInventoryScan(result.scan_id);
    expect(scan.root_file_id).toBe(`0000000000000001:${"a".repeat(32)}`);
    expect(repository.listDurableInventory(result.scan_id, null, 20).map((row) => row.canonical_relative_path)).toEqual([
      "00-a.txt", "10-b.txt", "src", "src/20-c.txt",
    ]);
  });

  it("reconciles deleted and renamed paths with immutable tombstones", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-s03-tombstone-"));
    roots.push(root);
    writeFileSync(join(root, "old.txt"), "same");
    writeFileSync(join(root, "gone.txt"), "gone");
    const dbRoot = mkdtempSync(join(tmpdir(), "aitest-s03-tombstone-db-"));
    roots.push(dbRoot);
    const storage = new Storage({ dbPath: join(dbRoot, "state.db") });
    stores.push(storage);
    storage.migrate();
    const location = new ProjectRepository(storage.db).ensureLocation(root, "s03-tombstone", null).location;
    const service = new InventoryScanService(new InventoryRepository(storage.db));
    const first = await service.scan({ project_id: location.project_id, location_id: location.id, root_path: root, generation: 1, owner_id: "scanner-test" });
    renameSync(join(root, "old.txt"), join(root, "renamed.txt"));
    rmSync(join(root, "gone.txt"));
    const second = await service.scan({ project_id: location.project_id, location_id: location.id, root_path: root, generation: 2, owner_id: "scanner-test" });
    const rows = new InventoryRepository(storage.db).listDurableInventory(second.scan_id, null, 20);
    expect(rows.find((row) => row.canonical_relative_path === "old.txt")?.tombstone).toBe(1);
    expect(rows.find((row) => row.canonical_relative_path === "gone.txt")?.tombstone).toBe(1);
    expect(rows.find((row) => row.canonical_relative_path === "renamed.txt")?.tombstone).toBe(0);
    expect(first.scan_id).not.toBe(second.scan_id);
  });
});
