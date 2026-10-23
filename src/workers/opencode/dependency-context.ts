import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { collectJavaFiles } from "../../discovery/java-inventory.js";

interface Input { projectRoot: string; sourceRoot: string; classesRoot: string; baselineRoot?: string; targetBody: string; targetFqn: string; javaHome?: string; maxBytes?: number; deadlineAt?: number }
/** Read-only API extraction from the successful owned baseline, never guessed source signatures. */
export async function buildDependencyContext(input: Input): Promise<{ text: string; relativePaths: string[]; omitted: string[] }> {
  const root = realpathSync(input.projectRoot);
  const inside = (path: string, base: string) => { const rel = relative(realpathSync(base), realpathSync(path)); return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`); };
  const files = collectJavaFiles(root, input.sourceRoot).filter(file => inside(file, root));
  const index = files.map(file => { const source = readFileSync(file, "utf8"); const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(source)?.[1] ?? ""; return { file, source, pkg, name: basename(file, ".java"), fqn: (pkg ? pkg + "." : "") + basename(file, ".java") }; });
  const selected = new Map<string, typeof index[number]>();
  const omitted: string[] = [];
  let frontier = [input.targetBody];
  // Two source reference hops cover DTO field enums and DAO/service signatures.
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const body of frontier) {
      const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(body)?.[1] ?? "";
      const imports = [...body.matchAll(/^\s*import\s+(?!static\s)([\w.*]+)\s*;/gm)].map(m => m[1]!);
      const names = new Set(body.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? []);
      for (const match of body.matchAll(/^\s*import\s+static\s+([\w.]+)\.(?:\w+|\*)\s*;/gm)) {
        imports.push(match[1]!); names.add(match[1]!.split(".").pop()!);
      }
      for (const entry of index) {
        if (entry.fqn === input.targetFqn || selected.has(entry.fqn) || !names.has(entry.name)) continue;
        if (entry.pkg !== pkg && !imports.includes(entry.fqn) && !imports.includes(`${entry.pkg}.*`)) continue;
        if (/secret|credential|password|token|\.env/i.test(relative(root, entry.file))) { omitted.push(`${entry.fqn}: sensitive path`); continue; }
        if (selected.size >= 48) { omitted.push(`${entry.fqn}: file budget`); continue; }
        selected.set(entry.fqn, entry); next.push(entry.source);
      }
    }
    frontier = next;
  }
  const javap = input.javaHome ? join(input.javaHome, "bin", process.platform === "win32" ? "javap.exe" : "javap") : "javap";
  const chunks: string[] = []; const relativePaths: string[] = []; let bytes = 0;
  const deadline = Math.min(Date.now() + 30000, input.deadlineAt ?? Infinity);
  const run = promisify(execFile);
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "JAVA_HOME"]) if (process.env[key]) env[key] = process.env[key];
  for (const entry of selected.values()) {
    if (Date.now() >= deadline) { omitted.push(`${entry.fqn}: time budget`); continue; }
    const baselineSource = resolve(input.baselineRoot ?? root, relative(root, entry.file));
    if (!existsSync(baselineSource) || !inside(baselineSource, input.baselineRoot ?? root) || !readFileSync(baselineSource).equals(Buffer.from(entry.source))) { omitted.push(`${entry.fqn}: source differs from baseline`); continue; }
    const binary = resolve(input.classesRoot, ...entry.fqn.split(".")) + ".class";
    if (!existsSync(binary) || !inside(binary, input.classesRoot)) { omitted.push(`${entry.fqn}: no baseline class`); continue; }
    try {
      const { stdout: api } = await run(javap, ["-public", "-classpath", input.classesRoot, entry.fqn], { encoding: "utf8", windowsHide: true, timeout: Math.max(1, Math.min(5000, deadline - Date.now())), maxBuffer: 256 * 1024, env });
      const path = relative(root, entry.file).replace(/\\/g, "/");
      const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
      const section = `## ${entry.fqn}\nsource=${path} sha256=${sha(entry.source)} class_sha256=${sha(readFileSync(binary))}\n${api}`;
      const size = Buffer.byteLength(section + "\n", "utf8");
      if (bytes + size > (input.maxBytes ?? 64 * 1024)) { omitted.push(`${entry.fqn}: byte budget`); continue; }
      chunks.push(section); relativePaths.push(path); bytes += size;
    } catch { omitted.push(`${entry.fqn}: javap unavailable`); }
  }
  return { text: chunks.join("\n"), relativePaths, omitted: [...new Set(omitted)] };
}
