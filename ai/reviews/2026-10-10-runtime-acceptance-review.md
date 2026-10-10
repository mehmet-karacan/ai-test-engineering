# Runtime Acceptance Incelemesi - B01-B12 Bulgulari

- Tarih: 2026-10-10
- Inceleyen: AITE-RUNTIME-ACCEPTANCE-003 (AKTIF_GOREV (1).md, kullanicinin verdigi dosya)
- Incelenen HEAD: `7620f206d1bab3e2014518593dcb322277a9ddbf`
- Bu kayit: AITE-REMEDIATION-002'nin "F01-F14 14/14 KAPANDI" kabulunun yeniden degerlendirilmesi

## Neden yeni denetim

Remediation'daki duzeltmeler bilesen seviyesinde vardi; ancak bilesen duzeltmesi normal runtime akisina bagli degilse kapanis degildir. Bu denetim "bilesen testi geciyor" ile "normal MCP yolundan calisiyor" ayrimini esas alir.

## Bulgular teyit durumu (uygulayici ortaminda dogrulandi)

| Bulgu | Onem | Teyit | Kanit |
| --- | --- | --- | --- |
| B01 - Normal test_start guvensiz host yolunu secip AI worker'i kapali baslatiyor | P0 | TEYIT EDILDI | services.ts:330 `AITEST_RUNNER` verilmezse `host_dev_only`; `AITEST_WORKER_ENABLED === "1"` olmadikca worker kapali; FailClosedRunner zincirde kullanilmiyor |
| B02 - Worker eksikligi plateau diye sunuluyor; gercek analiz/onarim baglami eksik | P0 | TEYIT EDILDI | job-dispatcher sabit `http://127.0.0.1:14096`; goal model `null`, butce sabit 20/2/3; prompt ilk 5 dosya imzalari |
| B03 - Final dispatcher karari BRANCH'i yeniden yok sayiyor | P0 | TEYIT EDILDI | job-dispatcher.ts:214-225 `allMet` yalniz LINE bps; `meaningfulGain` yalniz LINE |
| B04 - Accepted set ve checkpoint callback'leri runtime'a baglanmamis | P0 | TEYIT EDILDI | dispatcher iterateOptions'a accepted_snapshot_dir/on_accepted gecmiyor; overlay finally ile geri aliniyor |
| B05 - Resume/cancel state degistiriyor; isi devralmiyor/durdurmuyor | P0 | TEYIT EDILDI | job-tools.ts:64 resume RUNNING yaziyor; source/checkpoint dogrulamasi ve dispatcher devami yok |
| B06 - Raporlarda sabit degerler; sonuc araci artifact veremiyor | P0 | TEYIT EDILDI | job-dispatcher.ts:255-256 `iterations: []`, `tests_added: 0`; handleTestStatus last_trusted_coverage sabit null |
| B07 - PS1'siz installer temiz clone'da dist'e erken bagimli | P1 | TEYIT EDILDI | install.mjs:8 statik `../dist/configuration/config-merge.js` import'u; dist yokken ERR_MODULE_NOT_FOUND |
| B08 - Tam pilot/resume kaniti hafifletilmis | P0 | TEYIT EDILDI | pilot-full.test.ts:115-116 `host_dev_only` + `WORKER_ENABLED: 0`; RG42 yeni runPilot ile yeni job |
| B09 - Cok modullu/effective Maven destegi tamamlanmamis | P1 | TEYIT EDILDI | statik POM okuma; coverage path kokte; overlay slash cevirme devam ediyor |
| B10 - Kalite kurallari gercek test semantigi korunmuyor | P1 | TEYIT EDILDI | isSutShadowing candidate zincirinde cagrilmiyor; regex agirlikli |
| B11 - Guvenli apply/export sinirlari acik | P0/P1 | TEYIT EDILDI | handleTestApply her defasinda default kapali config + PATCH_ONLY; gercek patch artifact sunulmuyor |
| B12 - V2 profil testi eski handshake'i test ediyor | P1 | TEYIT EDILDI | v2-wire.test.ts her iki test 2025-11-25 gonderiyor; protocol response assertion yok |

## Eski F/AC/RG eslesmesi

| Bulgu | Ilgili eski kanit | Yeni durum |
| --- | --- | --- |
| B01 | F01/F05 (F01 kapanis kaydi) | Yeniden acildi: dispatch vardi ama guvenli runner contract'i zincirde yok |
| B03 | F03 (evaluateGoalMet) | Yeniden acildi: loop iki metrik kontrol etti ama dispatcher final karari yine LINE |
| B05 | F08 (resume/recovery) | Yeniden acildi: resume RUNNING yaziyor, isi devralmiyor |
| B08 | RG41/RG42 (pilot) | Yeniden acildi: host_dev_only + worker-disabled smoke pilot diye sunuldu |
| B12 | F12 (v2 wire) | Yeniden acildi: ayni eski handshake + 2025-11-25; v2 etiketi protokol destegi degil |

## Kabul durumu degisimi

- Onceki: `REMEDIATION_TAMAMLANDI` (76/76 kanit kayitlari) - tarihsel uygulayici beyanlari olarak korunur
- Yeni: `RUNTIME_ACCEPTANCE_IN_PROGRESS`
