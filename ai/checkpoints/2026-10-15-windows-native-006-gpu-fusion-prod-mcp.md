# GPU Fusion prod-like MCP ve status projection checkpoint

- Tarih: 2026-10-15.
- Urun branch/HEAD: `codex/windows-native-006` / `a22004e89f1750ed6af9ad75b2d3976d0b10aac4`.
- Customer repo: `C:\innova\projeler\gpu-fusion`; branch `features/5.0.1_SKYRSM-5747-yz-gupi`; HEAD `485a544bc87754f4d3c7181ec291d6389798ace5`.
- Commit/push yapilmadi.

## Customer korunumu ve yerel uygulama

- Onceki customer status/head ve hedef dosya kopyalari `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\gpu-fusion-prod-20261015-before` altina kaydedildi.
- Onceki status 103 dirty/untracked kayit iceriyordu. Islem sonrasi 105 kayit goruldu; delta yalnizca:
  - `gpu-backend/pom.xml`
  - `gpu-backend/src/main/java/tr/com/innova/gpu/service/GpuReportService.java`
- Customer HEAD degismedi. Diger dirty/untracked dosyalara dokunulmadi.
- Uygulanan hedef hash'leri snapshot ile ayni: POM `B94D9D8416822BEE13611B7E45343DF85B138D26FF84AF17494C415C205C6F01`; servis `D3D90DEDAF6659F28BA3627E730C9BEEF445DC3B3797AC7A98A3C6CEA38C4BA6`.
- Checkout'taki `logs/archived/gpu-backend.2026-10-06.log` 372009724 byte oldugu icin MCP 67108864 byte fail-closed snapshot sinirina takildi. Log silinmedi. Kod/build kaynaklari `...\gpu-fusion-prod-20261015-source` sahipli mirror'ina logs ve mevcut target haric kopyalandi.

## Normal MCP kaniti

- Runtime: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\gpu-fusion-prod-20261015-mcp2`.
- Job: `c412eafc-d484-4058-a6d0-911bc623d2c0`.
- Akis: inspect -> modules/classes/tests query -> test_start -> native preflight -> baseline -> final replay -> test_result.
- Sonuc: `COMPLETED / TARGET_ALREADY_MET`, `verification_level=AFFECTED_SCOPE`.
- Hedef: `tr.com.innova.gpu.validation.AccumulatorFormulaValidator`; coverage hedefi 80 LINE/BRANCH; model profili `litellm/GLM-5.3-Flash-IT`.
- Run summary: 2 toplam, 2 PASS, 0 fail, 0 skipped.
- Coverage: LINE 10/10 = 100%; BRANCH 9/10 = 90%; hedef 80%.
- Gates: `test_only_policy=PASSED`, `final_replay=PASSED`, production changed files 0, gaps bos.
- Report06: `reports/index.html`, `manifest.json`, `PUBLISHED`; manifest 1536 artifact, report evidence 1533 dosya.
- Baseline hedefi zaten karsiladigi icin model candidate, pause ve resume acilmadi; bu nedenle WN72/WN73 kaniti bu kosuda NOT_RUN'dur.

## Urun status projection duzeltmesi

- `src/domain/job-state.ts`: `verificationLevelForReport` eklendi; final verification failure `UNVERIFIED`, tamamlanmis rapor `AFFECTED_SCOPE`.
- `src/orchestration/job-dispatcher.ts`: terminal outcome -> verification -> lifecycle row-version zinciri uygulandi.
- Regresyon: `tests/unit/p07-verification-level.test.ts` ve ilgili P07/P08 odaklari toplam 7 dosya/41 PASS.
- `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint` PASS; lint 0 error, mevcut 89 warning.

## Release durumu

- `npm.cmd test`: 119 dosya, 895 PASS, 35 FAIL, 25 SKIP, 2 unhandled error. Fail'ler canli pilot/model evidence, Windows process/helper/pin timing, restore/backup timing, browser print ve makine yukune bagli timeout/fail kapilarinda toplandi.
- `node scripts/release-verify.mjs --local`: PASS.
- `node scripts/release-verify.mjs`: NO_GO, tek acik neden `EVIDENCE_MANIFEST_EKSIK`; mandatory 391, verified 0, missing 391.

## Devam noktasi

- G1 hedef kaniti tamamlandi; WN72/WN73/WN75 review, G2/G3 ve S09 full evidence acik.
- Customer iki dosya yerel modified olarak birakildi; kullanici istegi olmadan apply/commit/push/deploy yapilmayacak.
