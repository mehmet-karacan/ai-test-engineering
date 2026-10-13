import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync, linkSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import Database from "better-sqlite3";
import { inspectWindowsPath, copyWindowsFile, copyWindowsOwnedFile, renameWindowsOwnedFile, verifyWindowsOwnedFile,
  deleteWindowsOwnedFile,
  packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";

function stdoutLineReader(stdout: Readable): () => Promise<string> {
  const lines = createInterface({ input: stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  return async () => {
    const next = await lines.next();
    if (next.done) throw new Error("helper stdout ended before response");
    return next.value;
  };
}

describe.skipIf(process.platform !== "win32")("WN27 native file bridge", () => {
  let sandbox: string;
  let helper: { path: string; sha256: string };

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "wn-file-bridge-"));
    const build = join(process.cwd(), "scripts", "build-windows-file-helper.cmd");
    const result = spawnSync("cmd.exe", ["/d", "/s", "/c", `""${build}" "${sandbox}""`],
      { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const path = join(sandbox, "windows-file-helper.exe");
    helper = { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
  });

  afterAll(() => {
    const tempRoot = resolve(tmpdir());
    const actual = sandbox && resolve(sandbox);
    if (actual && actual.startsWith(`${tempRoot}${sep}`) && actual.split(sep).at(-1)?.startsWith("wn-file-bridge-")) {
      rmSync(actual, { recursive: true, force: true });
    }
  });

  it("deletes only the expected pinned FileId after native root and file checks", () => {
    const root = join(sandbox, `delete-${randomUUID()}`);
    mkdirSync(join(root, "blobs"), { recursive: true });
    const path = join(root, "blobs", "x.bin");
    writeFileSync(path, "owned bytes");
    const rootIdentity = inspectWindowsPath(helper, root);
    const fileIdentity = inspectWindowsPath(helper, path);
    const expected = { ...fileIdentity, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
    expect(() => deleteWindowsOwnedFile(helper, root, "blobs\\x.bin",
      { ...rootIdentity, fileId: "f".repeat(32) }, expected)).toThrow();
    expect(() => deleteWindowsOwnedFile(helper, root, "blobs\\x.bin", rootIdentity,
      { ...expected, fileId: "f".repeat(32) })).toThrow();
    expect(readFileSync(path, "utf8")).toBe("owned bytes");
    deleteWindowsOwnedFile(helper, root, "blobs\\x.bin", rootIdentity, expected);
    expect(existsSync(path)).toBe(false);
  });

  it("refuses an owned delete when the physical blob has another hardlink", () => {
    const root = join(sandbox, `delete-linked-${randomUUID()}`);
    mkdirSync(join(root, "blobs"), { recursive: true });
    const path = join(root, "blobs", "x.bin");
    const alias = join(root, "blobs", "alias.bin");
    writeFileSync(path, "shared bytes");
    linkSync(path, alias);
    const rootIdentity = inspectWindowsPath(helper, root);
    const fileIdentity = inspectWindowsPath(helper, path);
    const expected = { ...fileIdentity, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
    expect(() => deleteWindowsOwnedFile(helper, root, "blobs\\x.bin", rootIdentity, expected)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("shared bytes");
    expect(readFileSync(alias, "utf8")).toBe("shared bytes");
  });

  it("copies and publishes only under the captured root FileId", () => {
    const sourceRoot = join(sandbox, `owned-source-${randomUUID()}`);
    const targetRoot = join(sandbox, `owned-target-${randomUUID()}`);
    const movedRoot = `${targetRoot}-moved`;
    mkdirSync(join(sourceRoot, "blobs"), { recursive: true });
    mkdirSync(join(targetRoot, "blobs"), { recursive: true });
    writeFileSync(join(sourceRoot, "blobs", "x.bin"), "verified source");
    const sourceIdentity = inspectWindowsPath(helper, sourceRoot);
    const targetIdentity = inspectWindowsPath(helper, targetRoot);
    renameSync(targetRoot, movedRoot);
    mkdirSync(join(targetRoot, "blobs"), { recursive: true });
    expect(() => copyWindowsOwnedFile(helper, sourceRoot, "blobs\\x.bin", targetRoot,
      "blobs\\x.stage", sourceIdentity, targetIdentity)).toThrow();
    expect(existsSync(join(targetRoot, "blobs", "x.stage"))).toBe(false);
    rmSync(targetRoot, { recursive: true });
    renameSync(movedRoot, targetRoot);
    const copied = copyWindowsOwnedFile(helper, sourceRoot, "blobs\\x.bin", targetRoot,
      "blobs\\x.stage", sourceIdentity, targetIdentity);
    expect(copied.sha256).toBe(createHash("sha256").update("verified source").digest("hex"));
    expect(() => renameWindowsOwnedFile(helper, targetRoot, "blobs\\x.stage", "blobs\\x.bin",
      targetIdentity, { ...copied, fileId: "f".repeat(32) })).toThrow();
    expect(existsSync(join(targetRoot, "blobs", "x.bin"))).toBe(false);
    const published = renameWindowsOwnedFile(helper, targetRoot, "blobs\\x.stage", "blobs\\x.bin",
      targetIdentity, copied);
    expect(published.fileId).toBe(copied.fileId);
    expect(readFileSync(join(targetRoot, "blobs", "x.bin"), "utf8")).toBe("verified source");
  });

  it("pins skip and final verification to the same physical blob ID across nested swaps", () => {
    const root = join(sandbox, `verify-${randomUUID()}`);
    const nested = join(root, "blobs");
    const moved = join(root, "blobs-moved");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "x.bin"), "expected bytes");
    const rootId = inspectWindowsPath(helper, root);
    const original = verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId,
      { bytes: 14, sha256: createHash("sha256").update("expected bytes").digest("hex") });
    renameSync(nested, moved);
    mkdirSync(nested);
    writeFileSync(join(nested, "x.bin"), "expected bytes");
    expect(inspectWindowsPath(helper, root).fileId).toBe(rootId.fileId);
    expect(() => verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId,
      { bytes: 14, sha256: original.sha256, identity: original })).toThrow();
    rmSync(nested, { recursive: true });
    renameSync(moved, nested);
    expect(verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId,
      { bytes: 14, sha256: original.sha256, identity: original }).fileId).toBe(original.fileId);
  });

  it("uses volume and file ID to recognize hardlink and case aliases", () => {
    const root = join(sandbox, "aliases");
    mkdirSync(root);
    const original = join(root, "Source.txt");
    const alias = join(root, "hardlink.txt");
    writeFileSync(original, "source");
    linkSync(original, alias);
    const first = inspectWindowsPath(helper, original);
    expect(inspectWindowsPath(helper, root).fileId).toMatch(/^[0-9a-f]{32}$/);
    const linked = inspectWindowsPath(helper, alias);
    const cased = inspectWindowsPath(helper, join(root, "source.TXT"));
    expect(first.volumeSerial).toMatch(/^[0-9a-f]{16}$/);
    expect(first.fileId).toMatch(/^[0-9a-f]{32}$/);
    expect(linked).toMatchObject({ volumeSerial: first.volumeSerial, fileId: first.fileId });
    expect(cased).toMatchObject({ volumeSerial: first.volumeSerial, fileId: first.fileId });
    expect(first.linkCount).toBeGreaterThanOrEqual(2);
    expect(() => inspectWindowsPath({ ...helper, sha256: "0".repeat(64) }, original)).toThrow();
    const target = join(sandbox, "alias-copy-target");
    mkdirSync(target);
    expect(() => copyWindowsFile(helper, root, "Source.txt", target, "must-not-exist.txt")).toThrow();
    expect(existsSync(join(target, "must-not-exist.txt"))).toBe(false);
  });

  it("resolves the packaged file helper only through its source and binary hashes", () => {
    const packaged = packagedWindowsFileHelper();
    expect(packaged.path).toContain("windows-file-helper.exe");
    expect(createHash("sha256").update(readFileSync(packaged.path)).digest("hex")).toBe(packaged.sha256);
    const mirror = join(sandbox, "package-tamper");
    mkdirSync(join(mirror, "scripts"), { recursive: true });
    mkdirSync(join(mirror, "native", "bin"), { recursive: true });
    for (const file of ["scripts/verify-windows-file-helper.mjs", "native/windows-file-helper.cpp",
      "native/windows-file-helper.manifest.json", "native/bin/windows-file-helper.exe"]) {
      copyFileSync(join(process.cwd(), file), join(mirror, file));
    }
    const verify = () => spawnSync(process.execPath, [join(mirror, "scripts", "verify-windows-file-helper.mjs")],
      { windowsHide: true });
    expect(verify().status).toBe(0);
    const binary = join(mirror, "native", "bin", "windows-file-helper.exe");
    const tampered = Buffer.from(readFileSync(binary));
    tampered[0] ^= 1;
    writeFileSync(binary, tampered);
    expect(verify().status).not.toBe(0);
  });

  it("rejects intermediate junction and refuses an existing destination", () => {
    const root = join(sandbox, "source");
    const outside = join(sandbox, "outside");
    const target = join(sandbox, "target");
    mkdirSync(root); mkdirSync(outside); mkdirSync(target);
    writeFileSync(join(outside, "secret.txt"), "outside");
    symlinkSync(outside, join(root, "pivot"), "junction");
    expect(() => inspectWindowsPath(helper, join(root, "pivot", "secret.txt"))).toThrow();
    expect(() => copyWindowsFile(helper, root, "pivot/secret.txt", target, "copied.txt")).toThrow();
    writeFileSync(join(root, "ok.txt"), "ok");
    writeFileSync(join(target, "copied.txt"), "existing");
    linkSync(join(target, "copied.txt"), join(sandbox, "outside-hardlink.txt"));
    expect(() => copyWindowsFile(helper, root, "ok.txt", target, "copied.txt")).toThrow();
    expect(readFileSync(join(target, "copied.txt"), "utf8")).toBe("existing");
    expect(readFileSync(join(sandbox, "outside-hardlink.txt"), "utf8")).toBe("existing");
  });

  it("copies from held source handle into a new target and checks bytes", () => {
    const root = join(sandbox, "copy-source");
    const target = join(sandbox, "copy-target");
    mkdirSync(join(root, ".mvn"), { recursive: true });
    mkdirSync(target);
    writeFileSync(join(root, ".mvn", "maven.config"), "-B ünicode");
    const result = copyWindowsFile(helper, root, ".mvn/maven.config", target, ".mvn/maven.config");
    expect(result.bytes).toBe(Buffer.byteLength("-B ünicode"));
    expect(readFileSync(join(target, ".mvn", "maven.config"), "utf8")).toBe("-B ünicode");
    const otherDrive = root[0]?.toUpperCase() === "C" ? "D" : "C";
    expect(() => copyWindowsFile(helper, root, ".mvn/maven.config", `${otherDrive}:\\not-opened`, "blocked.txt"))
      .toThrowError(expect.objectContaining({ details: { reason_code: "WINDOWS_FILE_CROSS_VOLUME" } }));
  });

  it("never copies external bytes during a concurrent directory/junction swap", async () => {
    const root = join(sandbox, "swap-source");
    const external = join(sandbox, "swap-outside");
    const target = join(sandbox, "swap-target");
    mkdirSync(join(root, "pivot"), { recursive: true });
    mkdirSync(external); mkdirSync(target);
    writeFileSync(join(root, "pivot", "payload.txt"), "inside");
    writeFileSync(join(external, "payload.txt"), "outside");
    const code = `
      const fs=require('node:fs'), path=require('node:path');
      const root=process.argv[1], external=process.argv[2];
      const pivot=path.join(root,'pivot'), parked=path.join(root,'parked');
      const end=Date.now()+1800;
      while(Date.now()<end){
        try { fs.renameSync(pivot,parked); fs.symlinkSync(external,pivot,'junction');
          fs.rmSync(pivot); fs.renameSync(parked,pivot); }
        catch { try { if(fs.lstatSync(pivot).isSymbolicLink()) fs.rmSync(pivot); } catch {}
          try { if(!fs.existsSync(pivot)) fs.renameSync(parked,pivot); } catch {} }
      }
      process.exit(0);
    `;
    const swapper = spawn(process.execPath, ["-e", code, root, external], { stdio: "ignore", windowsHide: true });
    try {
      for (let i = 0; i < 24; i++) {
        const output = `copy-${i}.txt`;
        try {
          copyWindowsFile(helper, root, "pivot/payload.txt", target, output);
          expect(readFileSync(join(target, output), "utf8")).toBe("inside");
        } catch (error) {
          if (error instanceof Error && error.name === "AssertionError") throw error;
        }
      }
    } finally {
      if (swapper.exitCode === null) swapper.kill();
      if (swapper.exitCode === null) await new Promise<void>((resolveExit) => swapper.once("exit", () => resolveExit()));
    }
    expect(readFileSync(join(external, "payload.txt"), "utf8")).toBe("outside");
  });

  it("probes SQLite read-only verification under a read-share DB guard", async () => {
    const path = join(sandbox, "read-guard.db");
    const setup = new Database(path);
    setup.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1)");
    setup.pragma("journal_mode = WAL");
    setup.close();
    const holder = spawn(helper.path, ["hold-read", path], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    await new Promise<void>((resolveReady, rejectReady) => {
      holder.stdout.once("data", (data: Buffer) => data.toString().includes("READY") ? resolveReady() : rejectReady(new Error("no READY")));
      holder.once("exit", (code) => rejectReady(new Error(`holder exit ${code}`)));
    });
    try {
      const readonly = new Database(path, { readonly: true });
      try { expect(readonly.prepare("SELECT x FROM t").get()).toMatchObject({ x: 1 }); }
      finally { readonly.close(); }
      expect(() => {
        const writer = new Database(path);
        try { writer.exec("INSERT INTO t VALUES (2)"); }
        finally { writer.close(); }
      }).toThrow();
      const rawWriter = spawnSync(process.execPath, ["-e",
        "const D=require('better-sqlite3');const db=new D(process.argv[1]);db.exec('INSERT INTO t VALUES (3)');db.close()", path],
        { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
      expect(rawWriter.status).not.toBe(0);
    } finally {
      holder.stdin.end();
      await new Promise<void>((resolveExit) => holder.once("exit", () => resolveExit()));
    }
    const renameHolder = spawn(helper.path, ["hold-rename", path], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    await new Promise<void>((resolveReady, rejectReady) => {
      renameHolder.stdout.once("data", (data: Buffer) => data.toString().includes("READY") ? resolveReady() : rejectReady(new Error("no READY")));
      renameHolder.once("exit", (code) => rejectReady(new Error(`rename holder exit ${code}`)));
    });
    try {
      expect(() => new Database(path, { readonly: true })).toThrow();
    } finally {
      renameHolder.stdin.end();
      await new Promise<void>((resolveExit) => renameHolder.once("exit", () => resolveExit()));
    }
    const transitioned = spawn(helper.path, ["hold-transition", path], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    await new Promise<void>((resolveReady, rejectReady) => {
      transitioned.stdout.once("data", (data: Buffer) => data.toString().includes("READY") ? resolveReady() : rejectReady(new Error("no READY")));
      transitioned.once("exit", (code) => rejectReady(new Error(`transition exit ${code}`)));
    });
    try {
      const readonly = new Database(path, { readonly: true });
      try { expect(readonly.prepare("SELECT x FROM t").get()).toMatchObject({ x: 1 }); }
      finally { readonly.close(); }
      const rawWriter = spawnSync(process.execPath, ["-e",
        "const D=require('better-sqlite3');const db=new D(process.argv[1]);db.exec('INSERT INTO t VALUES (4)');db.close()", path],
        { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
      expect(rawWriter.status).not.toBe(0);
    } finally {
      transitioned.stdin.end();
      await new Promise<void>((resolveExit) => transitioned.once("exit", () => resolveExit()));
    }
  });

  it("renames a pinned file within its directory without replacing another file", () => {
    const root = join(sandbox, "rename-root");
    mkdirSync(root);
    const source = join(root, "old.db");
    const occupied = join(root, "occupied.db");
    writeFileSync(source, "old-data");
    writeFileSync(occupied, "occupied-data");
    const original = inspectWindowsPath(helper, source);
    const digest = createHash("sha256").update(readFileSync(source)).digest("hex");
    const args = ["rename-probe", root, "old.db", "occupied.db", original.fileId, digest];
    expect(spawnSync(helper.path, args, { windowsHide: true }).status).not.toBe(0);
    expect(readFileSync(occupied, "utf8")).toBe("occupied-data");
    args[3] = "preserved.db";
    const moved = spawnSync(helper.path, args, { windowsHide: true, encoding: "utf8" });
    expect(moved.status, moved.stderr).toBe(0);
    expect(existsSync(source)).toBe(false);
    expect(inspectWindowsPath(helper, join(root, "preserved.db"))).toMatchObject({
      volumeSerial: original.volumeSerial, fileId: original.fileId,
    });
  });

  it("keeps SQLite DB and sidecar handles across moves and read-only verification", async () => {
    const root = join(sandbox, "session-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedSuffix = `.restore-old-${randomUUID()}`;
    mkdirSync(root);
    const oldDb = new Database(join(root, "state.db"));
    oldDb.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1)");
    oldDb.close();
    const stagedDb = new Database(join(root, stagedName));
    stagedDb.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (2)");
    stagedDb.close();
    writeFileSync(join(root, "state.db-wal"), "old-wal");
    writeFileSync(join(root, "state.db-shm"), "old-shm");
    const generation = randomUUID();
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const child = spawn(helper.path, ["session", root, hex("state.db"), hex(stagedName), generation],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const lines: string[] = [];
    let partial = "";
    let resolveLine: ((line: string) => void) | undefined;
    child.stdout.on("data", (chunk: Buffer) => {
      partial += chunk.toString("utf8");
      while (partial.includes("\n")) {
        const end = partial.indexOf("\n");
        const line = partial.slice(0, end).trimEnd();
        partial = partial.slice(end + 1);
        if (resolveLine) { const resolve = resolveLine; resolveLine = undefined; resolve(line); }
        else lines.push(line);
      }
    });
    const nextLine = () => lines.length ? Promise.resolve(lines.shift()!) : new Promise<string>((resolve) => { resolveLine = resolve; });
    const send = async (line: string) => { child.stdin.write(`${line}\n`); return nextLine(); };
    try {
      const ready = (await nextLine()).split("\t");
      expect(ready[0]).toBe("READY");
      expect(ready[1]).toBe(generation);
      const slots = new Map(ready.slice(2).map((entry) => entry.split("=")));
      for (const [slot, from, to] of [
        ["oldDb", "state.db", `state.db${preservedSuffix}`],
        ["oldWal", "state.db-wal", `state.db-wal${preservedSuffix}`],
        ["oldShm", "state.db-shm", `state.db-shm${preservedSuffix}`], ["stagedDb", stagedName, "state.db"],
      ]) {
        const evidence = slots.get(slot)!.split(":");
        const receipt = (await send(["MOVE", slot, hex(from), hex(to), ...evidence].join("\t"))).split("\t");
        expect(receipt.slice(0, 4)).toEqual(["MOVED", generation, String([...slots.keys()].indexOf(slot) + 1), slot]);
        expect(receipt[6]).toBe(receipt[7]);
      }
      expect((await send("VERIFY")).split("\t")[0]).toBe("VERIFY_READY");
      const readonly = new Database(join(root, "state.db"), { readonly: true });
      try { expect(readonly.prepare("SELECT x FROM t").get()).toMatchObject({ x: 2 }); }
      finally { readonly.close(); }
      const writer = spawnSync(process.execPath, ["-e",
        "const D=require('better-sqlite3');const db=new D(process.argv[1]);db.exec('INSERT INTO t VALUES (3)');db.close()",
        join(root, "state.db")], { cwd: process.cwd(), windowsHide: true });
      expect(writer.status).not.toBe(0);
      for (const [slot, from, to] of [
        ["stagedDb", "state.db", stagedName], ["oldShm", `state.db-shm${preservedSuffix}`, "state.db-shm"],
        ["oldWal", `state.db-wal${preservedSuffix}`, "state.db-wal"],
        ["oldDb", `state.db${preservedSuffix}`, "state.db"],
      ]) {
        const evidence = slots.get(slot)!.split(":");
        expect((await send(["MOVE", slot, hex(from), hex(to), ...evidence].join("\t"))).split("\t")[0]).toBe("MOVED");
      }
      expect((await send("CLOSE")).split("\t")[0]).toBe("CLOSED");
    } finally {
      child.stdin.end();
      if (child.exitCode === null) await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
    }
    rmSync(join(root, "state.db-wal"));
    rmSync(join(root, "state.db-shm"));
    const restored = new Database(join(root, "state.db"), { readonly: true });
    try { expect(restored.prepare("SELECT x FROM t").get()).toMatchObject({ x: 1 }); }
    finally { restored.close(); }
  });

  it("fails closed if an absent WAL appears after session READY", async () => {
    const root = join(sandbox, "absent-sidecar-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, "state.db"), "old-db");
    writeFileSync(join(root, stagedName), "staged-db");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const child = spawn(helper.path, ["session", root, hex("state.db"), hex(stagedName), randomUUID()],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const nextLine = stdoutLineReader(child.stdout);
    try {
      expect(await nextLine()).toContain("oldWal=-");
      writeFileSync(join(root, "state.db-wal"), "unowned-wal");
      child.stdin.write("VERIFY\n");
      const [code] = await once(child, "exit") as [number];
      expect(code).toBe(2);
      expect(readFileSync(join(root, "state.db-wal"), "utf8")).toBe("unowned-wal");
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });

  it("does not become READY while raw SQLite owns the DB", () => {
    const root = join(sandbox, "raw-open-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    mkdirSync(root);
    const path = join(root, "state.db");
    const db = new Database(path);
    db.exec("CREATE TABLE t(x INTEGER)");
    writeFileSync(join(root, stagedName), "staged-db");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    try {
      const attempt = spawnSync(helper.path, ["session", root, hex("state.db"), hex(stagedName), randomUUID()],
        { input: "", encoding: "utf8", windowsHide: true, timeout: 5000 });
      expect(attempt.status).toBe(2);
      expect(attempt.stdout).not.toContain("READY");
      expect(db.prepare("SELECT COUNT(*) AS n FROM t").get()).toMatchObject({ n: 0 });
    } finally { db.close(); }
  });

  it("leaves a recoverable preserved DB after a kill cut following MOVE receipt", async () => {
    const root = join(sandbox, "kill-cut-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, "state.db"), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const child = spawn(helper.path, ["session", root, hex("state.db"), hex(stagedName), randomUUID()],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const nextLine = stdoutLineReader(child.stdout);
    try {
      const ready = (await nextLine()).split("\t");
      expect(ready[0]).toBe("READY");
      const snapshot = ready.find((field) => field.startsWith("oldDb="))!.slice("oldDb=".length).split(":");
      child.stdin.write(["MOVE", "oldDb", hex("state.db"), hex(preservedName), ...snapshot].join("\t") + "\n");
      expect(await nextLine()).toContain("MOVED");
      child.kill();
      await once(child, "exit");
      expect(existsSync(join(root, "state.db"))).toBe(false);
      expect(readFileSync(join(root, preservedName), "utf8")).toBe("old-generation");
      expect(readFileSync(join(root, stagedName), "utf8")).toBe("new-generation");
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });

  it("pins an absent-target recovery layout before accepting journal evidence", async () => {
    const root = join(sandbox, "recover-layout-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, "state.db"), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    renameSync(join(root, "state.db"), join(root, preservedName));
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const child = spawn(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), randomUUID()],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const nextLine = stdoutLineReader(child.stdout);
    try {
      const ready = (await nextLine()).split("\t");
      expect(ready[0]).toBe("RECOVERY_READY");
      expect(ready[2]).toBe("1");
      expect(ready.find((field) => field.startsWith("oldDb="))).toContain(hex(preservedName));
      expect(ready.find((field) => field.startsWith("stagedDb="))).toContain(hex(stagedName));
      child.stdin.write("VERIFY\n");
      const [code] = await once(child, "exit") as [number];
      expect(code).toBe(2);
      expect(readFileSync(join(root, preservedName), "utf8")).toBe("old-generation");
      expect(readFileSync(join(root, stagedName), "utf8")).toBe("new-generation");
      expect(existsSync(join(root, "state.db"))).toBe(false);
    } finally { if (child.exitCode === null) child.kill(); }
  });

  it("rolls a pinned partial move back only after an exact recovery acceptance", async () => {
    const root = join(sandbox, "recover-rollback-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, "state.db"), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    renameSync(join(root, "state.db"), join(root, preservedName));
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const generation = randomUUID();
    const child = spawn(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), generation],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const nextLine = stdoutLineReader(child.stdout);
    try {
      const ready = (await nextLine()).split("\t");
      expect(ready.slice(0, 3)).toEqual(["RECOVERY_READY", generation, "1"]);
      child.stdin.write(["ACCEPT", generation, "1", ...ready.slice(3)].join("\t") + "\n");
      expect((await nextLine()).split("\t")).toEqual(["ACCEPTED", generation, "1"]);
      const old = ready.find((field) => field.startsWith("oldDb="))!.split(":").slice(1);
      child.stdin.write(["MOVE", "oldDb", hex(preservedName), hex("state.db"), ...old].join("\t") + "\n");
      expect((await nextLine()).split("\t").slice(0, 4)).toEqual(["MOVED", generation, "2", "oldDb"]);
      child.stdin.write("CLOSE\n");
      expect((await nextLine()).split("\t")).toEqual(["CLOSED", generation, "2"]);
      const [code] = await once(child, "exit") as [number];
      expect(code).toBe(0);
      expect(readFileSync(join(root, "state.db"), "utf8")).toBe("old-generation");
      expect(readFileSync(join(root, stagedName), "utf8")).toBe("new-generation");
    } finally { if (child.exitCode === null) child.kill(); }
  });

  it("rejects an ambiguous recovery target before READY", () => {
    const root = join(sandbox, "recover-ambiguous-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, preservedName), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    writeFileSync(join(root, "state.db"), "unowned");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const result = spawnSync(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), randomUUID()],
      { input: "", encoding: "utf8", windowsHide: true });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("RECOVERY_READY");
    expect(readFileSync(join(root, "state.db"), "utf8")).toBe("unowned");
  });

  it("refuses recovery READY while a raw SQLite owner holds the preserved DB", () => {
    const root = join(sandbox, "recover-raw-owner-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    mkdirSync(root);
    const db = new Database(join(root, preservedName));
    db.exec("CREATE TABLE t(x INTEGER)");
    writeFileSync(join(root, stagedName), "new-generation");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    try {
      const result = spawnSync(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), randomUUID()],
        { input: "", encoding: "utf8", windowsHide: true, timeout: 5000 });
      expect(result.status).toBe(2);
      expect(result.stdout).not.toContain("RECOVERY_READY");
      expect(db.prepare("SELECT COUNT(*) AS n FROM t").get()).toMatchObject({ n: 0 });
    } finally { db.close(); }
  });

  it("refuses duplicated original and preserved WAL identities", () => {
    const root = join(sandbox, "recover-sidecar-duplicate-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    const suffix = preservedName.slice("state.db".length);
    mkdirSync(root);
    writeFileSync(join(root, preservedName), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    writeFileSync(join(root, `state.db-wal${suffix}`), "old-wal");
    writeFileSync(join(root, "state.db-wal"), "unowned-wal");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const result = spawnSync(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), randomUUID()],
      { input: "", encoding: "utf8", windowsHide: true });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("RECOVERY_READY");
    expect(readFileSync(join(root, "state.db-wal"), "utf8")).toBe("unowned-wal");
  });

  it("pins a published new DB and permits read verification after journal acceptance", async () => {
    const root = join(sandbox, "recover-published-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    mkdirSync(root);
    const oldDb = new Database(join(root, "state.db"));
    oldDb.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1)");
    oldDb.close();
    const stagedDb = new Database(join(root, stagedName));
    stagedDb.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (2)");
    stagedDb.close();
    renameSync(join(root, "state.db"), join(root, preservedName));
    renameSync(join(root, stagedName), join(root, "state.db"));
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const generation = randomUUID();
    const child = spawn(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), generation],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const nextLine = stdoutLineReader(child.stdout);
    try {
      const ready = (await nextLine()).split("\t");
      expect(ready.slice(0, 3)).toEqual(["RECOVERY_READY", generation, "2"]);
      child.stdin.write(["ACCEPT", generation, "2", ...ready.slice(3)].join("\t") + "\n");
      expect(await nextLine()).toBe(`ACCEPTED\t${generation}\t2`);
      child.stdin.write("VERIFY\n");
      expect((await nextLine()).split("\t")[0]).toBe("VERIFY_READY");
      const readonly = new Database(join(root, "state.db"), { readonly: true });
      try { expect(readonly.prepare("SELECT x FROM t").get()).toMatchObject({ x: 2 }); }
      finally { readonly.close(); }
      child.stdin.write("CLOSE\n");
      expect(await nextLine()).toBe(`CLOSED\t${generation}\t2`);
      const [code] = await once(child, "exit") as [number];
      expect(code).toBe(0);
      expect(readFileSync(join(root, preservedName)).byteLength).toBeGreaterThan(0);
    } finally { if (child.exitCode === null) child.kill(); }
  });

  it("rejects a MOVE outside the restore-owned name sequence", async () => {
    const root = join(sandbox, "move-name-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, "state.db"), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    const child = spawn(helper.path, ["session", root, hex("state.db"), hex(stagedName), randomUUID()],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const nextLine = stdoutLineReader(child.stdout);
    try {
      const snapshot = (await nextLine()).split("\t")
        .find((field) => field.startsWith("oldDb="))!.slice("oldDb=".length).split(":");
      child.stdin.write(["MOVE", "oldDb", hex("state.db"), hex("unrelated.db"), ...snapshot].join("\t") + "\n");
      const [code] = await once(child, "exit") as [number];
      expect(code).toBe(2);
      expect(readFileSync(join(root, "state.db"), "utf8")).toBe("old-generation");
      expect(existsSync(join(root, "unrelated.db"))).toBe(false);
    } finally { if (child.exitCode === null) child.kill(); }
  });

  it("refuses CLOSE before verification or an explicit full rollback", async () => {
    const root = join(sandbox, "premature-close-root");
    const stagedName = `state.db.restore-${randomUUID()}`;
    mkdirSync(root);
    writeFileSync(join(root, "state.db"), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    const hex = (name: string) => Buffer.from(name, "utf16le").toString("hex");
    for (const moveFirst of [false, true]) {
      const child = spawn(helper.path, ["session", root, hex("state.db"), hex(stagedName), randomUUID()],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      const nextLine = stdoutLineReader(child.stdout);
      try {
        const ready = (await nextLine()).split("\t");
        expect(ready[0]).toBe("READY");
        if (moveFirst) {
          const snapshot = ready.find((field) => field.startsWith("oldDb="))!.slice("oldDb=".length).split(":");
          child.stdin.write(["MOVE", "oldDb", hex("state.db"),
            hex(`state.db.restore-old-${randomUUID()}`), ...snapshot].join("\t") + "\n");
          expect(await nextLine()).toContain("MOVED");
        }
        child.stdin.write("CLOSE\n");
        const [code] = await once(child, "exit") as [number];
        expect(code).toBe(2);
        if (moveFirst) break;
      } finally { if (child.exitCode === null) child.kill(); }
    }
    expect(readFileSync(join(root, stagedName), "utf8")).toBe("new-generation");
  });
});
