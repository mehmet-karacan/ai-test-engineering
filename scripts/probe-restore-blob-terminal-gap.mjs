/** Windows Temp cut between blob verification and terminal journal fsync. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, closeSync,
  readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectWindowsPath, packagedWindowsFileHelper,
  verifyWindowsOwnedFile } from "../dist/discovery/windows-file-bridge.js";
import { startWindowsBlobVerifySession } from "../dist/storage/windows-blob-verify-session.js";

assert.equal(process.platform, "win32");
const top = mkdtempSync(join(tmpdir(), "aitest-blob-terminal-gap-"));
let session;
try {
  const root = join(top, "artifacts");
  const nested = join(root, "blobs");
  const moved = join(root, "blobs-moved");
  const path = join(nested, "x.bin");
  mkdirSync(nested, { recursive: true });
  writeFileSync(path, "expected bytes");
  const helper = packagedWindowsFileHelper();
  const rootId = inspectWindowsPath(helper, root);
  const sha = createHash("sha256").update("expected bytes").digest("hex");
  const old = verifyWindowsOwnedFile(helper, root, "blobs\\x.bin", rootId, { bytes: 14, sha256: sha });
  renameSync(nested, moved);
  mkdirSync(nested);
  writeFileSync(path, "wrong replacement");
  assert.equal(inspectWindowsPath(helper, root).fileId, rootId.fileId);
  assert.equal(readFileSync(path, "utf8"), "wrong replacement");
  process.stdout.write("RED: one-shot verify closed; nested replacement before terminal is accepted by root FileId\n");
  rmSync(nested, { recursive: true });
  renameSync(moved, nested);
  session = await startWindowsBlobVerifySession(helper, root, rootId);
  await session.verify("blobs/x.bin", old);
  await session.seal();
  assert.ok(session.pid > 0);
  execFileSync("taskkill", ["/F", "/PID", String(session.pid)], { stdio: "ignore" });
  renameSync(nested, moved);
  mkdirSync(nested);
  writeFileSync(path, "wrong after helper kill");
  const redJournal = join(top, "killed-terminal.journal");
  const redFd = openSync(redJournal, "a");
  try { writeFileSync(redFd, "COMMITTED\n"); fsyncSync(redFd); }
  finally { closeSync(redFd); }
  assert.equal(readFileSync(path, "utf8"), "wrong after helper kill");
  process.stdout.write("RED: taskkill after SEALED releases handles before JS terminal fsync\n");
  session = undefined;
  rmSync(nested, { recursive: true });
  renameSync(moved, nested);
  const killedJournal = join(top, "native-killed.journal");
  writeFileSync(killedJournal, "VERIFIED\n");
  session = await startWindowsBlobVerifySession(helper, root, rootId);
  await session.verify("blobs/x.bin", old);
  await session.seal();
  execFileSync("taskkill", ["/F", "/PID", String(session.pid)], { stdio: "ignore" });
  let denied = false;
  try {
    const journalId = inspectWindowsPath(helper, killedJournal);
    const journalSha = createHash("sha256").update(readFileSync(killedJournal)).digest("hex");
    await session.commit(killedJournal, { ...journalId, bytes: 9, sha256: journalSha }, "COMMITTED\n");
  } catch { denied = true; }
  assert.equal(denied, true, "dead helper must not acknowledge terminal commit");
  assert.equal(readFileSync(killedJournal, "utf8"), "VERIFIED\n");
  session = undefined;
  process.stdout.write("GREEN: taskkill before native COMMIT leaves journal nonterminal\n");
  session = await startWindowsBlobVerifySession(helper, root, rootId);
  await session.verify("blobs/x.bin", old);
  await session.seal();
  let blocked = false;
  try { renameSync(nested, moved); }
  catch (error) {
    if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
    blocked = true;
  }
  assert.equal(blocked, true, "nested directory rename must fail while verified file and ancestors stay pinned");
  const journal = join(top, "terminal.journal");
  writeFileSync(journal, "VERIFIED\n");
  const journalId = inspectWindowsPath(helper, journal);
  const journalSha = createHash("sha256").update(readFileSync(journal)).digest("hex");
  await session.commit(journal, { ...journalId, bytes: 9, sha256: journalSha }, "COMMITTED\n");
  await session.close(); session = undefined;
  assert.equal(readFileSync(journal, "utf8"), "VERIFIED\nCOMMITTED\n");
  assert.equal(existsSync(path), true);
  assert.equal(readFileSync(path, "utf8"), "expected bytes");
  process.stdout.write("GREEN: held native blob/ancestor handles denied nested swap through terminal fsync\n");
} finally {
  await session?.abort();
  assert.ok(resolve(top).startsWith(resolve(tmpdir())));
  rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
