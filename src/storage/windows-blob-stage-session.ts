/** Copy into a delete-on-close file; publish its hardlink only after journal receipt fsync. */
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { AppError } from "../domain/errors.js";
import { assertTrustedWindowsFileHelper, type WindowsCopyResult, type WindowsFileHelperSpec,
  type WindowsFileIdentity } from "../discovery/windows-file-bridge.js";
import { RestoreSessionLines } from "./windows-restore-session.js";

export interface BlobStageSession {
  readonly pid: number;
  copy(): Promise<WindowsCopyResult>;
  link(expected: WindowsCopyResult): Promise<void>;
  abort(): Promise<void>;
}

function protocol(reason: string): AppError {
  return new AppError("BLOCKED_ISOLATION", `Blob stage session: ${reason}`, {
    reason_code: "WINDOWS_BLOB_STAGE_SESSION_PROTOCOL",
  });
}

export async function startWindowsBlobStageSession(helper: WindowsFileHelperSpec,
  sourceRoot: string, sourceRelative: string, targetRoot: string, stageRelative: string,
  expectedSourceRoot: WindowsFileIdentity, expectedTargetRoot: WindowsFileIdentity): Promise<BlobStageSession> {
  assertTrustedWindowsFileHelper(helper);
  if (!isAbsolute(sourceRoot) || !isAbsolute(targetRoot) ||
      !sourceRelative || !stageRelative || isAbsolute(sourceRelative) || isAbsolute(stageRelative) ||
      !/^[a-f0-9]{16}$/u.test(expectedSourceRoot.volumeSerial) ||
      !/^[a-f0-9]{32}$/u.test(expectedSourceRoot.fileId) ||
      !/^[a-f0-9]{16}$/u.test(expectedTargetRoot.volumeSerial) ||
      !/^[a-f0-9]{32}$/u.test(expectedTargetRoot.fileId)) throw protocol("invalid roots");
  const child = spawn(helper.path, ["copy-stage-session", sourceRoot, sourceRelative,
    targetRoot, stageRelative, expectedSourceRoot.volumeSerial, expectedSourceRoot.fileId,
    expectedTargetRoot.volumeSerial, expectedTargetRoot.fileId],
  { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
  child.stdin.on("error", () => { /* write callback or closed child reports protocol failure. */ });
  const lines = new RestoreSessionLines(child);
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal })));
  let copied: WindowsCopyResult | undefined;
  let closed = false;
  const send = async (command: string): Promise<string> => {
    if (closed) throw protocol("session closed");
    try {
      await new Promise<void>((resolve, reject) => child.stdin.write(`${command}\n`,
        (error) => error ? reject(error) : resolve()));
      return await lines.next();
    } catch (error) { closed = true; child.kill(); throw error; }
  };
  try { if (await lines.next() !== "COPY_READY") throw protocol("invalid READY"); }
  catch (error) { closed = true; child.kill(); throw error; }
  return {
    pid: child.pid ?? 0,
    async copy() {
      if (copied) throw protocol("duplicate COPY");
      const fields = (await send("COPY")).split("\t");
      if (fields.length !== 5 || fields[0] !== "COPIED" ||
          !/^[a-f0-9]{16}$/u.test(fields[1] ?? "") ||
          !/^[a-f0-9]{32}$/u.test(fields[2] ?? "") ||
          !/^\d+$/u.test(fields[3] ?? "") || !/^[a-f0-9]{64}$/u.test(fields[4] ?? "")) {
        throw protocol("invalid COPIED receipt");
      }
      const bytes = Number(fields[3]);
      if (!Number.isSafeInteger(bytes)) throw protocol("invalid byte count");
      copied = { volumeSerial: fields[1]!, fileId: fields[2]!, linkCount: 1, bytes, sha256: fields[4]! };
      return copied;
    },
    async link(expected) {
      if (!copied || JSON.stringify(expected) !== JSON.stringify(copied)) throw protocol("unrecorded COPY");
      if (await send(`LINK\t${expected.volumeSerial}\t${expected.fileId}\t${expected.bytes}\t${expected.sha256}`) !==
          "LINKED") throw protocol("invalid LINKED receipt");
      closed = true;
      const result = await exit;
      if (result.code !== 0 || result.signal) throw protocol("child failed after LINKED");
    },
    async abort() {
      if (closed) return;
      closed = true;
      child.kill();
      await exit;
    },
  };
}
