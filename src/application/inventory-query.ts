/**
 * project_query tool'u: DB ve kanitli artifact baglantilariyla sinirli sorgu.
 * Serbest SQL kabul etmez; view + filtre + cursor ile sayfalama.
 */
import type { ProjectQueryInput } from "../domain/tool-schemas.js";

export interface QueryRow {
  [key: string]: unknown;
}

export interface QueryResult {
  view: string;
  rows: QueryRow[];
  next_cursor: string | null;
}

export class InventoryQueryService {
  query(
    db: import("better-sqlite3").Database,
    input: ProjectQueryInput,
    locationIds: string[],
  ): QueryResult {
    const limit = input.limit;
    const offset = input.cursor ? Number.parseInt(input.cursor, 10) || 0 : 0;
    let rows: QueryRow[] = [];

    if (locationIds.length === 0) {
      return { view: input.view, rows: [], next_cursor: null };
    }

    const placeholders = locationIds.map(() => "?").join(", ");
    const bindAll = (...extra: unknown[]): unknown[] => [...locationIds, ...extra];
    switch (input.view) {
      case "projects": {
        rows = db
          .prepare<unknown[], QueryRow>(
            `SELECT DISTINCT p.id, p.name, p.identity_kind, p.normalized_remote FROM projects p
             JOIN project_locations pl ON pl.project_id = p.id WHERE pl.id IN (${placeholders}) LIMIT ? OFFSET ?`,
          )
          .all(...bindAll(limit + 1, offset));
        break;
      }
      case "modules": {
        rows = db
          .prepare<unknown[], QueryRow>(
            `SELECT DISTINCT m.relative_path, m.artifact_id, m.packaging FROM modules m
             JOIN project_snapshots ps ON m.snapshot_id = ps.id WHERE ps.location_id IN (${placeholders}) LIMIT ? OFFSET ?`,
          )
          .all(...bindAll(limit + 1, offset));
        break;
      }
      case "classes": {
        rows = db
          .prepare<unknown[], QueryRow>(
            `SELECT DISTINCT cs.fqn, cs.kind, cs.relative_path FROM code_symbols cs
             JOIN java_packages jp ON cs.package_id = jp.id
             JOIN modules m ON jp.module_id = m.id
             JOIN project_snapshots ps ON m.snapshot_id = ps.id
             WHERE ps.location_id IN (${placeholders}) AND cs.kind IN ('class', 'interface', 'enum', 'record')
             LIMIT ? OFFSET ?`,
          )
          .all(...bindAll(limit + 1, offset));
        break;
      }
      case "tests": {
        rows = db
          .prepare<unknown[], QueryRow>(
            `SELECT DISTINCT tc.logical_key, tc.test_kind, tc.source_path FROM test_cases tc
             JOIN modules m ON tc.module_id = m.id
             JOIN project_snapshots ps ON m.snapshot_id = ps.id
             WHERE ps.location_id IN (${placeholders}) LIMIT ? OFFSET ?`,
          )
          .all(...bindAll(limit + 1, offset));
        break;
      }
      case "job_history": {
        rows = db
          .prepare<unknown[], QueryRow>(
            `SELECT tj.id, tj.lifecycle, tj.phase, tj.outcome, tj.created_at FROM test_jobs tj
             WHERE tj.location_id IN (${placeholders}) ORDER BY tj.created_at DESC LIMIT ? OFFSET ?`,
          )
          .all(...bindAll(limit + 1, offset));
        break;
      }
      case "packages": {
        rows = db
          .prepare<unknown[], QueryRow>(
            `SELECT DISTINCT jp.qualified_name, jp.source_set FROM java_packages jp
             JOIN modules m ON jp.module_id = m.id
             JOIN project_snapshots ps ON m.snapshot_id = ps.id
             WHERE ps.location_id IN (${placeholders}) LIMIT ? OFFSET ?`,
          )
          .all(...bindAll(limit + 1, offset));
        break;
      }
      case "coverage_history": {
        return { view: input.view, rows: [], next_cursor: null };
      }
    }

    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }
    return {
      view: input.view,
      rows,
      next_cursor: hasMore ? String(offset + limit) : null,
    };
  }
}
