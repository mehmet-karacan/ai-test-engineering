import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, renameSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProjectCoverage } from "../../src/coverage/project-coverage.js";
import { discoverModules, type PomModule } from "../../src/discovery/pom-discovery.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const module: PomModule = { module_relative_path: "", group_id: "demo", artifact_id: "demo", version: "1", packaging: "jar", parent_artifact_id: null, source_root: "src/main/java", test_root: "src/test/java", jacoco_configured: true, surefire_configured: true, junit4_present: false, junit5_present: true, mockito_present: false };
function fixture(items: Array<{ name: string; covered: number; missed: number; kind?: string }>) {
  const root = mkdtempSync(join(tmpdir(), "project-coverage-")); roots.push(root);
  const start = Date.now() - 5000; const finish = Date.now() + 5000;
  for (const item of items) {
    const src = join(root, "src/main/java/demo", `${item.name}.java`); mkdirSync(join(src, ".."), { recursive: true });
    writeFileSync(src, `package demo;\npublic ${item.kind ?? "class"} ${item.name} {\n public int value() { return 1; }\n}\n`);
    utimesSync(src, new Date(start - 5000), new Date(start - 5000));
    const cls = join(root, "target/classes/demo", `${item.name}.class`); mkdirSync(join(cls, ".."), { recursive: true }); writeFileSync(cls, "compiled-fixture");
  }
  const path = join(root, "target/site/jacoco/jacoco.xml"); mkdirSync(join(path, ".."), { recursive: true });
  const classes = items.map(i => `<class name="demo/${i.name}" sourcefilename="${i.name}.java"><counter type="LINE" covered="${i.covered}" missed="${i.missed}"/><counter type="BRANCH" covered="0" missed="0"/></class>`).join("");
  const sourcefiles = items.map(i=>`<sourcefile name="${i.name}.java"><counter type="LINE" covered="${i.covered}" missed="${i.missed}"/></sourcefile>`).join("");
  writeFileSync(path, `<report name="demo"><sessioninfo id="fresh" start="${start + 100}" dump="${finish - 100}"/><package name="demo">${classes}${sourcefiles}</package><counter type="LINE" covered="${items.reduce((n,i)=>n+i.covered,0)}" missed="${items.reduce((n,i)=>n+i.missed,0)}"/><counter type="BRANCH" covered="0" missed="0"/></report>`);
  return { root, path, start, finish };
}
describe("project-wide coverage analysis", () => {
  it("sums actual counters and proposes low coverage ordinary classes in stable order", () => {
    const f = fixture([{name:"High",covered:9,missed:1},{name:"Small",covered:0,missed:2},{name:"Large",covered:0,missed:20},{name:"AccountDto",covered:0,missed:40}]);
    const result = analyzeProjectCoverage(f.root, [module], f.start, f.finish);
    expect(result.overall.line).toEqual({covered:9,missed:63,percent:12.5});
    expect(result.overall.branch.percent).toBeNull();
    expect(result.recommendations.map(c=>c.fqn)).toEqual(["demo.Large","demo.Small"]);
    expect(result.classes.find(c=>c.fqn==="demo.AccountDto")).toMatchObject({suitable:false,reasons:["DATA_OR_CONFIGURATION_TYPE"]});
    expect(result.selection_required).toBe(true);
    expect(result.reports[0]).toMatchObject({module_path:"",path:f.path,sha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
  });
  it("rejects an executable module with no coverage instead of reporting zero", () => {
    const f = fixture([{name:"Small",covered:0,missed:2}]);
    expect(()=>analyzeProjectCoverage(f.root,[module,{...module,module_relative_path:"missing"}],f.start,f.finish)).toThrow(/JaCoCo/);
  });
  it("rejects stale reports and sessions from another run", () => {
    const f=fixture([{name:"Small",covered:0,missed:2}]);
    utimesSync(f.path,new Date(f.start-10000),new Date(f.start-10000));
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start,f.finish)).toThrow(/Stale|stale/);
    utimesSync(f.path,new Date(),new Date());
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start+4000,f.finish+4000)).toThrow(/session/i);
  });
  it("rejects missing binary evidence and source identity mismatch", () => {
    const f=fixture([{name:"Small",covered:0,missed:2}]);
    rmSync(join(f.root,"target/classes/demo/Small.class"));
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start,f.finish)).toThrow(/class/i);
  });
  it("rejects inconsistent totals and mismatched source names", () => {
    const f=fixture([{name:"Small",covered:0,missed:2}]);
    const xml=readFileSync(f.path,"utf8");
    writeFileSync(f.path,xml.replace('sourcefilename="Small.java"','sourcefilename="Other.java"'));
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start,f.finish)).toThrow(/source/i);
    writeFileSync(f.path,xml.replace('</package><counter type="LINE" covered="0" missed="2"','</package><counter type="LINE" covered="0" missed="200"'));
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start,f.finish)).toThrow(/counter|total/i);
  });
  it("rejects malformed XML and a binary older than its source", () => {
    const f=fixture([{name:"Small",covered:0,missed:2}]);
    const xml=readFileSync(f.path,"utf8"); writeFileSync(f.path,xml.replace('</report>',''));
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start,f.finish)).toThrow(/XML/);
    writeFileSync(f.path,xml);
    utimesSync(join(f.root,"target/classes/demo/Small.class"),new Date(f.start-20000),new Date(f.start-20000));
    expect(()=>analyzeProjectCoverage(f.root,[module],f.start,f.finish)).toThrow(/binary|class/i);
  });
  it("keeps unmeasured source classes visible and never recommends them", () => {
    const f=fixture([{name:"Small",covered:0,missed:2}]);
    writeFileSync(join(f.root,"src/main/java/demo/Unmeasured.java"),"package demo;\npublic class Unmeasured {}\n");
    const result=analyzeProjectCoverage(f.root,[module],f.start,f.finish);
    expect(result.unmeasured.source_classes).toBe(1);
    expect(result.recommendations.map(c=>c.fqn)).toEqual(["demo.Small"]);
  });
  it("does not recommend interfaces, nested classes or generated configuration types", () => {
    const f=fixture([{name:"Contract",kind:"interface",covered:0,missed:2},{name:"AppConfiguration",covered:0,missed:3},{name:"Utility",covered:0,missed:3}]);
    const result=analyzeProjectCoverage(f.root,[module],f.start,f.finish,80,1);
    expect(result.recommendations.map(c=>c.fqn)).toEqual(["demo.Utility"]);
    expect(result.classes.find(c=>c.fqn==="demo.Contract")?.reasons).toContain("NON_CONCRETE_TYPE");
  });
  it("maps real reactor-relative source roots discovered from multi-module POMs", () => {
    const f=fixture([{name:"Utility",covered:0,missed:3}]);
    mkdirSync(join(f.root,"module-a"));
    renameSync(join(f.root,"src"),join(f.root,"module-a/src"));
    renameSync(join(f.root,"target"),join(f.root,"module-a/target"));
    writeFileSync(join(f.root,"pom.xml"),'<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>reactor</artifactId><version>1</version><packaging>pom</packaging><modules><module>module-a</module></modules></project>');
    writeFileSync(join(f.root,"module-a/pom.xml"),'<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>module-a</artifactId><version>1</version></project>');
    const discovered=discoverModules(f.root);
    expect(discovered.modules[1]?.source_root).toBe("module-a/src/main/java");
    const result=analyzeProjectCoverage(f.root,discovered.modules,f.start,f.finish);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({fqn:"demo.Utility",module_path:"module-a",relative_path:"module-a/src/main/java/demo/Utility.java"});
    expect(result.unmeasured).toMatchObject({source_classes:0,report_classes:0});
  });
  it("uses unique source-line totals when outer and inner class share one line", () => {
    const f=fixture([{name:"Outer",covered:1,missed:0}]);
    writeFileSync(f.path,readFileSync(f.path,"utf8").replace('</package>','<class name="demo/Outer$Inner" sourcefilename="Outer.java"><counter type="LINE" covered="1" missed="0"/></class></package>'));
    const result=analyzeProjectCoverage(f.root,[module],f.start,f.finish);
    expect(result.overall.line).toEqual({covered:1,missed:0,percent:100});
    expect(result.classes.find(c=>c.fqn==="demo.Outer$Inner")?.reasons).toContain("NESTED_OR_SYNTHETIC_TYPE");
    expect(result.recommendations).toEqual([]);
  });
  it("returns an empty proposal list when every measured class is unsuitable", () => {
    const f=fixture([{name:"AccountDto",covered:0,missed:40}]);
    const result=analyzeProjectCoverage(f.root,[module],f.start,f.finish);
    expect(result.recommendations).toEqual([]);
    expect(result.classes).toHaveLength(1);
    expect(result.selection_required).toBe(true);
  });
  it("marks every repeated FQN ambiguous instead of proposing an unselectable target", () => {
    const f=fixture([{name:"Utility",covered:0,missed:3}]);
    mkdirSync(join(f.root,"module-a"));
    renameSync(join(f.root,"src"),join(f.root,"module-a/src"));
    renameSync(join(f.root,"target"),join(f.root,"module-a/target"));
    cpSync(join(f.root,"module-a"),join(f.root,"module-b"),{recursive:true,preserveTimestamps:true});
    const modules=["module-a","module-b"].map(path=>({...module,module_relative_path:path,source_root:`${path}/src/main/java`,test_root:`${path}/src/test/java`}));
    const result=analyzeProjectCoverage(f.root,modules,f.start,f.finish);
    expect(result.classes).toHaveLength(2);
    expect(result.classes.every(cls=>!cls.suitable&&cls.reasons.includes("AMBIGUOUS_CLASS_IDENTITY"))).toBe(true);
    expect(result.recommendations).toEqual([]);
  });
});
