import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it } from "vitest";
import { RestoreSessionLines } from "../../src/storage/windows-restore-session.js";

describe("Windows restore session response drain", () => {
  it("accepts a complete CLOSE response drained after child exit", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter; stderr: EventEmitter; kill: () => boolean;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    const lines = new RestoreSessionLines(child as unknown as ChildProcessWithoutNullStreams);
    const response = lines.next();
    child.emit("exit", 0, null);
    child.stdout.emit("data", Buffer.from("CLOSED\tgeneration\t2\n"));
    child.emit("close", 0, null);
    await expect(response).resolves.toBe("CLOSED\tgeneration\t2");
  });
});
