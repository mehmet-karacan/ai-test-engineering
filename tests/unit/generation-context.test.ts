import {it,expect} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {homedir,tmpdir} from "node:os";
import {coverageGapContext,repairCandidateContext} from "../../src/workers/opencode/generation-context.js";

it("focuses missing public methods from the supplied trusted workspace, including remaining branches",()=>{
 const root=mkdtempSync(join(tmpdir(),"trusted-gaps-"));
 try{
  const path=join(root,"target/site/jacoco/jacoco.xml");mkdirSync(join(path,".."),{recursive:true});
  writeFileSync(path,'<report><package name="a"><class name="a/Service" sourcefilename="Service.java"><method name="covered" line="10"><counter type="LINE" covered="5" missed="0"/><counter type="BRANCH" covered="2" missed="0"/></method><method name="update" line="20"><counter type="LINE" covered="0" missed="30"/><counter type="BRANCH" covered="0" missed="10"/></method><method name="helper" line="40"><counter type="LINE" covered="0" missed="99"/></method><method name="partial" line="50"><counter type="LINE" covered="8" missed="0"/><counter type="BRANCH" covered="2" missed="2"/></method></class></package></report>');
  const text=coverageGapContext(root,"a.Service","",["covered","update","partial"]).join("\n");
  expect(text).toContain("ODAK: update");expect(text).toContain("partial");expect(text).not.toContain("helper");expect(text).not.toContain("covered:");expect(text).toContain("BRANCH eksik=10");
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("redacts previous candidate source and bounds or excludes unsafe content",()=>{
 const candidate = {schema_version:1 as const,changes:[{path:"src/test/java/a/Test.java",action:"create" as const,new_content:`class Test { String uri="https://user:secret@example.com"; String path="${homedir()}"; }`}]};
 const text=repairCandidateContext(candidate);expect(text).not.toContain("user:secret");expect(text).not.toContain(homedir());
 expect(repairCandidateContext({...candidate,changes:[{...candidate.changes[0]!,path:"src/test/java/../../main/Sut.java"}]})).toBe("");
 expect(Buffer.byteLength(repairCandidateContext({...candidate,changes:[{...candidate.changes[0]!,new_content:"x".repeat(20000)}]}),"utf8")).toBeLessThan(16384);
});
