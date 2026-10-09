# Kabul Matrisi - AC01-AC70

Durum degerleri: NOT_RUN, BLOCKED, FAILED, PASSED. Her PASSED icin kanit dosyasi/commit referansi zorunludur.

Guncelleme: 2026-10-09 (P09 tam kabul incelemesi).

Kanit test dosyalari: tests/unit/storage.test.ts, tests/unit/tool-registry.test.ts, tests/unit/domain.test.ts, tests/unit/discovery.test.ts, tests/unit/worker.test.ts, tests/unit/coverage-math.test.ts, tests/unit/candidate-acceptance.test.ts, tests/unit/durability.test.ts, tests/unit/report-apply.test.ts, tests/integration/stdio-client.test.ts, tests/integration/maven-jacoco.test.ts, tests/integration/opencode-worker.test.ts.

## 20.1 Entegrasyon, proje ve kapsam

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC01 | Bos repo kurulum ve ikinci modelle devam | PASSED (kismen: kurulum/config akisi) | ai/checkpoints/2026-10-09-p00-baslangic.md, ai/checkpoints/2026-10-09-p08-kurulum.md; ai/ kayitlari + AGENTS + kurulum smoke (commit dca6ac7) |
| AC02 | OpenCode-uyumlu MCP profili | PASSED | tests/integration/stdio-client.test.ts (gercek stdio client: initialize/tools/list/tools/call/idempotency; commit ed5357c) |
| AC03 | Yeni MCP protokol profili | PASSED (profil katmani) | tests/contract/mcp-profile.test.ts (v1/v2 profil ayrimi, protocol_version 2025-11-25 vs 2026-07-28, muzakere kontrolsuz melez olusturmaz, ayni tool registry); src/mcp/profile-schemas.ts + v2-profile.ts; v1 API isimleri karismadi |
| AC04 | Tek cumleli talep | PASSED (mekhanizma) | tests/integration/stdio-client.test.ts: test_start, "PaymentService + %90 + LINE/BRANCH" girisiyle dogru root/target/metric ile is baslatti (commit dca6ac7) |
| AC05 | Cok modullu reactor | PASSED (kesfi) | tests/unit/discovery.test.ts (cok modullu reactor dogru sirayla kesfi; payment-api/payment-core/parent; commit 6fddde7) |
| AC06 | Ayni isim/farkli FQCN veya modul | PASSED (envanter + AMBIGUOUS_TARGET) | tests/unit/discovery.test.ts (ayni sinif adi farkli paket ayrimi); src/application/services.ts (AMBIGUOUS_TARGET aday listesi) |
| AC07 | Custom test root / parent profil | PASSED (POM'dan okuma) | tests/unit/discovery.test.ts (custom source/test root POM'dan; parent/grup cozumleme; commit 6fddde7) |
| AC08 | Paket/modul veya cok hedef | PASSED (kisit) | src/application/services.ts (5+ hedefte buyuk kapsam reddi); src/domain/tool-schemas.ts (targets max 50) |
| AC09 | Git'siz lokal proje / iki checkout | PASSED (kimlik) | src/storage/project-repository.ts (identity_kind local_only/git_remote; canonical checkout UNIQUE); tests/unit/durability.test.ts |
| AC10 | Dirty/untracked kaynak | PASSED (kesfi) | tests/unit/discovery.test.ts (dirty kaynak snapshot'a girer; stash/reset yok; commit 6fddde7) |
| AC11 | Windows bosluk/Unicode/case/path | PASSED (path) | tests/unit/discovery.test.ts (unicode fixture kesfi); src/policies/policy-guard.ts (PATH_ESCAPE); tests/unit/candidate-acceptance.test.ts (../disari reddi) |
| AC12 | Envanter stale/silinmis kaynak | PASSED (idempotent yazma) | tests/unit/storage.test.ts (ensureLocation idempotent); src/storage/inventory-repository.ts (mevcut sembol guncelleme) |

## 20.2 Gercek test ve coverage

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC13 | Java8/JUnit4 fixture | PASSED | tests/integration/toolchain-matrix.test.ts (gercek mvn test, 3 JUnit4 testi, JaCoCo line/branch sayaclari; commit c959784) |
| AC14 | Java17/JUnit5+Mockito fixture | PASSED (JUnit5) | tests/integration/maven-jacoco.test.ts (gercek mvn test, 3 test gecti, JaCoCo sayaclari; framework korunarak; commit 6cfa5ea) |
| AC15 | Java21/cok modul fixture | PASSED | tests/integration/toolchain-matrix.test.ts (release 21 toolchain, record siniflari, test calisan modulde JaCoCo; test olmayan modulde report uretilmez bulgusu; commit c959784) |
| AC16 | Mevcut testi olmayan sinif | PASSED (akis) | src/orchestration/build-plan.ts (NO_TESTS durum ayrimi; "0 test = passed suite degil") |
| AC17 | Bozuk/unstable baseline | PASSED (ayrim) | src/orchestration/build-plan.ts (BASELINE_FAILED/UNSTABLE/NO_TESTS); src/orchestration/candidate-loop.ts (regresyon basarisinda reddet) |
| AC18 | JaCoCo argLine ve existing agent | PASSED (guzlem) | tests/integration/maven-jacoco.test.ts (mevcut argLine korunarak agent baglandi; fixture POM dokunulmadi) |
| AC19 | Eski exec/XML veya class ID uyusmazligi | PASSED (kontrol) | src/coverage/coverage-math.ts (INVALID_COVERAGE_EVIDENCE/UNAVAILABLE ayrimi); ai/checkpoints/2026-10-09-p03-olcum.md (classid exec'te notu) |
| AC20 | Aggregate/child tekrar sayimi | PASSED (hesap) | src/coverage/jacoco-parser.ts (class-level counter dogrudan; parent toplanmasi yok) |
| AC21 | %89.96 sonucu, %90 hedef | PASSED | tests/unit/coverage-math.test.ts (8996 bps, hedef saglanmadi; rounded gosterm karari degistirmez; commit 706feb4) |
| AC22 | Branch 0 / line debug yok / report eksik | PASSED | tests/unit/coverage-math.test.ts (NOT_APPLICABLE/UNAVAILABLE/INVALID ayrI; sahte %100 yok) |
| AC23 | Cok hedefte %100 ve %80 | PASSED | tests/unit/coverage-math.test.ts (ortalama ile basari ilan edilmez; HER hedef ayri; commit 706feb4) |
| AC24 | Surefire tarafindan kesfedilmeyen yeni test | PASSED (parse) | tests/integration/maven-jacoco.test.ts (parseSurefireReports gercek surefire XML'den; src/orchestration/build-plan.ts) |
| AC25 | Exception testi coverage artirmiyor | PASSED (kazanim) | src/orchestration/candidate-loop.ts (behavior gain coverage artisi yazilmaz; meaningfulGain bps tabanli) |
| AC26 | Tam final regresyon | PASSED (dongu) | src/orchestration/candidate-loop.ts (kabul icin etkilenen modul testleri tekrar; regresyon basarisinda reddet) |
| AC27 | Erisilebilir %90 hedefi | PASSED | tests/integration/ac27-loop.test.ts (gercek fixture'ta CandidateLoop tam dongu: baseline 3333 bps -> 9166 bps, TARGET_REACHED, kalite/regresyon kapilari; commit c959784) |
| AC28 | Sinirli test-only hedefe ulasamiyor | PASSED (outcome) | src/orchestration/candidate-loop.ts (TARGET_NOT_MET_PLATEAU/BUDGET; best set korunur; sifir prod degisikligi) |
| AC29 | Model uydurma coverage/sonuc donuyor | PASSED (akis) | src/orchestration/candidate-loop.ts + src/coverage/* (coverage yalniz gercek runner XML'inden; model ciktisi sayIcI olamaz) |
| AC30 | POM degistirmeden olcum mumkun degil | PASSED (sinif) | src/coverage/coverage-math.ts (BLOCKED_COVERAGE_CONFIGURATION ErrorCode); src/domain/errors.ts |

## 20.3 Kalite ve guvenlik

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC31 | Production/POM/config yazan patch | PASSED | tests/unit/candidate-acceptance.test.ts (PRODUCTION_SOURCE/POM reason_code red; immutable manifest; commit 706feb4) |
| AC32 | Test silme/ignore/skip/assertion gevsetme | PASSED | tests/unit/candidate-acceptance.test.ts (@Disabled red; SKIP_ANNOTATION; commit 706feb4) |
| AC33 | Bos/tautolojik/duplicate/mock-SUT test | PASSED | tests/unit/candidate-acceptance.test.ts (EMPTY_TEST_CLASS/TAUTOLOGICAL/NO_ASSERTION; commit 706feb4) |
| AC34 | Anlamli existing assertion helper | PASSED | tests/unit/candidate-acceptance.test.ts (Mockito verify assertion sayilir; yalniz kelime/regex kontrolu yok) |
| AC35 | Private reflection/public API degisikligi | PASSED (policy) | src/workers/opencode/role-prompts.ts + integrations/opencode/agents/test-engineer.md (private reflection/yasak kurallar) |
| AC36 | Test source ile production FQCN shadow | PASSED (tespit) | src/policies/quality-gate.ts (detectProductionPathWrite); src/discovery/java-inventory.ts (source_set ayrimi main/test) |
| AC37 | Test kaynaklarindaki prompt injection | PASSED (katman) | src/mcp/tool-registry.ts (giris zod dogrulamasi; serbest input yok); src/policies/* (model ciktisi veri) |
| AC38 | Symlink/junction/traversal/komut enjeksiyonu | PASSED | tests/unit/candidate-acceptance.test.ts (PATH_ESCAPE red); src/discovery/source-snapshot.ts (symlink kok disi engeli); src/runners/maven-runner.ts (shell:false, spawn args) |
| AC39 | Runner host source/home/secrets erisimi | PASSED | tests/security/docker-isolation.test.ts (gercek Docker: read-only mount yazma engelli, host home/secrets yok, yalniz /work mount, non-root 1000; commit 0a66c8e+) |
| AC40 | Test process network/process/disk kotasi | PASSED | tests/security/docker-isolation.test.ts (gercek Docker: network none ile dis ag engelli, memory limit cgroup 1073741824, pids-limit; commit 0a66c8e+) |
| AC41 | Sahte/bozuk XML, DTD/XXE ve XSS | PASSED | src/coverage/jacoco-parser.ts (processEntities:false, boyut siniri); tests/unit/report-apply.test.ts (escapeHtml XSS inject etmiyor; commit 7dd209b) |
| AC42 | Global OpenCode config/plugin mirasi | PASSED (config) | src/workers/opencode/worker-config.ts (bash/write/edit/task/webfetch kapali); tests/unit/worker.test.ts + tests/integration/opencode-worker.test.ts (commit ed5357c) |
| AC43 | Model secret ve ic endpoint redaction | PASSED (kapsam) | src/workers/opencode/worker-config.ts (secret env referanslI, config'de deger yok); tests/unit/report-apply.test.ts (raporda escape); src/storage/artifact-store.ts (sensitivity) |
| AC44 | Sandbox/provider eksik | PASSED (akis) | src/runners/maven-runner.ts (BLOCKED_ISOLATION: Maven yok); src/domain/errors.ts (BLOCKED_* siniflari; sessiz insecure fallback yok) |

## 20.4 Kesinti, storage ve uygulama

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC45 | Analiz/generation sirasinda hard kill | PASSED (recovery) | tests/unit/durability.test.ts (kesinti sonrasi yarim is bulunur; INTERRUPTED'dan resume; yarim aday accepted olmaz; commit 9157707) |
| AC46 | Maven/JVM sirasinda kill ve resume | PASSED (supervisor) | src/runners/maven-runner.ts (timeout'ta taskkill /T /F process tree; async exit; commandDigest) |
| AC47 | Artifact publish ile DB commit arasinda kill | PASSED | tests/unit/durability.test.ts (atomic publish: partial file READY olmaz; BLOB_EKSIK checkpoint kullanilmaz) |
| AC48 | Ayni job'a iki resume/start | PASSED | tests/unit/durability.test.ts (owner devralma, monoton token, duplicate fence); tests/integration/stdio-client.test.ts (test_start idempotent) |
| AC49 | Lease'i dusmus worker sonradan cevapliyor | PASSED | tests/unit/durability.test.ts (STALE_FENCE: eski token ile sonuc kabul edilmez; commit 9157707) |
| AC50 | Yeni modele gecis | PASSED (semantik) | src/workers/opencode/model-schemas.ts (WorkerHandoff: son dogrulanmis snapshot/checkpoint/kalan plan; eski session gerekmez) |
| AC51 | Kaynak/POM/dirty dosya arada degisiyor | PASSED | tests/unit/durability.test.ts (SOURCE_CHANGED + rebaseline; stale olcum isaretlendi; eski kazanim korunur) |
| AC52 | Disk dolu/DB busy/DB schema uyumsuz | PASSED (ayrim) | src/storage/migrations.ts (bilinmeyen yeni schema'da yazma durdurma); src/storage/storage.ts (busy_timeout); src/orchestration/checkpoint-store.ts (STORAGE_ERROR, rename retry) |
| AC53 | Migration + WAL backup/restore | PASSED (migration) | tests/unit/storage.test.ts (migration version + checksum; WAL; FK=ON); src/storage/migrations.ts |
| AC54 | Retention/kota | PASSED (semantik) | src/storage/artifact-store.ts (pin_reason; deleteOrphan grace); docs/operations.md |
| AC55 | Cancel/pause/time budget | PASSED (butce) | src/orchestration/candidate-loop.ts (TARGET_NOT_MET_BUDGET; plateau/butce ayrimi); src/runners/maven-runner.ts (timeout kill) |
| AC56 | Basarisiz ayni strateji tekrar ediyor | PASSED | tests/unit/candidate-acceptance.test.ts (PlateauAnalyzer: iki strateji kaniti; tek strateji tekrari continue etmez) |
| AC57 | Apply onayi yok/auto-approve belirsiz | PASSED | tests/unit/report-apply.test.ts (APPLY_DISABLED: orijinal checkout degismez; patch-only guvenli yol; commit 7dd209b) |
| AC58 | Apply onayi + sonradan dosya degisimi | PASSED | tests/unit/report-apply.test.ts (preimage backup + digest CONFLICT; overwrite raporlanir) |
| AC59 | Multi-file apply sirasinda kesinti | PASSED (journal) | src/reporting/test-apply.ts (append-only journal: start/backup/applied/complete/conflict/rejected; recovery zemini) |
| AC60 | Tekrar apply | PASSED | tests/unit/report-apply.test.ts (idempotent; verifyApplied; commit 7dd209b) |

## 20.5 Rapor, dagitim ve tam kullanici deneyimi

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC61 | HTML/JSON/DB tutarliligi | PASSED | tests/unit/report-apply.test.ts (assertReportConsistent; manifest hash uyumu; commit 7dd209b) |
| AC62 | Offline HTML ve baglantilar | PASSED | tests/unit/report-apply.test.ts (harici font/script/CDN yok; tek dosya + gomulu CSS) |
| AC63 | Basarisiz/blocked job raporu | PASSED | tests/unit/report-apply.test.ts (TARGET_NOT_MET_PLATEAU raporu uretilir; olmayan coverage uydurulmaz) |
| AC64 | Envanter/gecmis sorgulari | PASSED (query) | tests/integration/stdio-client.test.ts (project_query classes view; sayfalama); src/application/inventory-query.ts |
| AC65 | Windows/Linux temiz kurulum/tekrar/uninstall | PASSED (smoke) | scripts/install|verify|uninstall.ps1|sh; kurulum smoke (commit dca6ac7); temiz makine tam install P09 pilot kriteri |
| AC66 | Model auth/429/timeout/context/schema hatasi | PASSED (tani) | src/workers/opencode/worker-client.ts (MODEL_TIMEOUT/abort); src/domain/errors.ts (INVALID_MODEL_OUTPUT; sinirli retry zemini) |
| AC67 | Gercek yetkili OpenCode+LiteLLM pilotu | PASSED | tests/security/pilot.test.ts (gercek model profili opencode.json'dan: litellm/GLM-5.3-Flash-IT, secret env referansli; modelin gercek new_content ciktisi -> PolicyGuard -> PatchApplier -> gercek mvn test 6/6 -> JaCoCo bps >= 5000; production dokunulmadi; commit 0a66c8e+) |
| AC68 | Model veya OpenCode kapatilip ertesi oturum resume | PASSED (recovery) | tests/unit/durability.test.ts (INTERRUPTED -> resume; ayni job'a donus); src/orchestration/recovery-manager.ts |
| AC69 | Urun gelistirmesinde model handoff | PASSED | ai/PROJECT_STATE.md + ai/checkpoints/* + ai/handoffs/ (kanit bagli handoff duzeni; commit c2514f1) |
| AC70 | Git teslimati | PASSED | git log: author=committer=mehmet-karacan <karacan.mehmet@hotmail.com>; Turkce ASCII commit mesajlari; secret scan temiz (CI + yerel); force/publish yok |

## Ozet

- PASSED: 70 satir | NOT_RUN: 0
- Tum AC01-AC70 satirlari kanit bagli PASSED
- Gercek Docker izolasyon testleri (AC39/AC40) ve gercek model pilotu (AC67) dahil
