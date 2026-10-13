import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { packagedWindowsFileHelper } from "../../src/discovery/windows-file-bridge.js";
import { captureExpectedWindowsRestoreFile } from "../../src/storage/windows-restore-session.js";
import { startWindowsRestoreRecoverySession } from "../../src/storage/windows-restore-recovery-session.js";
import { appendRestorePhase, captureRestoreEvidence, journalPathForDb, readRestoreJournal } from "../../src/storage/restore-journal.js";
import type { RestoreJournalRecord } from "../../src/storage/restore-journal.js";
import { Storage } from "../../src/storage/storage.js";
import { acquireRestoreDbLock } from "../../src/storage/maintenance-lock.js";
import Database from "better-sqlite3";

describe.skipIf(process.platform !== "win32")("S01 native recovery close", () => {
  it.each(["forward-unreceipted", "reverse-unreceipted", "terminal-fsync", "startup-lock"])("reopens old SQLite after %s move", async (cut) => {
    const root = mkdtempSync(join(tmpdir(), "wn-restore-recovery-startup-"));
    const targetDbPath = join(root, "state.db");
    const stagedDbPath = `${targetDbPath}.restore-${randomUUID()}`;
    const preservedDbPath = `${targetDbPath}.restore-old-${randomUUID()}`;
    const artifactRoot = join(root, "artifacts");
    const manifestPath = join(root, "manifest.json");
    const schema = "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES(7); CREATE TABLE test_jobs(id TEXT PRIMARY KEY, lifecycle TEXT NOT NULL); CREATE TABLE artifacts(id TEXT PRIMARY KEY, job_id TEXT REFERENCES test_jobs(id), relative_store_path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, status TEXT NOT NULL);";
    let opened: Storage | undefined;
    try {
      mkdirSync(artifactRoot);
      writeFileSync(manifestPath, "{}");
      for (const [path, id] of [[targetDbPath, "old"], [stagedDbPath, "new"]]) {
        const db = new Database(path);
        db.exec(schema);
        db.prepare("INSERT INTO test_jobs VALUES (?, 'COMPLETED')").run(id);
        db.close();
      }
      const helper = packagedWindowsFileHelper();
      const generation = randomUUID();
      const oldDb = captureExpectedWindowsRestoreFile(helper, targetDbPath);
      const stagedDb = captureExpectedWindowsRestoreFile(helper, stagedDbPath);
      const base: RestoreJournalRecord = { formatVersion: 2, generation, phase: "PREPARED",
        targetDbPath, artifactRoot, stagedDbPath, preservedDbPath, publishedBlobs: [],
        moveReceipts: [], nativeInitial: { oldDb, oldWal: null, oldShm: null, stagedDb },
        evidence: captureRestoreEvidence(targetDbPath, stagedDbPath, manifestPath, []) };
      const journalPath = journalPathForDb(targetDbPath);
      appendRestorePhase(journalPath, base);
      appendRestorePhase(journalPath, { ...base, phase: "BLOBS_READY" });
      renameSync(targetDbPath, preservedDbPath);
      if (cut === "reverse-unreceipted") {
        appendRestorePhase(journalPath, { ...base, phase: "RECOVERING", recoveryBaseCount: 1, recoveryReceipts: [] });
        renameSync(preservedDbPath, targetDbPath);
      }
      if (cut === "terminal-fsync") {
        const pausePath = join(root, "pause-terminal.cjs");
        writeFileSync(pausePath, `const fs=require("node:fs"); const {syncBuiltinESMExports}=require("node:module");
          let phase=""; const write=fs.writeFileSync; fs.writeFileSync=(...args)=>{const result=write(...args);
            if(typeof args[1]==="string") try{phase=JSON.parse(JSON.parse(args[1]).json).phase??phase}catch{} return result};
          const sync=fs.fsyncSync; fs.fsyncSync=(fd)=>{const result=sync(fd); if(phase==="ROLLED_BACK"){
            process.stdout.write("HALT\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000)} return result};
          syncBuiltinESMExports();`);
        const workerPath = fileURLToPath(new URL("../../scripts/restore-recovery-worker.mjs", import.meta.url));
        const worker = spawn(process.execPath, ["--require", pausePath, workerPath, targetDbPath],
          { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let stderr = "";
        worker.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        try {
          await new Promise<void>((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`worker terminal timeout: ${stderr}`)), 30_000);
            worker.stdout.on("data", (chunk) => { if (chunk.toString().includes("HALT")) { clearTimeout(timer); done(); } });
            worker.once("exit", (code) => { clearTimeout(timer); fail(new Error(`worker exited ${code}: ${stderr}`)); });
          });
          const writer = spawnSync(process.execPath, ["-e", `const Database=require("better-sqlite3");
            const db=new Database(process.argv[1]); db.pragma("busy_timeout=0");
            db.prepare("INSERT INTO test_jobs VALUES ('racing-writer','COMPLETED')").run(); db.close();`, targetDbPath],
          { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });
          expect(writer.status).not.toBe(0);
        } finally {
          if (worker.exitCode === null && worker.pid) spawnSync("taskkill", ["/F", "/PID", String(worker.pid)]);
          if (worker.exitCode === null) await once(worker, "exit").catch(() => undefined);
        }
      }
      if (cut === "startup-lock") {
        const pausePath = join(root, "pause-startup.cjs");
        writeFileSync(pausePath, `const fs=require("node:fs"); const {syncBuiltinESMExports}=require("node:module");
          let terminalReads=0; const read=fs.readFileSync; fs.readFileSync=(path,...args)=>{
            const result=read(path,...args);
            if(typeof path==="string" && path.endsWith(".restore-journal.jsonl") &&
               result.toString().includes("ROLLED_BACK") && ++terminalReads===2){
              process.stdout.write("HALT\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000)}
            return result}; syncBuiltinESMExports();`);
        const storageUrl = new URL("../../dist/storage/storage.js", import.meta.url).href;
        const startup = spawn(process.execPath, ["--require", pausePath, "-e",
          `import(process.argv[1]).then(({Storage})=>{const s=new Storage({dbPath:process.argv[2]});s.close()})`,
          storageUrl, targetDbPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let stderr = "";
        startup.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        try {
          await new Promise<void>((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`startup fence timeout: ${stderr}`)), 30_000);
            startup.stdout.on("data", (chunk) => { if (chunk.toString().includes("HALT")) { clearTimeout(timer); done(); } });
            startup.once("exit", (code) => { clearTimeout(timer); fail(new Error(`startup exited ${code}: ${stderr}`)); });
          });
          expect(() => { const release = acquireRestoreDbLock(targetDbPath); release(); })
            .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason_code: "MAINTENANCE_BUSY_OR_STALE" }) }));
        } finally {
          if (startup.exitCode === null && startup.pid) spawnSync("taskkill", ["/F", "/PID", String(startup.pid)]);
          if (startup.exitCode === null) await once(startup, "exit").catch(() => undefined);
        }
      }
      opened = new Storage({ dbPath: targetDbPath });
      expect(opened.db.prepare("SELECT id FROM test_jobs").all()).toEqual([{ id: "old" }]);
      const last = readRestoreJournal(journalPath);
      expect(last?.phase).toBe("ROLLED_BACK");
      expect(last?.recoveryReceipts).toHaveLength(1);
      expect(last?.recoveryReceipts?.[0]?.evidence).toBe(cut === "reverse-unreceipted" ? "RECOVERY_READY" : "MOVED");
    } finally {
      opened?.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it("validates pinned READY, ACCEPTs and rolls a preserved DB back", async () => {
    const root = mkdtempSync(join(tmpdir(), "wn-restore-recovery-adapter-"));
    const targetDbPath = join(root, "state.db");
    const stagedDbPath = `${targetDbPath}.restore-${randomUUID()}`;
    const preservedDbPath = `${targetDbPath}.restore-old-${randomUUID()}`;
    writeFileSync(targetDbPath, "old-generation");
    writeFileSync(stagedDbPath, "new-generation");
    const helper = packagedWindowsFileHelper();
    const oldDb = captureExpectedWindowsRestoreFile(helper, targetDbPath);
    const stagedDb = captureExpectedWindowsRestoreFile(helper, stagedDbPath);
    renameSync(targetDbPath, preservedDbPath);
    const generation = randomUUID();
    const journal: RestoreJournalRecord = { formatVersion: 2, generation, phase: "OLD_DB_MOVED",
      targetDbPath, artifactRoot: join(root, "artifacts"), stagedDbPath, preservedDbPath,
      publishedBlobs: [], nativeInitial: { oldDb, oldWal: null, oldShm: null, stagedDb },
      moveReceipts: [{ generation, sequence: 1, operation: "rename", slot: "oldDb",
        fromName: "state.db", toName: preservedDbPath.split(/[\\/]/u).at(-1)!, before: oldDb, after: oldDb }] };
    try {
      const session = await startWindowsRestoreRecoverySession(helper, journal);
      expect(session.remaining()).toBe(1);
      expect((await session.rollbackOne()).slot).toBe("oldDb");
      expect(session.remaining()).toBe(0);
      await session.close();
      expect(readFileSync(targetDbPath, "utf8")).toBe("old-generation");
      expect(readFileSync(stagedDbPath, "utf8")).toBe("new-generation");
    } finally { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });

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
