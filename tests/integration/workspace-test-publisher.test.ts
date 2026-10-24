import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceTestPublisher } from "../../src/orchestration/workspace-test-publisher.js";
import { registerWindowsNativeTestLock } from "../support/windows-native-test-lock.js";

registerWindowsNativeTestLock("workspace-test-publisher");

const temporary: string[] = [];
const roots = [{ module_relative_path: "", test_root: "src/test/java" }];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aitest-publisher-")); temporary.push(root);
  const workspace = join(root, "workspace"); const storeRoot = join(root, "store");
  mkdirSync(join(workspace, "src/test/java"), { recursive: true }); mkdirSync(storeRoot);
  const options = { workspace, storeRoot, operationId: "operation-1", allowedTestRoots: roots };
  return { root, workspace, storeRoot, options, publisher: new WorkspaceTestPublisher(options) };
}
function file(path = "src/test/java/pkg/NewTest.java", text = "class NewTest {}") {
  const content = Buffer.from(text); return { path, content, sha256: createHash("sha256").update(content).digest("hex") };
}
// A real child runs the TS source with only a loader, then dies at native operation boundaries.
// Hooks live in this child fixture; production code has no fault modes or test-only API.
function runChild(options: ReturnType<typeof fixture>["options"], fault: string): ReturnType<typeof spawnSync> {
  const sourceUrl = new URL("../../src/orchestration/workspace-test-publisher.ts", import.meta.url).href;
  const code = `
    import { registerHooks, syncBuiltinESMExports } from 'node:module';
    import fs from 'node:fs'; import cp from 'node:child_process'; import ts from 'typescript';
    import { fileURLToPath } from 'node:url'; import { createHash } from 'node:crypto';
    registerHooks({ resolve(specifier, context, next) {
      try { return next(specifier, context); } catch(error) {
        if (!specifier.endsWith('.js') || !context.parentURL) throw error;
        return next(new URL(specifier.slice(0,-3)+'.ts', context.parentURL).href, context);
      }
    }, load(url, context, next) {
      if (!url.endsWith('.ts')) return next(url, context);
      return { format:'module', shortCircuit:true, source:ts.transpileModule(fs.readFileSync(fileURLToPath(url),'utf8'),
        {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText };
    }});
    const original = cp.spawnSync; let published = 0;
    cp.spawnSync = function(command, args, ...rest) {
      const result = original(command,args,...rest);
      if (args?.[0] === 'copy-owned' && result.status === 0 && process.env.PUBLISHER_FAULT === 'stage') {
        fs.writeSync(1, 'KILL_STAGE\\n'); process.kill(process.pid, 'SIGKILL');
      }
      if (args?.[0] === 'rename-owned' && result.status === 0) {
        published++;
        if (process.env.PUBLISHER_FAULT === 'published') { fs.writeSync(1,'KILL_PUBLISHED\\n'); process.kill(process.pid, 'SIGKILL'); }
        if (process.env.PUBLISHER_FAULT === 'partial' && published === 1) fs.writeFileSync(process.env.SECOND_PATH,'user collision');
      }
      return result;
    }; syncBuiltinESMExports();
    const {WorkspaceTestPublisher} = await import(${JSON.stringify(sourceUrl)});
    const options=JSON.parse(process.env.PUBLISHER_OPTIONS);
    const files=['src/test/java/pkg/NewTest.java','src/test/java/Second.java'].map(path=>{
      const content=Buffer.from('class NewTest {}'); return {path,content,sha256:createHash('sha256').update(content).digest('hex')};
    });
    const publisher=new WorkspaceTestPublisher(options); publisher.prepare(files); publisher.publish();
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 30000,
    cwd: fileURLToPath(new URL("../..", import.meta.url)), windowsHide: true,
    env: { ...process.env, PUBLISHER_OPTIONS: JSON.stringify(options), PUBLISHER_FAULT: fault, SECOND_PATH: join(options.workspace, "src/test/java/Second.java") } });
}
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe.skipIf(process.platform !== "win32")("native create-only test publisher", () => {
  it("publishes, reloads and rolls back its own unchanged files", () => {
    const f = fixture(); const item = file(); f.publisher.prepare([item]);
    expect(existsSync(join(f.workspace, item.path))).toBe(false);
    expect(f.publisher.publish()).toEqual([item.path]); expect(f.publisher.verify()).toBe(true);
    const reload = new WorkspaceTestPublisher(f.options); reload.prepare([item]);
    expect(reload.publish()).toEqual([item.path]);
    expect(reload.rollback()).toEqual({ removed_paths: [item.path], conflicts: [] });
    expect(reload.verify()).toBe(false); expect(existsSync(join(f.workspace, item.path))).toBe(false);
  });
  it("preflights the complete batch before creating any target or directory", () => {
    const f = fixture(); const first = file(); const existing = file("src/test/java/Existing.java");
    writeFileSync(join(f.workspace, existing.path), existing.content);
    expect(() => f.publisher.prepare([first, existing])).toThrow();
    expect(existsSync(join(f.workspace, "src/test/java/pkg"))).toBe(false);
    expect(readFileSync(join(f.workspace, existing.path))).toEqual(existing.content);
  });
  it("preflights a file used as a later target parent before any publication", () => {
    const f = fixture(); const first = file(); const blocked = file("src/test/java/blocked/Other.java");
    writeFileSync(join(f.workspace, "src/test/java/blocked"), "user file");
    expect(() => f.publisher.prepare([first, blocked])).toThrow();
    expect(existsSync(join(f.workspace, first.path))).toBe(false);
    expect(existsSync(join(f.workspace, "src/test/java/pkg"))).toBe(false);
  });
  it.each(["../Outside.java", "src/test/java/../java/A.java", "src/test/java/A.java:stream", "src/test/java/A.java.", "src/test/java/CON.java", "src/main/java/A.java", "src/test/java/A.txt", "src\\test\\java\\A.java"])("rejects noncanonical or forbidden path %s", path => {
    const f = fixture(); expect(() => f.publisher.prepare([file(path)])).toThrow();
  });
  it("rejects case collisions and content digest mismatch without writes", () => {
    const f = fixture(); expect(() => f.publisher.prepare([file(), file("src/test/java/pkg/newtest.java")])).toThrow();
    expect(() => f.publisher.prepare([{ ...file(), sha256: "0".repeat(64) }])).toThrow();
    expect(readdirSync(join(f.workspace, "src/test/java"))).toEqual([]);
  });
  it("rejects a planned file that is also another file's parent", () => {
    const f = fixture();
    expect(() => f.publisher.prepare([file("src/test/java/A.java"), file("src/test/java/A.java/Other.java")])).toThrow();
    expect(readdirSync(join(f.workspace, "src/test/java"))).toEqual([]);
  });
  it("rejects a junction in an allowed test path", () => {
    const f = fixture(); const outside = join(f.root, "outside"); mkdirSync(outside);
    symlinkSync(outside, join(f.workspace, "src/test/java/pkg"), "junction");
    expect(() => f.publisher.prepare([file()])).toThrow(); expect(readdirSync(outside)).toEqual([]);
  });
  it("preserves external edits and file replacements during rollback", () => {
    const f = fixture(); const item = file(); f.publisher.prepare([item]); f.publisher.publish();
    writeFileSync(join(f.workspace, item.path), "class UserEdit {}");
    const result = f.publisher.rollback(); expect(result.removed_paths).toEqual([]); expect(result.conflicts).toHaveLength(1);
    expect(readFileSync(join(f.workspace, item.path), "utf8")).toBe("class UserEdit {}");
  });
  it("preserves a byte-identical replacement with a different native FileId", () => {
    const f = fixture(); const item = file(); f.publisher.prepare([item]); f.publisher.publish();
    const target = join(f.workspace, item.path); const original = join(f.workspace, "original.java");
    // Keep the original inode alive so the OS cannot reuse its FileId.
    renameSync(target, original); writeFileSync(target, item.content);
    expect(f.publisher.verify()).toBe(false); expect(f.publisher.rollback().conflicts).toHaveLength(1);
    expect(readFileSync(target)).toEqual(item.content); expect(readFileSync(original)).toEqual(item.content);
  });
  it.each(["published", "partial"])("recovers durably owned files after %s interruption", fault => {
    const f = fixture(); const run = runChild(f.options, fault);
    expect(run.error).toBeUndefined(); expect(run.status).not.toBe(0);
    if (fault === "published") { expect(run.stdout).toBe("KILL_PUBLISHED\n"); expect(run.stderr).toBe(""); expect(run.status).toBe(1); }
    const reload = new WorkspaceTestPublisher(f.options);
    reload.prepare([file(), file("src/test/java/Second.java")]);
    const result = reload.rollback(); expect(result.removed_paths).toEqual(["src/test/java/pkg/NewTest.java"]);
    expect(existsSync(join(f.workspace, "src/test/java/pkg/NewTest.java"))).toBe(false);
    if (fault === "partial") {
      expect(result.conflicts.map(c => c.path)).toEqual(["src/test/java/Second.java"]);
      expect(readFileSync(join(f.workspace, "src/test/java/Second.java"), "utf8")).toBe("user collision");
    } else expect(result.conflicts).toEqual([]);
  });
  it("preserves an unreceipted stage after child death and reports recovery conflict", () => {
    const f = fixture(); const run = runChild(f.options, "stage");
    expect(run.stdout).toBe("KILL_STAGE\n"); expect(run.stderr).toBe(""); expect(run.status).toBe(1);
    const reload = new WorkspaceTestPublisher(f.options); reload.prepare([file(), file("src/test/java/Second.java")]);
    expect(() => reload.publish()).toThrow(); const result = reload.rollback();
    expect(result.removed_paths).toEqual([]); expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.path).toMatch(/\.stage$/u);
    expect(readFileSync(join(f.workspace, result.conflicts[0]!.path))).toEqual(file().content);
  });
  it("rejects changed plan, workspace identity and operation reuse", () => {
    const f = fixture(); f.publisher.prepare([file()]);
    expect(() => new WorkspaceTestPublisher(f.options).prepare([file(undefined, "class Other {}")])).toThrow();
    const other = join(f.root, "other"); mkdirSync(other);
    expect(() => new WorkspaceTestPublisher({ ...f.options, workspace: other }).prepare([file()])).toThrow();
  });
  it("rejects replacement of the bound store root after preparation", () => {
    const f = fixture(); f.publisher.prepare([file()]);
    const old = join(f.root, "old-store"); renameSync(f.storeRoot, old); cpSync(old, f.storeRoot, { recursive: true });
    expect(() => f.publisher.publish()).toThrow();
    expect(readdirSync(join(f.workspace, "src/test/java"))).toEqual([]);
  });
  it.each(["runtime", "..runtime"])("rejects runtime store inside workspace under %s", name => {
    const f = fixture(); const storeRoot = join(f.workspace, name);
    expect(() => new WorkspaceTestPublisher({ ...f.options, storeRoot }).prepare([file()])).toThrow();
    expect(existsSync(storeRoot)).toBe(false);
    expect(readdirSync(f.workspace)).toEqual(["src"]);
  });
  it("rejects an operation directory inside workspace when storeRoot is its ancestor", () => {
    const f = fixture(); const workspace = join(f.root, "apply-publisher"); mkdirSync(workspace);
    expect(() => new WorkspaceTestPublisher({ ...f.options, workspace, storeRoot: f.root }).prepare([file()])).toThrow();
    expect(readdirSync(workspace)).toEqual([]);
  });
  it("rejects changed source content before any workspace copy", () => {
    const f = fixture(); f.publisher.prepare([file()]);
    writeFileSync(join(f.storeRoot, "apply-publisher/operation-1/source-0"), "class Changed {}");
    expect(() => f.publisher.publish()).toThrow();
    expect(readdirSync(join(f.workspace, "src/test/java"))).toEqual([]);
  });
  it("preflights all source digests before publishing the first target", () => {
    const f = fixture(); const one = file(); const two = file("src/test/java/Second.java"); f.publisher.prepare([one, two]);
    writeFileSync(join(f.storeRoot, "apply-publisher/operation-1/source-1"), "class Changed {}");
    expect(() => f.publisher.publish()).toThrow();
    expect(existsSync(join(f.workspace, one.path))).toBe(false);
    expect(readdirSync(join(f.workspace, "src/test/java"))).toEqual([]);
  });
  it("rejects an incomplete journal instead of inventing ownership", () => {
    const f = fixture(); f.publisher.prepare([file()]); f.publisher.publish();
    const journal = join(f.storeRoot, "apply-publisher/operation-1/journal.jsonl");
    writeFileSync(journal, readFileSync(journal, "utf8") + "{");
    const reload = new WorkspaceTestPublisher(f.options); expect(() => reload.prepare([file()])).toThrow();
    expect(readFileSync(join(f.workspace, file().path))).toEqual(file().content);
  });
  it("handles a late collision without deleting the colliding file", () => {
    const f = fixture(); const one = file(); const two = file("src/test/java/Second.java");
    f.publisher.prepare([one, two]); writeFileSync(join(f.workspace, two.path), "user");
    expect(() => f.publisher.publish()).toThrow();
    expect(existsSync(join(f.workspace, one.path))).toBe(false);
    expect(f.publisher.rollback().conflicts.some(c => c.path === two.path)).toBe(true);
    expect(readFileSync(join(f.workspace, two.path), "utf8")).toBe("user");
  });
});
