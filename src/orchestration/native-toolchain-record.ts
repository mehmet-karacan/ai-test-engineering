/** Immutable, content-addressed native toolchain approval bound to one job. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import { NativeToolchainResolver, effectiveMavenEnvironment, type NativeToolchainOptions, type VerifiedNativeToolchainPlan } from "../runners/native-toolchain.js";

interface ToolchainRecord {
  schema_version: 1;
  job_id: string;
  identity: string;
  cwd: string;
  executable: string;
  source: VerifiedNativeToolchainPlan["source"];
  settingsPath?: string;
  toolchainsPath?: string;
  profiles?: string[];
  preferWrapper?: boolean;
}

type Verifier = (plan: ReturnType<typeof NativeToolchainResolver.resolve>, env: NodeJS.ProcessEnv) => Promise<VerifiedNativeToolchainPlan>;

export class NativeToolchainRecordStore {
  constructor(private readonly db: BetterSqlite3.Database, private readonly storageRoot: string) {}

  private rows(jobId: string): Array<{ relative_store_path: string; sha256: string; bytes: number }> {
    return this.db.prepare<[string], { relative_store_path: string; sha256: string; bytes: number }>(
      "SELECT relative_store_path, sha256, bytes FROM artifacts WHERE job_id = ? AND kind = 'native_toolchain_contract' AND status = 'READY'",
    ).all(jobId);
  }

  pin(jobId: string, options: NativeToolchainOptions, plan: VerifiedNativeToolchainPlan): string {
    const record: ToolchainRecord = {
      schema_version: 1, job_id: jobId, identity: plan.identity, cwd: plan.cwd,
      executable: plan.executable, source: plan.source,
      ...(options.settingsPath ? { settingsPath: options.settingsPath } : {}),
      ...(options.toolchainsPath ? { toolchainsPath: options.toolchainsPath } : {}),
      ...(options.profiles ? { profiles: options.profiles } : {}),
      ...(options.preferWrapper ? { preferWrapper: true } : {}),
    };
    // An installed executable must be rediscovered from current PATH on resume.
    const serialized = JSON.stringify(record);
    const hash = createHash("sha256").update(serialized).digest("hex");
    const existing = this.rows(jobId);
    if (existing.length > 0) {
      const pinned = this.read(jobId);
      if (pinned.identity !== plan.identity || existing.length !== 1) this.changed();
      return hash;
    }
    const dir = join(this.storageRoot, "jobs", jobId, "native-toolchain");
    mkdirSync(dir, { recursive: true });
    this.assertRealPathInside(dir);
    const path = join(dir, hash);
    const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
    writeFileSync(temp, serialized, "utf8");
    renameSync(temp, path);
    this.db.prepare("INSERT INTO artifacts (id,job_id,kind,relative_store_path,sha256,bytes,schema_version,sensitivity,status,pin_reason,created_at) VALUES (?,?,'native_toolchain_contract',?,?,?,'1','internal','READY','native_toolchain_contract',?)")
      .run(randomUUID(), jobId, `jobs/${jobId}/native-toolchain/${hash}`, hash, Buffer.byteLength(serialized), Date.now());
    return hash;
  }

  read(jobId: string): ToolchainRecord {
    const rows = this.rows(jobId);
    if (rows.length !== 1) throw new AppError("BLOCKED_ISOLATION", "Native toolchain identity missing or ambiguous", { reason_code: "TOOLCHAIN_IDENTITY_MISSING" });
    const row = rows[0]!;
    if (!/^[a-f0-9]{64}$/u.test(row.sha256) || row.relative_store_path !== `jobs/${jobId}/native-toolchain/${row.sha256}` ||
      !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > 64 * 1024) this.invalid();
    const root = resolve(this.storageRoot);
    const path = resolve(root, row.relative_store_path);
    const rel = relative(root, path);
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(path)) this.invalid();
    this.assertRealPathInside(path);
    if (!statSync(path).isFile() || statSync(path).size !== row.bytes) this.invalid();
    const bytes = readFileSync(path);
    if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) this.invalid();
    let record: ToolchainRecord;
    try { record = JSON.parse(bytes.toString("utf8")) as ToolchainRecord; } catch { return this.invalid(); }
    if (!record || typeof record !== "object") this.invalid();
    if (record.schema_version !== 1 || record.job_id !== jobId || typeof record.identity !== "string" || !/^[a-f0-9]{64}$/u.test(record.identity) ||
      typeof record.cwd !== "string" || typeof record.executable !== "string" ||
      !["explicit", "installed", "wrapper"].includes(record.source)) this.invalid();
    if (record.settingsPath !== undefined && typeof record.settingsPath !== "string") this.invalid();
    if (record.toolchainsPath !== undefined && typeof record.toolchainsPath !== "string") this.invalid();
    if (record.profiles !== undefined && (!Array.isArray(record.profiles) || record.profiles.some((x) => typeof x !== "string"))) this.invalid();
    if (record.preferWrapper !== undefined && typeof record.preferWrapper !== "boolean") this.invalid();
    return record;
  }

  async verify(jobId: string, options: NativeToolchainOptions, verifier: Verifier): Promise<VerifiedNativeToolchainPlan> {
    const recorded = this.read(jobId);
    const env = effectiveMavenEnvironment(options.env);
    const selected = NativeToolchainResolver.resolve({ ...options, env });
    const current = await verifier(selected, env);
    if (recorded.identity !== current.identity || recorded.cwd !== current.cwd ||
      recorded.executable !== current.executable || recorded.source !== current.source) this.changed();
    return current;
  }

  optionsForResume(jobId: string, env: NodeJS.ProcessEnv): NativeToolchainOptions {
    const record = this.read(jobId);
    return {
      cwd: record.cwd, env,
      ...(record.source === "explicit" ? { executable: record.executable } : {}),
      ...(record.preferWrapper ? { preferWrapper: true } : {}),
      ...(record.settingsPath ? { settingsPath: record.settingsPath } : {}),
      ...(record.toolchainsPath ? { toolchainsPath: record.toolchainsPath } : {}),
      ...(record.profiles ? { profiles: record.profiles } : {}),
    };
  }

  private changed(): never { throw new AppError("BLOCKED_ISOLATION", "Native toolchain changed since job approval", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }); }
  private invalid(): never { throw new AppError("BLOCKED_ISOLATION", "Native toolchain record is invalid", { reason_code: "TOOLCHAIN_IDENTITY_INVALID" }); }
  private assertRealPathInside(path: string): void {
    try {
      const root = realpathSync(this.storageRoot);
      const actual = realpathSync(path);
      const rel = relative(root, actual);
      if (rel.startsWith("..") || isAbsolute(rel)) this.invalid();
    } catch { this.invalid(); }
  }
}
