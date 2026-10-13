import { describe, expect, it } from "vitest";
import { closeSync, ftruncateSync, mkdtempSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { inventoryDigestFromCompletePage, scanFileInventory } from "../../src/discovery/file-inventory.js";
import { SourceSnapshot, buildDigestFromManifest, sourceDigestFromManifest } from "../../src/discovery/source-snapshot.js";

function removeFixture(path: string): void {
  const absolute = resolve(path);
  if (dirname(absolute).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(absolute).startsWith("wn-")) {
    throw new Error(`Unsafe fixture cleanup: ${absolute}`);
  }
  rmSync(absolute, { recursive: true, force: true });
}

function removeFixtureChild(sandbox: string, path: string): void {
  const absolute = resolve(path);
  const base = resolve(sandbox);
  if (dirname(base).toLowerCase() !== resolve(tmpdir()).toLowerCase() ||
      !basename(base).startsWith("wn-") || !absolute.toLowerCase().startsWith(`${base.toLowerCase()}${sep}`)) {
    throw new Error(`Unsafe fixture child cleanup: ${absolute}`);
  }
  rmSync(absolute, { recursive: true });
}

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
    } finally { removeFixture(sandbox); }
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
    } finally { removeFixture(sandbox); }
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
      removeFixtureChild(sandbox, join(root, ".mvn"));
      symlinkSync(external, join(root, ".mvn"), process.platform === "win32" ? "junction" : "dir");
      expect(() => snapshot.copyTo(join(sandbox, "copy2"), manifest)).toThrow();
    } finally { removeFixture(sandbox); }
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
    } finally { removeFixture(sandbox); }
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
    } finally { removeFixture(root); }
  });

  it("keeps complete metadata digest separate from execution source and build digests", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-digest-separation-"));
    try {
      const root = join(sandbox, "root");
      for (const path of [".git", "target", ".mvn", "src/main/java"]) mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, ".git", "config"), "old");
      writeFileSync(join(root, "target", "old.class"), "old");
      writeFileSync(join(root, ".mvn", "maven.config"), "-B");
      writeFileSync(join(root, "pom.xml"), "<project/>");
      writeFileSync(join(root, "src", "main", "java", "A.java"), "class A {}");
      const snapshot = new SourceSnapshot(root);
      const firstManifest = snapshot.buildManifest();
      const firstPage = await scanFileInventory(root, { pageSize: 100 });
      const firstInventoryDigest = inventoryDigestFromCompletePage(firstPage);
      writeFileSync(join(root, ".git", "config"), "changed");
      writeFileSync(join(root, "target", "old.class"), "changed");
      const secondManifest = snapshot.buildManifest();
      const secondPage = await scanFileInventory(root, { pageSize: 100 });
      expect(inventoryDigestFromCompletePage(secondPage)).not.toBe(firstInventoryDigest);
      expect(sourceDigestFromManifest(secondManifest)).toBe(sourceDigestFromManifest(firstManifest));
      expect(buildDigestFromManifest(secondManifest)).toBe(buildDigestFromManifest(firstManifest));
      expect(() => inventoryDigestFromCompletePage({ ...firstPage, complete: false, partial: true })).toThrow();
      expect(() => inventoryDigestFromCompletePage({ ...firstPage, entries: [...firstPage.entries, firstPage.entries[0]!] })).toThrow();
    } finally { removeFixture(sandbox); }
  });

  it("hashes a large required input for inventory and refuses an untrusted execution manifest", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-large-required-"));
    try {
      const root = join(sandbox, "root");
      mkdirSync(join(root, ".mvn", "wrapper"), { recursive: true });
      writeFileSync(join(root, "pom.xml"), "<project/>");
      const required = join(root, ".mvn", "wrapper", "maven-wrapper.jar");
      const fd = openSync(required, "w");
      ftruncateSync(fd, 1024 * 1024);
      closeSync(fd);
      const metadata = await scanFileInventory(root, { requiredHashPaths: [".mvn/wrapper/maven-wrapper.jar"], pageSize: 100 });
      expect(metadata.entries.find((entry) => entry.relativePath === ".mvn/wrapper/maven-wrapper.jar")?.hashStatus).toBe("COMPUTED");
      expect(() => new SourceSnapshot(root).buildManifest({ maxFileBytes: 1024 })).toThrow();
      const manifest = new SourceSnapshot(root).buildManifest({ maxFileBytes: 2 * 1024 * 1024 });
      const entry = manifest.entries.find((item) => item.relative_path === ".mvn/wrapper/maven-wrapper.jar");
      expect(entry?.sha256).toMatch(/^[0-9a-f]{64}$/);
      const target = join(sandbox, "copy");
      new SourceSnapshot(root).copyTo(target, manifest);
      expect(readFileSync(join(target, ".mvn", "wrapper", "maven-wrapper.jar")).byteLength).toBe(1024 * 1024);
    } finally { removeFixture(sandbox); }
  });

  it("does not overwrite an existing execution target or accept changed source bytes", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "wn-copy-revalidate-"));
    try {
      const root = join(sandbox, "root");
      const target = join(sandbox, "copy");
      mkdirSync(root);
      mkdirSync(target);
      writeFileSync(join(root, "pom.xml"), "<project/>");
      const snapshot = new SourceSnapshot(root);
      const manifest = snapshot.buildManifest();
      writeFileSync(join(target, "pom.xml"), "owned");
      expect(() => snapshot.copyTo(target, manifest)).toThrow();
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("owned");
      rmSync(join(target, "pom.xml"));
      writeFileSync(join(root, "pom.xml"), "changed");
      expect(() => snapshot.copyTo(target, manifest)).toThrow();
      expect(readdirSync(target)).not.toContain("snapshot-manifest.json");
    } finally { removeFixture(sandbox); }
  });
});
