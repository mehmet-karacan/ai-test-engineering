import { describe, expect, it } from "vitest";
import { cleanupOwnedProcessControlRoot } from "../../src/runners/windows-process-supervisor.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("S02 Windows control-root cleanup", () => {
  it("retries a transient Windows sharing failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-owned-process-fixture-"));
    let calls = 0;
    const result = await cleanupOwnedProcessControlRoot(root, () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("busy"), { code: "EPERM" });
    });
    expect(result).toBe(true);
    expect(calls).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an untrusted cleanup failure after the bounded retry budget", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-owned-process-fixture-"));
    let calls = 0;
    const result = await cleanupOwnedProcessControlRoot(root, () => {
      calls += 1;
      throw Object.assign(new Error("busy"), { code: "EPERM" });
    });
    expect(result).toBe(false);
    expect(calls).toBe(12);
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses recursive cleanup outside its owned Temp prefix", async () => {
    expect(await cleanupOwnedProcessControlRoot(tmpdir())).toBe(false);
    expect(await cleanupOwnedProcessControlRoot(join(tmpdir(), "unrelated"))).toBe(false);
  });
});
