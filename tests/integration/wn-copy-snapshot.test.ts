import { describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { SourceSnapshot } from "../../src/discovery/source-snapshot.js";
import { AppError } from "../../src/domain/errors.js";
import { packagedWindowsFileHelper, inspectWindowsPath } from "../../src/discovery/windows-file-bridge.js";
import { packagedSnapshotHelper } from "../../src/discovery/windows-snapshot-bridge.js";

function fixture(): string {
  return mkdtempSync(join(tmpdir(), "wn-copy-snapshot-"));
}

function cleanup(path: string): void {
  const absolute = resolve(path);
  if (dirname(absolute).toLowerCase() !== resolve(tmpdir()).toLowerCase() ||
      !basename(absolute).startsWith("wn-copy-snapshot-")) throw new Error("Unsafe fixture cleanup");
  rmSync(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

describe.skipIf(process.platform !== "win32")("S03 native execution snapshot copy", () => {
  it("refuses a missing target root beneath a junction without creating anything outside", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const external = join(sandbox, "external");
      mkdirSync(source);
      mkdirSync(external);
      writeFileSync(join(source, "pom.xml"), "<project/>");
      symlinkSync(external, join(sandbox, "target-link"), "junction");
      const target = join(sandbox, "target-link", "new-root");
      expect(() => new SourceSnapshot(source).copyTo(target, new SourceSnapshot(source).buildManifest())).toThrow();
      expect(existsSync(join(external, "new-root"))).toBe(false);
    } finally { cleanup(sandbox); }
  });

  it("rejects a hardlinked source and leaves the pre-existing target untouched", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "<project/>");
      linkSync(join(source, "pom.xml"), join(sandbox, "source-alias.xml"));
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      expect(() => snapshot.copyTo(target, manifest)).toThrow();
      expect(existsSync(join(target, "pom.xml"))).toBe(false);
      expect(readFileSync(join(source, "pom.xml"), "utf8")).toBe("<project/>");
    } finally { cleanup(sandbox); }
  });

  it("refuses an execution target inside the source tree before writing a copy", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(source, "owned-target");
      mkdirSync(target, { recursive: true });
      writeFileSync(join(source, "pom.xml"), "<project/>");
      const snapshot = new SourceSnapshot(source);
      expect(() => snapshot.copyTo(target, snapshot.buildManifest())).toThrow();
      expect(existsSync(join(target, "pom.xml"))).toBe(false);
    } finally { cleanup(sandbox); }
  });

  it("rejects drive-relative and alternate-stream manifest names before native copy", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "<project/>");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      for (const name of ["C:foo", "dir:ads", "dir/file:stream"]) {
        const forged = { ...manifest, entries: [{ ...manifest.entries[0]!, relative_path: name }] };
        try {
          snapshot.copyTo(target, forged);
          throw new Error(`Accepted invalid name: ${name}`);
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          expect((error as AppError).code).toBe("POLICY_VIOLATION");
        }
      }
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
    } finally { cleanup(sandbox); }
  });

  it("removes only files it created when a later source digest is wrong", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(join(source, "nested"), { recursive: true });
      mkdirSync(target);
      writeFileSync(join(source, "nested", "a.xml"), "first");
      writeFileSync(join(source, "nested", "b.xml"), "second");
      writeFileSync(join(target, "preexisting.txt"), "keep");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      const forged = { ...manifest, entries: manifest.entries.map((entry) =>
        entry.relative_path === "nested/b.xml" ? { ...entry, sha256: "0".repeat(64) } : entry) };
      expect(() => snapshot.copyTo(target, forged)).toThrow();
      expect(existsSync(join(target, "nested", "a.xml"))).toBe(false);
      expect(existsSync(join(target, "nested", "b.xml"))).toBe(false);
      expect(existsSync(join(target, "nested"))).toBe(false);
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
      expect(readFileSync(join(target, "preexisting.txt"), "utf8")).toBe("keep");
    } finally { cleanup(sandbox); }
  });

  it("cleans copied files if manifest publication would overwrite an existing file", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "<project/>");
      writeFileSync(join(target, "snapshot-manifest.json"), "preexisting");
      const snapshot = new SourceSnapshot(source);
      expect(() => snapshot.copyTo(target, snapshot.buildManifest())).toThrow();
      expect(existsSync(join(target, "pom.xml"))).toBe(false);
      expect(readFileSync(join(target, "snapshot-manifest.json"), "utf8")).toBe("preexisting");
    } finally { cleanup(sandbox); }
  });

  it("pins both roots through a file copy and the manifest publication", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "<project/>");
      const manifest = new SourceSnapshot(source).buildManifest();
      const entry = manifest.entries[0]!;
      const bridge = packagedWindowsFileHelper();
      const sourceId = inspectWindowsPath(bridge, source);
      const targetId = inspectWindowsPath(bridge, target);
      child = spawn(packagedSnapshotHelper(), ["snapshot", source, target,
        sourceId.volumeSerial + sourceId.fileId, targetId.volumeSerial + targetId.fileId],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
      const closed = once(child, "close") as Promise<[number]>;
      expect((await lines.next()).value).toBe("READY");
      expect(child.exitCode).toBe(null);
      // Both roots are open, but no target file exists yet. Windows may rename
      // the pathname; all later opens must remain anchored to the old handles.
      const movedSource = join(sandbox, "source-moved");
      const movedTarget = join(sandbox, "target-moved");
      renameSync(source, movedSource);
      renameSync(target, movedTarget);
      mkdirSync(source);
      mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "replacement source");
      writeFileSync(join(target, "sentinel.txt"), "replacement target");
      const fileLine = `FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\n`;
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) });
      child.stdin.end(fileLine + `MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nEND\n`);
      expect((await closed)[0]).toBe(2);
      expect(existsSync(join(movedTarget, "snapshot-manifest.json"))).toBe(false);
      expect(existsSync(join(movedTarget, "pom.xml"))).toBe(false);
      expect(readFileSync(join(target, "sentinel.txt"), "utf8")).toBe("replacement target");
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy();
        child.kill();
        await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);
});
