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

  /**
   * K06/B09: module hedefi icindeki somut sinif listesi (tam FQCN'ler).
   */
  listModuleClasses(snapshotId: string, moduleRelativePath: string): string[] {
    return this.db
      .prepare<[string, string], { fqn: string }>(
        `SELECT cs.fqn FROM code_symbols cs
         JOIN java_packages jp ON cs.package_id = jp.id
         JOIN modules m ON jp.module_id = m.id
         WHERE m.snapshot_id = ? AND m.relative_path = ? AND cs.kind IN ('class', 'interface', 'enum', 'record')
         ORDER BY cs.fqn`,
      )
      .all(snapshotId, moduleRelativePath)
      .map((row) => row.fqn);
  }

  /**
   * FIN03/14.2: Coverage snapshot kaydi - target + run + once/after raw sayaclar.
   * Validity/applicability ayri tutulur; olculmeyen alan 0 ile ortulmez.
   */
  writeCoverageSnapshot(input: {
    job_id: string;
    target_symbol_id: string | null;
    run_id: string | null;
    fqn: string;
    source_sha256: string | null;
    binary_class_id: string | null;
    line_covered: number;
    line_missed: number;
    branch_covered: number | null;
    branch_missed: number | null;
    line_validity: "OK" | "NOT_APPLICABLE" | "UNAVAILABLE" | "INVALID_COVERAGE_EVIDENCE";
    branch_validity: string | null;
    before_after: "before" | "after";
    checkpoint_id: string | null;
  }): string {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO coverage_snapshots (id, job_id, target_symbol_id, run_id, fqn, source_sha256, binary_class_id, line_covered, line_missed, branch_covered, branch_missed, line_validity, branch_validity, before_after, checkpoint_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.job_id,
        input.target_symbol_id,
        input.run_id,
        input.fqn,
        input.source_sha256,
        input.binary_class_id,
        input.line_covered,
        input.line_missed,
        input.branch_covered,
        input.branch_missed,
        input.line_validity,
        input.branch_validity,
        input.before_after,
        input.checkpoint_id,
        Date.now(),
      );
    return id;
  }

  listCoverageHistory(locationIds: string[], limit = 50): Array<{ fqn: string; line_covered: number; line_missed: number; branch_covered: number | null; branch_missed: number | null; before_after: string; job_id: string; created_at: number }> {
    if (locationIds.length === 0) {
      return [];
    }
    const placeholders = locationIds.map(() => "?").join(", ");
    const params: unknown[] = [...locationIds, limit];
    return this.db
      .prepare<unknown[], { fqn: string; line_covered: number; line_missed: number; branch_covered: number | null; branch_missed: number | null; before_after: string; job_id: string; created_at: number }>(
        `SELECT cs.fqn, cs.line_covered, cs.line_missed, cs.branch_covered, cs.branch_missed, cs.before_after, cs.job_id, cs.created_at
         FROM coverage_snapshots cs
         JOIN test_jobs tj ON cs.job_id = tj.id
         WHERE tj.location_id IN (${placeholders})
         ORDER BY cs.created_at DESC LIMIT ?`,
      )
      .all(...params);
  }

  /**
   * FIN03/14.2: Worker attempt kaydi - provider/model profil snapshot'i, session/message, usage/repair.
   */
  writeWorkerAttempt(input: {
    job_id: string;
    attempt_ordinal: number;
    role: "analyzer" | "test_designer" | "test_developer" | "reviewer" | "gap_analyzer";
    provider_id: string;
    model_id: string;
    profile_digest: string | null;
    session_id: string | null;
    message_id: string | null;
    status: "ok" | "timeout" | "error" | "aborted";
    input_digest: string | null;
    output_digest: string | null;
    duration_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    repair_for_attempt: number | null;
    error_class: string | null;
  }): string {
    const existing = this.db
      .prepare<[string, number], { id: string }>("SELECT id FROM worker_attempts WHERE job_id = ? AND attempt_ordinal = ?")
      .get(input.job_id, input.attempt_ordinal);
    if (existing) {
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO worker_attempts (id, job_id, attempt_ordinal, role, provider_id, model_id, profile_digest, session_id, message_id, status, input_digest, output_digest, duration_ms, input_tokens, output_tokens, repair_for_attempt, error_class, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.job_id,
        input.attempt_ordinal,
        input.role,
        input.provider_id,
        input.model_id,
        input.profile_digest,
        input.session_id,
        input.message_id,
        input.status,
        input.input_digest,
        input.output_digest,
        input.duration_ms,
        input.input_tokens,
        input.output_tokens,
        input.repair_for_attempt,
        input.error_class,
        Date.now(),
      );
    return id;
  }

  /**
   * FIN03/14.2: Candidate iteration kaydi - parent accepted checkpoint, changeset hash, karar ve neden.
   */
  writeCandidateIteration(input: {
    job_id: string;
    parent_checkpoint_id: string | null;
    iteration_ordinal: number;
    changeset_hash: string;
    strategy_key: string | null;
    decision: "adopted" | "rejected" | "needs_review" | "duplicate";
    decision_reason: string | null;
    coverage_before_bps: number | null;
    coverage_after_bps: number | null;
    error_fingerprint: string | null;
  }): string {
    const existing = this.db
      .prepare<[string, number], { id: string }>("SELECT id FROM candidate_iterations WHERE job_id = ? AND iteration_ordinal = ?")
      .get(input.job_id, input.iteration_ordinal);
    if (existing) {
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO candidate_iterations (id, job_id, parent_checkpoint_id, iteration_ordinal, changeset_hash, strategy_key, decision, decision_reason, coverage_before_bps, coverage_after_bps, error_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.job_id,
        input.parent_checkpoint_id,
        input.iteration_ordinal,
        input.changeset_hash,
        input.strategy_key,
        input.decision,
        input.decision_reason,
        input.coverage_before_bps,
        input.coverage_after_bps,
        input.error_fingerprint,
        Date.now(),
      );
    return id;
  }

  listCandidateIterations(jobId: string): Array<{ iteration_ordinal: number; decision: string; decision_reason: string | null; changeset_hash: string; coverage_before_bps: number | null; coverage_after_bps: number | null }> {
    return this.db
      .prepare<[string], { iteration_ordinal: number; decision: string; decision_reason: string | null; changeset_hash: string; coverage_before_bps: number | null; coverage_after_bps: number | null }>(
        "SELECT iteration_ordinal, decision, decision_reason, changeset_hash, coverage_before_bps, coverage_after_bps FROM candidate_iterations WHERE job_id = ? ORDER BY iteration_ordinal",
      )
      .all(jobId);
  }
}
