/** P08/PP43: MCP, model ve Maven readiness durumlari birbirine karismaz. */
import * as readiness from "../../src/configuration/readiness.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateMavenReadiness, evaluateWorkerReadiness } from "../../src/configuration/readiness.js";

const profile = { profile_name: "local-glm", provider_id: "litellm", model_id: "GLM-5.3-Flash-IT" };

describe("P08/PP43 readiness siniflandirmasi", () => {
  it("handshake bilgisi olmadan worker kapaliysa model NOT_READY kalir", () => {
    const result = evaluateWorkerReadiness({
      enabled: false,
      profiles: [profile],
      default_profile: "local-glm",
      configured_model: "litellm/GLM-5.3-Flash-IT",
      configured_providers: { litellm: {} },
    });
    expect(result).toMatchObject({ capability: "model", status: "NOT_READY", reason_code: "WORKER_DISABLED" });
  });

  it("profil, provider ve model birebir eslesince model READY olur", () => {
    const result = evaluateWorkerReadiness({
      enabled: true,
      profiles: [profile],
      default_profile: "local-glm",
      configured_model: "litellm/GLM-5.3-Flash-IT",
      configured_providers: { litellm: { options: { apiKey: "{env:KEY}" } } },
    });
    expect(result).toMatchObject({ capability: "model", status: "READY", evidence_level: "CONFIGURED", reason_code: null });
    expect(result.detail).not.toContain("KEY");
  });

  it("Maven/Java version probe basarisizsa executable bulunsa bile Maven NOT_READY olur", () => {
    const result = evaluateMavenReadiness({
      platform: "win32",
      executable_found: true,
      version_probe_passed: false,
      failure_reason: "MAVEN_VERSION_UNVERIFIED",
    });
    expect(result).toMatchObject({ capability: "maven", status: "NOT_READY", reason_code: "MAVEN_VERSION_UNVERIFIED" });
  });

  it("Maven READY sonucu capability probe seviyesini tasir", () => {
    const result = evaluateMavenReadiness({
      platform: "win32",
      executable_found: true,
      version_probe_passed: true,
      maven_version: "3.9.16",
      java_version: "25.0.3",
    });
    expect(result).toMatchObject({ capability: "maven", status: "READY", evidence_level: "CAPABILITY_PROBED" });
  });
});


describe("registered MCP entry readiness", () => {
  const entryJs=join(process.cwd(),"dist/mcp/stdio-entry.js"),config=join(process.cwd(),"fixture-config.json"),db=join(process.cwd(),"fixture.db");
  const entry={type:"local",command:["node",entryJs],environment:{AITEST_CONFIG:config,AITEST_DB_PATH:db,AITEST_WORKER_ENABLED:"0"}};
  const evaluate=(value:unknown,ambient:Record<string,string|undefined>={AITEST_WORKER_ENABLED:"1"})=>{
    const fn=(readiness as unknown as {evaluateRegisteredMcpEntry:(input:unknown)=>{valid:boolean;worker_enabled:boolean;command:string[];environment:Record<string,string|undefined>}}).evaluateRegisteredMcpEntry;
    expect(fn).toBeTypeOf("function");
    return fn({entry:value,entry_js:entryJs,config_path:config,db_path:db,ambient});
  };
  it("lets the registered disabled flag win over the verifier shell",()=>{expect(evaluate(entry)).toMatchObject({valid:true,worker_enabled:false});});
  it.each(["missing","extra","disabled","foreign"])("rejects %s registered command configuration",variant=>{
    const value={...entry,command:[...entry.command]};
    if(variant==="missing")value.command[0]="does-not-exist.exe";
    if(variant==="extra")value.command.push("--unexpected");
    if(variant==="disabled")Object.assign(value,{enabled:false});
    if(variant==="foreign")value.command[1]=join(process.cwd(),"foreign.js");
    expect(evaluate(value).valid).toBe(false);
  });
  it("keeps the actual registered executable and merged environment for the handshake",()=>{
    const value={...entry,command:[process.execPath,entryJs],environment:{...entry.environment,AITEST_WORKER_ENABLED:"1",AITEST_PROFILE:"v2"}};
    const result=evaluate(value,{AITEST_WORKER_ENABLED:"0",SENTINEL:"keep"});
    expect(result).toMatchObject({valid:true,worker_enabled:true,command:value.command,environment:{AITEST_PROFILE:"v2",SENTINEL:"keep"}});
  });
});


describe("installed MCP environment upgrade",()=>{
  const build=(previous:unknown,ambient:Record<string,string|undefined>)=>{
    const fn=(readiness as unknown as {buildRegisteredMcpEnvironment:(old:unknown,env:Record<string,string|undefined>,config:string,db:string)=>Record<string,string>}).buildRegisteredMcpEnvironment;
    expect(fn).toBeTypeOf("function"); return fn(previous,ambient,"new-config","new-db");
  };
  it("preserves registered worker/profile/custom values while replacing mandatory runtime paths",()=>{
    expect(build({AITEST_CONFIG:"old",AITEST_DB_PATH:"old",AITEST_WORKER_ENABLED:"1",AITEST_PROFILE:"v2",SENTINEL:"keep"},{}))
      .toEqual({AITEST_CONFIG:"new-config",AITEST_DB_PATH:"new-db",AITEST_WORKER_ENABLED:"1",AITEST_PROFILE:"v2",SENTINEL:"keep"});
  });
  it("lets an explicit disabled worker flag override a previous enabled installation",()=>{expect(build({AITEST_WORKER_ENABLED:"1"},{AITEST_WORKER_ENABLED:"0"}).AITEST_WORKER_ENABLED).toBe("0");});
  it("keeps a fresh installation disabled without transferring unrelated shell variables",()=>{expect(build(undefined,{UNRELATED:"omit"})).toEqual({AITEST_CONFIG:"new-config",AITEST_DB_PATH:"new-db"});});
});
