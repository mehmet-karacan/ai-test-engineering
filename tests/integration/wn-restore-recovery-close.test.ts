import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";

describe.skipIf(process.platform !== "win32")("S01 native recovery close", () => {
  it("accepts a proven old layout after rollback completed before terminal journal fsync", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-restore-recovery-close-"));
    const stagedName = `state.db.restore-${randomUUID()}`;
    const preservedName = `state.db.restore-old-${randomUUID()}`;
    const hex = (value: string) => Buffer.from(value, "utf16le").toString("hex");
    const generation = randomUUID();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "state.db"), "old-generation");
    writeFileSync(join(root, stagedName), "new-generation");
    const helper = packagedWindowsFileHelper();
    const child = spawn(helper.path, ["recover-session", root, hex("state.db"), hex(stagedName), hex(preservedName), generation],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
    const next = async () => {
      const result = await lines.next();
      if (result.done) throw new Error("native recovery response missing");
      return result.value;
    };
    try {
      const ready = (await next()).split("\t");
      expect(ready.slice(0, 3)).toEqual(["RECOVERY_READY", generation, "0"]);
      child.stdin.write(["ACCEPT", generation, "0", ...ready.slice(3)].join("\t") + "\n");
      expect(await next()).toBe(`ACCEPTED\t${generation}\t0`);
      const closed = once(child, "close") as Promise<[number]>;
      child.stdin.write("CLOSE\n");
      expect(await next()).toBe(`CLOSED\t${generation}\t0`);
      expect((await closed)[0]).toBe(0);
      expect(readFileSync(join(root, "state.db"), "utf8")).toBe("old-generation");
    } finally {
      if (child.exitCode === null) child.kill();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
