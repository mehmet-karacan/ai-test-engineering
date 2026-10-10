/**
 * Lease/fence yonetimi: ayni workspace/job'u iki process yonetemez.
 * Token monoton artar; her state/pointer guncellemesi fence kontrol eder.
 * Eski worker token'i geri donerse sonuc stale kaydedilir.
 */
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";

export interface Lease {
  id: string;
  job_id: string;
  owner_id: string;
  fencing_token: number;
  expires_at: number;
  heartbeat_at: number;
}

export interface LeaseAcquireResult {
  lease: Lease;
  created: boolean;
  previous_owner_alive: boolean;
}

export class LeaseManager {
  private readonly db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  acquire(jobId: string, ownerId: string, ttlMs: number, processIdentity?: string): LeaseAcquireResult {
    const tx = this.db.transaction((): LeaseAcquireResult => {
      const now = Date.now();
      const existing = this.db
        .prepare<[string], { id: string; owner_id: string; fencing_token: number; expires_at: number; heartbeat_at: number; process_identity: string | null }>(
          "SELECT id, owner_id, fencing_token, expires_at, heartbeat_at, process_identity FROM job_leases WHERE job_id = ?",
        )
        .get(jobId);

      if (existing && existing.owner_id === ownerId) {
        this.db
          .prepare("UPDATE job_leases SET expires_at = ?, heartbeat_at = ? WHERE job_id = ? AND owner_id = ?")
          .run(now + ttlMs, now, jobId, ownerId);
        return {
          lease: { id: existing.id, job_id: jobId, owner_id: ownerId, fencing_token: existing.fencing_token, expires_at: now + ttlMs, heartbeat_at: now },
          created: false,
          previous_owner_alive: false,
        };
      }

      const previousOwnerAlive = existing !== undefined && existing.owner_id !== ownerId && existing.expires_at > now;
      const nextToken = (existing?.fencing_token ?? 0) + 1;

      if (existing) {
        this.db
          .prepare(
            "UPDATE job_leases SET owner_id = ?, fencing_token = ?, expires_at = ?, heartbeat_at = ?, process_identity = ? WHERE job_id = ?",
          )
          .run(ownerId, nextToken, now + ttlMs, now, processIdentity ?? null, jobId);
        return {
          lease: { id: existing.id, job_id: jobId, owner_id: ownerId, fencing_token: nextToken, expires_at: now + ttlMs, heartbeat_at: now },
          created: false,
          previous_owner_alive: previousOwnerAlive,
        };
      }

      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO job_leases (id, job_id, owner_id, fencing_token, expires_at, heartbeat_at, process_identity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, jobId, ownerId, nextToken, now + ttlMs, now, processIdentity ?? null, now);
      return {
        lease: { id, job_id: jobId, owner_id: ownerId, fencing_token: nextToken, expires_at: now + ttlMs, heartbeat_at: now },
        created: true,
        previous_owner_alive: false,
      };
    });
    return tx();
  }

  renew(jobId: string, ownerId: string, ttlMs: number): Lease {
    const now = Date.now();
    const result = this.db
      .prepare("UPDATE job_leases SET expires_at = ?, heartbeat_at = ? WHERE job_id = ? AND owner_id = ?")
      .run(now + ttlMs, now, jobId, ownerId);
    if (result.changes === 0) {
      throw new AppError("POLICY_VIOLATION", "Lease yenileme basarisiz; sahiplik degisti", { reason_code: "LEASE_LOST" });
    }
    return this.get(jobId);
  }

  get(jobId: string): Lease {
    const row = this.db
      .prepare<[string], { id: string; job_id: string; owner_id: string; fencing_token: number; expires_at: number; heartbeat_at: number }>(
        "SELECT id, job_id, owner_id, fencing_token, expires_at, heartbeat_at FROM job_leases WHERE job_id = ?",
      )
      .get(jobId);
    if (!row) {
      throw new AppError("INVALID_PARAMETERS", `Lease bulunamadi: ${jobId}`);
    }
    return row;
  }

  assertFence(jobId: string, ownerId: string, fencingToken: number): void {
    const lease = this.get(jobId);
    if (lease.owner_id !== ownerId || lease.fencing_token !== fencingToken) {
      throw new AppError("POLICY_VIOLATION", "Stale fence: eski worker sonucu kabul edilmedi", { reason_code: "STALE_FENCE" });
    }
    if (lease.expires_at < Date.now()) {
      throw new AppError("POLICY_VIOLATION", "Lease suresi bitti", { reason_code: "LEASE_EXPIRED" });
    }
  }

  release(jobId: string, ownerId: string): void {
    // D06/F08: release kaydi silmez; kalici monoton fencing icin lease'i expire eder.
    // Token geri gitmez; yeni acquisition bir sonraki token'i alir.
    const now = Date.now();
    const row = this.db
      .prepare<[string], { id: string; owner_id: string; fencing_token: number }>(
        "SELECT id, owner_id, fencing_token FROM job_leases WHERE job_id = ?",
      )
      .get(jobId);
    if (!row || row.owner_id !== ownerId) {
      return;
    }
    this.db
      .prepare("UPDATE job_leases SET expires_at = ?, heartbeat_at = ? WHERE job_id = ? AND owner_id = ?")
      .run(now - 1, now, jobId, ownerId);
  }

  /**
   * Kalici monoton fencing token (D06/F08): lease row silinse de gerilemeyen.
   * Job state'indeki fencing_generation alanindan gelir; her acquisition'da artar.
   */
  currentGeneration(jobId: string): number {
    const row = this.db
      .prepare<[string], { fencing_token: number | null }>("SELECT fencing_token FROM job_leases WHERE job_id = ?")
      .get(jobId);
    return row?.fencing_token ?? 0;
  }
}
