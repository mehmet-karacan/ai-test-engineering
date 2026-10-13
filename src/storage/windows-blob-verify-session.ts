/** Hold every published blob and ancestor handle through the terminal restore fsync. */
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { AppError } from "../domain/errors.js";
import { assertTrustedWindowsFileHelper, type WindowsCopyResult, type WindowsFileHelperSpec,
  type WindowsFileIdentity } from "../discovery/windows-file-bridge.js";
import { RestoreSessionLines } from "./windows-restore-session.js";

export interface BlobVerifySession {
  verify(relativePath: string, expected: WindowsCopyResult): Promise<void>;
  seal(): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

function protocol(reason: string): AppError {
  return new AppError("BLOCKED_ISOLATION", `Blob verify session: ${reason}`, {
    reason_code: "WINDOWS_BLOB_VERIFY_SESSION_PROTOCOL",
  });
}

export async function startWindowsBlobVerifySession(helper: WindowsFileHelperSpec, root: string,
  expectedRoot: WindowsFileIdentity): Promise<BlobVerifySession> {
  assertTrustedWindowsFileHelper(helper);
  if (!isAbsolute(root) || !/^[a-f0-9]{16}$/u.test(expectedRoot.volumeSerial) ||
      !/^[a-f0-9]{32}$/u.test(expectedRoot.fileId)) throw protocol("invalid root identity");
  const child = spawn(helper.path, ["blob-verify-session", root, expectedRoot.volumeSerial, expectedRoot.fileId],
    { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
  const lines = new RestoreSessionLines(child);
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal })));
  let count = 0;
  let sealed = false;
  let closed = false;
  let busy = false;
  const send = async (command: string): Promise<string> => {
    if (busy || closed) throw protocol("session unavailable");
    busy = true;
    try {
      await new Promise<void>((resolve, reject) => child.stdin.write(`${command}\n`,
        (error) => error ? reject(error) : resolve()));
      return await lines.next();
    } catch (error) {
      closed = true;
      child.kill();
      throw error;
    } finally { busy = false; }
  };
  try { if (await lines.next() !== "READY") throw protocol("invalid READY"); }
  catch (error) { closed = true; child.kill(); throw error; }
  return {
    async verify(relativePath, expected) {
      if (sealed || count >= 4096 || !relativePath || isAbsolute(relativePath) ||
          relativePath.split("/").some((part) => !part || part === "." || part === ".." || /[\\:\t\r\n]/u.test(part)) ||
          !/^[a-f0-9]{16}$/u.test(expected.volumeSerial) || !/^[a-f0-9]{32}$/u.test(expected.fileId) ||
          !Number.isSafeInteger(expected.bytes) || expected.bytes < 0 ||
          !/^[a-f0-9]{64}$/u.test(expected.sha256)) throw protocol("invalid VERIFY request");
      const response = (await send(`VERIFY\t${Buffer.from(relativePath, "utf16le").toString("hex")}\t` +
        `${expected.volumeSerial}\t${expected.fileId}\t${expected.bytes}\t${expected.sha256}`)).split("\t");
      if (response.length !== 6 || response[0] !== "VERIFIED" || response[1] !== String(count + 1) ||
          response[2] !== expected.volumeSerial || response[3] !== expected.fileId ||
          response[4] !== String(expected.bytes) || response[5] !== expected.sha256) throw protocol("invalid VERIFIED receipt");
      count++;
    },
    async seal() {
      if (sealed || await send(`SEAL\t${count}`) !== "SEALED") throw protocol("invalid SEAL response");
      sealed = true;
    },
    async close() {
      try {
        if (!sealed || await send("CLOSE") !== "CLOSED") throw protocol("invalid CLOSE response");
        closed = true;
        const result = await exit;
        if (result.code !== 0 || result.signal) throw protocol("child failed after CLOSE");
      } catch (error) {
        closed = true;
        child.kill();
        await exit;
        throw error;
      }
    },
    async abort() {
      if (closed) return;
      try { await send("ABORT"); }
      catch { child.kill(); }
      closed = true;
      await exit;
    },
  };
}
