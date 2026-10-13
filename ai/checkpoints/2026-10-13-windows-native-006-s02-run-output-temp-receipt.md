# S02 WN21 gecici blob receipt baglama kesiti

Tarih: 2026-10-13. Baslangic `7cacf54`; coordinator origin merge edilmedi. Iki onceki reddedilmis Temp fixture'ina, musteri Maven/model, GPU ve S01 GC/retention koduna dokunulmadi.

## RED ve GREEN

- Gercek Windows child, `ArtifactStore.publish` gecici dosyayi yazdiktan sonra `renameSync` girisinde bekletilip parent tarafindan `taskkill /F` ile kesildi. RED: PENDING row id'sinden beklenen `.tmp-<receipt-id>` yerine gercek yol `.tmp-<pid>-<timestamp>` idi; orphan temp DB receipt'ten kesfedilemiyordu.
- Yeni run-output yazicilari `ownedAttemptId=receipt.id` tasir. `ArtifactStore.publish` bu durumda temp dosyayi yalniz `.tmp-<receipt-id>` yolunda `wx` ile yaratir; eski dosyayi overwrite etmez. Son blob yolu ve SHA mevcut PENDING receipt'te kalir. Diger artifact writer'larinin genel temp protokolu degismedi.
- GREEN ayni gercek hard-kill kesitinde PENDING row, beklenen temp yolu ve fiziksel temp dosya eslesti; final blob yok, trusted terminal event yok. Blob publish sonrasi kill testinin PENDING final blob kaniti da korundu.
- `listPendingRunOutputReceipts` yalniz DB metadata'sindan en cok 64 (izin verilen ust sinir 256) receipt okur, fazla satirda typed fail-closed verir, id/hash/path uyumsuzlugunu reddeder ve deterministik temp relative yolunu bildirir. Dosya acmaz veya silmez; fiziksel authority/GC karari vermez. PENDING retry zaten `RUN_OUTPUT_RECEIPT_PENDING` ile durur.

## Dogrulama ve sinir

- RED gercek fixture 1 FAIL (temp adlari eslesmedi); GREEN uc odak dosyasi/11 PASS (`--maxWorkers=1`). Typecheck, build, hedef ESLint exit 0.
- Daha genis WN21 baseline timeout fixture'i bu dilimde bir kez 9 MiB output/truncation event'i timeout oncesi uretilemeden FAIL verdi; izole tekrar 1/1 PASS. Bu zamanlama davranisi bu kesitle duzeltilmis sayilmadi ve full suite kaniti degil.
- Eski surumun PID/zaman adli kayitsiz temp/orphan dosyalari, diger `ArtifactStore` yazicilari ve fiziksel delete yetkisi acik. S01 path authority kaniti olmadan otomatik cleanup yok. WN20/WN21 canli customer kabul, WN14/15/18/22/23 ve G1/G2/G3 NO_GO.
