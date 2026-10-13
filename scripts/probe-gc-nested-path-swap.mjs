/** Windows Temp reproduction of gcSweep's stat(path) -> rmSync(path) physical alias gap. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packagedWindowsFileHelper, inspectWindowsPath } from "../dist/discovery/windows-file-bridge.js";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-gc-nested-swap-"));
try {
  const root = join(top, "artifacts");
  const nested = join(root, "blobs");
  const moved = join(root, "blobs-moved");
  const candidate = join(nested, "x.bin");
  mkdirSync(nested, { recursive: true });
  writeFileSync(candidate, "old candidate");
  const helper = packagedWindowsFileHelper();
  const rootBefore = inspectWindowsPath(helper, root);
  const checked = statSync(candidate);
  assert.equal(checked.size, "old candidate".length);
  // A second process can do these two path operations between gcSweep's stat
  // and rmSync. The root FileId stays the same; only the nested segment changes.
  renameSync(nested, moved);
  mkdirSync(nested);
  writeFileSync(candidate, "replacement user data");
  const rootAfter = inspectWindowsPath(helper, root);
  assert.equal(rootAfter.fileId, rootBefore.fileId);
  rmSync(candidate, { force: true });
  assert.equal(existsSync(candidate), false);
  assert.equal(readFileSync(join(moved, "x.bin"), "utf8"), "old candidate");
  process.stdout.write("RED_CONFIRMED: GC absolute unlink deleted replacement after nested path swap\n");
} finally {
  assert.ok(resolve(top).startsWith(resolve(tmpdir())));
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
