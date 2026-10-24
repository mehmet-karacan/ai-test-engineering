import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface SkillInstallInput { sourcePath: string; destinationPath: string; manifestPath: string; backupDir: string }
export interface SkillInstallResult { status: "installed" | "updated" | "unchanged" | "preserved"; backup_path: string | null }
interface OwnershipManifest { schema_version: 1; owned_files: Array<{ path: string; sha256: string }>; [key: string]: unknown }
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function atomicWrite(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx" });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

/** Never adopt preexisting files or overwrite edits to an owned skill. */
export function installOpenCodeSkill(input: SkillInstallInput): SkillInstallResult {
  const destination = resolve(input.destinationPath);
  const manifest: OwnershipManifest = existsSync(input.manifestPath)
    ? JSON.parse(readFileSync(input.manifestPath, "utf8")) as OwnershipManifest
    : { schema_version: 1, owned_files: [] };
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.owned_files)
    || manifest.owned_files.some(entry => !entry || typeof entry.path !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256))) {
    throw new Error("Gecersiz install ownership manifesti; skill degistirilmedi");
  }
  const owned = manifest.owned_files.filter(entry => resolve(entry.path) === destination);
  if (owned.length > 1) throw new Error("Tekrarli skill ownership kaydi; skill degistirilmedi");
  const source = readFileSync(input.sourcePath);
  const sourceHash = hash(source);
  let backupPath: string | null = null;
  const existing = existsSync(destination);
  if (existing) {
    if (!lstatSync(destination).isFile()) throw new Error("Skill hedefi normal dosya olmali");
    const previous = readFileSync(destination);
    const previousHash = hash(previous);
    if (previousHash === sourceHash) return { status: "unchanged", backup_path: null };
    mkdirSync(input.backupDir, { recursive: true });
    backupPath = join(input.backupDir, `test-engineering-skill-${previousHash}.md`);
    if (!existsSync(backupPath)) writeFileSync(backupPath, previous, { flag: "wx" });
    else if (hash(readFileSync(backupPath)) !== previousHash) throw new Error("Skill backup hash uyusmazligi");
    if (owned[0]?.sha256 !== previousHash) return { status: "preserved", backup_path: backupPath };
    // Recheck before replacing; a concurrent user edit must not be overwritten.
    if (hash(readFileSync(destination)) !== previousHash) throw new Error("Skill kurulum sirasinda degisti; tekrar deneyin");
  }
  atomicWrite(destination, source);
  manifest.owned_files = manifest.owned_files.filter(entry => resolve(entry.path) !== destination);
  manifest.owned_files.push({ path: destination, sha256: sourceHash });
  atomicWrite(input.manifestPath, Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"));
  return { status: existing ? "updated" : "installed", backup_path: backupPath };
}

export function verifyOpenCodeSkill(source: string, destination: string): boolean {
  try {
    return lstatSync(destination).isFile() && hash(readFileSync(source)) === hash(readFileSync(destination));
  } catch { return false; }
}
