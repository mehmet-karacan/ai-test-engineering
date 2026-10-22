import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { discoverModules } from "../discovery/pom-discovery.js";
import { AppError } from "../domain/errors.js";
import { packagedWindowsFileHelper, inspectWindowsPath, verifyWindowsOwnedFile, renameWindowsOwnedFile,
  copyWindowsOwnedFile, deleteWindowsOwnedFile, type WindowsCopyResult } from "../discovery/windows-file-bridge.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function inside(root: string, path: string): void {
  const rel = relative(realpathSync(root), realpathSync(path));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new AppError("BLOCKED_ISOLATION", "Unit-test override requires an owned execution directory");
}
/** Explicit opt-in. Native FileId-bound rename/copy/delete; never overwrite a pathname. */
export async function withUnitTestSkipOverride<T>(cwd: string, ownedRoot: string, logDir: string, run: () => Promise<T>): Promise<T> {
  inside(ownedRoot, cwd);
  const helper = packagedWindowsFileHelper(), owner = inspectWindowsPath(helper, ownedRoot);
  const stage = mkdtempSync(join(ownedRoot, "unit-test-overlay-"));
  const stageIdentity = inspectWindowsPath(helper, stage);
  const changes: Array<{ path: string; backup: string; stage: string; original: WindowsCopyResult; execution?: WindowsCopyResult; moved: boolean }> = [];
  const files: Array<{ relative_path: string; original_sha256: string; execution_sha256: string }> = [];
  const paths = discoverModules(cwd).modules.map(module => join(cwd, module.module_relative_path, "pom.xml"));
  for (const path of paths) {
    inside(ownedRoot, path);
    const bytes = readFileSync(path);
    const original = verifyWindowsOwnedFile(helper, ownedRoot, relative(ownedRoot, path), owner, { bytes: bytes.length, sha256: sha(bytes) });
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) throw new AppError("INVALID_PARAMETERS", "Unit-test overlay requires UTF-8 POM bytes");
    const execution = Buffer.from(text.replace(/(<(skipTests|maven\.test\.skip)>\s*)true(\s*<\/\2>)/g, "$1false$3"));
    if (execution.equals(bytes)) continue;
    const name = `${changes.length}.xml`;
    writeFileSync(join(stage, name), execution, { flag: "wx" });
    changes.push({ path: relative(ownedRoot, path), backup: relative(ownedRoot, `${path}.aitest-original-${randomUUID()}`), stage: name, original, moved: false });
    files.push({ relative_path: relative(cwd, path).replace(/\\/g, "/"), original_sha256: original.sha256, execution_sha256: sha(execution) });
  }
  mkdirSync(logDir, { recursive: true }); inside(ownedRoot, logDir);
  const evidencePath = relative(ownedRoot, join(logDir, "unit-test-skip-overrides.json"));
  // Stage all possible terminal evidence before untrusted Maven starts. After
  // await, only pinned native helpers may mutate files, including this receipt.
  const expectedReceipts = new Map<string, { bytes: number; sha256: string }>();
  for (const state of ["pending", "restored", "failed"] as const) {
    const bytes = Buffer.from(JSON.stringify({ schema_version: 1, restored: state === "restored", files }));
    writeFileSync(join(stage, `${state}.json`), bytes, { flag: "wx" });
    expectedReceipts.set(state, { bytes: bytes.length, sha256: sha(bytes) });
  }
  let receipt: WindowsCopyResult | undefined;
  const publish = (state: string) => {
    const expected = expectedReceipts.get(state)!;
    const tempPath = relative(ownedRoot, join(logDir, `unit-test-receipt-${randomUUID()}.tmp`));
    const staged = copyWindowsOwnedFile(helper, stage, `${state}.json`, ownedRoot, tempPath, stageIdentity, owner);
    if (staged.bytes !== expected.bytes || staged.sha256 !== expected.sha256) {
      deleteWindowsOwnedFile(helper, ownedRoot, tempPath, owner, staged);
      throw new AppError("SOURCE_CHANGED", "Unit-test override receipt changed during execution");
    }
    if (receipt) deleteWindowsOwnedFile(helper, ownedRoot, evidencePath, owner, receipt);
    receipt = renameWindowsOwnedFile(helper, ownedRoot, tempPath, evidencePath, owner, staged);
  };
  try {
    publish("pending");
    for (const change of changes) {
      renameWindowsOwnedFile(helper, ownedRoot, change.path, change.backup, owner, change.original); change.moved = true;
      change.execution = copyWindowsOwnedFile(helper, stage, change.stage, ownedRoot, change.path, stageIdentity, owner);
    }
    return await run();
  } finally {
    let failed = false;
    for (const change of changes) {
      if (!change.moved) continue;
      try {
        if (change.execution) deleteWindowsOwnedFile(helper, ownedRoot, change.path, owner, change.execution);
        renameWindowsOwnedFile(helper, ownedRoot, change.backup, change.path, owner, change.original);
      } catch { failed = true; }
    }
    try { publish(failed ? "failed" : "restored"); } catch { failed = true; }
    // A restore failure must override a successful or failed Maven result.
    // eslint-disable-next-line no-unsafe-finally
    if (failed) throw new AppError("SOURCE_CHANGED", "Owned execution POM or evidence changed during unit-test override; restore incomplete, unexpected files preserved");
  }
}
