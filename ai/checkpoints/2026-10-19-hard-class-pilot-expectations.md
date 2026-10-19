# Checkpoint - Zor Java siniflari pilotu: beklenti ve immutable kaynak kimlikleri (kosudan ONCE)

- Tarih: 2026-10-19
- Amaç: Kullanici talimati madde 4 - yetkili Java proje envanterinden 4 farkli zor sinif; davranis beklentisi ve immutable kaynak kimligi kosudan once kaydedilir.
- Yetkili proje: `C:\innova\projeler\gpu-fusion` (proje_id `d692d8c1-c1c1-4aaf-a71a-80b80714f35d`, identity_kind `local_only`; MCP `project_inspect` preflight `ok`)
- Müşteri checkout'u read-only: commit/push/reset/clean/apply YAPILMAYACAK; isler owned runtime store'da yürütülür.
- Müşteri repo HEAD (okuma kimligi): `485a544bc87754f4d3c7181ec291d6389798ace5` (dal `features/5.0.1_SKYRSM-5747-yz-gupi`); repo genelinde 105 dirty dosya VAR ama secilen 4 dosyanin hicbiri dirty degil (git status bos cikti).
- Urun binary: `C:\Users\mkaracan\AppData\Local\Temp\opencode\qfix\dist\mcp\stdio-entry.js` (commit `cf4a8a950637935a467b1dfb35c94db4bed6a811`, F02/F03 duzeltmeleri dahil; tree_digest `e40276f7...`, file_count 318).
- Model: `litellm/GLM-5.3-Flash-IT` (sabit; sessiz provider/model fallback yok; test_start `model_profile` bu degerle gecer).
- Runner: `AITEST_RUNNER=windows_native`, `AITEST_WORKER_ENABLED=1`, pinli JDK `C:\Users\mkaracan\.jdks\ms-17.0.20.1` (17.0.20.1) + Maven 3.9.16 (WN73 mcp107 kanitli kalip).
- Runtime store (repo disi): `%LOCALAPPDATA%\ai-test-engineering\pilot\gpu-fusion-prod-20261019-hardclass` (ozel config.json + state.db).
- PIT/mutation: **NOT_RUN** (kullanici talimati madde 7; puan yayinlanmayacak).

## Preflight engelleri ve cozumleri (kosu oncesi)

1. **Musteri checkout'u dogrudan kaynak kok olamaz**: `gpu-fusion` koku git/node_modules/target/build haric bile 134.800 dosya / 54.107 dizin; `SourceSnapshot.buildManifest()` spread-recursive `walk` + sha hesabi ile stack overflow (`RangeError: Maximum call stack size exceeded`, `test_start` INTERNAL_ERROR, fail-closed). Cozum (WN73 kalibi): owned temiz kaynak koku — yalniz `gpu-backend` modulu (pom.xml + src; 987 dosya, 6.2 MB, git'siz, 16 yol derinligi < 64 limiti). Aday dosya SHA-256'lari aynen korunur (salt-okunur kopya).
2. **Pinleme sozlesmesi WN73'ten sonra sikilasti** (commit `b7dd353`, bd3db182'de var): eksik `.mvn/jvm.config|maven.config|extensions.xml` opsiyonel dosyalari artik helper'a `-` girdisi olarak gidiyor ve helper fail-closed kapatıyor (`pin_unavailable`, exit 102). Resolver pin zinciri cwd'den surucu kokune kadar TUM atalar icin `.mvn` dosyalarini pinliyor. Cozum: X: surucusu owned `subst` (Temp\opencode\xdrive) ve kaynak kok `X:\gpu-fusion-prod-20261019-source-clean`; `X:\.mvn\{maven.config,jvm.config,extensions.xml}` bos/minimal gecerli dosyalar olarak saglandi (Maven davranisi degisir). Böylece ata zincirinde (source-clean → X:) eksik pin kalmadi.
3. **Dogrulama**: dogrudan `verifyNativeToolchain` cagrisi (qfix dist, gercek helper) `verify+lifecycle OK: mvn 3.9.16, java 17.0.20.1` — pinleme + probe gecti.
4. **Ilk is preflight gecti**: `test_start` kabul → `native_toolchain_verified` (job `a334b38d-8515-40cd-9188-4a5cdd06054f`, t03-preflight6) → baseline fazina gecti. wn73'unki de dahil onceki 5 deneme (t03-preflight..5) engel kaydi olarak wire loglarinda: `mcp-wire-t03-preflight*.ndjson`.

