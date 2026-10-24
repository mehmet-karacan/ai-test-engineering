# Onayli test uygulama Implementation Plan

> Agentic workers: use executing-plans/subagent-driven-development; task boundaries below own separate files, RED->GREEN, independent final review.

Goal: Kullanici onayi sonrasi yalniz kabul edilmis yeni testleri asil projeye
uygula, mevcut testleri koru, tum testleri dogrula ve sonucu kalici kaydet.
BASE8349de7; kullanici bu isi acikca istedi. OpenCode-only surer. Windows,
Node24, yerel JDK/Maven; CI/Docker/macOS/ikinciUI/globalprovider degisikligi yok.
Asil customer checkout icin bu tur yeni apply/model/Maven kosusu yok;
sentetik acceptance mevcut G0 yetkisinde. Uygulama kullanicisi G2 somut onay
verir. Yayin G3 ayri. Gelistirme hafizasi ai/, runtime repo disinda.

Architecture/spec: Mevcut test_apply'nin PATCH_ONLY stub'i tamamlanir.
Preview engine'den best checkpoint/hash/source/root/dosya listesi uretir;
model supplied approval_reference onay sayilmaz. Actual MCP form accept+
approved:true, transport callback'ten gelir; unsupported/decline/cancel
yazmaz. OpenCode2.1.4 form support official docs ve installedversion ile
goruldu; actual protocol/SDK testleri bunu dogrular. Onaydan sonra tekrar
source/hash/checkpoint/fence kontrolu yapilir. Sadece create; mevcut dosya
overwrite/modify/delete yok. Uygulama sonrasi asil kaynaklarin verified
owned kopyasinda filtre olmadan tum Maven testleri+JaCoCo calisir. Asil POM
ve mevcut testler ayni kalir. Bu FULL_PROJECT_SNAPSHOT olarak acik yazilir.

Alternatives: Eski TestApplyService'i sadece enable etmek guvenilir onay,
kalici sahiplik ve verification saglamaz. Modelin yazdigi onay metni de
guvenilir degil. Ayrica UI/HTTPonay sunucusu bu urunun kapsaminda degil.
Secilen tasarim mevcut MCP human form/native file helper/JobObject/
NativeProcessRegistry/runBaseline/ReportExporter'i yeniden kullanir.

Shared interfaces: src/domain/apply-contracts.ts. Root owns application
coordinator, operation repository/migration, full-suite runner, jobtools/
services status/result/cancel integration. Publisher agent owns new
src/orchestration/workspace-test-publisher.ts + focused native tests.
Approval agent owns tool schemas/MCP context wiring/SDK consent tests.
Report agent owns reporting + report-runtime + OpenCode skill/docs tests.
Isolated native managed worktrees, short hashed brief, no concurrent writers.

- [x] Task1 native create-only publisher: strict paths/allowed roots,
  unique operation journal fsync, native FileId+sha receipts before publish,
  NO_REPLACE publish, idempotent recovery/rollback only owned unchanged files.
  API constructor({workspace,storeRoot,operationId,allowedTestRoots});
  prepare(files:{path,sha256,content:Buffer}[]):void; publish():string[];
  rollback():{removed_paths:string[],conflicts:{path,reason}[]}; verify():boolean.
  Reload constructor+prepare can reconcile its own journal; no fake receipt.
- [x] Task2 approval: test_apply mode preview|apply|recover (defaultpreview),
  job_id required; project_root/target_workspace/checkpoint_id/patch_digest/
  approval_reference optional legacy hints. Digest hex validated. Approval
  text not trusted. ToolContext has ApplyCallContext members. MCP transport
  supplies requestApplyApproval(plan,signal) only after client form capability,
  calls elicitInput boolean approved, bounded deadline, real request binding.
  registerTools handler forwards context to handleTestApply third arg. No
  server-global user callback or approve RPC. Agent can extend wrapper
  signature/context forwarding only; root replaces application body later.
- [x] Task3 root durable coordinator: migrate10 apply_operations, immutable
  plan+one active op/job, job lease fence/native process ownership, bounded
  background execution/status/result, strict checkpoint/source/batch hash,
  repeated calls no duplicate run. Original baseline test inventory retained;
  runBaseline collectcoverage/cli/test_selectors=[] fresh source copy;
  original before/after source hash equal to applied source, new testcases
  present; failures/timeouts/cancel roll back own files, uncertain cleanup
  RECOVERY_REQUIRED. Process crash cannot silently APPLIED. Recovery only
  rolls back an old op and requires a new approval for retry.
- [x] Task4 report/application result: optional ReportData.application:
  ApplyOperationView, truth from root repository read helper only. Planned
  src/storage/apply-operation-repository.ts getApplyOperationView(db,jobId)
  returns latest view/null (old DB table absent returnsnull). application
  snapshot/source scope, all test counters, skipped/fail/rollback explicit,
  no fake generation outcome or verification promotion. Serialized runtime
  sync includes application facts and checks manifest+hash. Old exports
  without application stay valid. OpenCode skill uses preview/form/apply/
  polling; terminal APPLIED only after tests pass. Update docs PATCH_ONLY.
- [x] Task5 integrate, edge/negative native/SDK tests, real synthetic
  approval->original new test->full Maven/JaCoCo proof (no manual model test
  completion claim), browser/report/old job compatibility, full Windowssuite,
  independent review, checkpoints/acceptance, identity/ASCII/privacy/staged
  diff then commit/main build/verify/push. No new account/key/deploy.

Review focus: source changes while user reads approval; existing file name
collision; process hardkill between journal/file/DB; cancellation during
Maven verification; two clients race approvals or reuse old patch scope.
Each corresponding owner adds RED->GREEN cases. Existing modified tests,
production/POM changes, missing accepted blob/hash, crossjob checkpoint,
missing final replay, wrong target/root, unapproved/cancelled calls fail
closed with zero writes. Preserve user edits during rollback; uncertain
native cleanup never becomes success. All runtime evidence stays private.
