# Checkpoint: 2026-10-10 - RT21 pilot durum devri (devam oncesi kayit)

## Gorev

- AITE-RUNTIME-ACCEPTANCE-003 v2.0; RT21/PRO56 gercek proje pilotu (sky-microservis / sky_backend)
- Onceki kayit: 2026-10-10-rt21-pilot-devam.md (provisioning duzeltmeleri f321024 + 1717e45 push edildi)

## Dogrulanan durum (bu devirde)

- Git: branch main, temiz tree, HEAD == origin/main == 36a775c
- Git kimligi (repo-local): mehmet-karacan <karacan.mehmet@hotmail.com>
- Onceki checkpoint yeniden okundu; KRITIK BILINEN BULGU ifadesiyle uyumlu
- Bu devirde kod degisikligi yok, test/pilot calistirilmedi (kullanici talimati: yalnizca checkpoint kaydi)

## KRITIK BILINEN BULGU (bir sonraki devirde ilk is)

1. job-dispatcher.ts: baseline asamasi `dockerRunner.run` ile dogrudan calisiyor (mvn test, network:none, readonly settings mount VAR ama provisioning YOK). loopRunner (DockerMavenRunner) provisioning'li calisiyor ama baseline o yolu KULLANMIYOR.
   - Duzeltme: baseline'i da DockerMavenRunner uzerinden calistir (provisioning + izinli mirror devri) VEYA baseline oncesine ayri hazirlama asamasi ekle.
2. services.ts requestDigest parcalari kontrol edilecek: idempotency_key digest'e dahil degilse AYNI payload + FARKLI key ile gelen istek eski FAILED job'u dondurur (9.1: kaynak degistigi halde onceki tamamlanmisi sonsuza kadar dondurme). rt21-pilot2.mjs'te gozlenen start_ok:false / eski job id davranisi bununla tutarli.

## Kanit

- npm test: 356/356 PASSED (42 dosya) - onceki devirde calistirildi; bu devirde yeniden calistirilmadi
- release-verify.mjs: exit 0 (onceki devir)
- Pilot job 10c8e4b3: BASELINE_FAILED (phase:baseline); provisioning tetiklenmemis (aitest-docker-baseline-logs/provisioning dizini yok)

## Devam adimlari (sira ile)

1. KRITIK BULGU 1: baseline'i DockerMavenRunner (provisioning) yoluna bagla
2. KRITIK BULGU 2: services.ts requestDigest kontrolu; gerekirse idempotency_key'i digest'e ekle
3. Her iki duzeltme icin test yaz (unit/contract)
4. npm test + release-verify.mjs
5. commit (Turkce ASCII) + push
6. node rt21-pilot2.mjs (C:\Users\mkaracan\AppData\Local\Temp\opencode\) ile pilotu yeniden kos
7. Baseline PASSED ise: worker candidate uretimi (litellm/GLM-5.3-Flash-IT), coverage >= %90, final replay + rapor kanitlari
8. Kabul matrisi + PROJECT_STATE guncelle

## Sinirlar (degismedi)

- Production/POM degisikligi YASAK; yalniz sky_backend src/test/java altina yeni test dosyasi eklenebilir (pilot PATCH_ONLY)
- Runtime veri (DB, blob, log) bu repoya yazilmaz; pilot script Temp\opencode altinda
- CI kapali (kullanici karari)