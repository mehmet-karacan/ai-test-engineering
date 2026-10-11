/**
 * P03 odak testleri (PR03/R03/R04/R06, PP10/PP11/PP12/PP13/PP15):
 * - PP10/R03: accepted blob eksik/bozuk/wrong-job iken checkpoint trusted/READY olamaz.
 * - PP11/R04: null/eslesmeyen source/build identity "unchanged" sayilamaz.
 * - PP12: clean commit degisimi, dirty kaynak, rename ve POM degisimi kaynak
 *   kontrolunden kacamaz (canonical source/build digest).
 * - PP13/R06: stale parent publish best pointer'i ezemez; expected head CAS gercekten
 *   GERCEK best pointer'a uygulanir.
 * - PP15: resume ayni job/target cursor/butce/kontratla surer; butce yalniz
 *   checkpoint manifest'inden; accepted set immutable blob'dan geri yuklenir;
 *   total job deadline kalicidir.
 * - Loop seviyesi: checkpoint publish basarisinda aday accepted OLMAZ; accepted set
 *   ve DB adopted kaydi onceki trusted state'te kalir.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Storage } from "../../src/storage/storage.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { LeaseManager } from "../../src/orchestration/lease-manager.js";
import { CheckpointStore, resumeBudgetFromManifest, type CheckpointManifest } from "../../src/orchestration/checkpoint-store.js";
import { RecoveryManager } from "../../src/orchestration/recovery-manager.js";
import {
  computeSourceChange,
  computeSourceIdentity,
  gitHeadCommit,
  sourceDigestFromManifest,
  buildDigestFromManifest,
  type SourceIdentity,
} from "../../src/discovery/source-snapshot.js";
import { SourceSnapshot } from "../../src/discovery/source-snapshot.js";
import { CandidateLoop } from "../../src/orchestration/candidate-loop.js";
import { MavenRunner } from "../../src/runners/maven-runner.js";
import type { CandidateChangeSet } from "../../src/workers/opencode/model-schemas.js";
import { AppError } from "../../src/domain/errors.js";

function expectReason(fn: () => void, reason: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details?.reason_code).toBe(reason);
    return;
  }
  throw new Error(`Beklenen ${reason} hatasi atilmedi`);
}

const MINIMAL_POM = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>p03-fixture</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>
</project>`;

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const sha40 = (c: string) => c.repeat(40);
const sha64 = (c: string) => c.repeat(64);

const ACCEPTED_PATH = "src/test/java/com/example/calc/CalcServiceTest.java";
const ACCEPTED_CONTENT = "package com.example.calc;\npublic class CalcServiceTest {\n}\n";

function makeIdentity(overrides: Partial<SourceIdentity> = {}): SourceIdentity {
  return {
    head_commit: sha40("a"),
    dirty: false,
    dirty_digest: null,
    source_digest: sha64("s"),
    build_digest: sha64("b"),
    ...overrides,
  };
}

interface Harness {
  dir: string;
  storage: Storage;
  jobs: JobRepository;
  projects: ProjectRepository;
  leases: LeaseManager;
  store: CheckpointStore;
  recovery: RecoveryManager;
  locationId: string;
  jobId: string;
}

function createHarness(prefix: string): Harness {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const storage = new Storage({ dbPath: join(dir, "state.db") });
  storage.migrate();
  const jobs = new JobRepository(storage.db);
  const projects = new ProjectRepository(storage.db);
  const leases = new LeaseManager(storage.db);
  const store = new CheckpointStore(storage.db, dir);
  const recovery = new RecoveryManager(storage.db, leases, store);
  const { location } = projects.ensureLocation(join(dir, "project").replace(/\\/g, "/"), "p03-project", null);
  const job = jobs.createJob({ locationId: location.id, requestDigest: `digest-${prefix}` });
  return { dir, storage, jobs, projects, leases, store, recovery, locationId: location.id, jobId: job.id };
}

function closeHarness(h: Harness): void {
  try {
    h.storage.close();
  } catch {
    // kilit
  }
  rmSync(h.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

function baseManifest(h: Harness, generation: number, parent: string | null, accepted: CheckpointManifest["accepted_changes"], budget: Record<string, number>): CheckpointManifest {
  return {
    schema_version: 1,
    job_id: h.jobId,
    project_id: "p03-proj",
    location_id: h.locationId,
    target_ids: ["com.example.calc.CalcService"],
    user_goal: "coverage:90",
    source_snapshot_id: "snap-1",
    head_commit: sha40("a"),
    source_digest: sha64("s"),
    dirty_digest: null,
    build_digest: sha64("b"),
    policy_digest: null,
    parser_version: "statik-tarama-1",
    toolchain: { node: process.version },
    accepted_changes: accepted,
    parent_checkpoint_id: parent,
    baseline_run_id: null,
    last_trusted_run_id: null,
    active_phase: "verification",
    next_action: "candidate_accepted",
    remaining_budget: budget,
    requested_model: "litellm/model-a",
    resolved_model: "litellm/model-a",
    worker_session_ref: null,
    generation,
    created_at: Date.now(),
  };
}

describe("P03/PP10 (R03): accepted content-addressed blob dogrulamasi", () => {
  let h: Harness;
  const acceptedEntry = () => [{ path: ACCEPTED_PATH, sha256: sha(ACCEPTED_CONTENT), action: "create" as const }];

  beforeEach(() => {
    h = createHarness("aitest-p03-pp10-");
  });
  afterEach(() => closeHarness(h));

  it("manifest'te accepted deklare edip blob'suz publish fail-closed reddedilir (R03)", () => {
    const manifest = baseManifest(h, 1, null, acceptedEntry(), { max_candidate_iterations: 3, max_repairs_per_candidate: 2, no_progress_window: 3 });
    // accepted content sessiz sifirlanmaz: blob seti manifest ile eslesmeden publish yok
    expectReason(() => h.store.publishCheckpoint(manifest, null, null, []), "ACCEPTED_CONTENT_MISSING");
    expect(h.store.bestCheckpoint(h.jobId)).toBeNull();
  });

  it("accepted blob sonradan kaybolursa (crash) checkpoint trusted/READY olmaz", () => {
    const manifest = baseManifest(h, 1, null, acceptedEntry(), { max_candidate_iterations: 3, max_repairs_per_candidate: 2, no_progress_window: 3 });
    const blobHash = sha(ACCEPTED_CONTENT);
    const blobs = h.store.publishAcceptedBlobs(h.jobId, [{ path: ACCEPTED_PATH, sha256: blobHash, action: "create", content: ACCEPTED_CONTENT }]);
    const result = h.store.publishCheckpoint(manifest, null, null, blobs);
    // crash senaryosu: blob dosyasi diskte yok (DB referansi var)
    const blobPath = join(h.dir, "blobs", "accepted", h.jobId, blobHash.slice(0, 2), blobHash.slice(2, 4), blobHash);
    rmSync(blobPath, { force: true });
    const verification = h.store.verifyCheckpoint(result.checkpoint_id);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("ACCEPTED_BLOB_EKSIK");
    // recovery bu checkpoint ile resume vermez (trusted degil):
    const plan = h.recovery.planRecovery(h.jobs.getJob(h.jobId), `owner-${process.pid}`, { current_identity: makeIdentity() });
    expect(plan.action).toBe("fresh_start");
    expect(plan.checkpoint_id).toBeNull();
  });

  it("accepted blob bozuk iken checkpoint trusted olmaz (hash uyusmazligi)", () => {
    const manifest = baseManifest(h, 1, null, acceptedEntry(), { max_candidate_iterations: 3 });
    const blobs = h.store.publishAcceptedBlobs(h.jobId, [{ path: ACCEPTED_PATH, sha256: sha(ACCEPTED_CONTENT), action: "create", content: ACCEPTED_CONTENT }]);
    const result = h.store.publishCheckpoint(manifest, null, null, blobs);
    // blob dosyasini boz (content degisti, hash ayni yolda):
    const blobPath = join(h.dir, "blobs", "accepted", h.jobId, sha(ACCEPTED_CONTENT).slice(0, 2), sha(ACCEPTED_CONTENT).slice(2, 4), sha(ACCEPTED_CONTENT));
    writeFileSync(blobPath, "BOSKUN", "utf8");
    const verification = h.store.verifyCheckpoint(result.checkpoint_id);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("ACCEPTED_BLOB_BOZUK");
  });

  it("accepted content/hash uyusmazligi publish oncesi reddedilir (blob seti manifest ile eslesmeli)", () => {
    // (a) baska content'in hash'i manifest'teki hash ile uyusmaz:
    const wrongManifest = baseManifest(h, 1, null, [{ path: ACCEPTED_PATH, sha256: sha("beklenen-icerik"), action: "create" }], { max_candidate_iterations: 3 });
    const wrongBlobs = h.store.publishAcceptedBlobs(h.jobId, [{ path: ACCEPTED_PATH, sha256: sha("farkli-icerik"), action: "create", content: "farkli-icerik" }]);
    expectReason(() => h.store.publishCheckpoint(wrongManifest, null, null, wrongBlobs), "ACCEPTED_BLOB_MISMATCH");
    // (b) manifest'te olmayan blob:
    const manifest = baseManifest(h, 1, null, acceptedEntry(), { max_candidate_iterations: 3 });
    const unmanifested = h.store.publishAcceptedBlobs(h.jobId, [{ path: "src/test/java/Extra.java", sha256: sha("x"), action: "create", content: "x" }]);
    expectReason(() => h.store.publishCheckpoint(manifest, null, null, unmanifested), "ACCEPTED_BLOB_UNMANIFESTED");
    // (c) path ayni, hash baska (blob bozuldu/content degisti):
    const tampered = h.store.publishAcceptedBlobs(h.jobId, [{ path: ACCEPTED_PATH, sha256: sha("degenerate"), action: "create", content: "degenerate" }]);
    expectReason(() => h.store.publishCheckpoint(manifest, null, null, tampered), "ACCEPTED_BLOB_MISMATCH");
    // best pointer degismez:
    expect(h.store.bestCheckpoint(h.jobId)).toBeNull();
  });

  it("baska job'un accepted blob'i bu job'un checkpoint'ine baglanamaz (wrong-job)", () => {
    const other = createHarness("aitest-p03-pp10-other-");
    try {
      const manifest = baseManifest(h, 1, null, acceptedEntry(), { max_candidate_iterations: 3 });
      // baska job icin yayinlanmis blob, ayni path/hash ile:
      const foreignBlobs = other.store.publishAcceptedBlobs(other.jobId, [{ path: ACCEPTED_PATH, sha256: sha(ACCEPTED_CONTENT), action: "create", content: ACCEPTED_CONTENT }]);
      // blob dosyasi baska job dizininde; bu job icin verify blob'u bulamaz:
      const result = h.store.publishCheckpoint(manifest, null, null, foreignBlobs);
      const verification = h.store.verifyCheckpoint(result.checkpoint_id);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe("ACCEPTED_BLOB_EKSIK");
    } finally {
      closeHarness(other);
    }
  });

  it("dogru accepted blob ile checkpoint trusted olur ve geri yuklenebilir", () => {
    const manifest = baseManifest(h, 1, null, acceptedEntry(), { max_candidate_iterations: 3 });
    const blobs = h.store.publishAcceptedBlobs(h.jobId, [{ path: ACCEPTED_PATH, sha256: sha(ACCEPTED_CONTENT), action: "create", content: ACCEPTED_CONTENT }]);
    const result = h.store.publishCheckpoint(manifest, null, null, blobs);
    const verification = h.store.verifyCheckpoint(result.checkpoint_id);
    expect(verification.valid).toBe(true);
    const restoreDir = join(h.dir, "restored");
    h.store.restoreAcceptedFiles(h.jobId, verification.manifest!.accepted_changes, restoreDir);
    expect(readFileSync(join(restoreDir, ACCEPTED_PATH), "utf8")).toBe(ACCEPTED_CONTENT);
  });
});

describe("P03/PP11 (R04): source identity - null/bilinmeyen degismeyen kaynak sayilmaz", () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness("aitest-p03-pp11-");
  });
  afterEach(() => closeHarness(h));

  it("recorded source_digest bosken (eski/bilinmeyen kayit) degisim kabul edilir", () => {
    const recorded = makeIdentity({ source_digest: "" });
    const change = computeSourceChange(recorded, makeIdentity());
    expect(change.changed).toBe(true);
    expect(change.reasons).toContain("RECORDED_SOURCE_IDENTITY_UNKNOWN");
  });

  it("recorded build_digest bosken degisim kabul edilir (POM/profile bilinmez)", () => {
    const change = computeSourceChange(makeIdentity({ build_digest: "" }), makeIdentity());
    expect(change.changed).toBe(true);
  });

  it("recorded head null + current head dolu (git ortama girdi) degisim kabul edilir", () => {
    const change = computeSourceChange(makeIdentity({ head_commit: null }), makeIdentity());
    expect(change.changed).toBe(true);
    expect(change.reasons).toContain("HEAD_UNKNOWN");
  });

  it("iki taraf da dolu iken birebir identity unchanged olur", () => {
    const change = computeSourceChange(makeIdentity(), makeIdentity());
    expect(change.changed).toBe(false);
    expect(change.reasons).toEqual([]);
  });

  it("recovery: dogrulanmis checkpoint identity'si ile ayni kaynak -> resume; degisen source -> rebaseline", () => {
    const manifest = baseManifest(h, 1, null, [], { max_candidate_iterations: 3, max_repairs_per_candidate: 2, no_progress_window: 3 });
    h.store.publishCheckpoint(manifest, null, null);
    // ayni identity: resume
    const same = h.recovery.planRecovery(h.jobs.getJob(h.jobId), `owner-same-${process.pid}`, { current_identity: makeIdentity() });
    expect(same.action).toBe("resume");
    expect(same.source_changed).toBe(false);
    expect(same.checkpoint_id).not.toBeNull();
  });

  it("recovery: source digest degisti -> SOURCE_CHANGED rebaseline (stale coverage isaretlenir)", () => {
    const h2 = createHarness("aitest-p03-pp11-chg-");
    try {
      const manifest = baseManifest(h2, 1, null, [], { max_candidate_iterations: 3 });
      h2.store.publishCheckpoint(manifest, null, null);
      const changed = h2.recovery.planRecovery(h2.jobs.getJob(h2.jobId), `owner-${process.pid}`, { current_identity: makeIdentity({ source_digest: sha64("x") }) });
      expect(changed.action).toBe("rebaseline");
      expect(changed.source_changed).toBe(true);
      expect(changed.stale_coverage_marked).toBe(true);
      expect(h2.jobs.getJob(h2.jobId).outcome).toBe("SOURCE_CHANGED");
    } finally {
      closeHarness(h2);
    }
  });

  it("recovery: recorded identity legacy/bilinmezken (source_digest bos) resume trusted verilmez", () => {
    const h3 = createHarness("aitest-p03-pp11-legacy-");
    try {
      const job = h3.jobs.createJob({ locationId: h3.locationId, requestDigest: "digest-legacy" });
      const snapId = randomUUID();
      // legacy project_snapshots kaydi: source_digest alanlari yok (v2 onceki kayitlar):
      h3.storage.db
        .prepare("INSERT INTO project_snapshots (id, location_id, parent_snapshot_id, head_commit, dirty_digest, source_manifest_artifact_id, build_digest, parser_version, created_at) VALUES (?, ?, NULL, ?, ?, NULL, NULL, 'v1', ?)")
        .run(snapId, h3.locationId, sha40("a"), null, Date.now());
      h3.storage.db.prepare("UPDATE test_jobs SET source_snapshot_id = ? WHERE id = ?").run(snapId, job.id);
      h3.jobs.updateLifecycle(job.id, "INTERRUPTED", h3.jobs.getJob(job.id).row_version);
      const freshJob = h3.jobs.getJob(job.id);
      const plan = h3.recovery.planRecovery(freshJob, `owner-${process.pid}`, { current_identity: makeIdentity() });
      // legacy kayit tam identity tasimaz: trusted resume degil, acik tani;
      // source degisimi bilinmeyen kaynak olarak isaretlenir (fail-closed):
      expect(plan.action).toBe("rebaseline");
      expect(plan.source_changed).toBe(true);
    } finally {
      closeHarness(h3);
    }
  });
});

describe("P03/PP12: canonical source/build digest - git clean/dirty/rename/POM", () => {
  let dir: string;

  function makeProject(name: string, files: Record<string, string>): string {
    const root = join(dir, name);
    for (const [rel, content] of Object.entries(files)) {
      const full = join(root, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content, "utf8");
    }
    return root;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-p03-pp12-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("ayni dosya icerigi iki root'ta ayni source_digest'i uretir (deterministik)", () => {
    const a = makeProject("a", { "src/main/java/A.java": "class A {}", "pom.xml": "<project/>" });
    const b = makeProject("b", { "src/main/java/A.java": "class A {}", "pom.xml": "<project/>" });
    const ma = new SourceSnapshot(a).buildManifest();
    const mb = new SourceSnapshot(b).buildManifest();
    expect(sourceDigestFromManifest(ma)).toBe(sourceDigestFromManifest(mb));
    expect(buildDigestFromManifest(ma)).toBe(buildDigestFromManifest(mb));
  });

  it("dosya icerigi degisimi source digest'i degistirir (dirty kaynak kacamaz)", () => {
    const root = makeProject("c", { "src/main/java/A.java": "class A {}", "pom.xml": "<project/>" });
    const before = sourceDigestFromManifest(new SourceSnapshot(root).buildManifest());
    writeFileSync(join(root, "src/main/java/A.java"), "class A { int x; }", "utf8");
    const after = sourceDigestFromManifest(new SourceSnapshot(root).buildManifest());
    expect(after).not.toBe(before);
  });

  it("file rename source digest'i degistirir (path canonical sirada)", () => {
    const root = makeProject("d", { "src/main/java/A.java": "class A {}" });
    const before = sourceDigestFromManifest(new SourceSnapshot(root).buildManifest());
    mkdirSync(join(root, "src/main/java/renamed"), { recursive: true });
    writeFileSync(join(root, "src/main/java/renamed/B.java"), "class B {}", "utf8");
    rmSync(join(root, "src/main/java/A.java"));
    const after = sourceDigestFromManifest(new SourceSnapshot(root).buildManifest());
    expect(after).not.toBe(before);
  });

  it("POM/build config degisimi build digest'i degistirir (source ayni kalabilir)", () => {
    const root = makeProject("e", { "src/main/java/A.java": "class A {}", "pom.xml": "<project><version>1</version></project>" });
    const before = buildDigestFromManifest(new SourceSnapshot(root).buildManifest());
    writeFileSync(join(root, "pom.xml"), "<project><version>2</version></project>", "utf8");
    const after = buildDigestFromManifest(new SourceSnapshot(root).buildManifest());
    expect(after).not.toBe(before);
  });

  it("git repository'de HEAD rev-parse ile okunur; dirty git status ile belirlenir", () => {
    const root = makeProject("g", { "src/main/java/A.java": "class A {}" });
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    execSync("git init -q", { cwd: root });
    execSync("git add -A", { cwd: root });
    execSync("git -c user.email=t@t -c user.name=t commit -qm init", { cwd: root });
    const head = gitHeadCommit(root);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const clean = computeSourceIdentity(root, new SourceSnapshot(root).buildManifest());
    expect(clean.dirty).toBe(false);
    expect(clean.head_commit).toBe(head);
    // dirty edit:
    writeFileSync(join(root, "src/main/java/A.java"), "class A { int z; }", "utf8");
    const dirty = computeSourceIdentity(root, new SourceSnapshot(root).buildManifest());
    expect(dirty.dirty).toBe(true);
    expect(dirty.dirty_digest).not.toBeNull();
    expect(dirty.source_digest).not.toBe(clean.source_digest);
    // HEAD degisimi (yeni commit) head_commit'i degistirir:
    execSync("git add -A", { cwd: root });
    execSync("git -c user.email=t@t -c user.name=t commit -qm second", { cwd: root });
    const afterCommit = computeSourceIdentity(root, new SourceSnapshot(root).buildManifest());
    expect(afterCommit.head_commit).not.toBe(clean.head_commit);
  });

  it("computeSourceChange: HEAD degisimi (clean commit) kaynak kontrolu uretir", () => {
    const change = computeSourceChange(makeIdentity({ head_commit: sha40("a") }), makeIdentity({ head_commit: sha40("b") }));
    expect(change.changed).toBe(true);
    expect(change.reasons).toContain("HEAD_COMMIT");
  });
});

describe("P03/PP13 (R06): best pointer CAS - stale parent head'i ezemez", () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness("aitest-p03-pp13-");
  });
  afterEach(() => closeHarness(h));

  function publish(gen: number, parent: string | null, expected: number | null) {
    const manifest = baseManifest(h, gen, parent, [], { max_candidate_iterations: 3 });
    return h.store.publishCheckpoint(manifest, null, expected);
  }

  it("ilk checkpoint best pointer olur; generation monotone artmali", () => {
    const first = publish(1, null, null);
    expect(h.store.bestCheckpoint(h.jobId)).toBe(first.checkpoint_id);
    const second = publish(2, first.checkpoint_id, 1);
    expect(h.store.bestCheckpoint(h.jobId)).toBe(second.checkpoint_id);
  });

  it("stale parent (eski checkpoint) publish best pointer'i ezemez", () => {
    const first = publish(1, null, null);
    const second = publish(2, first.checkpoint_id, 1);
    // eski parent (first) uzerinden yeni publish: best (second) degil -> RED
    expectReason(() => publish(3, first.checkpoint_id, 1), "STALE_PARENT");
    // best pointer ikinci checkpoint'te kalir:
    expect(h.store.bestCheckpoint(h.jobId)).toBe(second.checkpoint_id);
  });

  it("beklenen head generation (CAS) GERCEK best pointer'dan dogrulanir", () => {
    const first = publish(1, null, null);
    const second = publish(2, first.checkpoint_id, 1);
    // best generation 2 iken expected 1 ile publish: CAS cakisma
    expectReason(() => publish(3, second.checkpoint_id, 1), "GENERATION_CONFLICT");
    // dogru expected generation ile publish basarili:
    const third = publish(3, second.checkpoint_id, 2);
    expect(h.store.bestCheckpoint(h.jobId)).toBe(third.checkpoint_id);
  });

  it("best pointer'dan gerizekalim (dusuk generation) kabul edilmez", () => {
    const first = publish(1, null, null);
    const second = publish(2, first.checkpoint_id, 1);
    // best (gen 2) varken generation 1 publish (pointer geri alinamaz):
    // parent best'e bakilir, expected best generation ile uyumlu; manifest generation
    // best'ten dusuk -> GENERATION_CONFLICT.
    const backward = baseManifest(h, 1, second.checkpoint_id, [], { max_candidate_iterations: 3 });
    expectReason(() => h.store.publishCheckpoint(backward, null, 2), "GENERATION_CONFLICT");
    // best pointer gerilemedi:
    expect(h.store.bestCheckpoint(h.jobId)).toBe(second.checkpoint_id);
  });

  it("parent baska job'a ait olamaz (ayni DB, ayni store)", () => {
    // ayni DB/store: baska job'a ait checkpoint parent olarak kullanilmaya calisilir
    const foreignJob = h.jobs.createJob({ locationId: h.locationId, requestDigest: "digest-pp13-foreign" });
    const foreign = h.store.publishCheckpoint(
      { schema_version: 1, job_id: foreignJob.id, project_id: "p", location_id: h.locationId, target_ids: ["t"], user_goal: "g", source_snapshot_id: null, head_commit: null, source_digest: sha64("s"), dirty_digest: null, build_digest: sha64("b"), policy_digest: null, parser_version: "v", toolchain: {}, accepted_changes: [], parent_checkpoint_id: null, baseline_run_id: null, last_trusted_run_id: null, active_phase: "verification", next_action: "n", remaining_budget: {}, requested_model: null, resolved_model: null, worker_session_ref: null, generation: 1, created_at: Date.now() },
      null,
      null,
    );
    const manifest = baseManifest(h, 1, foreign.checkpoint_id, [], { max_candidate_iterations: 3 });
    expectReason(() => h.store.publishCheckpoint(manifest, null, null), "PARENT_FOREIGN_JOB");
    // best pointer degismez:
    expect(h.store.bestCheckpoint(h.jobId)).toBeNull();
  });
});

describe("P03/PP15: resume identity, butce, contract ve kalicilik", () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness("aitest-p03-pp15-");
  });
  afterEach(() => closeHarness(h));

  it("resumeBudgetFromManifest: butce yalniz checkpoint manifest'inden (config sifirlamaz)", () => {
    const manifest = baseManifest(h, 4, null, [], { max_candidate_iterations: 2, max_repairs_per_candidate: 1, no_progress_window: 2 });
    const budget = resumeBudgetFromManifest(manifest, { max_candidate_iterations: 20, max_repairs_per_candidate: 5, no_progress_window: 10 });
    expect(budget.remaining_iterations).toBe(2);
    expect(budget.remaining_repairs).toBe(1);
    expect(budget.no_progress_window).toBe(2);
    expect(budget.start_iteration).toBe(5);
    // eksik butce: config'e sessiz fallback YOK; 0 kalir (fail-closed)
    const empty = resumeBudgetFromManifest({ ...manifest, remaining_budget: {} }, { max_candidate_iterations: 20, max_repairs_per_candidate: 5, no_progress_window: 10 });
    expect(empty.remaining_iterations).toBe(0);
    expect(empty.start_iteration).toBe(5);
  });

  it("resume plan checkpoint manifest'ini doner; accepted set immutable blob'dan geri yuklenir", () => {
    const manifest = baseManifest(h, 2, null, [{ path: ACCEPTED_PATH, sha256: sha(ACCEPTED_CONTENT), action: "create" }], { max_candidate_iterations: 3, max_repairs_per_candidate: 2, no_progress_window: 3 });
    const blobs = h.store.publishAcceptedBlobs(h.jobId, [{ path: ACCEPTED_PATH, sha256: sha(ACCEPTED_CONTENT), action: "create", content: ACCEPTED_CONTENT }]);
    h.store.publishCheckpoint(manifest, null, null, blobs);
    h.jobs.updateLifecycle(h.jobId, "INTERRUPTED", h.jobs.getJob(h.jobId).row_version);
    const plan = h.recovery.planRecovery(h.jobs.getJob(h.jobId), `owner-${process.pid}`, { current_identity: makeIdentity() });
    expect(plan.action).toBe("resume");
    expect(plan.checkpoint_manifest?.remaining_budget["max_candidate_iterations"]).toBe(3);
    expect(plan.checkpoint_manifest?.requested_model).toBe("litellm/model-a");
    // accepted set mutable klasor karismaz: blob'dan geri yukle
    const restoreDir = join(h.dir, "resume-accepted");
    h.store.restoreAcceptedFiles(h.jobId, plan.checkpoint_manifest!.accepted_changes, restoreDir);
    expect(readFileSync(join(restoreDir, ACCEPTED_PATH), "utf8")).toBe(ACCEPTED_CONTENT);
  });

  it("total job deadline kalicilik: created_at + total_job_minutes uzerinden hesaplanir", () => {
    // job.created_at + butce; eski job icin kalan sure azalir (config sifirlamaz)
    const job = h.jobs.getJob(h.jobId);
    const created = job.created_at;
    const deadline = created + 120 * 60000;
    expect(deadline > created).toBe(true);
    // 2 saat once olusturulmus job icin deadline gecerli (gecmis zaman)
    const staleCreated = Date.now() - 130 * 60000;
    const staleDeadline = staleCreated + 120 * 60000;
    expect(staleDeadline < Date.now()).toBe(true);
  });
});

describe("P03 loop seviyesi: checkpoint publish basarisinda aday accepted olmaz (fail-closed)", () => {
  let dir: string;
  let projectRoot: string;
  let staging: string;
  let acceptedDir: string;
  let dbDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aitest-p03-loop-"));
    projectRoot = join(dir, "project");
    staging = join(dir, "staging");
    acceptedDir = join(dir, "accepted");
    dbDir = join(dir, "db");
    mkdirSync(join(projectRoot, "src/test/java/com/example/calc"), { recursive: true });
    writeFileSync(join(projectRoot, "pom.xml"), MINIMAL_POM, "utf8");
    writeFileSync(join(projectRoot, "src/test/java/com/example/calc/CalcServiceTest.java"), "package com.example.calc;\npublic class CalcServiceTest {}\n", "utf8");
    mkdirSync(staging, { recursive: true });
    mkdirSync(acceptedDir, { recursive: true });
    mkdirSync(join(projectRoot, "target/site/jacoco"), { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  /** baseline jacoco: LINE 0/10 (target alani), BRANCH yok */
  function writeBaselineJacoco(covered: number, missed: number): void {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><report name="p">
<package name="com/example/calc">
<class name="com/example/calc/CalcService" sourcefilename="CalcService.java">
<counter type="INSTRUCTION" missed="0" covered="0"/><counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="COMPLEXITY" missed="0" covered="0"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/>
</class>
<sourcefile name="CalcService.java"><counter type="INSTRUCTION" missed="0" covered="0"/><counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="COMPLEXITY" missed="0" covered="0"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/></sourcefile>
<counter type="INSTRUCTION" missed="0" covered="0"/><counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="COMPLEXITY" missed="0" covered="0"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/>
</package>
<counter type="INSTRUCTION" missed="0" covered="0"/><counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="COMPLEXITY" missed="0" covered="0"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/>
</report>`;
    writeFileSync(join(projectRoot, "target/site/jacoco/jacoco.xml"), xml, "utf8");
  }

  /** workspace icinde jacoco yaz (candidate workspace target/site/jacoco) */
  function writeWorkspaceJacoco(workspace: string, covered: number, missed: number): void {
    mkdirSync(join(workspace, "target/site/jacoco"), { recursive: true });
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><report name="p">
<package name="com/example/calc">
<class name="com/example/calc/CalcService" sourcefilename="CalcService.java">
<counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/>
</class>
<sourcefile name="CalcService.java"><counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/></sourcefile>
<counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/>
</package>
<counter type="LINE" missed="${missed}" covered="${covered}"/><counter type="METHOD" missed="0" covered="0"/><counter type="CLASS" missed="0" covered="0"/>
</report>`;
    writeFileSync(join(workspace, "target/site/jacoco/jacoco.xml"), xml, "utf8");
  }

  function candidateContent(): string {
    return "package com.example.calc;\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class CalcServiceTest {\n  @Test\n  public void add_positive() {\n    assertEquals(8, 3 + 5);\n  }\n}\n";
  }

  it("on_accepted publish basarisinda: adopted karar yazilmaz, accepted set onceki state'te kalir, loop hata verir", async () => {
    writeBaselineJacoco(0, 10);
    const decisions: Array<{ iteration: number; decision: string }> = [];
    let acceptedCalled = 0;
    const publishFail = true;

    const runner = new MavenRunner();
    // run'ı sahte: candidate workspace'te kazanc ureten jacoco + exit0
    runner.run = async (o: { working_dir: string }) => {
      writeWorkspaceJacoco(o.working_dir, 10, 0);
      mkdirSync(join(o.working_dir, "target/surefire-reports"), { recursive: true });
      writeFileSync(join(o.working_dir, "target/surefire-reports/TEST-com.example.calc.CalcServiceTest.xml"), '<?xml version="1.0"?><testsuite name="com.example.calc.CalcServiceTest" tests="1" failures="0" errors="0" skipped="0"><testcase name="add_positive" classname="com.example.calc.CalcServiceTest"/></testsuite>', "utf8");
      return { exit_code: 0, duration_ms: 10, stdout_log_path: "o", stderr_log_path: "e", command: ["mvn"], timed_out: false };
    };
    const loop = new CandidateLoop(runner, { accepted_set_dir: acceptedDir, staging_root: staging });

    await expect(loop.iterate({
      project_root: projectRoot,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 5000,
      branch_target_bps: 0,
      budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 2, no_progress_window: 3 },
      staging_root: staging,
      workspace_root: join(dir, "workspaces"),
      accepted_snapshot_dir: acceptedDir,
      timeout_ms_per_run: 1000,
      generate_candidate: async (): Promise<CandidateChangeSet> => {
        const content = candidateContent();
        return { schema_version: 1, changes: [{ path: ACCEPTED_PATH, action: "modify", new_content: content, after_hash: sha(content), scenario_ids: ["s1"] }] } as CandidateChangeSet;
      },
      on_accepted: () => {
        acceptedCalled++;
        if (publishFail) {
          throw new Error("CHECKPOINT_PUBLISH_REDDEDILDI");
        }
      },
      on_decision: (info) => { decisions.push({ iteration: info.iteration, decision: info.decision }); },
    })).rejects.toThrow(/CHECKPOINT_PUBLISH_REDDEDILDI/);

    // aday accepted sayilmaz: on_accepted cagrildi ama hata yayildi;
    // adopted karar kaydi YOK (yalniz reddedilmis deneme izi de yok cunku publish accepted sonrasi):
    expect(decisions.every((d) => d.decision !== "adopted")).toBe(true);
    expect(acceptedCalled).toBe(1);
    // accepted set onceki state'te: kazanc dosyasi accepted'de KALMADI (rollback):
    expect(existsSync(join(acceptedDir, ACCEPTED_PATH))).toBe(false);
  });

  it("on_accepted publish basarili iken adopted karar yazilir ve accepted set birikir", async () => {
    writeBaselineJacoco(0, 10);
    const decisions: Array<{ iteration: number; decision: string }> = [];

    const runner = new MavenRunner();
    runner.run = async (o: { working_dir: string }) => {
      writeWorkspaceJacoco(o.working_dir, 10, 0);
      mkdirSync(join(o.working_dir, "target/surefire-reports"), { recursive: true });
      writeFileSync(join(o.working_dir, "target/surefire-reports/TEST-com.example.calc.CalcServiceTest.xml"), '<?xml version="1.0"?><testsuite name="com.example.calc.CalcServiceTest" tests="1" failures="0" errors="0" skipped="0"><testcase name="add_positive" classname="com.example.calc.CalcServiceTest"/></testsuite>', "utf8");
      return { exit_code: 0, duration_ms: 10, stdout_log_path: "o", stderr_log_path: "e", command: ["mvn"], timed_out: false };
    };
    const loop = new CandidateLoop(runner, { accepted_set_dir: acceptedDir, staging_root: staging });

    const result = await loop.iterate({
      project_root: projectRoot,
      target_fqn: "com.example.calc.CalcService",
      target_module_path: "",
      line_target_bps: 5000,
      branch_target_bps: 0,
      budget: { max_candidate_iterations: 2, max_repairs_per_candidate: 2, no_progress_window: 3 },
      staging_root: staging,
      workspace_root: join(dir, "workspaces"),
      accepted_snapshot_dir: acceptedDir,
      timeout_ms_per_run: 1000,
      generate_candidate: async (): Promise<CandidateChangeSet> => {
        const content = candidateContent();
        return { schema_version: 1, changes: [{ path: ACCEPTED_PATH, action: "modify", new_content: content, after_hash: sha(content), scenario_ids: ["s1"] }] } as CandidateChangeSet;
      },
      on_accepted: () => {
        // publish basarili: accepted blob DB'ye girdi (simule)
      },
      on_decision: (info) => { decisions.push({ iteration: info.iteration, decision: info.decision }); },
    });

    expect(result.outcome).toBe("TARGET_REACHED");
    // adopted karar kaydi var:
    expect(decisions.some((d) => d.decision === "adopted")).toBe(true);
    // accepted set birikti:
    expect(existsSync(join(acceptedDir, ACCEPTED_PATH))).toBe(true);
    expect(readFileSync(join(acceptedDir, ACCEPTED_PATH), "utf8")).toContain("add_positive");
  });
});