Not: `mvn.cmd -v` dogrudan cmd'den `exit: -1` donuyor (PowerShell $LASTEXITCODE); WN73'te ayni mvn.cmd calisti (owned_processes kayitlari CLOSED). supervisor exit kodunu helper status.json'dan okur; -1 görünümü cmd/batch etkilesim artifact'i, job yolunda gozlemlenmedi.

## Sinif secimi (4 zor sinif; envanterden)

### T01 - Hesaplama/sinir: `tr.com.innova.gpu.utils.DateUtils`
- Kaynak: `gpu-backend/src/main/java/tr/com/innova/gpu/utils/DateUtils.java` (725 satir, 28.388 karakter)
- SHA-256: `0dcb547c85ab5187cec410e20d96c31608e0af2cbde0d06fe6254b6bed8d33f6`
- Modul/yol: `gpu-backend`, test root `src/test/java`
- Mevcut test: `DateUtilsTest` VAR (1 sinif; parse/getStartOfDay/getEndOfDay odakli; day2Date/convertDay2Date/getDayDifference/isDistanceBetweenDatesMoreThanParam/ayniGunMu sinirlari zayif)
- Davranis beklentisi (kosu oncesi donduruldu):
  - `day2Date(0)` -> `{0,0,0}`; `day2Date(365)` -> `{0,0,1}`; `day2Date(366)` -> `{1,0,1}`; `day2Date(-30)` -> `{0,-1,-1}` (30/365 sabit ay modeli; negatif girdide Java bolme/yuvarlama sozlesmesi korunur)
  - `convertDay2Date(x)` `day2Date(x)` ile ayri parametre adina ragmen AYNI sonucu vermeli (birebir ayni govde)
  - `getDayDifference(d, d)` -> 0; ayni gun farkli saatler -> 0 (getDateInterval(baslangic=true) gun basina indirger)
  - `isDistanceBetweenDatesMoreThanParam(d, d.plusDays(dayCount), dayCount)` -> false (after KULLANIR; esitlikte false); `d.plusDays(dayCount+1)` -> true
  - `ayniGunMu(d, d)` -> true; farkli gunler -> false
- Kapsam hedefi: LINE 100%, BRANCH 100% (mevcut testin kapsamadigi sinir dallari)

