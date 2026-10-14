/** Windows GUARD_ITEM byte-boundary proof using a real PUBLISH_1 restore layout. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

assert.equal(process.platform, "win32");
const script = new URL("./probe-restore-two-blob-layout.mjs", import.meta.url);
function run(extra) {
  const child = spawnSync(process.execPath,
    [fileURLToPath(script), "--cut=PUBLISH_1", "--guard-after-cut", ...extra],
    { encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout)[0];
}

const control = run([]);
assert.equal(control.blocked, true);
assert.deepEqual(control.physical, ["destination", "stage"]);
const boundary = run(["--valid-item-boundary"]);
assert.equal(boundary.itemRejected, true);
assert.equal(boundary.blocked, true);
assert.ok(boundary.itemBytes > 8192 && boundary.itemBytes < 1024 * 1024);
process.stdout.write(`${JSON.stringify({ control: "GUARD_READY", boundary }, null, 2)}\n`);
