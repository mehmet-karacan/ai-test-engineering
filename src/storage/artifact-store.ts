/**
 * Artifact store: content-addressed immutable blob deposu.
 * Partial file READY olmaz; publish atomic rename ile olur.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { AppError } from "../domain/errors.js";

export interface ArtifactRecord {
  id: string;
  kind: string;
  relativeStorePath: string;
  sha256: string;
  bytes: number;
  schemaVersion?: string;
  sensitivity: "public" | "internal" | "sensitive";
  status: "PENDING" | "READY" | "QUARANTINED" | "DELETED";
}

export interface ArtifactStoreOptions {
  root: string;
}

export class ArtifactStore {
  private readonly root: string;

  constructor(options: ArtifactStoreOptions) {
    this.root = options.root;
    mkdirSync(join(this.root, "blobs", "sha256"), { recursive: true });
  }

  get rootPath(): string {
    return this.root;
  }

  sha256(data: Buffer | string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  blobPath(sha256: string): string {
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new AppError("INVALID_PARAMETERS", `Gecersiz sha256: ${sha256.slice(0, 8)}...`);
    }
    return join(this.root, "blobs", "sha256", sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  }

  publish(kind: string, data: Buffer | string, options?: { schemaVersion?: string; sensitivity?: "public" | "internal" | "sensitive" }): ArtifactRecord {
    const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    const hash = this.sha256(buffer);
    const target = this.blobPath(hash);
    const targetDir = join(target, "..");
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    if (existsSync(target)) {
      const existing = readFileSync(target);
      if (this.sha256(existing) !== hash) {
        throw new AppError("STORAGE_ERROR", "Mevcut blob hash uyusmazligi");
      }
    } else {
      const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmpPath, buffer);
      renameSync(tmpPath, target);
    }
    return {
      id: crypto.randomUUID(),
      kind,
      relativeStorePath: relative(this.root, target).replace(/\\/g, "/"),
      sha256: hash,
      bytes: buffer.length,
      ...(options?.schemaVersion !== undefined ? { schemaVersion: options.schemaVersion } : {}),
      sensitivity: options?.sensitivity ?? "internal",
      status: "READY",
    };
  }

  read(hash: string): Buffer {
    const path = this.blobPath(hash);
    if (!existsSync(path)) {
      throw new AppError("STORAGE_ERROR", `Blob bulunamadi: ${hash.slice(0, 8)}...`);
    }
    return readFileSync(path);
  }

  exists(hash: string): boolean {
    try {
      return existsSync(this.blobPath(hash));
    } catch {
      return false;
    }
  }

  verify(hash: string): boolean {
    try {
      const data = readFileSync(this.blobPath(hash));
      return this.sha256(data) === hash;
    } catch {
      return false;
    }
  }

  stat(hash: string): { bytes: number } | undefined {
    try {
      const s = statSync(this.blobPath(hash));
      return { bytes: s.size };
    } catch {
      return undefined;
    }
  }

  deleteOrphan(hash: string, graceMs: number, publishedAtMs: number): boolean {
    if (Date.now() - publishedAtMs < graceMs) {
      return false;
    }
    const path = this.blobPath(hash);
    if (!existsSync(path)) {
      return false;
    }
    rmSync(path, { force: true });
    return true;
  }
}
