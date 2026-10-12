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

  /**
   * P03: snapshot kaydi tam source identity tasir: head_commit + dirty_digest +
   * source_digest (tum dosyalar) + build_digest (POM/profile). source/build digest
   * null kalamaz; bilinmeyen kaynak da deterministik digest olarak kaydedilir.
   */
  writeSnapshot(locationId: string, headCommit: string | null, dirtyDigest: string | null, sourceDigest: string, buildDigest: string, parserVersion: string, sourceManifestArtifactId?: string): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO project_snapshots (id, location_id, parent_snapshot_id, head_commit, dirty_digest, source_manifest_artifact_id, build_digest, parser_version, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)")
      .run(id, locationId, headCommit, dirtyDigest, sourceManifestArtifactId ?? null, buildDigest, parserVersion, Date.now());
    this.db
      .prepare("INSERT INTO source_identities (snapshot_id, head_commit, dirty_digest, source_digest, build_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, headCommit, dirtyDigest, sourceDigest, buildDigest, Date.now());
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

  /**
   * W03/F05/N21: package hedefi boundary-aware cosulur.
   * `com.example.packA.` selector'u yalniz o paketteki siniflari dondurur;
   * `com.example.packAB` gibi prefix cakismasi sizmaz (nokta siniri korunur).
   */
  resolvePackageBoundary(snapshotId: string, packageSelector: string): Array<{ symbol_id: string; fqn: string; module_relative_path: string; relative_path: string }> {
    // selector trailing nokta ile gelmeli ("com.example.packA."); yoksa ekle
    const prefix = packageSelector.endsWith(".") ? packageSelector : `${packageSelector}.`;
    // prefix + nokta kontrolu: LIKE 'com.example.packA.%' (SQLite escape ile);
    // nokta siniri korunur: packAB prefix cakismasi sizmaz
    const escaped = prefix.replace(/[\\%_]/g, (m) => `\\${m}`);
    const rows = this.db
      .prepare<[string, string], { symbol_id: string; fqn: string; module_relative_path: string; relative_path: string }>(
        `SELECT cs.id AS symbol_id, cs.fqn, m.relative_path AS module_relative_path, cs.relative_path
         FROM code_symbols cs
         JOIN java_packages jp ON cs.package_id = jp.id
         JOIN modules m ON jp.module_id = m.id
         WHERE m.snapshot_id = ? AND cs.fqn LIKE ? ESCAPE '\\'
         ORDER BY cs.fqn`,
      )
      .all(snapshotId, `${escaped}%`);
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
   * P05/PR06: TEK typed frozen resolver.
   * class/package/module selectorleri snapshot kimligina bagli concrete
   * {fqn, module_path, source_set, relative_path, snapshot_id} listesine cozer.
   *
   * - class: exact FQCN once; simple name tekil eslesirse kabul; coklu eslesme
   *   AMBIGUOUS_TARGET olarak dondurulur (sessiz secim yok).
   * - package: exact package boundary (nokta siniri); alt paket degil (subpackages
   *   parametresi explicit ise dahil).
   * - module: modul relative path'i exact; sinif adina GORE arama yok (module
   *   selector yeniden sinif gibi aratilmez).
   * - source_set: java_packages.source_set (envanter yaziminda module source/test
   *   root'una gore belirler); dosya adi "Test" suffix'i kanit degil.
   */
  resolveFrozenTargets(
    snapshotId: string,
    inputs: Array<{ selector: string; kind: "class" | "package" | "module"; subpackages?: boolean }>,
  ): {
    targets: Array<{ fqn: string; module_path: string; source_set: "main" | "test" | "unknown"; relative_path: string; symbol_id: string }>;
    bySelector: Array<{ selector: string; kind: "class" | "package" | "module"; concrete: Array<{ fqn: string; module_path: string; source_set: "main" | "test" | "unknown"; relative_path: string; symbol_id: string }> }>;
    ambiguous: Array<{ selector: string; candidates: string[] }>;
    not_found: string[];
  } {
    const targets: Array<{ fqn: string; module_path: string; source_set: "main" | "test" | "unknown"; relative_path: string; symbol_id: string }> = [];
    const bySelector: Array<{ selector: string; kind: "class" | "package" | "module"; concrete: Array<{ fqn: string; module_path: string; source_set: "main" | "test" | "unknown"; relative_path: string; symbol_id: string }> }> = [];
    const ambiguous: Array<{ selector: string; candidates: string[] }> = [];
    const not_found: string[] = [];
    const seenTarget = new Set<string>();

    const sourceSetOf = (value: string): "main" | "test" | "unknown" =>
      value === "test" ? "test" : value === "main" ? "main" : "unknown";

    const addMatch = (input: { selector: string; kind: "class" | "package" | "module" }, m: { symbol_id: string; fqn: string; module_path: string; source_set: string; relative_path: string }): void => {
      const concrete = {
        fqn: m.fqn,
        module_path: m.module_path,
        source_set: sourceSetOf(m.source_set),
        relative_path: m.relative_path,
        symbol_id: m.symbol_id,
      };
      const group = bySelector.find((g) => g.selector === input.selector && g.kind === input.kind);
      if (group) {
        group.concrete.push(concrete);
      } else {
        bySelector.push({ selector: input.selector, kind: input.kind, concrete: [concrete] });
      }
      const key = `${m.fqn}|${m.module_path}|${concrete.source_set}|${m.relative_path}`;
      if (!seenTarget.has(key)) {
        seenTarget.add(key);
        targets.push({ fqn: m.fqn, module_path: m.module_path, source_set: concrete.source_set, relative_path: m.relative_path, symbol_id: m.symbol_id });
      }
    };

    const symbolRow = `SELECT cs.id AS symbol_id, cs.fqn, m.relative_path AS module_path, jp.source_set, cs.relative_path
      FROM code_symbols cs
      JOIN java_packages jp ON cs.package_id = jp.id
      JOIN modules m ON jp.module_id = m.id
      WHERE m.snapshot_id = ?`;

    for (const input of inputs) {
      if (input.kind === "class") {
        const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
        // Nested binary ad: `Outer$Inner` selector'u source FQCN `p.Outer.Inner`
        // ile exact eslesir ($ -> . normalize).
        const effectiveSelector = input.selector.includes("$") ? input.selector.replace(/\$/g, ".") : input.selector;
        // FQCN (nokta icerir) birebir; simple name yalniz SON TEK eslesir
        // (`%.Name`): suffix oyunu yok, `OtherPaymentService` `PaymentService`
        // selector'una eslemez. Noktali FQCN icin LIKE kullanilMAZ.
        const condition = effectiveSelector.includes(".")
          ? `(cs.fqn = ?)`
          : `(cs.fqn = ? OR cs.fqn LIKE ? ESCAPE '\\')`;
        const params: unknown[] = effectiveSelector.includes(".") ? [effectiveSelector] : [effectiveSelector, `%.${esc(effectiveSelector)}`];
        const rows = this.db
          .prepare<[string, ...unknown[]], { symbol_id: string; fqn: string; module_path: string; source_set: string; relative_path: string }>(
            `${symbolRow} AND ${condition} ORDER BY cs.fqn`,
          )
          .all(snapshotId, ...params);
        if (rows.length === 0) {
          not_found.push(input.selector);
          continue;
        }
        if (rows.length > 1) {
          ambiguous.push({ selector: input.selector, candidates: rows.map((m) => `${m.module_path}: ${m.fqn} (${m.source_set})`) });
          continue;
        }
        addMatch(input, rows[0]!);
        continue;
      }
      if (input.kind === "package") {
        const base = input.selector.endsWith(".") ? input.selector.slice(0, -1) : input.selector;
        const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
        // Package boundary: nokta siniri korunur; `packAB` prefix cakismasi sizmaz.
        // exact: paket adi birebir; subpackages: paket + alt paketler (explicit policy).
        const condition = input.subpackages
          ? `(jp.qualified_name = ? OR jp.qualified_name LIKE ? ESCAPE '\\')`
          : `(jp.qualified_name = ?)`;
        const params: unknown[] = input.subpackages ? [base, `${esc(base)}.%`] : [base];
        const rows = this.db
          .prepare<[string, ...unknown[]], { symbol_id: string; fqn: string; module_path: string; source_set: string; relative_path: string }>(
            `${symbolRow} AND ${condition} ORDER BY cs.fqn`,
          )
          .all(snapshotId, ...params);
        if (rows.length === 0) {
          not_found.push(input.selector);
          continue;
        }
        for (const m of rows) {
          addMatch(input, m);
        }
        continue;
      }
      // module: relative path exact; sinif adina gore arama yok
      const rows = this.db
        .prepare<[string, string], { symbol_id: string; fqn: string; module_path: string; source_set: string; relative_path: string }>(
          `${symbolRow} AND m.relative_path = ? ORDER BY cs.fqn`,
        )
        .all(snapshotId, input.selector);
      if (rows.length === 0) {
        not_found.push(input.selector);
        continue;
      }
      for (const m of rows) {
        addMatch(input, m);
      }
    }
    return { targets, bySelector, ambiguous, not_found };
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
   * W01/F02: attempt sonucu guncellenir (istek oncesi yazilan satira).
   * Tum sonuclar bitirilir: ok/timeout/error/aborted; unknown usage null kalir.
   */
  updateWorkerAttemptOutcome(input: {
    job_id: string;
    attempt_ordinal: number;
    status: "ok" | "timeout" | "error" | "aborted";
    session_id: string | null;
    message_id: string | null;
    input_digest: string | null;
    output_digest: string | null;
    duration_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    error_class: string | null;
  }): boolean {
    const result = this.db
      .prepare(
        "UPDATE worker_attempts SET status = ?, session_id = ?, message_id = ?, input_digest = ?, output_digest = ?, duration_ms = ?, input_tokens = ?, output_tokens = ?, error_class = ? WHERE job_id = ? AND attempt_ordinal = ?",
      )
      .run(
        input.status,
        input.session_id,
        input.message_id,
        input.input_digest,
        input.output_digest,
        input.duration_ms,
        input.input_tokens,
        input.output_tokens,
        input.error_class,
        input.job_id,
        input.attempt_ordinal,
      );
    return result.changes > 0;
  }

  /**
   * FIN03/14.2: Candidate iteration kaydi - parent accepted checkpoint, changeset hash, karar ve neden.
   */
  writeCandidateIteration(input: {
    job_id: string;
    parent_checkpoint_id: string | null;
    attempt_ordinal?: number;
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
      .prepare<[string, number], { id: string }>("SELECT id FROM candidate_iterations WHERE job_id = ? AND attempt_ordinal = ?")
      .get(input.job_id, input.attempt_ordinal ?? input.iteration_ordinal);
    if (existing) {
      return existing.id;
    }
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO candidate_iterations (id, job_id, parent_checkpoint_id, attempt_ordinal, iteration_ordinal, changeset_hash, strategy_key, decision, decision_reason, coverage_before_bps, coverage_after_bps, error_fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.job_id,
        input.parent_checkpoint_id,
        input.attempt_ordinal ?? input.iteration_ordinal,
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

  listCandidateIterations(jobId: string): Array<{ attempt_ordinal: number; iteration_ordinal: number; decision: string; decision_reason: string | null; changeset_hash: string; coverage_before_bps: number | null; coverage_after_bps: number | null }> {
    return this.db
      .prepare<[string], { attempt_ordinal: number; iteration_ordinal: number; decision: string; decision_reason: string | null; changeset_hash: string; coverage_before_bps: number | null; coverage_after_bps: number | null }>(
        "SELECT attempt_ordinal, iteration_ordinal, decision, decision_reason, changeset_hash, coverage_before_bps, coverage_after_bps FROM candidate_iterations WHERE job_id = ? ORDER BY attempt_ordinal",
      )
      .all(jobId);
  }
}
