# Checkpoint: 2026-10-11 - AITE-REPORT06-INTEGRATION-004 W00 baseline

## Gorev

- AITE-REPORT06-INTEGRATION-004 v1.0; Rapor 06 entegrasyonu ve kanit zinciri duzeltmeleri
- Onceki gorev: AITE-RUNTIME-ACCEPTANCE-003 v2.0 (arsiv: ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v2.0.md)
- Uygulayici: opencode worker (litellm/GLM-5.3-Flash-IT, varyant xhigh)

## W00 dogrulanmis baseline (2026-10-11)

- Branch: main; HEAD: 1925b128e590f91ca1f5a3ee164abd7d48fdccd1 (incelenen commit ile eslesiyor)
- Remote: origin https://github.com/mehmet-karacan/ai-test-engineering.git
- Git kimligi (repo-local): mehmet-karacan <karacan.mehmet@hotmail.com>
- Referans 06 HTML: docs/reporting/reference/innova_test_raporu_tasarim_06.html
  - 257845 bayt; SHA-256 e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80 (beklenen ile eslesiyor)
- Onceki aktif gorev arsivi: ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v2.0.md
  - 150429 bayt; SHA-256 40819cc6f2680bc15e4e9c7c3cdb53a62a16171d998e353bb4a99b5bab4c58a3 (beklenen ile eslesiyor)
- Yeni AKTIF_GOREV.md (dirty, kullanici hazirladi): SHA-256 7426734dcbd9e6766fd4212cf0dd43c2eb7f7b2dc3d51b177bf7608c5d3742e8
- release-verify.mjs: SHA-256 2ab045b4bc73b898782ebbf896b45b256e467b6040600bd5bb8944cdfed5374f

## Dirty/untracked envanter (dokunma kurallari)

- M  AKTIF_GOREV.md - kullanici hazirladi; yeni gorev sozlesmesi (korunur)
- ?? ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v2.0.md - onceki gorev arsivi (korunur)
- ?? docs/reporting/ - 06 HTML referansi (korunur; hash dogrulandi)
- ?? java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java
  - sahibi belirsiz untracked dosya: SILME, STAGE ETME, UZERINE YAZMA (0.2 siniri)
- Eski aktif gorev hash'i beklenen ile eslesiyor; ustune yazilMADI

## W00 test kaniti (gercek komut + exit)

- `npm.cmd run typecheck`: exit 0 (temiz)
- `npm.cmd run lint`: exit 1 - 1 error (scripts/release-verify.mjs:40 'sha256File' unused;
  onceki devirlerden) + 104 warning; bu gorevde F17/W10 kapsaminda duzeltilecek
- `npm.cmd test` (vitest run): exit 0 - 45 dosya, **375/375 PASSED**, 129.38s (Node v24.14.1, vitest 4.1.11)
  - PROJECT_STATE'teki 375/375 iddiasi son HEAD'de yeniden olculdu: dogrulandi

## Mevcut rapor akisi kod incelemesi (F01-F18 dogrulama)

