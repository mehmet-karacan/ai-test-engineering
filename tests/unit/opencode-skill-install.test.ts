import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { installOpenCodeSkill, verifyOpenCodeSkill } from "../../src/configuration/opencode-skill-install.js";
import { ownedUninstall } from "../../src/storage/lifecycle-ops.js";

function fixture(run: (input: { sourcePath: string; destinationPath: string; manifestPath: string; backupDir: string }) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "aitest-skill-install-"));
  const input = { sourcePath: join(dir, "source", "SKILL.md"), destinationPath: join(dir, "opencode", "skills", "test-engineering", "SKILL.md"), manifestPath: join(dir, "runtime", "install-manifest.json"), backupDir: join(dir, "runtime", "backups") };
  mkdirSync(dirname(input.sourcePath), { recursive: true });
  writeFileSync(input.sourcePath, "---\nname: test-engineering\n---\nTurkce UTF8: \u00e7\u011f\u0131\n");
  try { run(input); } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("OpenCode owned skill installation", () => {
  it("fresh installation writes exact source bytes and an ownership hash accepted by uninstall", () => fixture(input => {
    expect(installOpenCodeSkill(input).status).toBe("installed");
    expect(readFileSync(input.destinationPath)).toEqual(readFileSync(input.sourcePath));
    const manifest = JSON.parse(readFileSync(input.manifestPath, "utf8"));
    expect(manifest.owned_files).toContainEqual({ path: input.destinationPath, sha256: createHash("sha256").update(readFileSync(input.sourcePath)).digest("hex") });
    expect(verifyOpenCodeSkill(input.sourcePath, input.destinationPath)).toBe(true);
    expect(ownedUninstall(input.manifestPath).removed.map(entry => entry.path)).toContain(input.destinationPath);
    expect(existsSync(input.destinationPath)).toBe(false);
  }));

  it("repeat installation is byte-idempotent including the existing config ownership entry", () => fixture(input => {
    mkdirSync(dirname(input.manifestPath), { recursive: true });
    writeFileSync(input.manifestPath, JSON.stringify({ schema_version: 1, owned_files: [{ path: join(dirname(input.manifestPath), "config.json"), sha256: "a".repeat(64) }] }));
    installOpenCodeSkill(input);
    const before = readFileSync(input.manifestPath, "utf8");
    expect(installOpenCodeSkill(input).status).toBe("unchanged");
    expect(readFileSync(input.manifestPath, "utf8")).toBe(before);
    expect(JSON.parse(before).owned_files).toHaveLength(2);
  }));

  it("updates a previously owned unmodified skill and backs up its previous bytes", () => fixture(input => {
    installOpenCodeSkill(input);
    const original = readFileSync(input.destinationPath);
    writeFileSync(input.sourcePath, "new released skill\n");
    const result = installOpenCodeSkill(input);
    expect(result.status).toBe("updated");
    expect(readFileSync(result.backup_path!)).toEqual(original);
    expect(readFileSync(input.destinationPath)).toEqual(readFileSync(input.sourcePath));
    expect(verifyOpenCodeSkill(input.sourcePath, input.destinationPath)).toBe(true);
    expect(ownedUninstall(input.manifestPath).removed).toHaveLength(1);
  }));

  it("backs up and preserves an existing custom skill without claiming ownership", () => fixture(input => {
    mkdirSync(dirname(input.destinationPath), { recursive: true });
    writeFileSync(input.destinationPath, "user custom skill\n");
    const result = installOpenCodeSkill(input);
    expect(result.status).toBe("preserved");
    expect(readFileSync(result.backup_path!, "utf8")).toBe("user custom skill\n");
    expect(readFileSync(input.destinationPath, "utf8")).toBe("user custom skill\n");
    expect(verifyOpenCodeSkill(input.sourcePath, input.destinationPath)).toBe(false);
    expect(ownedUninstall(input.manifestPath).removed).toHaveLength(0);
    installOpenCodeSkill(input);
    expect(readdirSync(input.backupDir)).toHaveLength(1);
  }));

  it("preserves user edits after installation and keeps uninstall from deleting them", () => fixture(input => {
    installOpenCodeSkill(input);
    writeFileSync(input.destinationPath, "locally modified skill\n");
    writeFileSync(input.sourcePath, "next released skill\n");
    expect(installOpenCodeSkill(input).status).toBe("preserved");
    expect(readFileSync(input.destinationPath, "utf8")).toBe("locally modified skill\n");
    const decision = ownedUninstall(input.manifestPath);
    expect(decision.removed).toHaveLength(0);
    expect(decision.preserved.some(entry => entry.path === input.destinationPath)).toBe(true);
  }));

  it("does not claim ownership of a preexisting identical skill", () => fixture(input => {
    mkdirSync(dirname(input.destinationPath), { recursive: true });
    writeFileSync(input.destinationPath, readFileSync(input.sourcePath));
    expect(installOpenCodeSkill(input).status).toBe("unchanged");
    expect(ownedUninstall(input.manifestPath).removed).toHaveLength(0);
    expect(existsSync(input.destinationPath)).toBe(true);
  }));

  it("rejects a malformed manifest before changing the skill", () => fixture(input => {
    mkdirSync(dirname(input.manifestPath), { recursive: true });
    writeFileSync(input.manifestPath, '{"schema_version":1,"owned_files":"bad"}');
    expect(() => installOpenCodeSkill(input)).toThrow();
    expect(existsSync(input.destinationPath)).toBe(false);
  }));
});
