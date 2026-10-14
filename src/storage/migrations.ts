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
  {
    version: 2,
    name: "coverage-worker-candidate-benchmark-tablolari",
    sql: `
CREATE TABLE IF NOT EXISTS coverage_snapshots (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  target_symbol_id TEXT REFERENCES code_symbols(id),
  run_id TEXT,
  fqn TEXT NOT NULL,
  source_sha256 TEXT,
  binary_class_id TEXT,
  line_covered INTEGER NOT NULL DEFAULT 0 CHECK (line_covered >= 0),
  line_missed INTEGER NOT NULL DEFAULT 0 CHECK (line_missed >= 0),
  branch_covered INTEGER,
  branch_missed INTEGER,
  line_validity TEXT NOT NULL CHECK (line_validity IN ('OK','NOT_APPLICABLE','UNAVAILABLE','INVALID_COVERAGE_EVIDENCE')),
  branch_validity TEXT,
  before_after TEXT NOT NULL CHECK (before_after IN ('before','after')),
  checkpoint_id TEXT REFERENCES checkpoints(id),
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36)
);

CREATE TABLE IF NOT EXISTS worker_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  attempt_ordinal INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('analyzer','test_designer','test_developer','reviewer','gap_analyzer')),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  profile_digest TEXT,
  session_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok','timeout','error','aborted')),
  input_digest TEXT,
  output_digest TEXT,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  repair_for_attempt INTEGER,
  error_class TEXT,
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36),
  UNIQUE (job_id, attempt_ordinal)
);

CREATE TABLE IF NOT EXISTS candidate_iterations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES test_jobs(id),
  parent_checkpoint_id TEXT REFERENCES checkpoints(id),
  iteration_ordinal INTEGER NOT NULL,
  changeset_hash TEXT NOT NULL,
  strategy_key TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('adopted','rejected','needs_review','duplicate')),
  decision_reason TEXT,
  coverage_before_bps INTEGER,
  coverage_after_bps INTEGER,
  error_fingerprint TEXT,
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36),
  UNIQUE (job_id, iteration_ordinal)
);

CREATE TABLE IF NOT EXISTS benchmark_trials (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES test_jobs(id),
  fixture_id TEXT NOT NULL,
  model_profile TEXT NOT NULL,
  trial_ordinal INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  reachable INTEGER NOT NULL DEFAULT 1 CHECK (reachable IN (0, 1)),
  coverage_gain_line_bps INTEGER,
  coverage_gain_branch_bps INTEGER,
  duration_ms INTEGER,
  cost_available INTEGER NOT NULL DEFAULT 0 CHECK (cost_available IN (0, 1)),
  raw_counters_artifact_id TEXT REFERENCES artifacts(id),
  created_at INTEGER NOT NULL,
  CHECK (length(id) = 36),
  UNIQUE (fixture_id, model_profile, trial_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_job ON coverage_snapshots(job_id);
CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_fqn ON coverage_snapshots(fqn);
CREATE INDEX IF NOT EXISTS idx_worker_attempts_job ON worker_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_candidate_iterations_job ON candidate_iterations(job_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_fixture ON benchmark_trials(fixture_id, model_profile);
`,
   },
  // Migration v3 SQL'i uygulanmis runtime DB'lerde checksum ile kimliklidir;
  // SQL metnini yeniden bicimlendirmek yeni migration eklemeden yasaklanir.
  {
     version: 3,
     name: "checkpoint-accepted-blob-baglanti",
     sql: `
 CREATE TABLE IF NOT EXISTS checkpoint_blobs (
   checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id),
   artifact_id TEXT NOT NULL REFERENCES artifacts(id),
   blob_path TEXT NOT NULL,
   blob_sha256 TEXT NOT NULL CHECK (length(blob_sha256) = 64),
   bytes INTEGER NOT NULL CHECK (bytes >= 0),
   action TEXT NOT NULL,
   PRIMARY KEY (checkpoint_id, artifact_id),
   UNIQUE (checkpoint_id, blob_path)
 );

 CREATE INDEX IF NOT EXISTS idx_checkpoint_blobs_artifact ON checkpoint_blobs(artifact_id);

 CREATE TABLE IF NOT EXISTS source_identities (
   snapshot_id TEXT PRIMARY KEY REFERENCES project_snapshots(id),
   head_commit TEXT,
   dirty_digest TEXT,
   source_digest TEXT NOT NULL,
   build_digest TEXT NOT NULL,
   created_at INTEGER NOT NULL
 );
 `,
   },
    {
      version: 4,
      name: "job-targets-concrete-frozen",
      sql: `
  -- P05/PR06: job_targets artik frozen concrete hedef kimligini tasir.
  -- resolved_fqn/module_path/source_set/relative_path/snapshot_id concrete hedefi
  -- tek kayit olarak sabitler; concrete_digest frozen liste digest'idir.
  ALTER TABLE job_targets ADD COLUMN resolved_fqn TEXT;
  ALTER TABLE job_targets ADD COLUMN module_path TEXT;
  ALTER TABLE job_targets ADD COLUMN source_set TEXT CHECK (source_set IS NULL OR source_set IN ('main', 'test', 'unknown'));
  ALTER TABLE job_targets ADD COLUMN relative_path TEXT;
  ALTER TABLE job_targets ADD COLUMN snapshot_id TEXT;
  ALTER TABLE job_targets ADD COLUMN concrete_digest TEXT;

  -- P05/PR06: job'un TAM frozen concrete hedef listesi (her concrete hedef bir satir).
  -- Package/module expansion'da job_targets selector satiri concrete alanlari tasimaz;
  -- resume/dispatch bu tablodan ayni frozen listeyi geri kurar (PP23).
  CREATE TABLE IF NOT EXISTS job_target_concretes (
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    selector TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    fqn TEXT NOT NULL,
    module_path TEXT NOT NULL,
    source_set TEXT NOT NULL CHECK (source_set IN ('main', 'test', 'unknown')),
    relative_path TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    concrete_digest TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (job_id, selector, fqn, module_path, relative_path)
  );

  CREATE INDEX IF NOT EXISTS idx_job_target_concretes_job ON job_target_concretes(job_id);
  `,
    },
    {
      version: 5,
      name: "candidate-attempt-ordinal",
      sql: `
  -- P05-B/PP15: repair/rejected attempts ayni logical iteration'da da kalici tutulur.
  ALTER TABLE candidate_iterations RENAME TO candidate_iterations_v4;
  DROP INDEX IF EXISTS idx_candidate_iterations_job;

  CREATE TABLE candidate_iterations (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    parent_checkpoint_id TEXT REFERENCES checkpoints(id),
    attempt_ordinal INTEGER NOT NULL,
    iteration_ordinal INTEGER NOT NULL,
    changeset_hash TEXT NOT NULL,
    strategy_key TEXT,
    decision TEXT NOT NULL CHECK (decision IN ('adopted','rejected','needs_review','duplicate')),
    decision_reason TEXT,
    coverage_before_bps INTEGER,
    coverage_after_bps INTEGER,
    error_fingerprint TEXT,
    created_at INTEGER NOT NULL,
    CHECK (length(id) = 36),
    UNIQUE (job_id, attempt_ordinal)
  );

  INSERT INTO candidate_iterations (
    id, job_id, parent_checkpoint_id, attempt_ordinal, iteration_ordinal,
    changeset_hash, strategy_key, decision, decision_reason,
    coverage_before_bps, coverage_after_bps, error_fingerprint, created_at
  )
  SELECT id, job_id, parent_checkpoint_id,
    ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY iteration_ordinal, created_at, id),
    iteration_ordinal, changeset_hash, strategy_key, decision, decision_reason,
    coverage_before_bps, coverage_after_bps, error_fingerprint, created_at
  FROM candidate_iterations_v4;

  DROP TABLE candidate_iterations_v4;
  CREATE INDEX IF NOT EXISTS idx_candidate_iterations_job ON candidate_iterations(job_id);
  `,
    },
    {
      version: 6,
      name: "test-run-provenance",
      sql: `
  -- P06/PP31: baseline/candidate/final kosulari test envanteri ve run kimligiyle
  -- kalici tut; yalniz Maven exit kodu authoritative kanit degildir.
  CREATE TABLE IF NOT EXISTS test_run_provenance (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    provenance_key TEXT NOT NULL UNIQUE,
    stage TEXT NOT NULL CHECK (stage IN ('baseline','candidate','final_replay')),
    attempt_ordinal INTEGER,
    iteration_ordinal INTEGER,
    execution_root TEXT NOT NULL,
    command_json TEXT NOT NULL,
    command_digest TEXT NOT NULL CHECK (length(command_digest) = 64),
    stdout_log_path TEXT NOT NULL,
    stderr_log_path TEXT NOT NULL,
    exit_code INTEGER NOT NULL,
    timed_out INTEGER NOT NULL CHECK (timed_out IN (0, 1)),
    total_tests INTEGER NOT NULL,
    failures INTEGER NOT NULL,
    errors INTEGER NOT NULL,
    skipped INTEGER NOT NULL,
    test_inventory_json TEXT NOT NULL,
    coverage_report_path TEXT NOT NULL,
    coverage_report_sha256 TEXT CHECK (coverage_report_sha256 IS NULL OR length(coverage_report_sha256) = 64),
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    CHECK (length(id) = 36),
    CHECK (finished_at >= started_at)
  );

  CREATE INDEX IF NOT EXISTS idx_test_run_provenance_job ON test_run_provenance(job_id, stage, created_at);
  `,
    },
    {
      version: 7,
      name: "test-run-coverage-report-listesi",
      sql: `
  -- P06/PP28: multi-module run'da tek coverage XML yolu authoritative degildir;
  -- tum module report + digest listesi provenance icinde korunur.
  ALTER TABLE test_run_provenance ADD COLUMN coverage_report_paths_json TEXT NOT NULL DEFAULT '[]';
  `,
    },
    {
      version: 8,
      name: "envanter-ajan-gorevleri-ve-sahipli-surecler",
      sql: `
  -- S03/S04: append-only envanter nesilleri; sealed generation geriye donuk yazilmaz.
  CREATE TABLE IF NOT EXISTS inventory_scans (
    scan_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    location_id TEXT NOT NULL REFERENCES project_locations(id),
    root_file_id TEXT,
    generation INTEGER NOT NULL CHECK (generation >= 0),
    required_paths_digest TEXT NOT NULL CHECK (length(required_paths_digest) = 64),
    state TEXT NOT NULL CHECK (state IN ('STAGING','COMPLETE','PARTIAL','STALE')),
    owner_id TEXT,
    fence_token INTEGER NOT NULL DEFAULT 0 CHECK (fence_token >= 0),
    row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    last_key TEXT,
    scanned_count INTEGER NOT NULL DEFAULT 0 CHECK (scanned_count >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
    errors_json TEXT NOT NULL DEFAULT '[]',
    digest TEXT CHECK (digest IS NULL OR length(digest) = 64),
    created_at INTEGER NOT NULL,
    finished_at INTEGER,
    UNIQUE (location_id, generation),
    CHECK (finished_at IS NULL OR finished_at >= created_at)
  );

  CREATE TABLE IF NOT EXISTS file_inventory (
    scan_id TEXT NOT NULL REFERENCES inventory_scans(scan_id),
    canonical_relative_path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('file','directory','symlink','junction','other')),
    size INTEGER CHECK (size IS NULL OR size >= 0),
    mtime INTEGER,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    hash_status TEXT NOT NULL CHECK (hash_status IN ('KNOWN','UNAVAILABLE','INVALID','NOT_APPLICABLE')),
    sensitivity TEXT NOT NULL CHECK (sensitivity IN ('PUBLIC','INTERNAL','SENSITIVE','UNKNOWN')),
    read_status TEXT NOT NULL CHECK (read_status IN ('READ','UNREADABLE','SKIPPED')),
    parser_status TEXT NOT NULL CHECK (parser_status IN ('PARSED','UNSUPPORTED','ERROR','NOT_APPLICABLE')),
    tombstone INTEGER NOT NULL DEFAULT 0 CHECK (tombstone IN (0,1)),
    created_at INTEGER NOT NULL,
    row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    PRIMARY KEY (scan_id, canonical_relative_path)
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_scans_location_state ON inventory_scans(location_id, state, generation);
  CREATE INDEX IF NOT EXISTS idx_file_inventory_scan_path ON file_inventory(scan_id, canonical_relative_path);
  CREATE INDEX IF NOT EXISTS idx_file_inventory_hash ON file_inventory(scan_id, sha256);

  -- S04: modelden gelen gorev kontrati ve per-attempt durable fence kaydi.
  CREATE TABLE IF NOT EXISTS agent_tasks (
    task_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    location_id TEXT NOT NULL REFERENCES project_locations(id),
    role TEXT NOT NULL CHECK (role IN ('explorer','test_architect','test_developer','reviewer')),
    parent_task_id TEXT REFERENCES agent_tasks(task_id),
    dependency_task_ids_json TEXT NOT NULL DEFAULT '[]',
    input_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    contract_json TEXT NOT NULL,
    contract_digest TEXT NOT NULL CHECK (length(contract_digest) = 64),
    state TEXT NOT NULL CHECK (state IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED','INTERRUPTED','BLOCKED','WAITING_APPROVAL')),
    idempotency_key TEXT NOT NULL,
    job_revision INTEGER NOT NULL CHECK (job_revision >= 0),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    lease_owner_id TEXT,
    lease_fence_token INTEGER NOT NULL DEFAULT 0 CHECK (lease_fence_token >= 0),
    lease_expires_at INTEGER,
    accepted_output_artifact_id TEXT REFERENCES artifacts(id),
    source_digest TEXT NOT NULL CHECK (length(source_digest) = 64),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    UNIQUE (job_id, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS agent_attempts (
    attempt_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES agent_tasks(task_id),
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal > 0),
    owner_id TEXT NOT NULL,
    fence_token INTEGER NOT NULL CHECK (fence_token >= 0),
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_revision INTEGER NOT NULL CHECK (model_revision >= 0),
    status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','CANCELLED','INTERRUPTED','BLOCKED','WAITING_APPROVAL')),
    input_digest TEXT,
    output_digest TEXT,
    input_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    output_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    session_id TEXT,
    message_id TEXT,
    error_class TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    UNIQUE (task_id, attempt_ordinal)
  );

  CREATE TABLE IF NOT EXISTS job_approvals (
    approval_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    approval_kind TEXT NOT NULL,
    scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
    model_digest TEXT NOT NULL CHECK (length(model_digest) = 64),
    budget_digest TEXT NOT NULL CHECK (length(budget_digest) = 64),
    decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','PENDING')),
    decided_by TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS owned_processes (
    process_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES test_jobs(id),
    run_id TEXT,
    attempt_id TEXT,
    process_identity TEXT NOT NULL,
    parent_process_identity TEXT,
    executable_fingerprint TEXT NOT NULL,
    workspace_fingerprint TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    closed_at INTEGER,
    cleanup_state TEXT NOT NULL CHECK (cleanup_state IN ('ACTIVE','CLOSED','LOST','BLOCKED')),
    row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    UNIQUE (job_id, process_identity, started_at)
  );

  ALTER TABLE worker_attempts ADD COLUMN task_id TEXT REFERENCES agent_tasks(task_id);
  ALTER TABLE worker_attempts ADD COLUMN input_artifact_refs_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE worker_attempts ADD COLUMN output_artifact_refs_json TEXT NOT NULL DEFAULT '[]';

  CREATE INDEX IF NOT EXISTS idx_agent_tasks_job_state ON agent_tasks(job_id, state, updated_at);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent ON agent_tasks(parent_task_id);
  CREATE INDEX IF NOT EXISTS idx_agent_attempts_task ON agent_attempts(task_id, attempt_ordinal);
  CREATE INDEX IF NOT EXISTS idx_agent_attempts_job ON agent_attempts(job_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_job_approvals_job ON job_approvals(job_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_owned_processes_job_state ON owned_processes(job_id, cleanup_state);
  CREATE INDEX IF NOT EXISTS idx_worker_attempts_task ON worker_attempts(task_id, attempt_ordinal);
  `,
    },
  {
    version: 9,
    name: "envanter-dosya-kimligi-makbuzlari",
    sql: `
  -- S03/WN25-WN30: trusted native FileId receipts are durable per inventory row.
  -- Nullable columns preserve metadata-only scans where the native helper is unavailable.
  ALTER TABLE file_inventory ADD COLUMN native_volume_serial TEXT;
  ALTER TABLE file_inventory ADD COLUMN native_file_id TEXT;
  ALTER TABLE file_inventory ADD COLUMN native_link_count INTEGER;
  ALTER TABLE file_inventory ADD COLUMN native_bytes INTEGER;
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
