# S01 PREPARED tek owned blob adi kurtarmasi

Tarih: 2026-10-13. Durum: stage-only ve destination-only dar kesit kanitlandi; genel S01 NO_GO.

## Fiziksel duzen ve karar

Normal restore akisi ayni anda stage ve destination adini tutmuyor. Native LINK pending dosyasindan stage hardlink'i olusturur; pending handle kapaninca stage tek ad olur. Sonra owned rename stage adini destination'a tasir. PREPARED journal/receipt non-null iken hard-kill stage-only veya destination-only birakabilir.

Native recover-session, eski DB/WAL/SHM ve staged DB handle'larini canli tutarken artifact root/son parent FileId'sini kontrol eder. Mevcut tek blob adini pinned parent altinda DELETE access/share0 ile **delete-on-close olmadan** acar; receipt FileId, bytes, SHA256 ve linkCount=1 eslesmesini dogrular. Diger iki adi CREATE_NEW/share0/delete-on-close ile bos rezerve eder. Ancak sonra ayni held owned handle'a `SetFileInformationByHandle(FileDispositionInfo)` uygular. ROLLED_BACK journal WriteFile+FlushFileBuffers bu handle'lar canliyken yapilir. Disposition oncesi hata foreign ismi silmez; disposition sonrasi child olurse OS yalniz dogrulanan adi kaldirir, nonterminal journal ile onceki bos-ad kurtarmasi tekrar denenir. Terminal flush sonrasi child olurse sonraki acilis ROLLED_BACK kaydini gorur.

Stage+destination birlikte, pending dolu, linkCount>1, farkli FileId/hash veya parent alias durumlari fail-closed. Bu dilim dosya silmeyi genel GC yetkisine donusturmez.

## Gercek Windows RED/GREEN ve negatifler

- RED: `--mode=LINK --expect-prepared-old` ve `--mode=PUBLISH_BLOB --expect-prepared-old` taskkill kesitleri eski nesil beklentisinde exit1/startup gate mismatch verdi. Birincide stage-only, ikincide destination-only PREPARED non-null receipt kaldi.
- GREEN: ayni iki komut exit0, journal ROLLED_BACK, owned ad yok ve eski DB acildi.
- Her iki duzende `--owned-negative=foreign`, `both-present`, `alias`, `pending-occupied`, `parent-swap`: 10/10 exit0/fail-closed. Foreign byte'lar, owned SHA ve terminal olmayan PREPARED journal korundu. `both-present` ve `alias` linkCount>1 sinirini de olctu.
- Her iki duzende `--prepared-native-cut=disposition` ve `--prepared-native-cut=terminal-flush`: 4/4 exit0. Fixture-only marker'lar disposition ve native FlushFileBuffers sonrasini isaretledi; `taskkill /F` sonrasi eski DB acildi, owned ad yoktu. ROLLED_BACK ACK kaybi ilk worker acilisinda fail-closed kalabilir; sonraki acilis terminal journal ile eski DB'yi acar.
- `node scripts/probe-restore-hardkill.mjs --native`: 15/15 exit0; varsayilan 14 ara kesit fail-closed, COMMITTED yeni. Bes odak Vitest dosyasi 54/54 PASS. `npm run build` ve `node scripts/verify-windows-file-helper.mjs` exit0.

## Binary ve kalan sinir

- Kaynak SHA256 `81a9297d8cd08877c17a94b30af9c09fc703454bbfe502a637889333252de943`; uretim EXE `e620cb865fc13b11235378c1dc73fa76e438b97912af2f71573ccba8ff7c910f`; fault fixture EXE `90d6cf8e7246aa487ec671cc82007233ba0d630819cafce7f63ccbf99f550e6d`.
- Ara parent zincirinin tarihsel FileId ve transient swap-back kaniti yok. Multi-blob, fresh target, GC sahipligi, foreign hardlink/orphan temizligi ve tum WN11-13 kabul kapilari NO_GO.
