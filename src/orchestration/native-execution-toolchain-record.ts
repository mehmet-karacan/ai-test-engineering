/** Per-frozen-workspace Maven identity, stored in the existing artifact ledger. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../domain/errors.js";
import type { VerifiedNativeToolchainPlan } from "../runners/native-toolchain.js";

interface ExecutionRecord {
  schema_version: 1;
  job_id: string;
  cwd: string;
  identity: string;
  base_identity: string;
  executable: string;
  source: VerifiedNativeToolchainPlan["source"];
  maven_version: string;
  java_version: string;
  output_digest: string;
}

interface ArtifactRow { relative_store_path: string; sha256: string; bytes: number }
const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const hex64 = /^[a-f0-9]{64}$/u;

export class NativeExecutionToolchainRecordStore {
  constructor(private readonly db: BetterSqlite3.Database, private readonly storageRoot: string) {}

  private scope(jobId: string, cwd: string): { root: string; prefix: string } {
    if (!/^[a-f0-9-]{36}$/u.test(jobId) || !isAbsolute(cwd)) this.invalid();
    const root = resolve(this.storageRoot);
    const jobRoot = resolve(root, "jobs", jobId);
    const candidate = resolve(cwd);
    const rel = relative(jobRoot, candidate);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) this.invalid();
    return { root, prefix: `jobs/${jobId}/native-execution-toolchain/${digest(candidate.toLowerCase())}/` };
  }

  private artifact(jobId: string, cwd: string): { row: ArtifactRow | null; root: string; prefix: string } {
    const { root, prefix } = this.scope(jobId, cwd);
    const matches = this.db.prepare<[string], ArtifactRow>(
      "SELECT relative_store_path, sha256, bytes FROM artifacts WHERE job_id = ? AND kind = 'native_execution_toolchain_contract' AND status = 'READY'",
    ).all(jobId).filter((row) => row.relative_store_path.startsWith(prefix));
    if (matches.length > 1) this.invalid();
    return { row: matches[0] ?? null, root, prefix };
  }

  read(jobId: string, cwd: string): ExecutionRecord {
    const { row, root, prefix } = this.artifact(jobId, cwd);
    if (!row) throw new AppError("BLOCKED_ISOLATION", "Frozen workspace toolchain identity missing", { reason_code: "TOOLCHAIN_IDENTITY_MISSING" });
    if (!hex64.test(row.sha256) || row.relative_store_path !== `${prefix}${row.sha256}` ||
        !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > 16 * 1024) this.invalid();
    const path = resolve(root, row.relative_store_path);
    const rel = relative(root, path);
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(path)) this.invalid();
    try {
      const realRoot = realpathSync.native(root);
      const actual = realpathSync.native(path);
      const actualRel = relative(realRoot, actual);
      if (actualRel.startsWith("..") || isAbsolute(actualRel) || lstatSync(path).isSymbolicLink() ||
          statSync(path).size !== row.bytes || !statSync(path).isFile()) this.invalid();
    } catch { this.invalid(); }
    const bytes = readFileSync(path);
    if (digest(bytes) !== row.sha256) this.invalid();
    let record: ExecutionRecord;
    try { record = JSON.parse(bytes.toString("utf8")) as ExecutionRecord; } catch { return this.invalid(); }
    if (!record || record.schema_version !== 1 || record.job_id !== jobId || record.cwd !== resolve(cwd) ||
        !hex64.test(record.identity) || !hex64.test(record.base_identity) || !hex64.test(record.output_digest) ||
        typeof record.executable !== "string" || !["explicit", "installed", "wrapper"].includes(record.source) ||
        typeof record.maven_version !== "string" || typeof record.java_version !== "string") this.invalid();
    return record;
  }

  pinOrVerify(jobId: string, plan: VerifiedNativeToolchainPlan): string {
    const { row, root, prefix } = this.artifact(jobId, plan.cwd);
    if (row) {
      const recorded = this.read(jobId, plan.cwd);
      if (recorded.identity !== plan.identity || recorded.base_identity !== plan.baseIdentity ||
          recorded.executable !== plan.executable || recorded.source !== plan.source ||
          recorded.maven_version !== plan.mavenVersion || recorded.java_version !== plan.javaVersion ||
          recorded.output_digest !== plan.outputDigest) this.changed();
      return row.sha256;
    }
    // The working directory must be an existing owned workspace, never the
    // source checkout or a junction escaping this job's storage tree.
    const realRoot = realpathSync.native(root);
    const realJob = realpathSync.native(join(root, "jobs", jobId));
    const jobRel = relative(realRoot, realJob);
    if (!jobRel || jobRel.startsWith("..") || isAbsolute(jobRel)) this.invalid();
    const realCwd = realpathSync.native(plan.cwd);
    const rel = relative(realJob, realCwd);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) this.invalid();
    const record: ExecutionRecord = {
      schema_version: 1, job_id: jobId, cwd: resolve(plan.cwd), identity: plan.identity,
      base_identity: plan.baseIdentity, executable: plan.executable, source: plan.source,
      maven_version: plan.mavenVersion, java_version: plan.javaVersion, output_digest: plan.outputDigest,
    };
    const bytes = Buffer.from(JSON.stringify(record), "utf8");
    const hash = digest(bytes);
    const directory = join(root, prefix);
    mkdirSync(directory, { recursive: true });
    const realDir = realpathSync.native(directory);
    const dirRel = relative(realRoot, realDir);
    if (dirRel.startsWith("..") || isAbsolute(dirRel)) this.invalid();
    const path = join(directory, hash);
    try { writeFileSync(path, bytes, { flag: "wx" }); }
    catch (error) {
      // A hard kill may occur after wx creates the immutable blob but before
      // the artifact row commits. Only the exact regular file at this scope
      // can be adopted; a foreign byte, link or path is never trusted.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") this.invalid();
      this.assertExactOrphan(path, realDir, hash, bytes);
    }
    this.db.prepare("INSERT INTO artifacts (id,job_id,kind,relative_store_path,sha256,bytes,schema_version,sensitivity,status,pin_reason,created_at) VALUES (?,?,'native_execution_toolchain_contract',?,?,?,'1','internal','READY','native_execution_toolchain_contract',?)")
      .run(randomUUID(), jobId, `${prefix}${hash}`, hash, bytes.length, Date.now());
    return hash;
  }

  private assertExactOrphan(path: string, realDir: string, hash: string, expected: Buffer): void {
    try {
      const metadata = lstatSync(path);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size !== expected.length) this.invalid();
      const actual = realpathSync.native(path);
      if (relative(realDir, actual).toLowerCase() !== hash) this.invalid();
      const bytes = readFileSync(path);
      if (bytes.length !== expected.length || digest(bytes) !== hash || !bytes.equals(expected)) this.invalid();
    } catch { this.invalid(); }
  }

  private changed(): never { throw new AppError("BLOCKED_ISOLATION", "Frozen workspace toolchain changed", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" }); }
  private invalid(): never { throw new AppError("BLOCKED_ISOLATION", "Frozen workspace toolchain record invalid", { reason_code: "TOOLCHAIN_IDENTITY_INVALID" }); }
}
