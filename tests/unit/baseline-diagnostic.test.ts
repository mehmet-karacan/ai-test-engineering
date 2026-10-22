import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baselineDiagnostic } from "../../src/orchestration/baseline-diagnostic.js";
it("provides a bounded redacted actual Maven error and an actionable skip explanation", () => {
  const root = mkdtempSync(join(tmpdir(), "baseline-error-"));
  try {
    const log = join(root, "maven.log"); writeFileSync(log, "[ERROR] COMPILATION ERROR :\n[ERROR] cannot find symbol password=private-secret\n");
    const d = baselineDiagnostic({ execution_root: root, reason_code: "MAVEN_EXIT_NONZERO", skip_config_detected: [], run: { stdout_log_path: log, stderr_log_path: log } });
    expect(d.error_excerpt.join("\n")).toContain("cannot find symbol"); expect(JSON.stringify(d)).not.toContain("private-secret");
    expect(baselineDiagnostic({ execution_root: root, reason_code: "NO_DISCOVERED_TESTS", skip_config_detected: ["pom.xml: skipTests=true"], run: null }).hint).toMatch(/skipTests/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