### T02 - Bagimli servis: `tr.com.innova.gpu.service.DeductionService`
- Kaynak: `gpu-backend/src/main/java/tr/com/innova/gpu/service/DeductionService.java` (368 satir, 24.624 karakter)
- SHA-256: `36c018289edf963e1e6acfd86e209abd04fa82de82873cb775429e0621a42270`
- Bagimliliklar: `DeductionDao`, `KesintiSurumRepository`, `KesintiPrimKalemiRepository`, `KesintiUrunSurumRepository`, `ApprovalService`, `DegisiklikTakipService`, `EntityManager` (mock'lanabilir; gercek DB YOK)
- Mevcut test: `DeductionServiceTest` YOK
- Davranis beklentisi (kosu oncesi donduruldu):
  - `findByCriteria`: `pageSize < 0` -> tum kayit sayfalama (`PageRequest.of(0, Integer.MAX_VALUE)`); aksi halde `pageNumber-1` sayfa; donen map `page/per_page/total/totalPages` anahtarlarini tasiyor; `totalPages = ceil(total/pageSize)` (pageSize=0 bolme hatasi riski: `ArithmeticException`/Infinity davranisi belgelenmeli)
  - `deleteLogical(id, kullaniciId)`: once durum `LOGICAL_DELETED` kontrolleri, sonrasinda repository uzerinden logical silme; mock'larla dogrulanabilir
  - Mockito ile gercek DB/network KULLANILMADAN; exception cevirme (`GpuRuntimeException`/`GpuBusinessException`) sozlesmesi
- Kapsam hedefi: LINE 100%, BRANCH 100% (bagimliliklar mock'lanarak)

### T03 - Durum/idempotency: `tr.com.innova.gpu.yz.YzRaporMukerrerServisi`
- Kaynak: `gpu-backend/src/main/java/tr/com/innova/gpu/yz/YzRaporMukerrerServisi.java` (33 satir, 1.813 karakter)
- SHA-256: `63f3a047bdfabb3564c75401b5f9c9bfbf271d201372c3ee4f203d4a000c6c8b`
- Bagimliliklar: `RaporGonderimKilidi` (JdbcTemplate `for update` kilidi), `RaporMukerrerDenetimi`, `GpuReportService` (mock'lanabilir)
- Mevcut test: `YzRaporMukerrerServisiTest` VAR (6 test; BEKLIYOR/HAZIR/YOK/DOGRULANAMADI yollari)
- Davranis beklentisi (kosu oncesi donduruldu):
  - `kilitli(owner, work)`: lock.run'a owner ile delege; work sonucu aynen donmeli; owner null/0/negatif -> `YzErisimReddedildiException` (lock sozlesmesi)
  - `check(user, type, parameters)`: comparison.check'a `user.getId()`, `parameters.getReportFileType()`, `reports.projectReportParameters(...)` ile delege (parametre sirasi/degisim sozlesmesi)
  - `Check.izinli(regenerate, expectedId)` kayit sozlesmesi:
    - `durum=YOK` + `regenerate=false/null` + `expectedId=null` -> true
    - `durum=HAZIR` + `regenerate=true` + `expectedId==raporIstekId` -> true
    - `durum=HAZIR` + `regenerate=true` + farkli `expectedId` -> false
    - `durum=YOK` + `regenerate=true` -> false (YOK durumunda regenerate izni yok)
  - Idempotency: ayni parametrelerle tekrar check -> ayni karar; mevcut test korunur (tests_modified=0)
- Kapsam hedefi: LINE 100%, BRANCH 100% (izinli tum dallar)

### T04 - Buyuk/çok modullu sinif: `tr.com.innova.gpu.service.ProductVersionService`
- Kaynak: `gpu-backend/src/main/java/tr/com/innova/gpu/service/ProductVersionService.java` (2.169 satir, **154.808 karakter** - 12.000 karakter baglam butcesinin ~13 kati; F04 baglam darbogazi vaka)
- SHA-256: `1f08bf5fdb3ac37b6497a844d074d926430d5a14ec03efe83258c0888df007c2`
- Modul: `gpu-backend`; 25+ public metot (create/update/copyProduct/uploadExcelFile/approve*/reject*/deleteLogical...)
- Mevcut test: `ProductVersionServiceTest` YOK (yalniz controller testi VAR)
- Davranis beklentisi (kosu oncesi donduruldu): 154K karakterlik sinifta worker baglam butcesi (12K karakter + 20 imza) kesme davranisi gozlemlenir; jenerasyonun hangi metotlari hedefleyebildigi ve hangi sinirlarda kaldigi kaydedilir. Davranis orani olarak `copyProduct`/`createProduct`/`deleteLogical` sozlesmeleri (mock'lu) hedeflenir.
- Not: Bu sinif F04 "12.000 karakter sonrasinda hedef davranis" olcumunun gercek vakasidir; basari kriteri jenerasyonun sinirla basa cikmasi (target met veya belgelenmis sinir) ikisinden biridir.

## Pilot is plani

- Preflight: her sinif icin 1 is (toplam 4); engel yoksa her sinifta 2 ek bagimsiz is (toplam 12).
- Her is: `test_start` (targets: tek sinif, kind=class; coverage LINE+BRANCH %100; mode TEST_ONLY; model_profile `litellm/GLM-5.3-Flash-IT`; benzersiz idempotency_key).
- Olcum: hedef test sonucu, AFFECTED_SCOPE, tam proje suite sonucları ayri yazilir; basarisiz/BLOCKED isler paydadan cikarilir.
- Sinirlar: müsteri checkout'u read-only; mutation NOT_RUN; runtime veri repo'ya yazilmaz.

## T03 preflight is 1 sonucu (kosu sonrasi ilk gercek kayit)

- Job: `a334b38d-8515-40cd-9188-4a5cdd06054f` (store `gpu-fusion-prod-20261019-hardclass`, wire `mcp-wire-t03-preflight6.ndjson`)
- Zincir: preflight `native_toolchain_verified` → baseline → generation (3 GLM denemesi, provider `litellm/GLM-5.3-Flash-IT`) → candidate koşuları → verification
- Baseline kaniti (provenance `...:baseline:0:0`): `YzRaporMukerrerServisiTest` 6/6 PASS, exit 0, coverage rapor sha `73f74579...` (~198 sn)
- Aday 1 (changeset `b161d279...`, artifact `728f9bc4-...`): `YzRaporMukerrerServisiIzinliKuralTesti` — 5 test, GERCEK assertion'lar (Check.izinli kural tablosu 13 dal, kilit devri sonuc+hata, check delege dogrulamasi) — **beklentilerle birebir uyumlu**; Maven 11/11 PASS (6 mevcut korunmus + 5 yeni), exit 0
- Aday 2/3 (changeset `5fbb24f3...`): benzer kalite; candidate koşuları PASS
- Gate kararlari: 3 iterasyon da `rejected` — "Anlamsiz kazanc yok (BRANCH olcumu yok)". Neden: `YzRaporMukerrerServisi` sinifinda JaCoCo BRANCH sayaci YOK (saf delegasyon; izinli dallari `$Check` record'unda). LINE 80→100 bps gercek (iter 1) ama BRANCH kaniti uretilemedi.
- Final: `COMPLETED`, outcome `INVALID_COVERAGE_EVIDENCE`, `last_trusted_coverage` 80% (bps 8000), report_facts: tests_added 0, tests_modified 0, run_summary 6/6 PASS, production_changed_files 0, test_only_policy PASSED
- Degerlendirme: Urun BRANCH olculemeyen sinifta hedef iddiasi yayinlamadi (fail-closed); sahte rapor yok. Bu dogru davranis; T01/T02/T04'te BRANCH sayaci mevcut (hesaplama/dallanma metotlari) — hedef gerceklestirilebilir.
- Sure: ~35 dk (14:21→14:56); 12 is icin paralel sinif-basi harness plani (ayri store'lar, SQLite cakismasi onlenir).

## T01 preflight is 1 sonucu (EN GUCLU kanit)

- Job: `29b317f7-0703-44d7-8698-a550a7868c21` (store `...-t01`, wire `mcp-wire-t01-preflight.ndjson`)
- Baseline: YALNIZ `DateUtilsTest` (8/8 PASS, exit 0) — hedef sinifin mevcut testi ile sinirli kapsam
- 13 deneme / 6 iterasyon: 5 aday KABUL, 8 ret (nedenleri: PROVIDER_ERROR + worker restart → retry BASARILI (att 2→3→4), LINE gerileme, Regresyon yakalama x3 (yeni test kirik cikti → kabul edilmedi), kazanc yok, EMPTY_FINAL)
- Kapsam: LINE 11.92% → **35.09%** (bps 3509), BRANCH 56.36% (bps 5636) — gercek JacoCo sayarlarindan
- Kabul edilen adaylar (artifact blob'lari dogrulandi): her biri 5 @Test + 50-71 GERCEK assertion (comment-only YOK); DateUtilsEdgeCasesTest, DateUtilsExtraTest, DateUtilsDateManipulationTest, DateUtilsExtendedTest, DateUtilsAdditionalTest, DateUtilsCalendarOpsTest
- Final: `COMPLETED`, outcome `TARGET_NOT_MET_PLATEAU`, verification_level `AFFECTED_SCOPE`, report_facts: tests_added 4, tests_modified 0, run_summary 28/28 PASS (6 mevcut korunmus + yeni), production_changed_files 0, test_only_policy PASSED
- Degerlendirme: Beklenti dogrulandi — day2Date/convertDay2Date/getDayDifference/isDistanceBetweenDatesMoreThanParam sinir davranislari calisiyor; REGRESYON yakalama gercek (yeni test kirik cikti → ret); PROVIDER_ERROR retry gercek (worker restart sonrasi kabul). Hedef %100 yakalanamadi (PLATEAU) — WN73 ile ayni outcome ailesi; kanit dolu.

## T02/T04 preflight kayitlari (BASELINE_FAILED — fail-closed)

- T02 job `f48c0158-...`, T04 job `b1c9a167-...`: baseline TUM modul (635 test) kosuldu — hedef sinifin mevcut testi YOK → urun modul duzeyine dustu (tutarli davranis; t01'de mevcut test VARDI → yalniz 8 test)
- Baseline 3 FAILURE: `GpuReportDuplicateControllerTest` (musteri kodunda ONCEDEN VAR kirik test) → urun `BASELINE_FAILED` ile fail-closed; kirik baseline uzerinde sahte kabul YOK
- Degerlendirme: Bu dogru urun davranisi; T02/T04 icin temiz baseline gerekli. Musteri projesinde test duzeltme KAPSAM DISI (read-only siniri). Bu iki sinif icin pilot kaniti BASELINE_FAILED olarak belgelenir.

## Pilot is sonuclari (TUM KOSULAR, 2026-10-19 14:21-16:51)

| Is | Sinif | Sonuc | Iter/Kabul | Agent | Not |
|----|-------|-------|-----------|-------|-----|
| T01-job1 `29b317f7` | DateUtils | COMPLETED / TARGET_NOT_MET_PLATEAU (AFFECTED_SCOPE) | 13 deneme / **5 kabul** | 10 COMPLETED | LINE 11.92→**35.09%**, BRANCH 56.36%; final 28/28 PASS |
| T01-job2 `dc8e138f` | DateUtils | COMPLETED / TARGET_NOT_MET_PLATEAU (AFFECTED_SCOPE) | 14 deneme / **5 kabul** | 13 COMPLETED | LINE 11.92→**33.99%**; final 28/28 PASS |
| T01-job3 `14c13ba8` | DateUtils | COMPLETED / TARGET_NOT_MET_PLATEAU (AFFECTED_SCOPE) | 3 deneme / 0 kabul | 1 COMPLETED | 1 Regresyon yakalandi + 2 PROVIDER_ERROR → PLATEAU (bagimsizlik kaniti) |
| T03-job1 `a334b38d` | YzRaporMukerrerServisi | COMPLETED / INVALID_COVERAGE_EVIDENCE | 3 deneme / 0 kabul | 3 COMPLETED | Adaylar 11/11 PASS; BRANCH sayaci yok → dürüst ret; 6/6 mevcut korunmus |
| T03-job2 `607e15a9` | YzRaporMukerrerServisi | COMPLETED / INVALID_COVERAGE_EVIDENCE | 3 deneme / 0 kabul | 3 COMPLETED | T03-job1 ile TUTARLI sonuc (bagimsizlik) |
| T02-job1 `f48c0158` | DeductionService | FAILED / **BASELINE_FAILED** | - | 0 | Baseline tum modul (635 test): `GpuReportDuplicateControllerTest` 3 failure (musteri kodunda onceeden var) → fail-closed |
| T04-job1 `b1c9a167` | ProductVersionService | FAILED / **BASELINE_FAILED** | - | 0 | T02 ile ayni neden (fail-closed; mevcut test YOK → modul duzeyi baseline) |
| (neg) `c6076cd0` | YzRaporMukerrerServisi | CANCELLED / POLICY_VIOLATION | pause/resume negatifi | - | Farkli model resume ret; is test_cancel ile temiz kapanis |

- Toplam 8 gercek is + 1 resume negatif is (plan 12 idi; T02/T04 tekrari ayni fail-closed sonucunu vereceginden kosulmadi — musteri baseline kirik, kapsam disi).
- Kabul edilen T01 adaylari (blob dogrulamali): 10 changeset'in hepsi 5 @Test + 22-71 GERCEK assertion; comment-only YOK; mevcut DateUtilsTest her isde korunmus (tests_modified=0).
- Olcum ozeti (basarisiz/BLOCKED isler payda disi):
  - Hedef test/AFFECTED_SCOPE sonuclari: T01 3/3 COMPLETED (final replay 28/28, 28/28, 8/8 PASS); T03 2/2 COMPLETED (6/6 PASS)
  - Tam proje suite (gpu-backend 635 test): T02/T04 baseline kayitlarinda goruldu (3 failure musteri kodundan) — ayri yazildi; pilot islerinde tam suite KOSULMADI (AFFECTED_SCOPE disiplini)
  - Uretim basarisi (kabul edilen aday uretimi): T01 10 kabul / 3 is (payda: 3 T01 isi); T03 0 kabul (BRANCH olculemeyen sinif — urun dogru davrandi)
- Ortam bulgulari (urun hatasi DEGIL, kanitla): `mvn.cmd -v` dogrudan cmd'den exit -1 (cmd/batch etkilesimi; supervisor helper status.json'dan okuyor, is yolunda gozlemlenmedi).

## Resume negatifleri (runtime)

- COMPLETED job (T01) uzerinden: `test_resume` → ret "Is zaten tamamlandi; yeniden devam etmez" (resumed=false) — hem farkli hem ayni model ile
- PAUSED job uzerinden (`c6076cd0-...`): pause OK (owned process'ler sonlandirildi) → **farkli model ile resume ret yedi**: outcome `POLICY_VIOLATION` yazildi (kanit: job_events `dispatch_failed`, job outcome POLICY_VIOLATION; pause-resume-result.json) — ANCAK handleTestResume once `test_resume_accepted` + RUNNING yayinladi; lifecycle RUNNING'de kaldi (FAILED'e gecmedi). **BULGU ADAYI (F-neg1)**: resume POLICY_VIOLATION'da lifecycle RUNNING+outcome POLICY_VIOLATION karma durumu; lease TTL ile temizlenir ama net FAILED beklenirdi. Ikinci resume (ayni model) de accepted yazdi. Is `test_cancel` ile CANCELLED'e alindi (temiz kapanis dogrulandi).
- Sonuc modeli degisimi: T01 store'undaki contract'ta model_profile `litellm/GLM-5.3-Flash-IT` dolu; ret POLICY_VIOLATION ile kaydedildi (ret kendisi calisti; lifecycle gecisi eksik kaldi).

## GO/NO_GO degerlendirmesi

- **KOŞUL KANITI**: gerçek ürün (cf4a8a9 dist) uçtan uca çalıştı — preflight/toolchain pinleme/baseline/GLM aday üretimi (litellm/GLM-5.3-Flash-IT, 27 agent denemesi)/gate/Maven doğrulama/kapsam/final replay/report. Aday kalitesi yüksek (gerçek assertion'lar); regresyon yakalama, PROVIDER_ERROR retry, mevcut test korunumu, test-only policy ve fail-closed kararları gerçek kanıtla doğrulandı.
- **NO_GO KOSULU YOK** ama iki not: (1) T02/T04 sınıflarında müşteri baseline'ı kırık (GpuReportDuplicateControllerTest 3 failure) — bu sınıflarda pilot kanıtı BASELINE_FAILED; müşteri testi düzeltilmeden üretim kanıtı üretilemez (kapsam dışı). (2) Pause/resume POLICY_VIOLATION'da lifecycle RUNNING'de kalıyor (F-neg1; lease TTL ile temizleniyor, CANCELLED ile kapatıldı) — ürün geliştirme notu.
- Dağıtım kararı kullanıcıya ait: `cf4a8a9` + `10927e8` push edilmemiş; kalite düzeltmeleri bu pilot binary'sinde (qfix dist) DOĞRULANDI ama dağıtılan r16 (bd3db182) worktree'si değişmedi.
