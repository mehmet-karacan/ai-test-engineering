/** Windows Temp proof: path hash accepts a swapped equal-byte blob, native FileId does not. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectWindowsPath, packagedWindowsFileHelper,
  verifyWindowsOwnedFile } from "../dist/discovery/windows-file-bridge.js";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-restore-verify-swap-"));
try {
  const root = join(top, "artifacts");
  const nested = join(root, "blobs");
  const moved = join(root, "blobs-moved");
  mkdirSync(nested, { recursive: true });
  const path = join(nested, "x.bin");
  writeFileSync(path, "expected bytes");
  const helper = packagedWindowsFileHelper();
  const rootId = inspectWindowsPath(helper, root);
  const digest = createHash("sha256").update("expected bytes").digest("hex");
  const original = verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId,
    { bytes: 14, sha256: digest });
  renameSync(nested, moved);
  mkdirSync(nested);
  writeFileSync(path, "expected bytes");
  assert.equal(inspectWindowsPath(helper, root).fileId, rootId.fileId);
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), digest,
    "RED: legacy path/hash verifier accepts replacement bytes");
  assert.throws(() => verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId,
    { bytes: 14, sha256: digest, identity: original }),
  "GREEN: native pinned verifier rejects replacement FileId");
  rmSync(nested, { recursive: true });
  renameSync(moved, nested);
  assert.equal(verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId,
    { bytes: 14, sha256: digest, identity: original }).fileId, original.fileId);
  process.stdout.write("RED path/hash accepted swapped blob; GREEN native FileId rejected it\n");
} finally {
  assert.ok(resolve(top).startsWith(resolve(tmpdir())));
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
