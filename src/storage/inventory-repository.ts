/**
 * Envanter yazma: snapshot/parser version ile iliskili satirlar; silinenler yeni snapshot'ta yok isaretlenir, gecmis silinmez.
 */
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import type { JavaSymbol, TestInventory } from "../discovery/java-inventory.js";
import type { PomModule } from "../discovery/pom-discovery.js";

export interface InventoryWriteResult {
  snapshot_id: string;
  module_id: string;
  symbols_written: number;
  test_cases_written: number;
}

export class InventoryRepository {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  writeSnapshot(locationId: string, headCommit: string | null, dirtyDigest: string | null, parserVersion: string): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO project_snapshots (id, location_id, parent_snapshot_id, head_commit, dirty_digest, source_manifest_artifact_id, build_digest, parser_version, created_at) VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?, ?)")
      .run(id, locationId, headCommit, dirtyDigest, parserVersion, Date.now());
    return id;
  }

  writeModule(snapshotId: string, module: PomModule): string {
    const existing = this.db
      .prepare<[string, string], { id: string }>("SELECT id FROM modules WHERE snapshot_id = ? AND relative_path = ?")
      .get(snapshotId, module.module_relative_path);
    if (existing) {
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO modules (id, snapshot_id, parent_module_id, relative_path, group_id, artifact_id, version, packaging, roots_artifact_id, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)")
      .run(id, snapshotId, module.module_relative_path, module.group_id, module.artifact_id, module.version, module.packaging, Date.now());
    return id;
  }

  writePackage(moduleId: string, qualifiedName: string, sourceSet: string): string {
    const existing = this.db
      .prepare<[string, string, string], { id: string }>("SELECT id FROM java_packages WHERE module_id = ? AND source_set = ? AND qualified_name = ?")
      .get(moduleId, sourceSet, qualifiedName);
    if (existing) {
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO java_packages (id, module_id, qualified_name, source_set, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, moduleId, qualifiedName, sourceSet, Date.now());
    return id;
  }

  writeSymbol(packageId: string, symbol: JavaSymbol): string {
    const existing = this.db
      .prepare<[string, string], { id: string }>("SELECT id FROM code_symbols WHERE package_id = ? AND fqn = ?")
      .get(packageId, symbol.fqn);
    if (existing) {
      this.db
        .prepare("UPDATE code_symbols SET relative_path = ?, source_sha256 = ?, line_start = ?, line_end = ? WHERE id = ?")
        .run(symbol.relative_path, symbol.source_sha256, symbol.line_start, symbol.line_end, existing.id);
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO code_symbols (id, package_id, enclosing_symbol_id, kind, fqn, signature, relative_path, source_sha256, line_start, line_end, created_at) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)")
      .run(id, packageId, symbol.kind, symbol.fqn, symbol.relative_path, symbol.source_sha256, symbol.line_start, symbol.line_end, Date.now());
    return id;
  }

  writeTestCase(moduleId: string, symbolId: string | null, testKind: string, logicalKey: string, sourcePath: string, sourceSha256: string | null): string {
    const existing = this.db
      .prepare<[string, string, string], { id: string }>("SELECT id FROM test_cases WHERE module_id = ? AND logical_key = ? AND source_path = ?")
      .get(moduleId, logicalKey, sourcePath);
    if (existing) {
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO test_cases (id, module_id, symbol_id, test_kind, logical_key, source_path, source_sha256, disabled_baseline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)")
      .run(id, moduleId, symbolId, testKind, logicalKey, sourcePath, sourceSha256, Date.now());
    return id;
  }

  writeTestInventory(moduleId: string, inventory: TestInventory): number {
    let count = 0;
    for (const testClass of inventory.test_classes) {
      const packageId = this.writePackage(moduleId, testClass.fqn.split(".").slice(0, -1).join(".") || "(default)", "test");
      const symbolId = this.writeSymbol(packageId, {
        kind: "class",
        fqn: testClass.fqn,
        simple_name: testClass.fqn.split(".").pop() ?? testClass.fqn,
        package_name: testClass.fqn.split(".").slice(0, -1).join("."),
        relative_path: testClass.relative_path,
        source_sha256: testClass.source_sha256,
        line_start: 1,
        line_end: 1,
        enclosing: null,
      });
      this.writeTestCase(moduleId, symbolId, testClass.kind, testClass.fqn, testClass.relative_path, testClass.source_sha256);
      count++;
    }
    return count;
  }

  resolveTarget(snapshotId: string, simpleNameOrFqn: string): Array<{ symbol_id: string; fqn: string; module_relative_path: string; relative_path: string }> {
    const likeName = `%${simpleNameOrFqn}`;
    const rows = this.db
      .prepare<[string, string, string, string], { symbol_id: string; fqn: string; module_relative_path: string; relative_path: string }>(
        `SELECT cs.id AS symbol_id, cs.fqn, m.relative_path AS module_relative_path, cs.relative_path
         FROM code_symbols cs
         JOIN java_packages jp ON cs.package_id = jp.id
         JOIN modules m ON jp.module_id = m.id
         WHERE m.snapshot_id = ? AND (cs.fqn = ? OR cs.fqn LIKE ?)
         ORDER BY CASE WHEN cs.fqn = ? THEN 0 ELSE 1 END`,
      )
      .all(snapshotId, simpleNameOrFqn, likeName, simpleNameOrFqn);
    return rows as unknown as Array<{ symbol_id: string; fqn: string; module_relative_path: string; relative_path: string }>;
  }

  listModules(snapshotId: string): Array<{ module_relative_path: string; artifact_id: string; packaging: string }> {
    return this.db
      .prepare<[string], { relative_path: string; artifact_id: string; packaging: string }>(
        "SELECT relative_path, artifact_id, packaging FROM modules WHERE snapshot_id = ? ORDER BY relative_path",
      )
      .all(snapshotId)
      .map((row) => ({
        module_relative_path: row.relative_path,
        artifact_id: row.artifact_id,
        packaging: row.packaging,
      }));
  }
}
