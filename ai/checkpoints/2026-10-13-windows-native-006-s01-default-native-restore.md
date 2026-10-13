# S01 Windows restore varsayilan native sinir (2026-10-13)

## Uygulama

- Public `restoreBackup` Windows'ta cagrilan `{ nativeHelper }` yoksa paketli native helper'i secer. Yerel manifestteki kaynak ve binary SHA-256 hash'leri dogrulanir; bu bir kriptografik imza degildir. Provenance bozuk/eksikse restore fail-closed durur; JS path tabanli geri yukleme Windows production yolundan secilemez. Verilen helper da native kimlik denetiminden gecer.
- Mevcut DB + artifact root senaryolarinin eski test fixture'lari gercek native restore yoluna tasindi. Baslangicta bulunmayan hedef DB `WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED`, bulunmayan artifact root `RESTORE_ARTIFACT_ROOT_REQUIRED` olarak mutasyondan once kapanir. Fresh restore destegi halen NO_GO.
- Eski `node:fs` blob `copy/link` ve DB `rename` mock'lari native child prosesine ulasmiyordu. Testler, staging sonrasi backup blob degisimi/kaybi ve native LINK/MOVE cagrisi sinirinda deterministik hata ile eski DB'nin korunmasini olcer. Ikinci LINK ACK belirsizliginde ilk blob fiziksel olarak kalir; journal PREPARED ve cleanup yetkisi verilmez. Bu, onceki 'hemen temizlendi' beklentisinin yerine veri koruma semantigidir.

## Gercek Windows kaniti

- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS; packaged helper source/binary manifest dogrulandi.
- `npx eslint` (8 degisen TS dosyasi) ve `git diff --check`: PASS.
- 7 odak Vitest dosyasi, `--maxWorkers=1 --testTimeout=30000`: 63/63 PASS. Native default mevcut hedefte blob FileId journal'i ve bos hedef/missing-root fail-closed durumu test edilir.
- `node scripts/probe-restore-hardkill.mjs --native`: 15/15 kesit fixture'i exit 0. Child public `restoreBackup` API'sini helper secenegi vermeden cagirir. Her kesitte yeni DB'nin staged veya hedefteki fiziksel SHA-256 hash'i snapshot hash'iyle; eski DB de hedef veya preserved hash'iyle eslestirilir. PREPARED ve LINK'te eski DB hedefte; WAL sentinel/kopyasi korunur. 14 ara kesitte acilis `RESTORE_RECOVERY_REQUIRED`, COMMITTED kesitinde tam yeni generation acilir. Ayrica raw SQLite owner restore'u `WINDOWS_RESTORE_SESSION_PROTOCOL` ile durdurur, DB/WAL/SHM hash'leri degismez.
- `--native --expect-recovery --mode=PREPARED`: beklenen RED exit 1; blob sahipligi receipt uzlasmasi olmadan otomatik eski generation acilisi iddia edilemez.

## Kalan NO_GO

- Onceki 15-cut `--expect-recovery` yesil iddiasi bloblu journal icin artik gecerli degil: worker `publishedBlobs.length > 0` durumunu bilerek fail-closed tutuyor. Kalici artifact root/parent FileId yetkisi, LINK ACK one-ahead uzlasmasi ve old DB ref kontrolu olmadan blob silerek otomatik rollback acilmaz. WN11/S01 VERIFIED ve S04 migration gate kapali.
- Fresh hedef native production restore henuz desteklenmiyor. Stage LINK ACK uzlasmasi, orphan cleanup, parent alias/GC ve terminal journal sinirlari onceki checkpointlerdeki NO_GO kapsaminda kalir.
- Eski ENOSPC stage-yazma mock'u native child icine ulasamadigi icin yeni fixture backup blob'u staging oncesi kaldiran kaynak yarisi olcer. Native kismi yazma/disk-doldu durumunda orphan kalmadigi ayri gercek Windows fault probe ile kanitlanmadi; WN13 icin acik kanit boslugudur.
