import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseJacocoXml, counterValue } from "../../coverage/jacoco-parser.js";
import { redactSensitive, redactUserPath } from "../../reporting/patch-artifact.js";
import type { CandidateChangeSet } from "./model-schemas.js";

export function redactContextSource(text: string): string {
  return redactUserPath(redactUserPath(redactSensitive(text),homedir()),homedir().replace(/\\/g,"\\\\"))
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,"$1[REDACTED]@");
}

/** Only the previous model candidate, never host files or previously accepted source. */
export function repairCandidateContext(candidate: CandidateChangeSet | null): string {
  const chunks: string[] = []; let bytes = 0;
  for (const change of candidate?.changes ?? []) {
    if (change.action === "delete" || !/(^|\/)src\/test\/java\/.+\.java$/.test(change.path) || change.path.split(/[\\/]/).includes("..")) continue;
    const text = redactContextSource(`// ${change.path}\n${change.new_content ?? ""}`);
    const size = Buffer.byteLength(text, "utf8");
    if (bytes + size > 16 * 1024) { chunks.push("[onceki aday kaynak butcesi nedeniyle kalan dosyalar haric]"); break; }
    chunks.push(text); bytes += size;
  }
  return chunks.join("\n");
}

/** Method facts come from the last validated execution, never the live checkout's target/. */
export function coverageGapContext(root: string, fqn: string, module: string, publicMethods: string[], goal?: {line_bps:number;branch_bps:number}): string[] {
  const path = join(root, module, "target/site/jacoco/jacoco.xml");
  if (!existsSync(path)) return [];
  const report = parseJacocoXml(path);
  const cls = report.packages.flatMap(pkg => pkg.classes).find(c => c.name === fqn.replace(/\./g, "/"));
  if (!cls) return [];
  const line = counterValue(cls.counters,"LINE"), branch = counterValue(cls.counters,"BRANCH");
  const branchFocus = !!goal && !!line && !!branch && line.covered+line.missed>0 && branch.covered+branch.missed>0
    && line.covered*10000 >= goal.line_bps*(line.covered+line.missed)
    && branch.covered*10000 < goal.branch_bps*(branch.covered+branch.missed);
  const gaps = cls.methods.filter(m => publicMethods.includes(m.name)).map(m => ({
    name: m.name, line: m.line,
    lines: counterValue(m.counters, "LINE")?.missed ?? 0,
    branches: counterValue(m.counters, "BRANCH")?.missed ?? 0,
  })).filter(m => branchFocus ? m.branches > 0 : m.lines > 0 || m.branches > 0)
    .sort((a,b) => (branchFocus ? b.branches-a.branches || b.lines-a.lines : b.lines-a.lines || b.branches-a.branches) || (a.line ?? 0)-(b.line ?? 0));
  return [
    ...(gaps[0] ? [`ODAK: ${gaps[0].name}; ${branchFocus ? "Satir hedefi saglandi; sadece kalan kosul/dal kombinasyonlarini test et, kapsanmis ana akisi tekrarlama." : "bu yeni adayda once bu public metodun basarili ana akisini ve kalan kosullarini test et."}`] : []),
    ...gaps.slice(0,20).map(m => `${m.name}: satir=${m.line}, LINE eksik=${m.lines}, BRANCH eksik=${m.branches}`),
  ];
}
