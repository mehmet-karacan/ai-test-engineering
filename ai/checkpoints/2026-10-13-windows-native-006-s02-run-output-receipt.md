# S02 WN20/WN21 run output publish receipt dilimi

Tarih: 2026-10-13. Baslangic `bf109ec`, dal `codex/windows-native-006-s02`. Coordinator origin merge edilmedi. Yalniz S02 run output yazicilari/fixture'lari degisti; S01 GC/blob kodu, original checkout, musteri Maven/model, GPU ve iki eski Temp fixture'i degismedi.

## Gercek RED kesiti

`wn-run-output-receipt-hardkill` gercek Windows child process'i terminal output blob publish sonrasi, artifact/event DB transaction oncesi `taskkill /F` ile kesti. Onceki davranista fiziksel blob vardi ama `artifacts` row'u yoktu: `expected PENDING, received undefined`. Bu hash mevcut GC envanterinde kesfedilemiyordu.

## Dar GREEN protokolu

- `run_output_terminal` ve `run_output_truncation` yazicilari beklenen hash, byte sayisi, content-addressed yol, job ve pin icin mevcut SQLite `artifacts` semasinda `PENDING` receipt'i blob publish oncesinde `BEGIN IMMEDIATE` transaction ile commit eder. Yeni migration yok.
- Publish sonrasi ayni SQLite transaction run veya event linkini ve `PENDING -> READY` gecisini yapar. Kayit farki, birden fazla pin, degismis hash veya pending retry typed `RUN_OUTPUT_RECEIPT_PENDING`/`STORAGE_ERROR` ile fail-closed kalir. `PENDING` hicbir zaman trusted run/event kaniti sayilmaz.
- Gercek hard-kill GREEN: PENDING satiri kaldi, hash ile blob dogrulandi, terminal event sayisi sifir. `gcDryRun` ayni hashi aday yapmadi; `PENDING` status ve pin mevcut GC kurali altinda dosyayi korur. SQLite run/event insert fault fixture'lari PENDING + READY/event yok sonucunu, retry blokajini dogruladi. Normal basarili idempotent READY ve WN21 truncation artifact baglari korunur.
- Seri odak: 4 dosya / 12 test PASS (`--maxWorkers=1`). `npm run typecheck`, `npm run build`, hedef ESLint `--quiet` exit 0. Ilk RED gercek Windows testinde 1 FAIL; GREEN ayni test PASS.

## Kalan sinir

Bu receipt yalniz yeni iki run output yazicisinin ileriye donuk publish'ini kapsar. Onceki binary'nin kayitsiz fiziksel orphan bloblari ve `ArtifactStore`/checkpoint gibi diger yazicilar otomatik kesfedilmez veya silinmez. PENDING/mismatch operatore read-only inceleme ve ayri guvenli uzlastirma gerektirir; otomatik READY yapilmaz, raw DB writer'a karsi tam yetki kaniti iddia edilmez. Physical orphan GC ve genel WN20/WN21 canli customer kabul NO_GO; WN14/15/18/22/23 ile G1/G2/G3 kapali.
