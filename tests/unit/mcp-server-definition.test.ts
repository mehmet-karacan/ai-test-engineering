import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "aitest-mcp-definition-")); roots.push(root);
  return { definitionPath: join(root, "config", "mcp-server.json"), manifestPath: join(root, "install-manifest.json"), backupDir: join(root, "backups"),
    definition: { schema_version: 1 as const, transport: "stdio" as const, command: process.execPath, args: [join(root, "entry.js")],
      env: { AITEST_CONFIG: join(root, "config.json"), AITEST_DB_PATH: join(root, "state.db"), AITEST_WORKER_ENABLED: "0" } } };
};

describe("MCP launch definition ownership", () => {
  it("writes an exact stdio launch definition and keeps unchanged upgrades idempotent", async () => {
    const { installMcpServerDefinition } = await import("../../src/configuration/mcp-server-definition.js");
    const f = fixture();
    expect(installMcpServerDefinition(f)).toMatchObject({ status: "installed" });
    expect(JSON.parse(readFileSync(f.definitionPath, "utf8"))).toEqual(f.definition);
    const manifest = readFileSync(f.manifestPath, "utf8");
    expect(JSON.parse(manifest).owned_files).toEqual([{ path: f.definitionPath, sha256: createHash("sha256").update(readFileSync(f.definitionPath)).digest("hex") }]);
    expect(installMcpServerDefinition(f)).toEqual({ status: "unchanged", backup_path: null });
    expect(readFileSync(f.manifestPath, "utf8")).toBe(manifest);
    expect(existsSync(f.backupDir)).toBe(false);
  });
  it("backs up an owned previous definition before updating it and retains unrelated ownership", async () => {
    const { installMcpServerDefinition } = await import("../../src/configuration/mcp-server-definition.js");
    const f = fixture(); installMcpServerDefinition(f);
    const manifest = JSON.parse(readFileSync(f.manifestPath, "utf8"));
    manifest.owned_files.push({ path: join(f.backupDir, "other.json"), sha256: "a".repeat(64) }); writeFileSync(f.manifestPath, JSON.stringify(manifest));
    const previous = readFileSync(f.definitionPath, "utf8");
    const result = installMcpServerDefinition({ ...f, definition: { ...f.definition, env: { ...f.definition.env, AITEST_WORKER_ENABLED: "1" } } });
    expect(result.status).toBe("updated");
    expect(readFileSync(result.backup_path!, "utf8")).toBe(previous);
    expect(JSON.parse(readFileSync(f.manifestPath, "utf8")).owned_files).toHaveLength(2);
  });
  it.each(["unowned", "edited"])("preserves and backs up %s definitions instead of adopting them", async variant => {
    const { installMcpServerDefinition } = await import("../../src/configuration/mcp-server-definition.js");
    const f = fixture();
    if (variant === "edited") installMcpServerDefinition(f);
    mkdirSync(join(f.definitionPath, ".."), { recursive: true }); writeFileSync(f.definitionPath, "custom bytes\n");
    const previousManifest = existsSync(f.manifestPath) ? readFileSync(f.manifestPath, "utf8") : null;
    const result = installMcpServerDefinition(f);
    expect(result.status).toBe("preserved");
    expect(readFileSync(f.definitionPath, "utf8")).toBe("custom bytes\n");
    expect(readFileSync(result.backup_path!, "utf8")).toBe("custom bytes\n");
    expect(existsSync(f.manifestPath) ? readFileSync(f.manifestPath, "utf8") : null).toBe(previousManifest);
  });
  it.each(["invalid", "duplicate"])("refuses %s ownership before touching a definition", async variant => {
    const { installMcpServerDefinition } = await import("../../src/configuration/mcp-server-definition.js");
    const f = fixture();
    const entry = { path: f.definitionPath, sha256: variant === "invalid" ? "invalid" : "a".repeat(64) };
    writeFileSync(f.manifestPath, JSON.stringify({ schema_version: 1, owned_files: variant === "invalid" ? [entry] : [entry, entry] }));
    expect(() => installMcpServerDefinition(f)).toThrow(/ownership/i);
    expect(existsSync(f.definitionPath)).toBe(false);
  });
  it("does not adopt an identical unowned definition", async () => {
    const { installMcpServerDefinition } = await import("../../src/configuration/mcp-server-definition.js");
    const f = fixture(); mkdirSync(join(f.definitionPath, ".."), { recursive: true });
    writeFileSync(f.definitionPath, JSON.stringify(f.definition, null, 2) + "\n");
    expect(installMcpServerDefinition(f)).toEqual({ status: "unchanged", backup_path: null });
    expect(existsSync(f.manifestPath)).toBe(false);
  });
});
