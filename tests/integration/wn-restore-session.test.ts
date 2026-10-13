import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";
import { captureExpectedWindowsRestoreFile, startWindowsRestoreMoveSession } from "../../src/storage/windows-restore-session.js";

describe("S01 native restore session adapter", () => {
  it("pins old and staged SQLite files through rename and read verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn-restore-adapter-"));
    const helper = packagedWindowsFileHelper();
    const name = "state.db";
    const stagedName = `${name}.restore-${randomUUID()}`;
    const preservedSuffix = `.restore-old-${randomUUID()}`;
    const target = join(root, name);
    const staged = join(root, stagedName);
    let session: Awaited<ReturnType<typeof startWindowsRestoreMoveSession>> | undefined;
    try {
      mkdirSync(root, { recursive: true });
      const old = new Database(target);
      old.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1)");
      old.close();
      const next = new Database(staged);
      next.exec("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (2)");
      next.close();
      session = await startWindowsRestoreMoveSession(helper, { dbDirectory: root, dbName: name, stagedName,
        preservedSuffix, generation: randomUUID(), expected: {
          oldDb: captureExpectedWindowsRestoreFile(helper, target),
          stagedDb: captureExpectedWindowsRestoreFile(helper, staged),
        } });
      const oldReceipt = await session.renameOwned("oldDb", `${name}${preservedSuffix}`);
      expect(oldReceipt.before.fileId).toBe(oldReceipt.after.fileId);
      const newReceipt = await session.renameOwned("stagedDb", name);
      expect(newReceipt.sequence).toBe(2);
      await session.enterReadVerify();
      const readonly = new Database(target, { readonly: true });
      try { expect(readonly.prepare("SELECT x FROM t").get()).toMatchObject({ x: 2 }); }
      finally { readonly.close(); }
      await session.close();
      session = undefined;
      expect(existsSync(staged)).toBe(false);
      const preserved = new Database(`${target}${preservedSuffix}`, { readonly: true });
      try { expect(preserved.prepare("SELECT x FROM t").get()).toMatchObject({ x: 1 }); }
      finally { preserved.close(); }
    } finally {
      await session?.close().catch(() => undefined);
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
