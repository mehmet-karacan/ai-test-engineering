import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Storage } from "../../dist/storage/storage.js";
import { ArtifactStore } from "../../dist/storage/artifact-store.js";
import { recordTerminalRunOutput } from "../../dist/orchestration/terminal-run-output.js";

const [root, jobId] = process.argv.slice(2);
const storage = new Storage({ dbPath: join(root, "state.db") });
storage.migrate();
const artifacts = new ArtifactStore({ root: join(root, "artifacts") });
const publish = artifacts.publish.bind(artifacts);
artifacts.publish = (...args) => {
  const result = publish(...args);
  writeFileSync(join(root, "published.marker"), result.sha256);
  // The outer fixture force-kills this process at the exact blob->DB cut.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
};
recordTerminalRunOutput({
  db: storage.db, artifacts, jobId, phase: "baseline",
  output: {
    reason_code: "NATIVE_MAVEN_TIMEOUT",
    stdout_log_path: join(root, "workspace", "stdout.log"),
    stderr_log_path: join(root, "workspace", "stderr.log"),
    stdout_raw_dropped_bytes: 17, stderr_raw_dropped_bytes: 0,
    stdout_rendered_dropped_bytes: 0, stderr_rendered_dropped_bytes: 0,
    stdout_reason: "BYTE_BUDGET_EXCEEDED", stderr_reason: null,
  },
});
