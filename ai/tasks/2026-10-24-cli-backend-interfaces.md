# CLI backend parcalari icin ortak arayuz

BASE ceb1285. Plan ai/tasks/2026-10-24-cli-backends-plan.md.
Root services/dispatcher/durablecandidate/installer integration ve CLIcanary
uzerinde calisir. Diger implementerlar yalniz kendi dosyalarina yazar.

## Config parcasi

Yeni src/workers/backend-config.ts exportlari:
- WorkerBackendSchema/WorkerBackend discriminated kind:
  {kind:'opencode'} | {kind:'cli_json',command:string[]} |
  {kind:'codex_cli',executable:string,auth_home?:string}. Env reference isimleri
  profile.secret_reference_names alanindan gelir; rawsecret/extra shellargs yok.
- WorkerBinding: {profile_name,provider_id,model_id,backend,
  command_inputs?:Array<{path:string,sha256:string}>}. CLI executable ve
  absolute regularfile arg'lari selection'da hash'lenerek frozen olur.
- WorkerBindingSchema; resolveWorkerBinding(config,{worker_profile?,model_profile?})
  => WorkerBinding | undefined. Undefined legacy OpenCode default yoludur.
  Explicit profil veya CLIdefault tam binding doner; farkli model/ambiguous
  secim/frozen config degisimi fail-closed. Raw undefined->eski digest korunur.
- Backendconfig optional WorkerProfileSchema.backend; new optional string
  TestStart/TestResume.worker_profile. JobContractInput.worker_binding optional
  immutable. Secretfreeconfig backend'i yalniz tanimliysa include eder.
Config agent application/services/dispatcher/scripts'e dokunmaz.

## CLI execution parcasi

Yeni src/workers/cli/cli-candidate-client.ts exportlari:
- CliBackendConfig: cli_json/codex_cli ustteki ayni yapisal shape.
- CliCandidateClient(options:{backend:CliBackendConfig,workRoot:string,
  envReferenceNames?:string[],pinnedInputs?:Array<{path:string,sha256:string}>,
  lifecycle?:NativeProcessLifecycle}).
- createSession():Promise<{session_id:string}>;
- generate({session_id,prompt,model:{providerID,modelID},timeout_ms,
  max_output_bytes,signal?}) => Promise<{value:unknown,text:string,
  message_id:string|null,usage:{input_tokens:number|null,output_tokens:number|null}}>
- abortSession(id):Promise<void>; stopOwnedServer():Promise<void>.
- CliCandidateError.kind TIMEOUT|CANCELLED|PROVIDER_ERROR|EMPTY_FINAL|TRUNCATED_JSON.
Prompt/signal/task/output immutable lineage'i root AgentScheduler'dadir.

Owned WindowsProcessSupervisor, Nodebridge scripts/cli-candidate-bridge.mjs
requestfile ile prompt'u stdin'e tasir; argv'ye prompt girmeyecek. Bridge
backend'i shell:false spawn eder. Generic stdin envelope schema_version1,
prompt,model,json_schema; stdout exact CandidateChangeSet JSON, stderrprivate.
Codex exec stdin+outputschema+ephemeral+read-only+ignore-user-config;
shell_tool/multi_agent/apps kapali, web_search disabled, mcp_servers bos.
ignore-rules veya sandbox bypass kullanma; managed policy degistirme. Auth
Codex kendi kayitli ChatGPT login'i, yeni APIkey kurulumu/copy/log yok.
Codex schema strict optional/null normalizasyonu yalniz bilinen optional
alanlarda ve engine validator'a dokunmadan; required null invalid kalir.
Bouned stdout/stderr/resultfile, nonzero/corrupt/oversize/timeout/cancel fail
closed; parentkill childtree JobObject ile kapatilir. Node/bridge/backendfile
hashleri native pin'de. Backendcli unavailable ise OpenCodefallback yok.
CLI implementer config/service/dispatcher'e dokunmaz; inputtypes yapisaldir.

Her implementer native create_worktree(ref ceb1285) ve codex/ branch kullanir.
Root d03b plani/brief'i explicit path'ten okuyup hash'i kontrol eder. RED/GREEN
ve odaktest/typecheck/lint; oncesi identity/ASCII/privacy/stageddiff; commit
yap push yok. Realmodel/customer/Maven kosularini root yapar. Rawkanit TEMP/
LOCALAPPDATA; session/providersecret public'e girmez. Bagimsiz reviewer ayri.
