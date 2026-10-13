import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { processPinPaths, WindowsProcessSupervisor } from "../../src/runners/windows-process-supervisor.js";

async function runHelper(args: string[]): Promise<number | null> {
  const child = spawn(resolve("native/bin/windows-process-helper.exe"), args, { stdio: ["pipe", "pipe", "pipe"] });
  return await new Promise((resolveDone, reject) => {
    child.once("error", reject);
    child.once("close", resolveDone);
  });
}

describe.skipIf(process.platform !== "win32")("WN15 native manifest pin transport", () => {
  it("accepts a verified large manifest and refuses changed bytes before CreateProcess", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-manifest-helper-"));
    try {
      const cmd = join(process.env.SystemRoot!, "System32", "cmd.exe");
      const batch = join(root, "mvn.cmd");
      const sentinel = join(root, "executed.txt");
      writeFileSync(batch, `@echo off\r\necho ran>"${sentinel}"\r\n`);
      const command = `"${cmd}" /d /s /v:off /c ""${batch}""`;
      const digest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
      const manifest = join(root, "pins.txt");
      const pins = Array.from({ length: 260 }, (_, index) => {
        const path = join(root, `maven-library-${index}.jar`);
        writeFileSync(path, `library-${index}`);
        return `${digest(path)}\t${path}\n`;
      }).join("") + `${digest(batch)}\t${batch}\n`;
      expect(pins.length).toBeGreaterThan(32767);
      writeFileSync(manifest, pins);
      const approvedHash = digest(manifest);
      const firstStatus = join(root, "first.json");
      const first = await runHelper([firstStatus, root, cmd, command, "@manifest", approvedHash, manifest]);
      expect(first).toBe(0);
      expect(JSON.parse(readFileSync(firstStatus, "utf8"))).toMatchObject({ kind: "exited", exit_code: 0 });
      rmSync(sentinel);
      writeFileSync(manifest, pins.replace(/^./u, "0"));
      const secondStatus = join(root, "second.json");
      const second = await runHelper([secondStatus, root, cmd, command, "@manifest", approvedHash, manifest]);
      expect(second).toBe(102);
      expect(JSON.parse(readFileSync(secondStatus, "utf8"))).toMatchObject({ kind: "pin_mismatch" });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally {
      const target = resolve(root);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("aitest-wn-manifest-helper-")) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  }, 30000);

  it("transports a large frozen snapshot and refuses an absent config before child launch", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-manifest-helper-"));
    try {
      const batch = join(root, "mvn.cmd");
      const sentinel = join(root, "executed.txt");
      writeFileSync(batch, `@echo off\r\necho ran>"${sentinel}"\r\n`);
      const plan = { executable: batch, cwd: root, argv: [], timeoutMs: 15000,
        env: { SystemRoot: process.env.SystemRoot, Path: process.env.Path } };
      const digest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
      const required = processPinPaths(plan).map((path) => ({ path, sha256: path === batch ? digest(path) : null }));
      const extra = Array.from({ length: 260 }, () => ({ path: batch, sha256: digest(batch) }));
      // Extras must be unique. The manifest transport remains larger than the
      // Windows command line even though the child is refused by a null pin.
      for (let i = 0; i < extra.length; i += 1) {
        extra[i]!.path = join(root, `runtime-${i}.dll`);
        writeFileSync(extra[i]!.path, `runtime-${i}`);
        extra[i]!.sha256 = digest(extra[i]!.path);
      }
      expect(Buffer.byteLength([...required, ...extra].map((pin) => `${pin.sha256 ?? "-"}\t${pin.path}\n`).join(""))).toBeGreaterThan(32767);
      const result = await new WindowsProcessSupervisor().run({ ...plan, pinnedInputs: [...required, ...extra] });
      expect(result).toMatchObject({ status: "spawn_error", errorCode: "pin_unavailable", preSpawnNoChild: true, ownedTreeDrained: true });
      expect(() => readFileSync(sentinel)).toThrow();
    } finally {
      const target = resolve(root);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("aitest-wn-manifest-helper-")) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  }, 30000);
});
