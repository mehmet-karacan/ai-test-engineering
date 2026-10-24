import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

it("installation handshake preserves a restricted project allowlist and creates no project inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "production-install-smoke-"));
  try {
    const allowed = join(root, "allowed-project"); mkdirSync(allowed);
    const configPath = join(root, "config.json"), dbPath = join(root, "state.db");
    const config = JSON.stringify({schema_version:1,storage:{root:join(root,"store")},coverage_defaults:{},budgets:{},allowed_project_roots:[allowed]});
    writeFileSync(configPath, config);
    const run = spawnSync(process.execPath, ["scripts/mcp-handshake-smoke.mjs"], {
      cwd: process.cwd(), encoding:"utf8", windowsHide:true, timeout:60000,
      env:{...process.env,AITEST_CONFIG:configPath,AITEST_DB_PATH:dbPath,AITEST_WORKER_ENABLED:"0"},
    });
    expect(run.status, run.stderr + run.stdout).toBe(0);
    expect(run.stdout).toContain("initialize + tools/list + tools/call");
    expect(readFileSync(configPath,"utf8")).toBe(config);
    const db = new Database(dbPath);
    try { expect(db.prepare("SELECT COUNT(*) AS n FROM projects").get()).toEqual({n:0}); } finally { db.close(); }
  } finally { rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100}); }
});

it("does not substitute the local server for a broken registered command",()=>{
  const run=spawnSync(process.execPath,["scripts/mcp-handshake-smoke.mjs"],{cwd:process.cwd(),encoding:"utf8",windowsHide:true,timeout:60000,
    env:{...process.env,AITEST_SMOKE_COMMAND_JSON:JSON.stringify(["aitest-command-that-does-not-exist.exe"])}});
  expect(run.status).not.toBe(0);expect(run.stdout).not.toContain("smoke gecti");
});
