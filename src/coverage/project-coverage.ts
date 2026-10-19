/** Pure analysis of fresh, all-module Maven/JaCoCo results. No Maven or model execution. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { XMLValidator } from "fast-xml-parser";
import type { PomModule } from "../discovery/pom-discovery.js";
import { collectJavaFiles, scanJavaFile, type JavaSymbol } from "../discovery/java-inventory.js";
import { AppError } from "../domain/errors.js";
import { parseJacocoXml, type Counter, type JaCoCoClass } from "./jacoco-parser.js";
import { readCoverageEvidenceAfterRun } from "../orchestration/candidate-loop.js";

export interface ProjectCoverageCounter { covered: number; missed: number; percent: number | null }
export interface ProjectCoverageClass {
  fqn: string; module_path: string; relative_path: string;
  line: ProjectCoverageCounter; branch: ProjectCoverageCounter;
  suitable: boolean; reasons: string[];
}
export interface ProjectCoverageAnalysis {
  status: "COMPLETE"; selection_required: true;
  overall: { line: ProjectCoverageCounter; branch: ProjectCoverageCounter };
  classes: ProjectCoverageClass[]; recommendations: ProjectCoverageClass[];
  reports: Array<{ module_path: string; path: string; html_path: string | null; sha256: string; bytes: number }>;
  unmeasured: { source_classes: number; report_classes: number; details: string[] };
}
function invalid(message: string, reason: string): never {
  throw new AppError("INVALID_COVERAGE_EVIDENCE", message, { reason_code: reason });
}
function count(counters: Counter[], kind: "LINE" | "BRANCH"): ProjectCoverageCounter {
  const value = counters.find(c => c.type === kind);
  const covered = value?.covered ?? 0; const missed = value?.missed ?? 0;
  return { covered, missed, percent: covered + missed === 0 ? null : 100 * covered / (covered + missed) };
}
function inside(root: string, path: string): string {
  const result = resolve(root, path); const rel = relative(root, result);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) invalid("Coverage path outside project", "COVERAGE_PATH_ESCAPE");
  return result;
}
function reasonsFor(cls: JaCoCoClass, symbol: JavaSymbol | undefined, content: string): string[] {
  const reasons: string[] = [];
  if (cls.name.includes("$")) reasons.push("NESTED_OR_SYNTHETIC_TYPE");
  if (!symbol) reasons.push("UNMAPPED_SOURCE_TYPE");
  if (symbol && (symbol.kind !== "class" || /\babstract\s+class\b/.test(content))) reasons.push("NON_CONCRETE_TYPE");
  if (/(?:dto|entity|model|config|configuration|generated|wsdl|schema)(?:\/|\.|$)/i.test(cls.name) || /(?:Dto|DTO|Entity|Configuration|Config|Application|Mapper)$/.test(cls.name)) reasons.push("DATA_OR_CONFIGURATION_TYPE");
  if (/@(?:[\w.]*\.)?(?:Generated|Configuration|SpringBootApplication)\b/.test(content)) reasons.push("GENERATED_OR_BOOTSTRAP_TYPE");
  if (count(cls.counters,"LINE").percent === null) reasons.push("NO_EXECUTABLE_LINES");
  return reasons;
}

export function analyzeProjectCoverage(projectRoot: string, modules: PomModule[], runStartedAt: number, runFinishedAt: number, belowPercent = 80, recommendationLimit = 5): ProjectCoverageAnalysis {
  if (!Number.isFinite(runStartedAt) || !Number.isFinite(runFinishedAt) || runFinishedAt < runStartedAt || !Number.isFinite(belowPercent) || belowPercent < 0 || belowPercent > 100 || !Number.isInteger(recommendationLimit) || recommendationLimit < 1 || recommendationLimit > 100) {
    throw new AppError("INVALID_PARAMETERS", "Invalid project coverage run window or recommendation limit");
  }
  const root=resolve(projectRoot);
  const canonicalRoot=realpathSync(root);
  const result: ProjectCoverageAnalysis = { status:"COMPLETE", selection_required:true, overall:{line:count([],"LINE"),branch:count([],"BRANCH")}, classes:[],recommendations:[],reports:[],unmeasured:{source_classes:0,report_classes:0,details:[]} };
  const executable = modules.filter(m=>m.packaging!=="pom");
  if (executable.length===0) invalid("No executable Maven module for JaCoCo", "NO_EXECUTABLE_MODULE");
  const seenModules = new Set<string>();
  for (const module of executable) {
    if(seenModules.has(module.module_relative_path)) invalid("Duplicate coverage module", "DUPLICATE_COVERAGE_MODULE");
    seenModules.add(module.module_relative_path);
    const moduleRoot=inside(root,module.module_relative_path);
    if(existsSync(moduleRoot)) inside(canonicalRoot,realpathSync(moduleRoot));
    // PomModule source roots are relative to the reactor, not to the module.
    inside(root,module.source_root);
    const path=join(moduleRoot,"target/site/jacoco/jacoco.xml");
    if(!existsSync(path)) invalid(`JaCoCo report missing: ${module.module_relative_path || "."}`,"JACOCO_REPORT_MISSING");
    inside(canonicalRoot,realpathSync(path));
    const stats=statSync(path);
    if(stats.mtimeMs < runStartedAt || stats.mtimeMs > runFinishedAt+1000) invalid(`Stale JaCoCo report outside run window: ${path}`,"STALE_COVERAGE_EVIDENCE");
    if(stats.size > 128*1024*1024) invalid("JaCoCo XML exceeds size limit","JACOCO_REPORT_TOO_LARGE");
    const bytes=readFileSync(path);
    if(XMLValidator.validate(bytes.toString("utf8"))!==true) invalid("Malformed JaCoCo XML","JACOCO_XML_MALFORMED");
    const report=parseJacocoXml(path);
    if(report.session_infos.length===0 || report.session_infos.some(s=>!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.dump)||s.start<runStartedAt-1000||s.dump>runFinishedAt+1000||s.dump<s.start)) invalid("JaCoCo session outside executed run window","JACOCO_SESSION_STALE");
    const symbols = new Map<string,JavaSymbol>();
    for(const file of collectJavaFiles(root,module.source_root)) {
      inside(canonicalRoot,realpathSync(file));
      for(const symbol of scanJavaFile(file,root).symbols) if(!symbol.enclosing) symbols.set(symbol.fqn,symbol);
    }
    const reported = new Set<string>(); let sharedValidated=false;
    const moduleClasses=report.packages.flatMap(pkg=>pkg.classes);
    for(const cls of moduleClasses) {
      const fqn=cls.name.replace(/\//g,".");
      if(reported.has(fqn)) invalid(`Duplicate JaCoCo class: ${fqn}`,"JACOCO_CLASS_DUPLICATE");
      reported.add(fqn);
      const symbol=symbols.get(fqn);
      let content="";
      if(symbol) {
        const source=inside(root,symbol.relative_path);
        // Existing runtime validator is reused once per module; repeated parsing
        // for every class would make large reactor analysis quadratic.
        if(!sharedValidated) {
          readCoverageEvidenceAfterRun(root,fqn,module.module_relative_path,{minimum_mtime_ms:runStartedAt,require_session_info:true,require_class_file:true,source_relative_path:symbol.relative_path,expected_source_filename:basename(source)});
          sharedValidated=true;
        }
        if(cls.sourcefilename!==basename(source)) invalid(`JaCoCo source filename mismatch: ${fqn}`,"JACOCO_SOURCE_MISMATCH");
        const binary=inside(join(moduleRoot,"target/classes"),`${cls.name}.class`);
        if(!existsSync(binary)) invalid(`Coverage class binary missing: ${fqn}`,"JACOCO_CLASS_MISSING");
        inside(canonicalRoot,realpathSync(binary));
        const binaryStats=statSync(binary); const sourceStats=statSync(source);
        if(binaryStats.mtimeMs<runStartedAt-1000 || binaryStats.mtimeMs<sourceStats.mtimeMs) invalid(`Coverage class binary predates source/run: ${fqn}`,"JACOCO_CLASS_STALE");
        content=readFileSync(source,"utf8");
      } else {
        result.unmeasured.report_classes++; result.unmeasured.details.push(`REPORT_WITHOUT_MAIN_SOURCE:${module.module_relative_path}:${fqn}`);
      }
      const reasons=reasonsFor(cls,symbol,content);
      result.classes.push({fqn,module_path:module.module_relative_path,relative_path:symbol?.relative_path??"",line:count(cls.counters,"LINE"),branch:count(cls.counters,"BRANCH"),suitable:reasons.length===0,reasons});
    }
    for(const fqn of symbols.keys()) if(!reported.has(fqn)) {
      result.unmeasured.source_classes++;result.unmeasured.details.push(`MAIN_SOURCE_WITHOUT_REPORT:${module.module_relative_path}:${fqn}`);
    }
    for(const kind of ["LINE","BRANCH"] as const) {
      const aggregate=count(report.counters,kind);
      // JaCoCo's LINE total counts distinct source lines. Summing class LINE
      // counters double-counts inner/outer code on the same line. Sourcefile
      // counters are the compatible aggregation level when available.
      const sourcefiles=report.packages.flatMap(pkg=>pkg.sourcefiles);
      const totals=kind==="LINE"?sourcefiles:moduleClasses;
      if(totals.length>0) {
        const total=totals.reduce((sum,item)=>{const counter=count(item.counters,kind);return {covered:sum.covered+counter.covered,missed:sum.missed+counter.missed};},{covered:0,missed:0});
        if(aggregate.covered!==total.covered || aggregate.missed!==total.missed) invalid(`JaCoCo ${kind} total counter mismatch`,"JACOCO_TOTAL_MISMATCH");
      }
      const key=kind==="LINE"?"line":"branch";
      result.overall[key].covered+=aggregate.covered;result.overall[key].missed+=aggregate.missed;
    }
    const html=join(moduleRoot,"target/site/jacoco/index.html");
    if(existsSync(html)) inside(canonicalRoot,realpathSync(html));
    result.reports.push({module_path:module.module_relative_path,path,html_path:existsSync(html)?html:null,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length});
  }
  for(const key of ["line","branch"] as const) {const c=result.overall[key];c.percent=c.covered+c.missed>0?100*c.covered/(c.covered+c.missed):null;}
  // Existing test_start resolves by FQN. None of a repeated FQN's module
  // instances can be selected unambiguously through that public contract.
  const fqnCounts=new Map<string,number>();
  for(const cls of result.classes) fqnCounts.set(cls.fqn,(fqnCounts.get(cls.fqn)??0)+1);
  for(const cls of result.classes) if((fqnCounts.get(cls.fqn)??0)>1) {
    cls.suitable=false;
    cls.reasons.push("AMBIGUOUS_CLASS_IDENTITY");
  }
  result.classes.sort((a,b)=>a.module_path.localeCompare(b.module_path)||a.fqn.localeCompare(b.fqn));
  result.recommendations=result.classes.filter(c=>c.suitable&&c.line.percent!==null&&c.line.percent<belowPercent).sort((a,b)=>(a.line.percent??100)-(b.line.percent??100)||b.line.missed-a.line.missed||a.fqn.localeCompare(b.fqn)||a.module_path.localeCompare(b.module_path)).slice(0,recommendationLimit);
  return result;
}
