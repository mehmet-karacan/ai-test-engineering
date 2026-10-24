import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

describe.skipIf(process.platform !== "win32")("client none actual SDK registration", () => {
  it.each(["valid", "foreign"])("uses %s definition command/env without reading malformed OpenCode config or probing Maven", variant => {
    const root = mkdtempSync(join(tmpdir(), "aitest-neutral-verify-"));
    try {
      const runtime = join(root, "ai-test-engineering"), configPath = join(runtime, "config", "config.json"), dbPath = join(runtime, "state.db");
      mkdirSync(join(runtime, "config"), { recursive: true });
      const opencode = join(root, ".config", "opencode", "opencode.json");
      mkdirSync(join(opencode, ".."), { recursive: true }); writeFileSync(opencode, "malformed OpenCode sentinel");
      writeFileSync(configPath, JSON.stringify({ schema_version: 1, storage: { root: runtime }, coverage_defaults: {}, budgets: {}, allowed_project_roots: [], worker_profiles: [] }));
      const definition = { schema_version: 1, transport: "stdio", command: variant === "valid" ? process.execPath : "aitest-no-command.exe",
        args: [join(process.cwd(), "dist", "mcp", "stdio-entry.js")], env: { AITEST_CONFIG: configPath, AITEST_DB_PATH: dbPath, AITEST_WORKER_ENABLED: "0" } };
      writeFileSync(join(runtime, "config", "mcp-server.json"), JSON.stringify(definition));
      const run = spawnSync(process.execPath, [join(process.cwd(), "scripts", "verify-install.mjs"), "--client", "none"], {
        cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 60000,
        env: { ...process.env, LOCALAPPDATA: root, USERPROFILE: root, AITEST_DB_PATH: dbPath, AITEST_WORKER_ENABLED: "1",
          // Rejected by effectiveMavenEnvironment before resolver/probe: this test starts no Maven process.
          MAVEN_OPTS: "%AITEST_TEST_NO_PROBE%" },
      });
      expect(run.status, run.stderr + run.stdout).toBe(1); // Maven deliberately unavailable; fresh worker remains disabled.
      expect(run.stdout).not.toContain("kayitli OpenCode");
      expect(run.stdout).not.toContain("OpenCode test-engineering skill");
      expect(readFileSync(opencode, "utf8")).toBe("malformed OpenCode sentinel");
      if (variant === "valid") {
        expect(run.stdout).toContain("OK: stdio tanimi config/DB ile eslesiyor");
        expect(run.stdout).toContain("WORKER_DISABLED");
        expect(run.stdout).toContain("initialize + tools/list + tools/call");
        const db = new Database(dbPath);
        try { expect(db.prepare("SELECT COUNT(*) AS n FROM projects").get()).toEqual({ n: 0 }); }
        finally { db.close(); }
      } else {
        expect(run.stdout).toContain("NOT_READY: stdio tanimi komut/config/DB ile eslesmiyor");
        expect(run.stdout).not.toContain("smoke gecti");
        expect(existsSync(dbPath)).toBe(false);
      }
    } finally { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  }, 60000);
});
