import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Storage } from "../../src/storage/storage.js";
import { ArtifactStore } from "../../src/storage/artifact-store.js";
import { ProjectRepository } from "../../src/storage/project-repository.js";
import { JobRepository } from "../../src/storage/job-repository.js";
import { defaultRetentionPolicy, gcDryRun } from "../../src/storage/retention-gc.js";

describe.skipIf(process.platform !== "win32")("WN21 run output receipt hard-kill", () => {
  it("leaves a durable PENDING receipt when killed after blob publication", async () => {
    const root = mkdtempSync(join(tmpdir(), "aitest-wn21-receipt-"));
    const dbPath = join(root, "state.db");
    const marker = join(root, "published.marker");
    const storage = new Storage({ dbPath });
    storage.migrate();
    const { location } = new ProjectRepository(storage.db).ensureLocation(root, "wn21-receipt", null);
    const jobId = new JobRepository(storage.db).createJob({ locationId: location.id, requestDigest: "wn21-receipt" }).id;
    storage.close();
    let workerPid: number | undefined;
    try {
      const worker = spawn(process.execPath, [fileURLToPath(new URL("../fixtures/wn-run-output-receipt-parent.mjs", import.meta.url)), root, jobId],
        { stdio: "ignore", windowsHide: true });
      workerPid = worker.pid;
      const closed = new Promise<void>((done) => worker.once("close", () => done()));
      for (let i = 0; i < 200 && !existsSync(marker); i += 1) await delay(25);
      expect(existsSync(marker)).toBe(true);
      expect(workerPid).toBeTypeOf("number");
      expect(spawnSync("taskkill", ["/F", "/PID", String(workerPid)], { encoding: "utf8" }).status).toBe(0);
      await Promise.race([closed, delay(5000).then(() => { throw new Error("receipt worker did not close"); })]);
      workerPid = undefined;
      const reopened = new Storage({ dbPath });
      try {
        const row = reopened.db.prepare<[string], { sha256: string; status: string; relative_store_path: string }>(
          "SELECT sha256, status, relative_store_path FROM artifacts WHERE job_id = ? AND kind = 'run_output_terminal'",
        ).get(jobId);
        expect(row?.status).toBe("PENDING");
        expect(row?.sha256).toBe(readFileSync(marker, "utf8"));
        expect(new ArtifactStore({ root: join(root, "artifacts") }).verify(row!.sha256)).toBe(true);
        expect(gcDryRun(reopened.db, { ...defaultRetentionPolicy(), rejected_ttl_ms: 0 }).candidates)
          .not.toContainEqual(expect.objectContaining({ sha256: row!.sha256 }));
        expect(reopened.db.prepare<[string], { count: number }>(
          "SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND event_type = 'run_output_truncated_terminal'",
        ).get(jobId)!.count).toBe(0);
      } finally { reopened.close(); }
    } finally {
      if (workerPid) spawnSync("taskkill", ["/F", "/PID", String(workerPid)], { encoding: "utf8" });
      const target = resolve(root);
      const inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith("..") && !isAbsolute(inside) && basename(target).startsWith("aitest-wn21-receipt-")) {
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  }, 30000);
});
