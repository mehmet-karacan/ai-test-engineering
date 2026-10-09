/**
 * SQLite migration yonetimi: tek sirali migration, checksum uyumu.
 * Daha yeni bilinmeyen schema acilirsa yazmayi durdurur.
 */
import type BetterSqlite3 from "better-sqlite3";
import { createHash } from "node:crypto";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex").slice(0, 64);
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "temel-tablolar",
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_remote TEXT,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('git_remote', 'local_only')),
  latest_snapshot_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 0,
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS project_locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  canonical_root TEXT NOT NULL,
  git_common_dir_fingerprint TEXT,
  platform TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, canonical_root),
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES project_locations(id),
  parent_snapshot_id TEXT REFERENCES project_snapshots(id),
  head_commit TEXT,
  dirty_digest TEXT,
  source_manifest_artifact_id TEXT,
  build_digest TEXT,
  parser_version TEXT,
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES project_snapshots(id),
  parent_module_id TEXT REFERENCES modules(id),
  relative_path TEXT NOT NULL,
  group_id TEXT,
  artifact_id TEXT,
  version TEXT,
  packaging TEXT,
  roots_artifact_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (snapshot_id, relative_path),
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS java_packages (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id),
  qualified_name TEXT NOT NULL,
  source_set TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (module_id, source_set, qualified_name),
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS code_symbols (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES java_packages(id),
  enclosing_symbol_id TEXT REFERENCES code_symbols(id),
  kind TEXT NOT NULL CHECK (kind IN ('class', 'interface', 'enum', 'record', 'method', 'field', 'nested')),
  fqn TEXT NOT NULL,
  signature TEXT,
  relative_path TEXT NOT NULL,
  source_sha256 TEXT,
  line_start INTEGER,
  line_end INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id),
  symbol_id TEXT REFERENCES code_symbols(id),
  test_kind TEXT NOT NULL CHECK (test_kind IN ('junit4', 'junit5', 'parameterized', 'dynamic', 'unknown')),
  logical_key TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_sha256 TEXT,
  disabled_baseline INTEGER NOT NULL DEFAULT 0 CHECK (disabled_baseline IN (0, 1)),
  created_at INTEGER NOT NULL,
  UNIQUE (module_id, logical_key, source_path),
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS test_jobs (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES project_locations(id),
  source_snapshot_id TEXT REFERENCES project_snapshots(id),
  best_checkpoint_id TEXT,
  policy_digest TEXT,
  profile_digest TEXT,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('QUEUED','RUNNING','WAITING_INPUT','PAUSED','INTERRUPTED','COMPLETED','FAILED','CANCELLED')),
  phase TEXT NOT NULL,
  outcome TEXT,
  verification_level TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_level IN ('UNVERIFIED','TARGET_ONLY','AFFECTED_SCOPE','FULL_DECLARED_SCOPE')),
  apply_state TEXT NOT NULL DEFAULT 'NOT_REQUESTED' CHECK (apply_state IN ('NOT_REQUESTED','READY_FOR_REVIEW','APPLYING','APPLIED','CONFLICT','REJECTED')),
  request_digest TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 0,
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS job_targets (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  symbol_id TEXT REFERENCES code_symbols(id),
  module_id TEXT REFERENCES modules(id),
  selector TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('class', 'package', 'module')),
  resolved_scope_digest TEXT,
  line_target_bps INTEGER NOT NULL CHECK (line_target_bps >= 0 AND line_target_bps <= 10000),
  branch_target_bps INTEGER CHECK (branch_target_bps >= 0 AND branch_target_bps <= 10000),
  created_at INTEGER NOT NULL,
  UNIQUE (job_id, selector, target_kind),
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  phase TEXT,
  origin TEXT NOT NULL,
  payload_artifact_id TEXT,
  occurred_at INTEGER NOT NULL,
  UNIQUE (job_id, sequence)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES test_jobs(id),
  kind TEXT NOT NULL,
  relative_store_path TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  schema_version TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'internal' CHECK (sensitivity IN ('public', 'internal', 'sensitive')),
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('PENDING', 'READY', 'QUARANTINED', 'DELETED')),
  pin_reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (sha256, relative_store_path),
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  parent_checkpoint_id TEXT REFERENCES checkpoints(id),
  iteration_id TEXT,
  manifest_artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  source_digest TEXT NOT NULL,
  verification_level TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_level IN ('UNVERIFIED','TARGET_ONLY','AFFECTED_SCOPE','FULL_DECLARED_SCOPE')),
  generation INTEGER NOT NULL CHECK (generation >= 0),
  kind TEXT NOT NULL DEFAULT 'tested' CHECK (kind IN ('best', 'tested', 'partial')),
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS job_leases (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  owner_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  process_identity TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (job_id, owner_id),
  CHECK (length(id) = 36),
  CHECK (fencing_token >= 0)
);

CREATE INDEX IF NOT EXISTS idx_projects_remote ON projects(normalized_remote);
CREATE INDEX IF NOT EXISTS idx_locations_project ON project_locations(project_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_location ON project_snapshots(location_id);
CREATE INDEX IF NOT EXISTS idx_modules_snapshot ON modules(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_symbols_package ON code_symbols(package_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_module ON test_cases(module_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON test_jobs(location_id);
CREATE INDEX IF NOT EXISTS idx_job_targets_job ON job_targets(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, sequence);
CREATE INDEX IF NOT EXISTS idx_artifacts_job ON artifacts(job_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_job ON checkpoints(job_id);
CREATE INDEX IF NOT EXISTS idx_leases_job ON job_leases(job_id);
`,
  },
];

export function migrate(db: BetterSqlite3.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)`);

  const appliedRows = db
    .prepare<[], { version: number; checksum: string }>("SELECT version, checksum FROM schema_migrations ORDER BY version")
    .all() as unknown as Array<{ version: number; checksum: string }>;

  const highestApplied = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1]!.version : 0;

  if (highestApplied > MIGRATIONS.length) {
    throw new Error(
      `DB schema surumu (${highestApplied}) uygulamanin bildigi en yuksek surumden (${MIGRATIONS.length}) yeni; yazma durduruldu`,
    );
  }

  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)",
  );

  const runMigrations = db.transaction(() => {
    for (const migration of MIGRATIONS) {
      const applied = appliedRows.find((row) => row.version === migration.version);
      if (applied) {
        if (applied.checksum !== checksum(migration.sql)) {
          throw new Error(`Migration checksum uyusmazligi: version ${migration.version}`);
        }
        continue;
      }
      db.exec(migration.sql);
      insertMigration.run(migration.version, checksum(migration.sql), Date.now());
    }
  });

  runMigrations();
}

export function currentSchemaVersion(db: BetterSqlite3.Database): number {
  const row = db
    .prepare<[], { version: number }>("SELECT MAX(version) AS version FROM schema_migrations")
    .get();
  return row?.version ?? 0;
}
