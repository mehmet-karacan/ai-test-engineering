import { afterAll } from "vitest";
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const LOCK_ACQUIRE_TIMEOUT_MS = 20 * 60 * 1000;

type LockOwner = { pid: number; token: string; created_at: number; label: string };

function lockPath(): string {
  const project = createHash("sha256").update(resolve(process.cwd()).toLowerCase()).digest("hex").slice(0, 16);
  return join(tmpdir(), `aitest-windows-native-${project}.lock`);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(path: string): LockOwner | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LockOwner>;
    if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid) || typeof parsed.token !== "string" ||
        typeof parsed.created_at !== "number" || typeof parsed.label !== "string") return undefined;
    return parsed as LockOwner;
  } catch {
    return undefined;
  }
}

function sleepSync(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function acquire(label: string): () => void {
  const path = lockPath();
  const started = Date.now();
  const token = randomUUID();
  for (;;) {
    let fd: number | undefined;
    try {
      fd = openSync(path, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, token, created_at: Date.now(), label }), "utf8");
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try { closeSync(fd!); } catch { /* process teardown may have closed it */ }
        if (readOwner(path)?.token === token) {
          try { unlinkSync(path); } catch { /* another teardown may have removed it */ }
        }
      };
    } catch (error) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* best effort */ }
      }
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new Error(`Windows native test lock failed (${label})`, { cause: error });
      }
      const owner = readOwner(path);
      let stale = false;
      try {
        statSync(path);
        stale = !owner || !processAlive(owner.pid);
      } catch { stale = true; }
      if (stale) {
        try { unlinkSync(path); } catch { /* the owner or another waiter won the race */ }
        continue;
      }
      if (Date.now() - started >= LOCK_ACQUIRE_TIMEOUT_MS) {
        throw new Error(`Windows native test lock timeout (${label})`, { cause: error });
      }
      sleepSync(100);
    }
  }
}

/** Serialize process-heavy Windows native integration files across Vitest workers. */
export function registerWindowsNativeTestLock(label: string): void {
  if (process.platform !== "win32") return;
  const release = acquire(label);
  afterAll(release);
}
