# GPU Fusion baseline checkpoint

Tarih: 2026-10-22. Kullanici istegiyle Sky akisi duraklatildi; ayni genel JaCoCo akisi GPU Fusion icin denendi. GPU customer checkout'ina dosya yazilmadi, commit/push yapilmadi.

## Kapsam ve profil

- Secilen Maven koku: `C:/innova/projeler/gpu-fusion/gpu-backend`. Ust `gpu-fusion` dizininde birden fazla POM oldugu icin otomatik tek kok secimi kullanilmadi.
- Native profil runtime config'te exact root, JDK `21.0.11`, Maven `3.9.16`, `run_skipped_unit_tests=false` olarak kayitli. Global Java ortami degistirilmedi.
- Akis: SourceSnapshot -> native preflight -> Maven baseline + JaCoCo. Model worker baslatilmadi, test uretimi ve customer checkout'a uygulama yapilmadi.
- GPU checkout'i onceden kirliydi; bu durum korunmustur. `gpu-backend/pom.xml` kosu oncesi/sonrasi SHA-256: `b94d9d8416822bee13611b7e45343df85b138d26ff84af17494c415c205c6f01`.

## Urun duzeltmesi

Ilk deneme, `gpu-backend/logs/archived/gpu-backend.2026-10-06.log` dosyasinin 372009724 bayt olmasi nedeniyle 64 MiB snapshot sinirinda durdu. `SourceSnapshot` runtime `logs` dizinini kaynak manifestinden disarida birakacak sekilde guncellendi. Uretim/test kaynaklari, POM ve diger girdiler taranmaya devam eder. Odak discovery testi 24/24, typecheck ve build PASS.

## Gercek GPU sonucu

- Job: `f98c90f4-ab7e-4409-8012-1856269c82b4`
- Sonuc: `FAILED / BASELINE_FAILED`
- Test sayaci: 635 test, 3 failure, 0 error, 11 skipped.
- Uc failure ayni mevcut test sinifinda: `tr.com.innova.gpu.controller.GpuReportDuplicateControllerTest`.
  - duplicate warning icin beklenen `409 CONFLICT`, gercek `200 OK`.
  - malformed regeneration icin beklenen `400 BAD_REQUEST`, gercek `200 OK`.
  - regeneration testinde `reports.createReport(...)` beklenmedigi halde cagrildi.
- Uygulama JaCoCo sonucu, sinif onerisi ve model/candidate kaydi uretilmedi. Sistem mevcut test failure'larini atlayarak sahte coverage vermedi.
- Source identity job kaydi ve tekrar okuma ile ayni: source `d3af34b9f0ee6d3988a7ab9dd63bac4a4e61d65bcdf37e2aafc8b56b0d1107fc`, build `d818a5be13c88014178efa3cb23019cfc695a506cdb01d702c882ad3e314ece5`.
- Private failure logu runtime altinda tutulur: `jobs/f98c90f4-ab7e-4409-8012-1856269c82b4/baseline/target/aitest-baseline-logs/maven-stdout.log`.

## Karar ve devam

GPU customer checkout baseline'i mevcut 3 test failure ile BLOCKED kalir. Kök neden icin `GpuReportController` duzeltmesi yalnizca ilk job'un owned baseline kopyasinda uygulandi: regeneration istegi ID dogrulamasi, bes parametreli servis cagrisi ve `RaporMukerrerException` icin 409 cevabi.

Bu owned kopya ile ikinci job `e6e14f15-8be2-4a18-bff8-82082990a479` `WAITING_INPUT/COVERAGE_ANALYZED` oldu: 635 test, 0 failure, 0 error, 11 skipped; LINE 5764/29345 (%19.64), BRANCH 2807/12779 (%21.97), 921 sinif ve 20 uygun oneriden ilk 10 kayit mevcut. Ilk bes aday: `SharingTariffVersionService` 0/645 LINE, `PldService` 0/289, `DeductionService` 0/272, `GpuCommonService` 0/253, `UserManagementService` 0/234. JaCoCo raporu SHA-256 `5e83eb13e2b225c363feee331f2d0efab1836051d20dd2a8bdf904d519b40315`.

Kaynak checkout'ina bu duzeltme uygulanmadi; model, candidate ve `test_start` sinif secimi olmadan calistirilmadi. Sonraki adim kullanicinin onerilerden bir sinif secmesi, sonra ayni owned kopyada `test_start` akisini baslatmaktir. Sky yeniden kosulmadi.