F01: worker-client.ts completedField her dolu finish degerini tamamlanma sayiyor (satir 206);
promptForJson bos/aborted finali tek Error("MODEL_TIMEOUT") yapiyor (satir 229-231). DOGRULANDI.
F02: job-dispatcher.ts generateCandidateFromWorker attempt yalniz basarili promptForJson SONRASI yaziliyor
(satir 531-550); message_id/input_digest/output_digest null; parse once status:ok; finally cleanup yok. DOGRULANDI.
F03: worker-server-manager.ts sabit port 14096 (DEFAULT_WORKER_PORT), ortak tmpdir/aitest-worker-xdg,
config yalniz ilk kosuda yaziliyor (existsSync kontrolu satir 82), {...process.env} tumu kopyalaniyor
(satir 73). DOGRULANDI.
F04: role-prompts.ts classBody.slice(0, 12000) - sessiz kesme + 'birebir' etiketi (satir 31). DOGRULANDI.
F05: inventory-repository.ts resolveTarget '%Name' suffix FQCN LIKE (satir 112-122);
dispatcher 188: endsWith("Test") filtresi LoadTest gibi production siniflarini da eler. DOGRULANDI.
F06: build-plan.ts runBaseline framework none ise sentetik run exit_code:0 NO_TESTS (satir 113-130);
satir 151-155 status hesabi effectively her exit!=0 durumunda FAILED; XML parse catch continue
(satir 104). DOGRULANDI.
F07: build-plan.ts maven_goals_coverage sabit ["test","jacoco:report"]; affected_modules plan alanina
yaziliyor ama komuta yansimiyor; readCoverageAfterRun yalniz join(projectRoot,"target","site","jacoco")
root path (candidate-loop.ts satir 46). DOGRULANDI.
F08: candidate-loop.ts applyOverlay change.path.replace(/\//g,"\\") - POSIX'te bozuk (satir 120);
overlay dogrudan projectRoot test kokune yaziliyor + finally revert (satir 249-301). DOGRULANDI.
F09: candidate-loop.ts accepted_snapshot_dir'a kopyalama var (satir 334-348) ama sonraki run/workspace
bu setten kurulmuyor; dispatcher on_accepted yalniz appendEvent + stderr (satir 220-228). DOGRULANDI.
F10: candidate-loop.ts meaningfulGain yalniz afterBps (LINE) bazli (satir 303); dispatcher final
outcome'u readCoverageAfterRun (root XML) ile yeniden kuruyor (satir 287-304). DOGRULANDI.
F11: job-dispatcher.ts resumeDispatch targetRows okuyup dispatch'i bastan cagiriyor (satir 421-439);
checkpoint/butce yuklemesi yok; cancel yalniz lifecycle yaziyor (job-tools.ts satir 92-117). DOGRULANDI.
F12: services.ts workerEnabled sadece env flag (satir 372); mode/model_profile contract'a girse bile
goal kararinda kullanilmiyor; handleTestStatus/handleTestResult mevcut checkout XML'ini okuyor
(services.ts 465-481, job-tools.ts 137-152). DOGRULANDI.
F13: job-dispatcher.ts reportData iterations:[], tests_added:0, run_summary hepsi 0, models[]
(satir 334-341); job COMPLETED rapordan sonra da olsa failure yolunda rapor uretilmiyor. DOGRULANDI.
F14: report-generator.ts eski basit HTML; 'yorumlar AI tarafindan uretildi' metni satir 150;
ReportData schema_version:1 dar kontrat. DOGRULANDI.
F15: report-generator.ts verifyExport verification_passed yalniz missing.length===0 (satir 217);
hash_mismatch raporlaniyor ama sonucu etkilemiyor; join(root,name) traversal kontrolu yok (satir 231).
DOGRULANDI.
F16: docker-runner.ts provisionDependencies network:"bridge" (satir 428); allowed_mirrors yalniz hata
mesajinda; paylasilan aitest-m2-cache volume + kullanici settings ro mount; NO_CGROUP memoryLimitApplied
match (satir 296). DOGRULANDI.
F17: release-verify.mjs dosya sayimi/marker/digest fingerprint; actual suite/job kaniti yok;
catalog.json kontrolu RT 28 adet yapisal. DOGRULANDI.
F18: lint 1 error; tam suite 375/375 bugun olculdu; kalici fixture harness yok. DOGRULANDI.

## Pilot durumu (degismedi)

- Canli pilot: PAUSED_BY_USER / evidence NOT_PASSED / root_cause UNRESOLVED
- Bu gorev kendiliginden canli model/provider denemesi YAPMAZ; davranislar yerel HTTP fixture ile kanitlanir

## Sonraki somut eylem

- W01: tests/contract altina yeni typed worker state machine testleri + src/workers/opencode/worker-client.ts
  typed completion sonucu (WorkerPromptOutcome) eklenmesi; N09-N13 fixture'lariyla dogrulama.
  Beklenen: yeni contract test dosyasi yesil; mevcut 375 test regresyonsuz.
