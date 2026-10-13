# S01 fresh hedef native wire dilimi

- Tarih: 2026-10-13. `session-fresh` ve `recover-fresh` mevcut hedef `session` / `recover-session` semantiginden ayri komutlardir. Bu dilimde TS restore cagri yolu ve journal format degismedi; fresh native restore halen `WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED` ile mutation oncesi bloklanir.
- Native ilk READY, hedef DB/WAL/SHM yoklugunu parent handle altinda kontrol eder ve staged DB'yi FileId, volume, byte ve SHA ile pinler. MOVE sadece staged/target arasindadir; beklenen kimlik her komutta yeniden kontrol edilir ve handle-relative NO_REPLACE rename kullanilir. Recover READY fiziksel 0/1 sayisini ve pinned snapshot'i bildirir; exact ACCEPT olmadan MOVE yapmaz. VERIFY iki-handle read guard devrini kullanir.
- RED: onceki helper'da `session-fresh` komutu yoktu ve kabul probe'u oldDb zorunlulugunda duruyordu. GREEN: `node scripts/probe-restore-fresh-session.mjs` exit 0; dolu hedef, READY sonrasi rakip create, yanlis kimlik, yayin + VERIFY, yayin sonrasi recover ters MOVE ve bos layout recover count0 dogrulandi. Tum fixture'lar sahipli Windows Temp altindadir.
- `cmd /c scripts\\build-windows-file-helper.cmd native\\bin` exit 0. Source SHA `1f66a0755a7a0bf1e2900b108b4816619a4d6e0040b74a2c1a38306e5bc087ec`; binary SHA `0875bd1c18b9db83b54bebc53fc8d35a8d4bb9e8a6bdac5417b455e23e948495`. `node scripts/verify-windows-file-helper.mjs`, `npm run typecheck`, `npm run build`, 3 odak Vitest, `npm run lint` exit 0 (repo genelinde 89 warning, 0 error).
- Sonraki is: TS fresh adapter; journal v2 oldDb=null icin eski kayit okunurlugu ve bos hedef acilis politikasi; her kritik kesitte hard-kill/SQLite WAL/raw owner kaniti. Bu kanit olmadan fresh native production'a baglanmayacak. WN11/12/13 ve S01 VERIFIED NO_GO; G1/G2/G3 kapali.

## TS adapter dilimi

- `startWindowsFreshRestoreMoveSession` yalniz `session-fresh` komutunu kullanir; eski hedef export'u `session` ile ayni kaldi. READY, MOVE, VERIFY ve CLOSE cevaplari mevcut kimlik/sequence denetiminden gecer.
- Gercek Windows SQLite fixture'inda yeni DB yayinlandi, readonly SQL `42` gordu, ardindan ters MOVE ayni FileId/hash ile staged ada dondu. `npx vitest run tests/integration/wn-restore-session.test.ts --maxWorkers=1`: 4/4 PASS; `npm run typecheck`: exit 0. Bu adapter henuz `restoreBackup` veya journal'a bagli degildir.

## Journal v2 bos eski nesil

- `nativeInitial.oldDb=null`, yalnız oldWal/oldShm da null ve evidence.oldDb.exists=false ise kabul edilir. Yeni `FRESH_TARGET_CONFIRMED` fazi eski `OLD_DB_PRESERVED` anlami degistirilmeden bos layout'u ayirt eder. Eski v2 ve legacy journal okuyucu testleri 23/23 PASS.
- Fresh ROLLED_BACK kaydindan sonra genel Storage acilisi bos SQLite DB yaratmadan `RESTORE_RECOVERY_REQUIRED` ile durur. Yalniz ilerideki explicit restore retry icin `allowFreshRollbackForRestore` secenegi vardir; henuz restoreBackup bu secenegi kullanmiyor. Bu dilim fresh production publish'i acmaz.

## Fresh recovery adapter

- `nativeInitial.oldDb=null` kaydi `recover-fresh` komutuna yonelir. Gercek Windows SQLite fixture'inda journal-proven tek stagedDb FileId `RECOVERY_READY/ACCEPT` ile onaylandi, published dosya staged ada ters tasindi ve hedef yoklugu dogrulandi. Adapter testleri 5/5 PASS, typecheck exit 0. Worker ve restoreBackup henuz fresh yoluna bagli degildir.
- S03 bagimsiz RED fixture'i, no-delete-share parent directory handle tutulurken dis `fs.renameSync(root, root-moved)` isleminin basarabildigini gosterdi. Bu nedenle root/alias degismezligi varsayimi WN13 icin kanit degildir; fresh production NO_GO ve path/GC sinirlari acik kalir.

## Startup worker bos-layout uzlasmasi

- Worker `RECOVERED_EMPTY` doner; count0 fiziksel staged layout ve count1 yayinlanmis staged FileId icin exact journal prefix + native READY/ACCEPT sonrasi `ROLLED_BACK` fsync eder. Genel `Storage` bos DB yaratmadan `RESTORE_RECOVERY_REQUIRED` verir; explicit restore yeniden denenebilir. Bu bilincli fail-closed sonucudur, WN11 kabulunun tamami degildir.
- `npm run build` exit 0; gercek Windows SQLite fixture'inda `wn-restore-recovery-close.test.ts` 8/8 PASS (iki fresh count kesiti dahil). Count1 testindeki baslangic tasimasi fixture `renameSync` ile kuruldu; gercek taskkill kesiti ve root alias guvencesi henuz kanitlanmadi.

## Gercek hard-kill kesitleri

- `node scripts/probe-restore-fresh-hardkill.mjs`: exit 0; 4/4 Windows `taskkill /PID /F` kesiti PASS. READY, MOVED stdout fakat receipt fsync oncesi, receipt fsync sonrasi ve VERIFY_READY sonrasi kesitlerinde native recover-fresh READY/ACCEPT fiziksel 0/1 layout'u uzlastirdi; ROLLED_BACK journal, hedef DB/WAL/SHM yoklugu ve staged snapshot SHA dogrulandi.
- Bu probe restoreBackup tam lifecycle'i degil, native helper + journal + worker zincirini olcer. Final CLOSE, blob yayini, rakip raw SQLite yazari, root rename/alias ve her mutation kesiti henuz kapsanmadi. Production fresh hedef yolu acilmaz; WN11/12/13 NO_GO.
- Ek terminal kesiti `COMMITTED` fsync sonrasi native guard canliyken taskkill: yeni DB FileId/SHA source ile es ve `test_jobs` yeni satiri readonly SQLite ile acildi. Probe 5/5 exit 0. CLOSE ACK, full blob lifecycle, root alias ve raw writer yarislari halen acik; production fail-closed.
