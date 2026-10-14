/**
 * Proje ve checkout repository: projects + project_locations yonetimi.
 */
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";

export interface ProjectRow {
  id: string;
  name: string;
  normalized_remote: string | null;
  identity_kind: "git_remote" | "local_only";
  latest_snapshot_id: string | null;
  created_at: number;
  updated_at: number;
  row_version: number;
}

export interface ProjectLocationRow {
  id: string;
  project_id: string;
  canonical_root: string;
  git_common_dir_fingerprint: string | null;
  platform: string;
  last_seen_at: number;
  created_at: number;
  updated_at: number;
  row_version: number;
}

export interface EnsureLocationResult {
  project: ProjectRow;
  location: ProjectLocationRow;
}

export class ProjectRepository {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  ensureLocation(canonicalRoot: string, normalizedName: string, normalizedRemote: string | null): EnsureLocationResult {
    const tx = this.db.transaction((): EnsureLocationResult => {
      const now = Date.now();
      // S04 kimlik kurali: gorunen proje adi tek basina birlestirme anahtari
      // olamaz. Remote'lu checkout'lar ayni remote ile ayni project'e, farkli
      // remote'lar farkli project'e gider; remote'suz kayitlar yalniz ayni
      // fiziksel canonical root ile idempotenttir.
      const candidates = normalizedRemote !== null
        ? this.db.prepare<[string, string], ProjectRow>(
          "SELECT * FROM projects WHERE name = ? AND normalized_remote = ? ORDER BY created_at, id",
        ).all(normalizedName, normalizedRemote)
        : this.db.prepare<[string, string], ProjectRow>(
          `SELECT DISTINCT p.* FROM projects p
           JOIN project_locations l ON l.project_id = p.id
           WHERE p.name = ? AND p.normalized_remote IS NULL AND l.canonical_root = ?
           ORDER BY p.created_at, p.id`,
        ).all(normalizedName, canonicalRoot);
      if (candidates.length > 1) {
        throw new AppError("STORAGE_ERROR", "Proje kimligi mevcut kayitlarda belirsiz", {
          reason_code: "PROJECT_IDENTITY_AMBIGUOUS",
          name: normalizedName,
          canonical_root: canonicalRoot,
          normalized_remote: normalizedRemote,
          candidate_project_ids: candidates.map((candidate) => candidate.id),
        });
      }
      let project = candidates[0];
      if (!project) {
        const identityKind = normalizedRemote ? "git_remote" : "local_only";
        const projectId = randomUUID();
        this.db
          .prepare(
            "INSERT INTO projects (id, name, normalized_remote, identity_kind, latest_snapshot_id, created_at, updated_at, row_version) VALUES (?, ?, ?, ?, NULL, ?, ?, 0)",
          )
          .run(projectId, normalizedName, normalizedRemote, identityKind, now, now);
        project = this.db.prepare<[string], ProjectRow>("SELECT * FROM projects WHERE id = ?").get(projectId)!;
      }

      let location = this.db
        .prepare<[string, string], ProjectLocationRow>("SELECT * FROM project_locations WHERE project_id = ? AND canonical_root = ?")
        .get(project.id, canonicalRoot);
      if (!location) {
        this.db
          .prepare(
            "INSERT INTO project_locations (id, project_id, canonical_root, git_common_dir_fingerprint, platform, last_seen_at, created_at, updated_at, row_version) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0)",
          )
          .run(randomUUID(), project.id, canonicalRoot, process.platform, now, now, now);
        location = this.db
          .prepare<[string, string], ProjectLocationRow>("SELECT * FROM project_locations WHERE project_id = ? AND canonical_root = ?")
          .get(project.id, canonicalRoot)!;
      } else {
        this.db
          .prepare("UPDATE project_locations SET last_seen_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?")
          .run(now, now, location.id);
        location = this.db
          .prepare<[string], ProjectLocationRow>("SELECT * FROM project_locations WHERE id = ?")
          .get(location.id)!;
      }

      return { project: project!, location: location! };
    });
    return tx();
  }

  getLocation(id: string): ProjectLocationRow {
    const row = this.db.prepare<[string], ProjectLocationRow>("SELECT * FROM project_locations WHERE id = ?").get(id);
    if (!row) {
      throw new Error(`Project location bulunamadi: ${id}`);
    }
    return row;
  }

  listLocations(projectId: string): ProjectLocationRow[] {
    return this.db
      .prepare<[string], ProjectLocationRow>("SELECT * FROM project_locations WHERE project_id = ? ORDER BY last_seen_at DESC")
      .all(projectId);
  }

  listLocationsProjects(canonicalRoot: string): ProjectLocationRow[] {
    return this.db
      .prepare<[string], ProjectLocationRow>("SELECT * FROM project_locations WHERE canonical_root = ? ORDER BY last_seen_at DESC")
      .all(canonicalRoot);
  }
}
