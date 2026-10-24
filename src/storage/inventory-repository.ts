/**
 * Envanter yazma: snapshot/parser version ile iliskili satirlar; silinenler yeni snapshot'ta yok isaretlenir, gecmis silinmez.
 */
import { createHash, randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import type { ArtifactStore } from "./artifact-store.js";
import { assertNoPendingRunOutputReceipt, promoteRunOutputReceipt, publishRunOutputReceipt, reserveRunOutputReceipt } from "./run-output-receipt.js";
import type { JavaSymbol, TestInventory } from "../discovery/java-inventory.js";
import type { PomModule } from "../discovery/pom-discovery.js";
import type { FileInventoryEntry, FileInventoryPage } from "../discovery/file-inventory.js";

export interface InventoryWriteResult {
  snapshot_id: string;
  module_id: string;
  symbols_written: number;
  test_cases_written: number;
}

export interface InventoryScanRow {
  scan_id: string;
  project_id: string;
  location_id: string;
  root_file_id: string | null;
  generation: number;
  required_paths_digest: string;
  state: "STAGING" | "COMPLETE" | "PARTIAL" | "STALE";
  owner_id: string | null;
  fence_token: number;
  row_version: number;
  last_key: string | null;
  scanned_count: number;
  error_count: number;
  errors_json: string;
  digest: string | null;
  created_at: number;
  finished_at: number | null;
}

export interface DurableFileInventoryRow {
  scan_id: string;
  canonical_relative_path: string;
  kind: "file" | "directory" | "symlink" | "junction" | "other";
  size: number | null;
  mtime: number | null;
  sha256: string | null;
  hash_status: "KNOWN" | "UNAVAILABLE" | "INVALID" | "NOT_APPLICABLE";
  sensitivity: "PUBLIC" | "INTERNAL" | "SENSITIVE" | "UNKNOWN";
  read_status: "READ" | "UNREADABLE" | "SKIPPED";
  parser_status: "PARSED" | "UNSUPPORTED" | "ERROR" | "NOT_APPLICABLE";
  native_volume_serial: string | null;
  native_file_id: string | null;
  native_link_count: number | null;
  native_bytes: number | null;
  tombstone: number;
  created_at: number;
  row_version: number;
}

function durableInventoryEntry(scanId: string, entry: FileInventoryEntry): DurableFileInventoryRow {
  const kind = entry.kind === "unknown" ? "other" : entry.kind;
  const hashStatus = entry.hashStatus === "COMPUTED" ? "KNOWN" : entry.hashStatus === "NOT_COMPUTED" ? "UNAVAILABLE" : entry.hashStatus === "ERROR" ? "INVALID" : "NOT_APPLICABLE";
  const readStatus = entry.readStatus === "OK" ? "READ" : entry.readStatus === "ERROR" ? "UNREADABLE" : "UNREADABLE";
  return {
    scan_id: scanId,
    canonical_relative_path: entry.relativePath,
    kind,
    size: entry.size,
    mtime: entry.mtimeMs === null ? null : Math.trunc(entry.mtimeMs),
    sha256: entry.hash,
    hash_status: hashStatus,
    sensitivity: "UNKNOWN",
    read_status: readStatus,
    parser_status: "NOT_APPLICABLE",
    native_volume_serial: entry.fileIdentity?.volumeSerial ?? null,
    native_file_id: entry.fileIdentity?.fileId ?? null,
    native_link_count: entry.fileIdentity?.linkCount ?? null,
    native_bytes: entry.fileIdentity?.bytes ?? null,
    tombstone: 0,
    created_at: Date.now(),
    row_version: 0,
  };
}

function sameInventoryRow(left: DurableFileInventoryRow, right: DurableFileInventoryRow): boolean {
  return left.kind === right.kind && left.size === right.size && left.mtime === right.mtime && left.sha256 === right.sha256 &&
    left.hash_status === right.hash_status && left.sensitivity === right.sensitivity && left.read_status === right.read_status &&
    left.parser_status === right.parser_status && left.native_volume_serial === right.native_volume_serial &&
    left.native_file_id === right.native_file_id && left.native_link_count === right.native_link_count &&
    left.native_bytes === right.native_bytes && left.tombstone === right.tombstone;
}

export interface RunOutputTruncation {
  stdout_raw_dropped_bytes: number;
  stderr_raw_dropped_bytes: number;
  stdout_rendered_dropped_bytes: number;
  stderr_rendered_dropped_bytes: number;
  stdout_reason: "BYTE_BUDGET_EXCEEDED" | null;
  stderr_reason: "BYTE_BUDGET_EXCEEDED" | null;
}

export class InventoryRepository {
  private readonly db: BetterSqlite3.Database;
  private readonly artifacts: ArtifactStore | undefined;

  constructor(db: BetterSqlite3.Database, artifacts?: ArtifactStore) {
    this.db = db;
    this.artifacts = artifacts;
  }

  /**
   * S03/S04: scan nesli kalici olarak acilir. Her location+generation tekildir;
   * ayni istek tekrarlandiginda ayni staging satiri doner.
   */
  beginInventoryScan(input: {
    scan_id?: string;
    project_id: string;
    location_id: string;
    root_file_id?: string | null;
    generation: number;
    required_paths_digest: string;
    owner_id: string;
  }): InventoryScanRow {
    if (!Number.isSafeInteger(input.generation) || input.generation < 0 || !/^[0-9a-f]{64}$/u.test(input.required_paths_digest) || !input.owner_id.trim()) {
      throw new AppError("INVALID_PARAMETERS", "Inventory scan parametreleri gecersiz");
    }
    const now = Date.now();
    const scanId = input.scan_id ?? randomUUID();
    const tx = this.db.transaction((): InventoryScanRow => {
      const existing = this.db
        .prepare<[string, number], InventoryScanRow>("SELECT * FROM inventory_scans WHERE location_id = ? AND generation = ?")
        .get(input.location_id, input.generation);
      if (existing) {
        if (existing.project_id !== input.project_id || existing.required_paths_digest !== input.required_paths_digest) {
          throw new AppError("STORAGE_ERROR", "Inventory generation identity cakismasi", { reason_code: "STALE_GENERATION" });
        }
        if (existing.state !== "STAGING") {
          throw new AppError("STORAGE_ERROR", "Sealed inventory generation yeniden acilamaz", { reason_code: "GENERATION_SEALED" });
        }
        return existing;
      }
      this.db
        .prepare(
          `INSERT INTO inventory_scans (
             scan_id, project_id, location_id, root_file_id, generation,
             required_paths_digest, state, owner_id, fence_token, row_version,
             last_key, scanned_count, error_count, errors_json, digest, created_at, finished_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'STAGING', ?, 1, 0, NULL, 0, 0, '[]', NULL, ?, NULL)`,
        )
        .run(scanId, input.project_id, input.location_id, input.root_file_id ?? null, input.generation, input.required_paths_digest, input.owner_id, now);
      const created = this.db.prepare<[string], InventoryScanRow>("SELECT * FROM inventory_scans WHERE scan_id = ?").get(scanId);
      if (!created) throw new AppError("STORAGE_ERROR", "Inventory scan olusturulamadi", { reason_code: "INVENTORY_SCAN_INSERT_FAILED" });
      return created;
    });
    return tx();
  }

  /** S03: bir sayfayi kisa fence transaction'inda append eder; ayni satir retry'da degismez. */
  appendInventoryPage(scanId: string, ownerId: string, fenceToken: number, page: FileInventoryPage): InventoryScanRow {
    const tx = this.db.transaction((): InventoryScanRow => {
      const scan = this.getInventoryScan(scanId);
      if (scan.state !== "STAGING") {
        throw new AppError("STORAGE_ERROR", "Sealed inventory scan'e sayfa eklenemez", { reason_code: "GENERATION_SEALED" });
      }
      this.assertInventoryLease(scan, ownerId, fenceToken);
      let inserted = 0;
      for (const entry of page.entries) {
        const normalized = durableInventoryEntry(scanId, entry);
        const result = this.db
          .prepare(
            `INSERT INTO file_inventory (
               scan_id, canonical_relative_path, kind, size, mtime, sha256,
               hash_status, sensitivity, read_status, parser_status, tombstone,
               created_at, row_version, native_volume_serial, native_file_id,
               native_link_count, native_bytes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'UNKNOWN', ?, ?, 0, ?, 0, ?, ?, ?, ?)
             ON CONFLICT(scan_id, canonical_relative_path) DO NOTHING`,
          )
          .run(
            normalized.scan_id,
            normalized.canonical_relative_path,
            normalized.kind,
            normalized.size,
            normalized.mtime,
            normalized.sha256,
            normalized.hash_status,
            normalized.read_status,
            normalized.parser_status,
            normalized.created_at,
            normalized.native_volume_serial,
            normalized.native_file_id,
            normalized.native_link_count,
            normalized.native_bytes,
          );
        if (result.changes === 1) {
          inserted++;
        } else {
          const existing = this.db
            .prepare<[string, string], DurableFileInventoryRow>("SELECT * FROM file_inventory WHERE scan_id = ? AND canonical_relative_path = ?")
            .get(scanId, normalized.canonical_relative_path);
          if (!existing || !sameInventoryRow(existing, normalized)) {
            throw new AppError("STORAGE_ERROR", `Inventory satiri retry uyusmazligi: ${entry.relativePath}`, { reason_code: "INVENTORY_ROW_CONFLICT" });
          }
        }
      }
      const lastKey = page.entries.length > 0 ? page.entries[page.entries.length - 1]!.relativePath : scan.last_key;
      let priorErrors: Array<{ relativePath: string; code: string }> = [];
      try {
        const parsed: unknown = JSON.parse(scan.errors_json);
        if (Array.isArray(parsed)) priorErrors = parsed as Array<{ relativePath: string; code: string }>;
      } catch { /* a malformed diagnostic history must not abort the page append */ }
      const allErrors = [...priorErrors, ...page.errors].slice(0, 512);
      const updated = this.db
        .prepare(
          `UPDATE inventory_scans
           SET last_key = ?, scanned_count = scanned_count + ?, error_count = error_count + ?,
               errors_json = ?, row_version = row_version + 1
           WHERE scan_id = ? AND state = 'STAGING' AND owner_id = ? AND fence_token = ? AND row_version = ?`,
        )
        .run(lastKey, inserted, page.errors.length, JSON.stringify(allErrors), scanId, ownerId, fenceToken, scan.row_version);
      if (updated.changes !== 1) {
        throw new AppError("POLICY_VIOLATION", "Inventory page fence/row_version cakismasi", { reason_code: "INVENTORY_CAS_CONFLICT" });
      }
      return this.getInventoryScan(scanId);
    });
    return tx();
  }

  /** S03: staging generation'i digest ile seal eder veya kontrollu stale isaretler. */
  finishInventoryScan(input: {
    scan_id: string;
    owner_id: string;
    fence_token: number;
    state: "COMPLETE" | "PARTIAL" | "STALE";
    digest?: string | null;
    finished_at?: number;
  }): InventoryScanRow {
    if (input.state === "COMPLETE" && (!input.digest || !/^[0-9a-f]{64}$/u.test(input.digest))) {
      throw new AppError("INVALID_PARAMETERS", "Complete inventory scan digest'i zorunlu");
    }
    const now = input.finished_at ?? Date.now();
    const tx = this.db.transaction((): InventoryScanRow => {
      const scan = this.getInventoryScan(input.scan_id);
      if (scan.state !== "STAGING") {
        if (scan.state === input.state && scan.digest === (input.digest ?? null)) return scan;
        throw new AppError("STORAGE_ERROR", "Inventory generation zaten sealed", { reason_code: "GENERATION_SEALED" });
      }
      this.assertInventoryLease(scan, input.owner_id, input.fence_token);
      const result = this.db
        .prepare(
          `UPDATE inventory_scans SET state = ?, digest = ?, finished_at = ?, owner_id = NULL,
             row_version = row_version + 1
           WHERE scan_id = ? AND state = 'STAGING' AND owner_id = ? AND fence_token = ? AND row_version = ?`,
        )
        .run(input.state, input.digest ?? null, now, input.scan_id, input.owner_id, input.fence_token, scan.row_version);
      if (result.changes !== 1) {
        throw new AppError("STORAGE_ERROR", "Inventory scan seal guncellemesi basarisiz", { reason_code: "INVENTORY_CAS_CONFLICT" });
      }
      return this.getInventoryScan(input.scan_id);
    });
    return tx();
  }

  getInventoryScan(scanId: string): InventoryScanRow {
    const row = this.db.prepare<[string], InventoryScanRow>("SELECT * FROM inventory_scans WHERE scan_id = ?").get(scanId);
    if (!row) throw new AppError("INVALID_PARAMETERS", `Inventory scan bulunamadi: ${scanId}`);
    return row;
  }

  listDurableInventory(scanId: string, afterPath: string | null = null, limit = 100): DurableFileInventoryRow[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new AppError("INVALID_PARAMETERS", "Inventory page limiti gecersiz");
    if (afterPath === null) {
      return this.db.prepare<[string, number], DurableFileInventoryRow>("SELECT * FROM file_inventory WHERE scan_id = ? ORDER BY canonical_relative_path LIMIT ?").all(scanId, limit);
    }
    return this.db.prepare<[string, string, number], DurableFileInventoryRow>("SELECT * FROM file_inventory WHERE scan_id = ? AND canonical_relative_path > ? ORDER BY canonical_relative_path LIMIT ?").all(scanId, afterPath, limit);
  }

  /** Return the newest sealed generation before an optional generation. */
  getLatestSealedInventoryScan(locationId: string, beforeGeneration?: number): InventoryScanRow | null {
    const row = beforeGeneration === undefined
      ? this.db.prepare<[string], InventoryScanRow>(
        "SELECT * FROM inventory_scans WHERE location_id = ? AND state <> 'STAGING' ORDER BY generation DESC LIMIT 1",
      ).get(locationId)
      : this.db.prepare<[string, number], InventoryScanRow>(
        "SELECT * FROM inventory_scans WHERE location_id = ? AND generation < ? AND state <> 'STAGING' ORDER BY generation DESC LIMIT 1",
      ).get(locationId, beforeGeneration);
    return row ?? null;
  }

  /** Allocate the next monotonic generation without opening a write transaction. */
  nextInventoryGeneration(locationId: string): number {
    const row = this.db.prepare<[string], { generation: number | null }>(
      "SELECT MAX(generation) AS generation FROM inventory_scans WHERE location_id = ?",
    ).get(locationId);
    const next = (row?.generation ?? 0) + 1;
    if (!Number.isSafeInteger(next) || next < 1) throw new AppError("STORAGE_ERROR", "Inventory generation tasti");
    return next;
  }

  /**
   * Reconcile a sealed generation against its predecessor. Missing paths are
   * copied as tombstones, preserving the old metadata and making deletes and
   * renames visible without mutating the immutable predecessor.
   */
  appendInventoryTombstones(scanId: string, ownerId: string, fenceToken: number, previousScanId: string | null): InventoryScanRow {
    if (!previousScanId) return this.getInventoryScan(scanId);
    const tx = this.db.transaction((): InventoryScanRow => {
      const scan = this.getInventoryScan(scanId);
      if (scan.state !== "STAGING") throw new AppError("STORAGE_ERROR", "Sealed inventory scan'e tombstone eklenemez", { reason_code: "GENERATION_SEALED" });
      this.assertInventoryLease(scan, ownerId, fenceToken);
      const previous = this.db.prepare<[string], InventoryScanRow>("SELECT * FROM inventory_scans WHERE scan_id = ?").get(previousScanId);
      if (!previous || previous.location_id !== scan.location_id || previous.project_id !== scan.project_id || previous.state === "STAGING") {
        throw new AppError("STORAGE_ERROR", "Inventory predecessor identity gecersiz", { reason_code: "STALE_GENERATION" });
      }
      const oldRows = this.db.prepare<[string], DurableFileInventoryRow>(
        "SELECT * FROM file_inventory WHERE scan_id = ? AND tombstone = 0 ORDER BY canonical_relative_path",
      ).all(previousScanId);
      const currentPaths = new Set(this.db.prepare<[string], { canonical_relative_path: string }>(
        "SELECT canonical_relative_path FROM file_inventory WHERE scan_id = ? AND tombstone = 0",
      ).all(scanId).map((row) => row.canonical_relative_path));
      const insert = this.db.prepare(
        `INSERT INTO file_inventory (
           scan_id, canonical_relative_path, kind, size, mtime, sha256,
           hash_status, sensitivity, read_status, parser_status, tombstone,
           created_at, row_version, native_volume_serial, native_file_id,
           native_link_count, native_bytes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(scan_id, canonical_relative_path) DO NOTHING`,
      );
      for (const row of oldRows) {
        if (currentPaths.has(row.canonical_relative_path)) continue;
        insert.run(scanId, row.canonical_relative_path, row.kind, row.size, row.mtime, row.sha256,
          row.hash_status, row.sensitivity, row.read_status, row.parser_status, Date.now(),
          row.native_volume_serial, row.native_file_id, row.native_link_count, row.native_bytes);
      }
      return this.getInventoryScan(scanId);
    });
    return tx();
  }

  /** Stable digest over persisted metadata, including tombstones. */
  inventoryDigest(scanId: string): string {
    const rows = this.db.prepare<[string], DurableFileInventoryRow>(
      "SELECT * FROM file_inventory WHERE scan_id = ? ORDER BY canonical_relative_path, tombstone",
    ).all(scanId);
    const canonical = rows.map((row) => [row.canonical_relative_path, row.kind, row.size, row.mtime, row.sha256,
      row.hash_status, row.sensitivity, row.read_status, row.parser_status, row.native_volume_serial,
      row.native_file_id, row.native_link_count, row.native_bytes, row.tombstone]);
    return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  }

  private assertInventoryLease(scan: InventoryScanRow, ownerId: string, fenceToken: number): void {
    if (scan.owner_id !== ownerId || scan.fence_token !== fenceToken) {
      throw new AppError("POLICY_VIOLATION", "Inventory fence eslesmiyor", { reason_code: "STALE_FENCE" });
    }
  }

  /** P06/PP31: Maven run + Surefire/Failsafe inventory authoritative kaydi. */
  writeTestRunProvenance(input: {
    job_id: string;
    stage: "baseline" | "candidate" | "final_replay";
    attempt_ordinal: number | null;
    iteration_ordinal: number | null;
    execution_root: string;
    command: string[];
    stdout_log_path: string;
    stderr_log_path: string;
    exit_code: number;
    timed_out: boolean;
    test_inventory: Array<{ module_relative_path: string; name: string; tests: number; failures: number; errors: number; skipped: number; test_names: string[]; skipped_test_names: string[]; failed_test_names: string[] }>;
    coverage_report_path: string;
    coverage_report_sha256: string | null;
    coverage_report_paths: Array<{ path: string; sha256: string | null }>;
    started_at: number;
    finished_at: number;
    output_truncation?: RunOutputTruncation | undefined;
  }): string {
    assertNoPendingRunOutputReceipt(this.db, input.job_id, "run_output_truncation");
    // A resumed dispatch executes baseline/final replay again. Their logical
    // stage/ordinal stays the same, but each physical run has its own receipt.
    // Keep exact retries (including pre-upgrade rows) idempotent.
    const logicalKey = [input.job_id, input.stage, input.attempt_ordinal ?? 0, input.iteration_ordinal ?? 0].join(":");
    const provenanceKey = `${logicalKey}:${input.started_at}`;
    const existing = this.db.prepare<[string, string, number], { id: string }>(
      "SELECT id FROM test_run_provenance WHERE provenance_key = ? OR (provenance_key = ? AND started_at = ?)",
    ).get(provenanceKey, logicalKey, input.started_at);
    const id = existing?.id ?? randomUUID();
    const truncation = input.output_truncation;
    const hasTruncation = truncation !== undefined && [
      truncation.stdout_raw_dropped_bytes, truncation.stderr_raw_dropped_bytes,
      truncation.stdout_rendered_dropped_bytes, truncation.stderr_rendered_dropped_bytes,
    ].some((count) => count > 0);
    if (truncation && Object.values(truncation).some((value) => typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))) {
      throw new AppError("STORAGE_ERROR", "Gecersiz run output kesinti sayaci");
    }
    if (truncation && ((truncation.stdout_reason !== null) !== (truncation.stdout_raw_dropped_bytes + truncation.stdout_rendered_dropped_bytes > 0) ||
      (truncation.stderr_reason !== null) !== (truncation.stderr_raw_dropped_bytes + truncation.stderr_rendered_dropped_bytes > 0))) {
      throw new AppError("STORAGE_ERROR", "Run output kesinti sebebi ve sayaci uyusmuyor");
    }
    if (hasTruncation && !this.artifacts) throw new AppError("STORAGE_ERROR", "Run output kesinti artifact deposu yok");
    const truncationJson = hasTruncation ? JSON.stringify({
      schema_version: 1, run_id: id, job_id: input.job_id, stage: input.stage, ...truncation,
    }) : null;
    const pin = `run_output_truncation:${id}`;
    const recordedArtifacts = existing ? this.db.prepare<[string, string], { sha256: string; bytes: number; relative_store_path: string; status: string }>(
      "SELECT sha256, bytes, relative_store_path, status FROM artifacts WHERE kind = 'run_output_truncation' AND job_id = ? AND pin_reason = ?",
    ).all(input.job_id, pin) : [];
    if (recordedArtifacts.length > 1) throw new AppError("STORAGE_ERROR", "Run output kesinti pin'i tekil degil");
    const recordedArtifact = recordedArtifacts[0];
    if (existing && hasTruncation && !recordedArtifact) {
      throw new AppError("STORAGE_ERROR", "Eski run icin output kesinti kaniti sonradan eklenemez");
    }
    if (recordedArtifact && (!truncationJson || recordedArtifact.sha256 !== this.artifacts?.sha256(truncationJson) || recordedArtifact.status !== "READY")) {
      throw new AppError("STORAGE_ERROR", "Run output kesinti kaydi degisti");
    }
    // The PENDING receipt commits before blob publication. A hard-kill after
    // publish therefore leaves an owned, non-trusted row for reconciliation.
    const receipt = truncationJson ? reserveRunOutputReceipt(this.db, this.artifacts!, {
      jobId: input.job_id, kind: "run_output_truncation", pin, data: truncationJson,
    }) : null;
    if (receipt) publishRunOutputReceipt(this.artifacts!, receipt, truncationJson!);
    const commandJson = JSON.stringify(input.command);
    const inventoryJson = JSON.stringify(input.test_inventory);
    const totalTests = input.test_inventory.reduce((sum, suite) => sum + suite.tests, 0);
    const failures = input.test_inventory.reduce((sum, suite) => sum + suite.failures, 0);
    const errors = input.test_inventory.reduce((sum, suite) => sum + suite.errors, 0);
    const skipped = input.test_inventory.reduce((sum, suite) => sum + suite.skipped, 0);
    const placeholders = Array.from({ length: 24 }, () => "?").join(", ");
    this.db.transaction(() => {
    if (!receipt) assertNoPendingRunOutputReceipt(this.db, input.job_id, "run_output_truncation");
    if (!existing) this.db.prepare(
      `INSERT INTO test_run_provenance (id, job_id, provenance_key, stage, attempt_ordinal, iteration_ordinal, execution_root, command_json, command_digest, stdout_log_path, stderr_log_path, exit_code, timed_out, total_tests, failures, errors, skipped, test_inventory_json, coverage_report_path, coverage_report_sha256, coverage_report_paths_json, started_at, finished_at, created_at) VALUES (${placeholders})`,
    ).run(
      id,
      input.job_id,
      provenanceKey,
      input.stage,
      input.attempt_ordinal,
      input.iteration_ordinal,
      input.execution_root,
      commandJson,
      createHash("sha256").update(commandJson, "utf8").digest("hex"),
      input.stdout_log_path,
      input.stderr_log_path,
      input.exit_code,
      input.timed_out ? 1 : 0,
      totalTests,
      failures,
      errors,
      skipped,
      inventoryJson,
      input.coverage_report_path,
      input.coverage_report_sha256,
      JSON.stringify(input.coverage_report_paths),
      input.started_at,
      input.finished_at,
      Date.now(),
    );
    if (receipt) {
      promoteRunOutputReceipt(this.db, receipt);
    } else if (existing && this.db.prepare<[string, string], { id: string }>(
      "SELECT id FROM artifacts WHERE kind = 'run_output_truncation' AND job_id = ? AND pin_reason = ?",
    ).get(input.job_id, pin)) {
      throw new AppError("STORAGE_ERROR", "Run output kesinti kaydi silinemez");
    }
    })();
    return id;
  }

  listTestRunProvenance(jobId: string): Array<{ id: string; stage: string; attempt_ordinal: number | null; iteration_ordinal: number | null; command_digest: string; command_json: string; execution_root: string; stdout_log_path: string; stderr_log_path: string; exit_code: number; timed_out: number; total_tests: number; failures: number; errors: number; skipped: number; test_inventory_json: string; coverage_report_path: string; coverage_report_paths_json: string; started_at: number; finished_at: number }> {
    return this.db.prepare<[string], { id: string; stage: string; attempt_ordinal: number | null; iteration_ordinal: number | null; command_digest: string; command_json: string; execution_root: string; stdout_log_path: string; stderr_log_path: string; exit_code: number; timed_out: number; total_tests: number; failures: number; errors: number; skipped: number; test_inventory_json: string; coverage_report_path: string; coverage_report_paths_json: string; started_at: number; finished_at: number }>(
      "SELECT id, stage, attempt_ordinal, iteration_ordinal, command_digest, command_json, execution_root, stdout_log_path, stderr_log_path, exit_code, timed_out, total_tests, failures, errors, skipped, test_inventory_json, coverage_report_path, coverage_report_paths_json, started_at, finished_at FROM test_run_provenance WHERE job_id = ? ORDER BY created_at",
    ).all(jobId);
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
         -- Millisecond timestamps can tie when before/after snapshots are
         -- written in the same transaction turn. Preserve insertion order
         -- for that tie so the latest snapshot remains first deterministically.
         ORDER BY cs.created_at DESC, cs.rowid DESC LIMIT ?`,
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
  candidateAttemptUsage(jobId: string): { attempts_used: number; next_ordinal: number } {
    const decisions = this.db.prepare<[string], { n: number; ordinal: number | null }>(
      "SELECT COUNT(*) AS n, MAX(attempt_ordinal) AS ordinal FROM candidate_iterations WHERE job_id = ?",
    ).get(jobId)!;
    // Pre-reservation versions could die with only a durable agent attempt.
    // That physical request still consumes the same job-wide candidate pool.
    const agents = this.db.prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM agent_attempts a JOIN agent_tasks t ON t.task_id = a.task_id
       WHERE a.job_id = ? AND json_extract(t.contract_json, '$.expected_output_schema') = 'candidate-change-set-v1'`,
    ).get(jobId)!;
    return { attempts_used: Math.max(decisions.n, decisions.ordinal ?? 0, agents.n), next_ordinal: Math.max(decisions.ordinal ?? 0, agents.n) + 1 };
  }

  reserveCandidateAttempt(jobId: string, ordinal: number, iteration: number, parentCheckpointId: string | null): void {
    this.writeCandidateIteration({ job_id: jobId, parent_checkpoint_id: parentCheckpointId,
      attempt_ordinal: ordinal, iteration_ordinal: iteration, changeset_hash: "pending", strategy_key: null,
      decision: "needs_review", decision_reason: "Candidate attempt started; decision pending",
      coverage_before_bps: null, coverage_after_bps: null, error_fingerprint: "CANDIDATE_ATTEMPT_PENDING" });
  }

  /** Only called after resume acquired the job lease, fencing the prior run. */
  interruptPendingCandidateAttempts(jobId: string): void {
    this.db.prepare(`UPDATE candidate_iterations SET decision = 'rejected',
      decision_reason = 'Candidate attempt interrupted before a durable decision', error_fingerprint = 'CANDIDATE_ATTEMPT_INTERRUPTED'
      WHERE job_id = ? AND decision = 'needs_review' AND error_fingerprint = 'CANDIDATE_ATTEMPT_PENDING'`).run(jobId);
  }

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
      .prepare<[string, number], { id: string; decision: string; error_fingerprint: string | null }>("SELECT id, decision, error_fingerprint FROM candidate_iterations WHERE job_id = ? AND attempt_ordinal = ?")
      .get(input.job_id, input.attempt_ordinal ?? input.iteration_ordinal);
    if (existing) {
      if (existing.decision === "needs_review" && existing.error_fingerprint === "CANDIDATE_ATTEMPT_PENDING" && input.decision !== "needs_review") {
        this.db.prepare(`UPDATE candidate_iterations SET parent_checkpoint_id = ?, iteration_ordinal = ?, changeset_hash = ?,
          strategy_key = ?, decision = ?, decision_reason = ?, coverage_before_bps = ?, coverage_after_bps = ?, error_fingerprint = ? WHERE id = ?`)
          .run(input.parent_checkpoint_id, input.iteration_ordinal, input.changeset_hash, input.strategy_key, input.decision,
            input.decision_reason, input.coverage_before_bps, input.coverage_after_bps, input.error_fingerprint, existing.id);
      }
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
