import { describe, expect, it } from "vitest";
import { closeSync, ftruncateSync, mkdtempSync, mkdirSync, openSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFileInventory } from "../../src/discovery/file-inventory.js";

describe("S03 metadata inventory phase A", () => {
  it("lists hidden, build, binary and large entries without following a junction", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-inventory-"));
    try {
      const root = join(sandbox, "root");
      const external = join(sandbox, "outside");
      for (const path of [root, external, ...[".git", ".mvn", "node_modules", "target", "build"].map((name) => join(root, name))]) {
        mkdirSync(path, { recursive: true });
      }
      writeFileSync(join(root, ".env"), "SECRET_SENTINEL");
      writeFileSync(join(root, ".mvn", "maven.config"), "-B");
      writeFileSync(join(root, "Türkçe & (test).java"), "class Fixture {}");
      writeFileSync(join(root, "binary.dat"), Buffer.from([0, 255, 1]));
      writeFileSync(join(external, "outside.txt"), "outside");
      const large = openSync(join(root, "large.bin"), "w");
      ftruncateSync(large, 65 * 1024 * 1024);
      closeSync(large);
      if (process.platform === "win32") symlinkSync(external, join(root, "outside-link"), "junction");

      const all = [];
      let cursor: string | null = null;
      do {
        const page = await scanFileInventory(root, { cursor, pageSize: 3, requiredHashPaths: [".mvn/maven.config"] });
        all.push(...page.entries);
        cursor = page.nextCursor;
      } while (cursor);
      const paths = all.map((entry) => entry.relativePath);
      expect(new Set(paths).size).toBe(paths.length);
      for (const path of [".git", ".mvn", ".env", "node_modules", "target", "build", "binary.dat", "large.bin", "Türkçe & (test).java"]) {
        expect(paths).toContain(path);
      }
      expect(all.find((entry) => entry.relativePath === ".mvn/maven.config")?.hashStatus).toBe("COMPUTED");
      expect(all.find((entry) => entry.relativePath === "large.bin")?.hashStatus).toBe("NOT_COMPUTED");
      if (process.platform === "win32") {
        expect(all.find((entry) => entry.relativePath === "outside-link")?.kind).toBe("symlink");
        expect(paths).not.toContain("outside-link/outside.txt");
      }
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });

  it("reports an unreadable directory as partial without guessing its contents", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-inventory-denied-"));
    try {
      mkdirSync(join(root, "closed"));
      writeFileSync(join(root, "closed", "unknown.txt"), "x");
      writeFileSync(join(root, "z.txt"), "visible");
      const readDir = (path: string) => {
        if (path === join(root, "closed")) {
          const error: NodeJS.ErrnoException = new Error("EACCES");
          error.code = "EACCES";
          throw error;
        }
        return readdirSync(path, { withFileTypes: true });
      };
      const page = await scanFileInventory(root, { readDir, pageSize: 1 });
      expect(page.partial).toBe(true);
      expect(page.complete).toBe(false);
      expect(page.entries.find((entry) => entry.relativePath === "closed")?.readStatus).toBe("ACCESS_DENIED");
      expect(page.entries.some((entry) => entry.relativePath === "closed/unknown.txt")).toBe(false);
      expect(page.nextCursor).not.toBeNull();
      const last = await scanFileInventory(root, { readDir, pageSize: 1, cursor: page.nextCursor });
      expect(last.partial).toBe(true);
      expect(last.complete).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
