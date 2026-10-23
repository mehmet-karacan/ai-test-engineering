import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { testFailureDiagnostic } from "../../src/orchestration/test-failure-diagnostic.js";
it("forwards actual assertion and exception details, bounded and redacted", () => {
 const root=mkdtempSync(join(tmpdir(),"failure-detail-"));
 try {const reports=join(root,"target/surefire-reports");mkdirSync(reports,{recursive:true});
 writeFileSync(join(reports,"TEST-a.Test.xml"), '<testsuite><properties><property name="secret" value="DO_NOT_EXPOSE"/></properties><testcase classname="a.Test" name="changesState"><failure message="expected RELEASED but was DRAFT password=private-value">java.lang.AssertionError: expected RELEASED\n at a.Test.changesState(Test.java:12)</failure></testcase></testsuite>');
 const text=testFailureDiagnostic(root,[""]).join("\n");expect(text).toContain("expected RELEASED but was DRAFT");expect(text).toContain("a.Test#changesState");expect(text).not.toContain("private-value");expect(text).not.toContain("DO_NOT_EXPOSE");expect(text.length).toBeLessThanOrEqual(4096);
 expect(testFailureDiagnostic(root,["../outside"])).toEqual([]);
 expect(testFailureDiagnostic(root,[""],["a.Test#changesState"]).join("\n")).toContain("expected RELEASED");
 expect(testFailureDiagnostic(root,[""],["unrelated.Test#x"])).toEqual([]);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("includes errors, redacts paths and credentials, and excludes stdout", () => {
 const root=mkdtempSync(join(tmpdir(),"failure-errors-"));
 try {
  const reports=join(root,"target/surefire-reports");mkdirSync(reports,{recursive:true});
  writeFileSync(join(reports,"TEST-a.Test.xml"), `<testsuite><testcase classname="a.Test" name="throws"><error type="java.lang.Exception" message="approval failed">${homedir()}/private/Test.java https://user:secret@example.com/run</error></testcase><system-out>NEVER_FORWARD_STDOUT</system-out></testsuite>`);
  const text=testFailureDiagnostic(root,[""]).join("\n");
  expect(text).toContain("java.lang.Exception");expect(text).toContain("approval failed");
  expect(text).not.toContain(homedir());expect(text).not.toContain("user:secret");expect(text).not.toContain("NEVER_FORWARD_STDOUT");
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("caps failure count and actual UTF-8 byte budget", () => {
 const root=mkdtempSync(join(tmpdir(),"failure-budget-"));
 try {
  const reports=join(root,"target/surefire-reports");mkdirSync(reports,{recursive:true});
  const report=(text:string)=>writeFileSync(join(reports,"TEST-a.Test.xml"),`<testsuite>${`<testcase classname="a.Test" name="failure"><failure>${text}</failure></testcase>`.repeat(12)}</testsuite>`);
  report("x".repeat(2000));const details=testFailureDiagnostic(root,[""]);
  expect(details).toHaveLength(2);expect(details.every(detail=>detail.length<=1500)).toBe(true);
  expect(Buffer.byteLength(details.join(""),"utf8")).toBeLessThanOrEqual(4096);
  report("short");expect(testFailureDiagnostic(root,[""])).toHaveLength(8);
  report("\u0131".repeat(2000));expect(Buffer.byteLength(testFailureDiagnostic(root,[""]).join(""),"utf8")).toBeLessThanOrEqual(4096);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("skips oversized XML and caps files after filtering failed suites", () => {
 const root=mkdtempSync(join(tmpdir(),"failure-files-"));
 try {
  const reports=join(root,"target/surefire-reports");mkdirSync(reports,{recursive:true});
  const report=(name:string,body:string)=>writeFileSync(join(reports,`TEST-${name}.xml`),`<testsuite>${body}</testsuite>`);
  report("a.Test","x".repeat(128*1024));expect(testFailureDiagnostic(root,[""])).toEqual([]);
  rmSync(join(reports,"TEST-a.Test.xml"));
  for(let index=0;index<65;index++)report(`a${index.toString().padStart(2,"0")}.Test`,"");
  report("z.Test",'<testcase classname="z.Test" name="failure"><failure>actual failure</failure></testcase>');
  expect(testFailureDiagnostic(root,[""])).toEqual([]);
  expect(testFailureDiagnostic(root,[""],["z.Test#failure"]).join("\n")).toContain("actual failure");
 }finally{rmSync(root,{recursive:true,force:true});}
});
