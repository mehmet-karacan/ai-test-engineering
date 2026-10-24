import { it,expect,vi } from "vitest";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";import {join} from "node:path";
import {readConfigFile,mergeConfigRecord} from "../../src/configuration/config-merge.js";
import {WorkerServerManager} from "../../src/workers/opencode/worker-server-manager.js";
import {readWorkerProfileFromOpencodeConfig} from "../../src/workers/opencode/profile-reader.js";
it.each([false,true])("preserves JSONC/BOM settings across install and worker profile reads (BOM %s)",bom=>{
 const root=mkdtempSync(join(tmpdir(),"opencode-jsonc-")),path=join(root,".config/opencode/opencode.json");
 mkdirSync(join(root,".config/opencode"),{recursive:true}); vi.stubEnv("USERPROFILE",root);
 const raw=(bom?"\uFEFF":"")+'{/* operator note */"model":"fixture/test","provider":{"fixture":{"options":{"baseURL":"http://127.0.0.1:1234"}}},"sentinel":"https://keep.example/path"}';
 try{writeFileSync(path,raw);expect(readConfigFile(path).parsed["sentinel"]).toBe("https://keep.example/path");
 const manager=new WorkerServerManager({opencodeExecutable:"unused",port:1234,startupTimeoutMs:1000,workDir:root});
 const worker=(manager as unknown as {buildWorkerConfigContent:()=>Record<string,unknown>}).buildWorkerConfigContent();
 expect(worker["provider"]).toHaveProperty("fixture");expect(worker["mcp"]).toEqual({});
 expect(readWorkerProfileFromOpencodeConfig(path)).toMatchObject({provider_id:"fixture",model_id:"test"});
 const result=mergeConfigRecord(path,{record_path:["mcp","ai-test-engineering"],new_value:{type:"local"},backup_dir:join(root,"backups")});
 expect(readFileSync(result.backup_path!,"utf8")).toBe(raw);expect(readConfigFile(path).parsed["sentinel"]).toBe("https://keep.example/path");
 }finally{vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});}
});
