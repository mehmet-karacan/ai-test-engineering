import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { XMLParser } from "fast-xml-parser";
import { redactSensitive, redactUserPath } from "../reporting/patch-artifact.js";

/** Only failure/error facts from owned Surefire reports; properties/system-out never enter prompts. */
export function testFailureDiagnostic(root: string, modules: string[], failedTests?: string[]): string[] {
  const result: string[] = []; let bytes = 0; let files = 0;
  const inside = (path: string) => { const rel = relative(realpathSync(root), realpathSync(path)); return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`); };
  const array = (v: unknown): unknown[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
  const expected = failedTests ? new Set(failedTests.map(name => `TEST-${name.split("#")[0]}.xml`)) : null;
  for (const module of new Set(modules)) {
    try {
      const directory = resolve(root, module, "target", "surefire-reports");
      if (!existsSync(directory) || !inside(directory)) continue;
      for (const name of readdirSync(directory).sort()) {
        if (!/^TEST-.*\.xml$/.test(name)) continue;
        if (expected && !expected.has(name)) continue;
        if (++files > 64) return result;
        const path = join(directory, name); const stat = lstatSync(path);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 128 * 1024 || !inside(path)) continue;
        const doc = parser.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        for (const suite of array(doc.testsuite)) {
          for (const entry of array((suite as Record<string, unknown>).testcase)) {
            const test = entry as Record<string, unknown>;
            for (const failure of [...array(test.failure), ...array(test.error)]) {
              const detail = typeof failure === "object" && failure ? failure as Record<string, unknown> : { "#text": failure };
              const raw = `${test["@_classname"]}#${test["@_name"]}: ${detail["@_type"] ?? ""} ${detail["@_message"] ?? ""}\n${detail["#text"] ?? ""}`;
              const text = redactUserPath(redactSensitive(raw).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@"), homedir()).slice(0, 1500);
              if (bytes + Buffer.byteLength(text, "utf8") > 4096 || result.length >= 8) return result;
              bytes += Buffer.byteLength(text, "utf8"); result.push(text);
            }
          }
        }
      }
    } catch { /* Unreadable diagnostics must not hide the original failure. */ }
  }
  return result;
}
