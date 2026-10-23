import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
import { WorkerServerManager } from "../../src/workers/opencode/worker-server-manager.js";

describe("owned worker shutdown", () => {
  it("waits for taskkill completion before the next candidate can reuse the port", async () => {
    const killer = new EventEmitter();
    spawn.mockReturnValue(killer);
    const manager = new WorkerServerManager({ opencodeExecutable: process.execPath, port: 14660, startupTimeoutMs: 1000, workDir: process.cwd() });
    const child = Object.assign(new EventEmitter(), { pid: 1234567, kill: vi.fn() });
    (manager as unknown as { server: ChildProcess | null }).server = child as unknown as ChildProcess;
    const stopped = manager.stopOwnedServer();
    expect(stopped).toBeInstanceOf(Promise);
    let finished = false;
    void stopped.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(spawn).toHaveBeenCalledWith("taskkill", ["/pid", "1234567", "/T", "/F"], expect.objectContaining({ windowsHide: true, shell: false }));
    killer.emit("close", 0);
    await stopped;
    expect(finished).toBe(true);
    expect((manager as unknown as { server: ChildProcess | null }).server).toBeNull();
  });
});
