import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { inspectWindowsPath, copyWindowsFile } from "../../src/discovery/windows-file-bridge.js";

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
  });
});
