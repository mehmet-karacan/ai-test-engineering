import { describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { SourceSnapshot } from "../../src/discovery/source-snapshot.js";
import { AppError } from "../../src/domain/errors.js";
import { packagedWindowsFileHelper, inspectWindowsPath } from "../../src/discovery/windows-file-bridge.js";
import { assertSnapshotHelperResult, packagedSnapshotHelper } from "../../src/discovery/windows-snapshot-bridge.js";

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
  it("returns a typed error when a verified helper vanishes before spawn", () => {
    const sandbox = fixture();
    try {
      const run = spawnSync(join(sandbox, "missing-helper.exe"), [], { encoding: "utf8", windowsHide: true });
      expect((run.error as NodeJS.ErrnoException | undefined)?.code).toBe("ENOENT");
      try { assertSnapshotHelperResult(run); throw new Error("Accepted missing helper"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_HELPER_LAUNCH_FAILED");
      }
    } finally { cleanup(sandbox); }
  });

  it("reports a helper exit 4 as partial cleanup failure", () => {
    const run = spawnSync(process.execPath, ["-e", "process.exit(4)"], { encoding: "utf8", windowsHide: true });
    try { assertSnapshotHelperResult(run); throw new Error("Accepted incomplete cleanup"); }
    catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_PARTIAL_CLEANUP_FAILED");
    }
  });
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

  it("rejects a source file reserved for the snapshot session marker", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, ".aitest-snapshot-session"), "source data");
      writeFileSync(join(target, "sentinel.txt"), "keep");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      try { snapshot.copyTo(target, manifest); throw new Error("Accepted reserved marker name"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("POLICY_VIOLATION");
      }
      expect(readdirSync(target)).toEqual(["sentinel.txt"]);
    } finally { cleanup(sandbox); }
  });

  it("rejects a valid-size inventory whose durable receipts exceed the reopen limit before writing", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "<project/>");
      writeFileSync(join(target, "sentinel.txt"), "keep");
      const snapshot = new SourceSnapshot(source);
      const base = snapshot.buildManifest();
      const template = base.entries[0]!;
      const entries = Array.from({ length: 68_000 }, (_, index) => ({
        ...template,
        relative_path: `src/${index.toString(36)}-${"x".repeat(230)}`,
      }));
      try { snapshot.copyTo(target, { ...base, entries }); throw new Error("Accepted oversized receipt journal"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("POLICY_VIOLATION");
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_JOURNAL_LIMIT");
      }
      expect(readdirSync(target)).toEqual(["sentinel.txt"]);
    } finally { cleanup(sandbox); }
  }, 30_000);

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
      expect(readdirSync(target).some((name) => name.startsWith("snapshot-manifest.json.tmp-"))).toBe(false);
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
      // Source root can move; the durable target journal also blocks target rename.
      const movedSource = join(sandbox, "source-moved");
      const movedTarget = join(sandbox, "target-moved");
      renameSync(source, movedSource);
      expect(() => renameSync(target, movedTarget)).toThrow();
      mkdirSync(source);
      writeFileSync(join(source, "pom.xml"), "replacement source");
      const fileLine = `FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\n`;
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) });
      child.stdin.end(fileLine + `MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nEND\n`);
      expect((await closed)[0]).toBe(2);
      expect(existsSync(join(movedTarget, "snapshot-manifest.json"))).toBe(false);
      expect(existsSync(join(target, "pom.xml"))).toBe(false);
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

  it("keeps the original source bytes after a transient source root swap-back", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
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
      const movedSource = join(sandbox, "source-moved");
      const replacement = join(sandbox, "source-replacement");
      renameSync(source, movedSource);
      mkdirSync(source);
      writeFileSync(join(source, "pom.xml"), "replacement");
      child.stdin.write(`FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\nBARRIER\n`);
      expect((await lines.next()).value).toBe("BARRIER");
      renameSync(source, replacement);
      renameSync(movedSource, source);
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) });
      child.stdin.end(`MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nEND\n`);
      expect((await lines.next()).value).toBe("OK");
      expect((await closed)[0]).toBe(0);
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("original");
      expect(readFileSync(join(replacement, "pom.xml"), "utf8")).toBe("replacement");
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy(); child.kill(); await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);

  it("blocks target root rename while the session journal is held", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
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
      const movedTarget = join(sandbox, "target-moved");
      expect(() => renameSync(target, movedTarget)).toThrow();
      child.stdin.write(`FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\nBARRIER\n`);
      expect((await lines.next()).value).toBe("BARRIER");
      expect(() => renameSync(target, movedTarget)).toThrow();
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) });
      child.stdin.end(`MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nEND\n`);
      expect((await closed)[0]).toBe(0);
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("original");
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(true);
      expect(existsSync(movedTarget)).toBe(false);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy(); child.kill(); await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);

  it("leaves an untrusted partial target without a manifest after hard kill", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
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
      child.stdin.write(`FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\nBARRIER\n`);
      expect((await lines.next()).value).toBe("BARRIER");
      expect(child.exitCode).toBe(null);
      expect(child.kill()).toBe(true);
      expect((await closed)[0]).toBe(null);
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("original");
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
      renameSync(join(target, "pom.xml"), join(target, "orphaned-original.xml"));
      writeFileSync(join(target, "pom.xml"), "other user");
      const markerBeforeRetry = readFileSync(join(target, ".aitest-snapshot-session"));
      try { new SourceSnapshot(source).copyTo(target, manifest); throw new Error("Recovered an incomplete session"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("other user");
      expect(readFileSync(join(target, "orphaned-original.xml"), "utf8")).toBe("original");
      expect(readFileSync(join(target, ".aitest-snapshot-session"))).toEqual(markerBeforeRetry);
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy(); child.kill(); await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);

  it("does not expose a final manifest when killed after its bytes are staged", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
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
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) });
      child.stdin.write(`FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\n` +
        `MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nBARRIER\n`);
      expect((await lines.next()).value).toBe("BARRIER");
      expect(child.exitCode).toBe(null);
      expect(child.kill()).toBe(true);
      expect((await closed)[0]).toBe(null);
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
      const stagedBeforeRetry = readdirSync(target).filter((name) => name.startsWith("snapshot-manifest.json.tmp-"));
      expect(stagedBeforeRetry).toHaveLength(1);
      try { new SourceSnapshot(source).copyTo(target, manifest); throw new Error("Accepted staged manifest"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
      expect(readdirSync(target).filter((name) => name.startsWith("snapshot-manifest.json.tmp-")))
        .toEqual(stagedBeforeRetry);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy(); child.kill(); await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);

  it("quarantines a session killed at READY before retry writes", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      const bridge = packagedWindowsFileHelper();
      const sourceId = inspectWindowsPath(bridge, source);
      const targetId = inspectWindowsPath(bridge, target);
      child = spawn(packagedSnapshotHelper(), ["snapshot", source, target,
        sourceId.volumeSerial + sourceId.fileId, targetId.volumeSerial + targetId.fileId],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
      const closed = once(child, "close") as Promise<[number]>;
      expect((await lines.next()).value).toBe("READY");
      expect(child.kill()).toBe(true);
      expect((await closed)[0]).toBe(null);
      try { snapshot.copyTo(target, manifest); throw new Error("Recovered READY-only session"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(existsSync(join(target, "pom.xml"))).toBe(false);
      expect(existsSync(join(target, "snapshot-manifest.json"))).toBe(false);
      expect(existsSync(join(target, ".aitest-snapshot-session"))).toBe(true);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy(); child.kill(); await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);

  it("quarantines a published snapshot after publish-before-OK hard kill without external ownership", async () => {
    const sandbox = fixture();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
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
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...rest }) => rest) }, null, 2);
      child.stdin.write(`FILE\t${Buffer.from(entry.relative_path, "utf16le").toString("hex")}\t${entry.bytes}\t${entry.sha256}\n` +
        `MANIFEST\t${Buffer.from(publicManifest, "utf8").toString("hex")}\nEND_PAUSE\n`);
      expect((await lines.next()).value).toBe("PUBLISHED");
      expect(child.kill()).toBe(true);
      expect((await closed)[0]).toBe(null);
      expect(readFileSync(join(target, "snapshot-manifest.json"), "utf8")).toBe(publicManifest);
      try { snapshot.copyTo(target, manifest); throw new Error("Accepted untrusted completed session"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(readFileSync(join(target, "snapshot-manifest.json"), "utf8")).toBe(publicManifest);
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("original");
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.destroy(); child.kill(); await once(child, "close");
      }
      cleanup(sandbox);
    }
  }, 30_000);

  it("quarantines a complete-looking target with a forged local marker", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      const publicManifest = JSON.stringify({ ...manifest,
        entries: manifest.entries.map(({ source_location: _loc, ...entry }) => entry) }, null, 2);
      writeFileSync(join(target, "pom.xml"), "original");
      writeFileSync(join(target, "snapshot-manifest.json"), publicManifest);
      const bridge = packagedWindowsFileHelper();
      const sourceId = inspectWindowsPath(bridge, source);
      const targetId = inspectWindowsPath(bridge, target);
      const fileId = inspectWindowsPath(bridge, join(target, "pom.xml"));
      const manifestId = inspectWindowsPath(bridge, join(target, "snapshot-manifest.json"));
      const marker = `AITEST_SNAPSHOT_V1\n${sourceId.volumeSerial}${sourceId.fileId}\n` +
        `${targetId.volumeSerial}${targetId.fileId}\n` +
        `F\t${Buffer.from("pom.xml", "utf16le").toString("hex")}\t${fileId.volumeSerial}${fileId.fileId}\n` +
        `M\t${manifestId.volumeSerial}${manifestId.fileId}\n`;
      writeFileSync(join(target, ".aitest-snapshot-session"), marker);
      try { snapshot.copyTo(target, manifest); throw new Error("Accepted forged target ownership"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("original");
      expect(readFileSync(join(target, ".aitest-snapshot-session"), "utf8")).toBe(marker);
    } finally { cleanup(sandbox); }
  });

  it("does not accept or delete a changed file during read-only reconciliation", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      snapshot.copyTo(target, manifest);
      const originalId = inspectWindowsPath(packagedWindowsFileHelper(), join(target, "pom.xml"));
      expect(readFileSync(join(target, ".aitest-snapshot-session"), "utf8"))
        .toContain(`F\t${Buffer.from("pom.xml", "utf16le").toString("hex")}\t${originalId.volumeSerial}${originalId.fileId}\n`);
      renameSync(join(target, "pom.xml"), join(target, "previous.xml"));
      writeFileSync(join(target, "pom.xml"), "original");
      const replacementId = inspectWindowsPath(packagedWindowsFileHelper(), join(target, "pom.xml"));
      expect(replacementId.fileId).not.toBe(originalId.fileId);
      try { snapshot.copyTo(target, manifest); throw new Error("Accepted changed target file"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(readFileSync(join(target, "pom.xml"), "utf8")).toBe("original");
      expect(readFileSync(join(target, "previous.xml"), "utf8")).toBe("original");
    } finally { cleanup(sandbox); }
  }, 60_000);

  it("quarantines a byte-identical replacement of the published manifest", () => {
    const sandbox = fixture();
    try {
      const source = join(sandbox, "source");
      const target = join(sandbox, "target");
      mkdirSync(source); mkdirSync(target);
      writeFileSync(join(source, "pom.xml"), "original");
      const snapshot = new SourceSnapshot(source);
      const manifest = snapshot.buildManifest();
      snapshot.copyTo(target, manifest);
      const published = join(target, "snapshot-manifest.json");
      const body = readFileSync(published);
      const originalId = inspectWindowsPath(packagedWindowsFileHelper(), published);
      expect(readFileSync(join(target, ".aitest-snapshot-session"), "utf8"))
        .toContain(`M\t${originalId.volumeSerial}${originalId.fileId}\n`);
      renameSync(published, join(target, "previous-manifest.json"));
      writeFileSync(published, body);
      const replacementId = inspectWindowsPath(packagedWindowsFileHelper(), published);
      expect(replacementId.fileId).not.toBe(originalId.fileId);
      try { snapshot.copyTo(target, manifest); throw new Error("Accepted replacement manifest"); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).details?.reason_code).toBe("SNAPSHOT_OWNERSHIP_UNVERIFIED");
      }
      expect(readFileSync(published)).toEqual(body);
      expect(readFileSync(join(target, "previous-manifest.json"))).toEqual(body);
    } finally { cleanup(sandbox); }
  }, 60_000);
});
