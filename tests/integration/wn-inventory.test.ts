import { describe, expect, it } from "vitest";
import { closeSync, ftruncateSync, mkdtempSync, mkdirSync, openSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFileInventory } from "../../src/discovery/file-inventory.js";
import { SourceSnapshot, buildDigestFromManifest } from "../../src/discovery/source-snapshot.js";

describe("S03 metadata inventory phase A", () => {
  it("keeps Maven wrapper inputs in a separate build snapshot and excludes old outputs", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-build-snapshot-"));
    try {
      const root = join(sandbox, "root");
      for (const path of [".mvn", ".mvn/wrapper", ".git", "target", "build", "src/main/java"]) {
        mkdirSync(join(root, path), { recursive: true });
      }
      writeFileSync(join(root, "pom.xml"), "<project/>");
      writeFileSync(join(root, ".mvn", "maven.config"), "-B");
      writeFileSync(join(root, ".mvn", "wrapper", "maven-wrapper.properties"), "distributionUrl=example");
      writeFileSync(join(root, "mvnw.cmd"), "@echo off");
      writeFileSync(join(root, "src", "main", "java", "A.java"), "class A {}");
      writeFileSync(join(root, "target", "old.class"), "old");
      writeFileSync(join(root, ".git", "config"), "private");
      const snapshot = new SourceSnapshot(root);
      const first = snapshot.buildManifest();
      const paths = first.entries.map((entry) => entry.relative_path);
      expect(paths).toContain(".mvn/maven.config");
      expect(paths).toContain(".mvn/wrapper/maven-wrapper.properties");
      expect(paths).toContain("mvnw.cmd");
      expect(paths).not.toContain("target/old.class");
      expect(paths).not.toContain(".git/config");
      expect(first.entries.find((entry) => entry.relative_path === ".mvn/maven.config")?.classification).toBe("build_config");
      const firstBuildDigest = buildDigestFromManifest(first);
      writeFileSync(join(root, ".mvn", "maven.config"), "-B -q");
      expect(buildDigestFromManifest(snapshot.buildManifest())).not.toBe(firstBuildDigest);
      const target = join(sandbox, "copy");
      snapshot.copyTo(target, snapshot.buildManifest());
      expect(readdirSync(join(target, ".mvn"))).toContain("maven.config");
      expect(readdirSync(target)).not.toContain("target");
      expect(readdirSync(target)).not.toContain(".git");
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });

  it("rejects a linked build input instead of silently omitting it", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-build-link-"));
    try {
      const root = join(sandbox, "root");
      const external = join(sandbox, "external");
      mkdirSync(root);
      mkdirSync(external);
      writeFileSync(join(root, "pom.xml"), "<project/>");
      writeFileSync(join(external, "maven.config"), "-B");
      symlinkSync(external, join(root, ".mvn"), process.platform === "win32" ? "junction" : "dir");
      expect(() => new SourceSnapshot(root).buildManifest()).toThrow();
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });

  it("rejects a source or destination junction introduced after the manifest", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-copy-link-"));
    try {
      const root = join(sandbox, "root");
      const external = join(sandbox, "external");
      mkdirSync(join(root, ".mvn"), { recursive: true });
      mkdirSync(external);
      writeFileSync(join(root, ".mvn", "maven.config"), "-B");
      writeFileSync(join(external, "maven.config"), "-B");
      const snapshot = new SourceSnapshot(root);
      const manifest = snapshot.buildManifest();
      const target = join(sandbox, "copy");
      mkdirSync(target);
      symlinkSync(external, join(target, ".mvn"), process.platform === "win32" ? "junction" : "dir");
      expect(() => snapshot.copyTo(target, manifest)).toThrow();
      expect(readdirSync(external)).toEqual(["maven.config"]);
      rmSync(join(target, ".mvn"));
      rmSync(join(root, ".mvn"), { recursive: true });
      symlinkSync(external, join(root, ".mvn"), process.platform === "win32" ? "junction" : "dir");
      expect(() => snapshot.copyTo(join(sandbox, "copy2"), manifest)).toThrow();
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });
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
