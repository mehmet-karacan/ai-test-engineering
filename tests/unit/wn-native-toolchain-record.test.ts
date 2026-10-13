import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultServicesForTest } from "../../src/application/services.js";
import { randomUUID } from "node:crypto";
import { NativeToolchainRecordStore } from "../../src/orchestration/native-toolchain-record.js";
import { NativeExecutionToolchainRecordStore } from "../../src/orchestration/native-execution-toolchain-record.js";
import { NativeToolchainResolver, effectiveMavenEnvironment } from "../../src/runners/native-toolchain.js";

describe("WN24 durable native toolchain", () => {
  const roots: string[] = [];
  const closers: Array<() => void> = [];
  afterEach(() => { vi.restoreAllMocks(); for (const close of closers.splice(0)) close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn24-")); roots.push(root);
    const project = join(root, "project"); const bin = join(root, "bin"); const storeRoot = join(root, "store");
    mkdirSync(project); mkdirSync(bin);
    const executable = join(bin, "mvn.cmd"); writeFileSync(executable, "@echo off\r\n");
    const services = createDefaultServicesForTest(join(root, "state.db"), storeRoot); closers.push(() => services.storage!.close());
    const projectId = randomUUID(); const locationId = randomUUID();
    services.storage!.db.prepare("INSERT INTO projects (id,name,identity_kind,created_at,updated_at,row_version) VALUES (?,'p','local_only',1,1,0)").run(projectId);
    services.storage!.db.prepare("INSERT INTO project_locations (id,project_id,canonical_root,platform,last_seen_at,created_at,updated_at,row_version) VALUES (?, ?, ?,'win32',1,1,1,0)").run(locationId, projectId, project);
    const job = services.jobs!.createJob({ locationId, requestDigest: "r" });
    const record = new NativeToolchainRecordStore(services.storage!.db, storeRoot);
    return { root, project, bin, storeRoot, executable, services, job, record };
  }

  it("missing identity fails closed before resume", async () => {
    const f = fixture();
    await expect(f.record.verify(f.job.id, { cwd: f.project, env: { PATH: f.bin }, platform: "win32" }, async (p) => ({ ...p, baseIdentity: p.identity, identity: p.identity, mavenVersion: "3.9.9", javaVersion: "21", outputDigest: "x" })))
      .rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_MISSING" } });
  });

  it("freezes identity and rejects PATH, JDK, settings, profile and parent .mvn changes", async () => {
    const f = fixture();
    const parentMvn = join(f.root, ".mvn"); mkdirSync(parentMvn);
    writeFileSync(join(parentMvn, "maven.config"), "-B");
    const settings = join(f.root, "settings.xml"); writeFileSync(settings, "<settings/>");
    const env = { PATH: f.bin, JAVA_HOME: join(f.root, "jdk") };
    const options = { cwd: f.project, env, platform: "win32" as const, settingsPath: settings, profiles: ["safe"] };
    const verifier = async (p: ReturnType<typeof NativeToolchainResolver.resolve>) => ({ ...p, baseIdentity: p.identity, identity: p.identity, mavenVersion: "3.9.9", javaVersion: "21", outputDigest: "x" });
    const original = await verifier(NativeToolchainResolver.resolve({ ...options, env: effectiveMavenEnvironment(env) }));
    f.record.pin(f.job.id, options, original);
    await expect(f.record.verify(f.job.id, options, verifier)).resolves.toMatchObject({ identity: original.identity });
    for (const changed of [
      { ...options, env: { ...env, PATH: `${f.bin};changed` } },
      { ...options, env: { ...env, JAVA_HOME: join(f.root, "jdk2") } },
      { ...options, profiles: ["other"] },
    ]) await expect(f.record.verify(f.job.id, changed, verifier)).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
    writeFileSync(settings, "<settings><changed/></settings>");
    await expect(f.record.verify(f.job.id, options, verifier)).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
    writeFileSync(settings, "<settings/>"); writeFileSync(join(parentMvn, "maven.config"), "-ntp");
    await expect(f.record.verify(f.job.id, options, verifier)).rejects.toMatchObject({ details: { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" } });
  });

  it("rejects artifact byte mismatch, foreign path and junction escaping the storage root", async () => {
    const f = fixture();
    const options = { cwd: f.project, env: { PATH: f.bin }, platform: "win32" as const };
    const plan = NativeToolchainResolver.resolve({ ...options, env: effectiveMavenEnvironment(options.env) });
    f.record.pin(f.job.id, options, { ...plan, baseIdentity: plan.identity, mavenVersion: "3.9.9", javaVersion: "21", outputDigest: "x" });
    const db = f.services.storage!.db;
    const row = db.prepare<[string], { relative_store_path: string; sha256: string }>("SELECT relative_store_path,sha256 FROM artifacts WHERE job_id = ? AND kind = 'native_toolchain_contract'").get(f.job.id)!;
    db.prepare("UPDATE artifacts SET bytes = bytes + 1 WHERE job_id = ? AND kind = 'native_toolchain_contract'").run(f.job.id);
    expect(() => f.record.read(f.job.id)).toThrowError(/invalid/i);
    db.prepare("UPDATE artifacts SET bytes = bytes - 1, relative_store_path = '../outside' WHERE job_id = ? AND kind = 'native_toolchain_contract'").run(f.job.id);
    expect(() => f.record.read(f.job.id)).toThrowError(/invalid/i);
    db.prepare("UPDATE artifacts SET relative_store_path = ? WHERE job_id = ? AND kind = 'native_toolchain_contract'").run(row.relative_store_path, f.job.id);
    const outside = join(f.root, "outside"); mkdirSync(outside);
    const recordDir = join(f.storeRoot, "jobs", f.job.id, "native-toolchain");
    writeFileSync(join(outside, row.sha256), readFileSync(join(recordDir, row.sha256)));
    rmSync(recordDir, { recursive: true });
    symlinkSync(outside, recordDir, "junction");
    expect(() => f.record.read(f.job.id)).toThrowError(/invalid/i);
  });

  it("pins a frozen workspace path identity and rejects same-path configuration drift", () => {
    const f = fixture();
    const baseline = join(f.storeRoot, "jobs", f.job.id, "baseline");
    const candidate = join(f.storeRoot, "jobs", f.job.id, "staging", "candidate-1");
    mkdirSync(baseline, { recursive: true }); mkdirSync(candidate, { recursive: true });
    const store = new NativeExecutionToolchainRecordStore(f.services.storage!.db, f.storeRoot);
    const options = { cwd: baseline, env: effectiveMavenEnvironment({ PATH: f.bin }), platform: "win32" as const };
    const selected = NativeToolchainResolver.resolve(options);
    const verified = { ...selected, baseIdentity: selected.identity, mavenVersion: "3.9.9", javaVersion: "21", outputDigest: "a".repeat(64) };
    expect(() => store.read(f.job.id, baseline)).toThrowError();
    store.pinOrVerify(f.job.id, verified);
    expect(store.read(f.job.id, baseline).identity).toBe(verified.identity);
    expect(() => store.pinOrVerify(f.job.id, verified)).not.toThrow();
    const other = NativeToolchainResolver.resolve({ ...options, cwd: candidate });
    store.pinOrVerify(f.job.id, { ...other, baseIdentity: other.identity, mavenVersion: "3.9.9", javaVersion: "21", outputDigest: "b".repeat(64) });
    mkdirSync(join(baseline, ".mvn"));
    writeFileSync(join(baseline, ".mvn", "maven.config"), "-ntp");
    const changed = NativeToolchainResolver.resolve(options);
    expect(() => store.pinOrVerify(f.job.id, { ...verified, ...changed, baseIdentity: changed.identity }))
      .toThrowError(/changed/i);
  });

  it("rejects a job workspace junction escaping storage before creating an identity directory", () => {
    const f = fixture();
    const outside = join(f.root, "outside-execution");
    const baselineOutside = join(outside, "baseline");
    mkdirSync(baselineOutside, { recursive: true });
    const jobsRoot = join(f.storeRoot, "jobs");
    mkdirSync(jobsRoot, { recursive: true });
    symlinkSync(outside, join(jobsRoot, f.job.id), "junction");
    const cwd = join(jobsRoot, f.job.id, "baseline");
    const selected = NativeToolchainResolver.resolve({ cwd, env: effectiveMavenEnvironment({ PATH: f.bin }), platform: "win32" });
    const record = new NativeExecutionToolchainRecordStore(f.services.storage!.db, f.storeRoot);
    expect(() => record.pinOrVerify(f.job.id, { ...selected, baseIdentity: selected.identity,
      mavenVersion: "3.9.9", javaVersion: "21", outputDigest: "a".repeat(64) })).toThrowError(/invalid/i);
    expect(existsSync(join(outside, "native-execution-toolchain"))).toBe(false);
  });
});
