/** Create-only publishing. Native handles pin every workspace mutation to FileId + SHA. */
import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { AppError } from "../domain/errors.js";
import { PolicyGuard, type AllowedTestRoot } from "../policies/policy-guard.js";
import { copyWindowsOwnedFile, deleteWindowsOwnedFile, inspectWindowsPath, packagedWindowsFileHelper,
  renameWindowsOwnedFile, verifyWindowsOwnedFile, type WindowsCopyResult, type WindowsFileIdentity,
  type WindowsFileHelperSpec } from "../discovery/windows-file-bridge.js";

interface PublisherOptions { workspace: string; storeRoot: string; operationId: string; allowedTestRoots: AllowedTestRoot[] }
interface PublisherFile { path: string; sha256: string; content: Buffer }
interface PlannedFile { path: string; sha256: string; bytes: number; stage: string }
interface PublisherPlan {
  version: 1; operationId: string; workspace: string; workspaceId: WindowsFileIdentity;
  storeRoot: string; storeId: WindowsFileIdentity; operationDirectoryId: WindowsFileIdentity | null;
  allowedTestRoots: AllowedTestRoot[]; files: PlannedFile[];
}
interface JournalRecord { plan: string; index: number; action: "copying" | "receipt" | "published" | "rollback"; receipt?: WindowsCopyResult }
interface FileState { copying: boolean; receipt?: WindowsCopyResult; published: boolean }
const digest = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
function fail(reason: string): never { throw new AppError("POLICY_VIOLATION", reason, { reason_code: "WORKSPACE_PUBLISHER_CONFLICT" }); }
function sameId(a: WindowsFileIdentity, b: WindowsFileIdentity): boolean { return a.volumeSerial === b.volumeSerial && a.fileId === b.fileId; }
function present(path: string): boolean {
  try { lstatSync(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error;
  }
}
function canonical(path: string): void {
  if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").some(part =>
    !part || part === "." || part === ".." || /[<>:"|?*]|\p{Cc}/u.test(part) || /[. ]$/u.test(part) ||
    /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part))) fail("Path must be a canonical relative Windows path");
}
function durableCreate(path: string, value: Buffer | string): void {
  const fd = openSync(path, "wx", 0o600);
  try { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

export class WorkspaceTestPublisher {
  private readonly helper: WindowsFileHelperSpec;
  private readonly options: PublisherOptions;
  private readonly workspaceId: WindowsFileIdentity;
  private readonly operationRoot: string;
  private plan: PublisherPlan | undefined;
  private planHash = "";
  private states: FileState[] = [];
  private rolledBack = false;

  constructor(options: PublisherOptions) {
    if (!isAbsolute(options.workspace) || !isAbsolute(options.storeRoot) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/u.test(options.operationId)) fail("Invalid publisher roots or operation id");
    this.options = { ...options, workspace: resolve(options.workspace), storeRoot: resolve(options.storeRoot),
      allowedTestRoots: options.allowedTestRoots.map(root => ({ ...root })) };
    const storeRelative = relative(this.options.workspace, this.options.storeRoot);
    if (!storeRelative || (!storeRelative.startsWith("..") && !isAbsolute(storeRelative))) fail("Publisher store must be outside workspace");
    this.helper = packagedWindowsFileHelper();
    this.workspaceId = inspectWindowsPath(this.helper, this.options.workspace);
    for (const root of this.options.allowedTestRoots) {
      if (root.module_relative_path) canonical(root.module_relative_path);
      canonical(root.test_root);
    }
    if (!this.options.allowedTestRoots.length) fail("Allowed test roots are required");
    this.operationRoot = join(this.options.storeRoot, "apply-publisher", this.options.operationId);
  }

  /** No workspace writes until every target has passed preflight. Reload binds exact immutable input. */
  prepare(files: PublisherFile[]): void {
    if (this.plan) fail("Publisher is already prepared");
    if (!files.length) fail("Empty test batch");
    const guard = new PolicyGuard(this.options.workspace, this.options.allowedTestRoots);
    const unique = new Set<string>();
    const operationTag = digest(this.options.operationId).slice(0, 24);
    const planned = files.map((file, index): PlannedFile => {
      canonical(file.path);
      if (!file.path.endsWith(".java") || !guard.checkPath(file.path).allowed || unique.has(file.path.toLowerCase()) ||
          !Buffer.isBuffer(file.content) || !file.content.length || !/^[a-f0-9]{64}$/u.test(file.sha256) || digest(file.content) !== file.sha256) fail("Invalid test batch path, collision or digest");
      unique.add(file.path.toLowerCase());
      const parent = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) + "/" : "";
      return { path: file.path, sha256: file.sha256, bytes: file.content.length,
        stage: `${parent}.aitest-${operationTag}-${index}.stage` };
    });
    const fileNames = new Set(planned.flatMap(file => [file.path.toLowerCase(), file.stage.toLowerCase()]));
    for (const name of fileNames) {
      const segments = name.split("/"); segments.pop();
      while (segments.length) {
        if (fileNames.has(segments.join("/"))) fail("A planned file cannot be another planned file's parent");
        segments.pop();
      }
    }
    // Existing runtime directories must themselves pass native no-follow inspection.
    this.assertExistingAncestors(this.options.storeRoot);
    mkdirSync(this.options.storeRoot, { recursive: true });
    const storeId = inspectWindowsPath(this.helper, this.options.storeRoot);
    if (storeId.volumeSerial !== this.workspaceId.volumeSerial) fail("Store and workspace must share a volume");
    const plan: PublisherPlan = { version: 1, operationId: this.options.operationId, workspace: this.options.workspace,
      workspaceId: this.workspaceId, storeRoot: this.options.storeRoot, storeId,
      operationDirectoryId: null, allowedTestRoots: this.options.allowedTestRoots, files: planned };
    const planPath = join(this.operationRoot, "plan.json");
    if (present(planPath)) {
      this.assertExistingAncestors(planPath);
      const previous = JSON.parse(readFileSync(planPath, "utf8")) as PublisherPlan;
      // Directory byte/link counts may change; only native volume/FileId identifies the root.
      if (!sameId(previous.workspaceId, this.workspaceId) || !sameId(previous.storeId, storeId) ||
          !previous.operationDirectoryId || !sameId(previous.operationDirectoryId, inspectWindowsPath(this.helper, this.operationRoot))) fail("Publisher root identity changed");
      plan.workspaceId = previous.workspaceId; plan.storeId = previous.storeId; plan.operationDirectoryId = previous.operationDirectoryId;
      if (JSON.stringify(previous) !== JSON.stringify(plan)) fail("Operation plan is immutable");
      this.plan = plan; this.planHash = digest(JSON.stringify(plan)); this.loadJournal(); return;
    }
    this.states = planned.map(() => ({ copying: false, published: false }));
    for (const file of planned) { this.assertTargetAncestors(file.path); if (present(join(this.options.workspace, file.path)) || present(join(this.options.workspace, file.stage))) fail("Existing test or stage is not owned by this operation"); }
    this.assertExistingAncestors(this.operationRoot);
    mkdirSync(this.operationRoot, { recursive: true }); plan.operationDirectoryId = inspectWindowsPath(this.helper, this.operationRoot);
    // A preexisting journal without its plan is never adopted.
    if (present(join(this.operationRoot, "journal.jsonl"))) fail("Orphan publisher journal");
    durableCreate(planPath, JSON.stringify(plan));
    durableCreate(join(this.operationRoot, "journal.jsonl"), "");
    this.plan = plan; this.planHash = digest(JSON.stringify(plan));
    files.forEach((file, index) => durableCreate(join(this.operationRoot, `source-${index}`), file.content));
  }

  publish(): string[] {
    const plan = this.requirePlan(); this.loadJournal();
    if (this.rolledBack) fail("Rolled back operation requires a new approval and operation id");
    // Recheck ALL names immediately before the first publish, including on replay.
    const sourceRootId = inspectWindowsPath(this.helper, this.operationRoot);
    plan.files.forEach((file, index) => {
      const state = this.states[index]!; this.preflight(file, state);
      if (!state.receipt) verifyWindowsOwnedFile(this.helper, this.operationRoot, `source-${index}`, sourceRootId, file);
    });
    for (const [index, file] of plan.files.entries()) {
      const state = this.states[index]!;
      if (present(join(plan.workspace, file.path))) { this.verifyFile(file.path, state.receipt!); continue; }
      if (!state.receipt) {
        if (state.copying) fail("Interrupted stage has no durable ownership receipt");
        verifyWindowsOwnedFile(this.helper, this.operationRoot, `source-${index}`, sourceRootId, file);
        this.record({ index, action: "copying" });
        const receipt = copyWindowsOwnedFile(this.helper, this.operationRoot, `source-${index}`, plan.workspace,
          file.stage, sourceRootId, plan.workspaceId);
        this.record({ index, action: "receipt", receipt });
        state.receipt = receipt;
        if (receipt.sha256 !== file.sha256 || receipt.bytes !== file.bytes) fail("Copied test differs from immutable plan");
      }
      renameWindowsOwnedFile(this.helper, plan.workspace, file.stage, file.path, plan.workspaceId, state.receipt);
      this.record({ index, action: "published" }); state.published = true;
    }
    if (!this.verify()) fail("Published batch verification failed");
    return plan.files.map(file => file.path);
  }

  /** Never delete an unknown, replaced, edited, linked or unprovable file. Directories stay intact. */
  rollback(): { removed_paths: string[]; conflicts: { path: string; reason: string }[] } {
    const plan = this.requirePlan(); this.loadJournal();
    const result: { removed_paths: string[]; conflicts: { path: string; reason: string }[] } = { removed_paths: [], conflicts: [] };
    this.record({ index: -1, action: "rollback" }); this.rolledBack = true;
    for (const [index, file] of plan.files.entries()) {
      const state = this.states[index]!;
      for (const path of [file.path, file.stage]) {
        try {
          this.assertTargetAncestors(path);
          if (!present(join(plan.workspace, path))) continue;
          if (!state.receipt) fail("File has no durable ownership receipt");
          deleteWindowsOwnedFile(this.helper, plan.workspace, path, plan.workspaceId, state.receipt);
          if (path === file.path) result.removed_paths.push(path);
        } catch (error) { result.conflicts.push({ path, reason: error instanceof Error ? error.message : String(error) }); }
      }
    }
    return result;
  }

  verify(): boolean {
    try {
      const plan = this.requirePlan(); this.loadJournal(); if (this.rolledBack) return false;
      return plan.files.every((file, index) => {
        const receipt = this.states[index]!.receipt;
        if (!receipt || receipt.sha256 !== file.sha256 || receipt.bytes !== file.bytes || present(join(plan.workspace, file.stage))) return false;
        this.verifyFile(file.path, receipt); return true;
      });
    } catch { return false; }
  }

  private requirePlan(): PublisherPlan { if (!this.plan) fail("Publisher must be prepared first"); return this.plan; }
  private verifyFile(path: string, receipt: WindowsCopyResult): void {
    const plan = this.requirePlan();
    verifyWindowsOwnedFile(this.helper, plan.workspace, path, plan.workspaceId,
      { sha256: receipt.sha256, bytes: receipt.bytes, identity: receipt });
  }
  private preflight(file: PlannedFile, state: FileState): void {
    this.assertTargetAncestors(file.path);
    const target = present(join(this.options.workspace, file.path)); const stage = present(join(this.options.workspace, file.stage));
    if (target) { if (!state.receipt || stage) fail("Existing test is not an exclusive owned publish"); this.verifyFile(file.path, state.receipt); }
    if (stage) { if (!state.receipt) fail("Existing stage has no durable ownership receipt"); this.verifyFile(file.stage, state.receipt); }
    if (state.receipt && (!target && !stage || state.receipt.sha256 !== file.sha256 || state.receipt.bytes !== file.bytes)) fail("Owned stage or test is missing or changed");
    if (state.copying && !state.receipt) fail("Interrupted copy requires recovery");
  }
  private assertExistingAncestors(path: string): void {
    let cursor = resolve(path);
    while (!present(cursor)) { const parent = dirname(cursor); if (parent === cursor) fail("No existing root ancestor"); cursor = parent; }
    // Native openAbsolute already pins and checks every ancestor, including drive root.
    inspectWindowsPath(this.helper, cursor);
  }
  private assertTargetAncestors(path: string): void {
    if (!sameId(inspectWindowsPath(this.helper, this.options.workspace), this.workspaceId)) fail("Workspace identity changed");
    let cursor = this.options.workspace; let deepest = cursor;
    for (const segment of path.split("/").slice(0, -1)) {
      cursor = join(cursor, segment);
      if (present(cursor)) {
        if (!lstatSync(cursor).isDirectory()) fail("Test parent is not a directory");
        deepest = cursor;
      }
    }
    if (deepest !== this.options.workspace) inspectWindowsPath(this.helper, deepest);
  }
  private record(record: Omit<JournalRecord, "plan">): void {
    const fd = openSync(join(this.operationRoot, "journal.jsonl"), "a");
    try { const bytes = Buffer.from(JSON.stringify({ ...record, plan: this.planHash }) + "\n"); let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd);
    } finally { closeSync(fd); }
  }
  private loadJournal(): void {
    const plan = this.requirePlan();
    if (!sameId(inspectWindowsPath(this.helper, plan.workspace), plan.workspaceId) ||
        !sameId(inspectWindowsPath(this.helper, plan.storeRoot), plan.storeId) || !plan.operationDirectoryId ||
        !sameId(inspectWindowsPath(this.helper, this.operationRoot), plan.operationDirectoryId)) fail("Bound publisher root identity changed");
    if (readFileSync(join(this.operationRoot, "plan.json"), "utf8") !== JSON.stringify(plan)) fail("Immutable publisher plan changed");
    const data = readFileSync(join(this.operationRoot, "journal.jsonl"), "utf8");
    if (data && !data.endsWith("\n")) fail("Publisher journal is incomplete; ownership is uncertain");
    this.states = plan.files.map(() => ({ copying: false, published: false })); this.rolledBack = false;
    for (const line of data.split("\n").filter(Boolean)) {
      const record = JSON.parse(line) as JournalRecord;
      if (record.plan !== this.planHash) fail("Journal belongs to a different publisher plan");
      if (record.action === "rollback" && record.index === -1) { this.rolledBack = true; continue; }
      const state = this.states[record.index]; if (!state || !Number.isInteger(record.index)) fail("Invalid publisher journal index");
      if (record.action === "copying" && !state.copying) state.copying = true;
      else if (record.action === "receipt" && state.copying && !state.receipt && record.receipt &&
        /^[a-f0-9]{16}$/u.test(record.receipt.volumeSerial) && /^[a-f0-9]{32}$/u.test(record.receipt.fileId) &&
        /^[a-f0-9]{64}$/u.test(record.receipt.sha256) && record.receipt.linkCount === 1 &&
        Number.isSafeInteger(record.receipt.bytes) && record.receipt.bytes >= 0) state.receipt = record.receipt;
      else if (record.action === "published" && state.receipt && !state.published) state.published = true;
      else fail("Invalid publisher journal transition");
    }
  }
}
