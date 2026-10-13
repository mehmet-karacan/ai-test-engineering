# S01 iki blob native GUARD kaniti

Tarih: 2026-10-13. Baz: coordinator `c1550b8`; S01 dalina merge `c5be527`.

Iki yeni blobun farkli mevcut parent dizinlerinde PREPARED kalmasi icin `recover-session` icine yalniz canli GUARD protokolu eklendi: exact `RECOVERY_READY`/`ACCEPT` sonrasi `GUARD_BEGIN\t2`, journal sirasi ile iki ayri boyu sinirli `GUARD_ITEM`, ardindan `GUARD_FINAL`. Her item kok ve son parent FileId'sini, stage/destination/pending adlarini, varsa tek owned adin FileId/bytes/SHA/linkCount=1 kimligini handle uzerinden dogrular. Bos adlar ayni pinned parent'ta CREATE_NEW/share0/DELETE_ON_CLOSE ile rezerve edilir. Iki item ayni root FileId'sine baglidir; ayni fiziksel parent'taki adlar Unicode ordinal case-insensitive capraz karsilastirilir. `GUARD_FINAL` iki kok/parent ve DB slot kimligini yeniden kontrol eder. Komut satiri okuma 1 MiB, her `GUARD_ITEM` 8192 byte, sayi tam 2 ile sinirlidir.

Bu helper `GUARD_READY` sonucunda **terminal journal yazmaz, owned dosyaya delete disposition koymaz, DB MOVE yapmaz**. `GUARD_FINAL` sonrasi sadece CLOSE kabul edilir. Helper hard-kill olursa tutulan owned dosyalar kalir, bizim negatif rezervasyonlar OS handle kapanisiyla temizlenir ve journal PREPARED kalir. TS recovery worker N=2 icin halen fail-closed; uretim auto-open acilmadi.

## RED/GREEN ve negatifler

`tests/integration/wn-file-bridge.test.ts` yeni `GUARD_BEGIN` testi eski binary'de helper EOF ile RED idi; yeni native kaynakla GREEN. Iki farkli parent'ta A stage-only/B destination-only pozitif; B foreign FileId, parent ayni iken case-variant cross-name collision, skip index, ucuncu item exit2; her redde ilk owned dosyanin baytlari korunur. `GUARD_READY` sonrasi gercek `taskkill /F` owned baytlari korur ve rezervasyon adlarini temizler. Gercek iki-blob restore PUBLISH_1 hard-kill fixture `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut` exit0; native GUARD_READY sonrasi ikinci helper kill ve startup RESTORE_RECOVERY_REQUIRED ile engel devam eder.

Regresyon: native bridge 25/25 PASS; restore odak bes dosya 54/54 PASS; `node scripts/probe-restore-hardkill.mjs --native` exit0 (15 kesit); iki-blob yedi kesit exit0 ve hepsi fail-closed. `npm run build`, helper provenance verify, lint (0 hata/89 mevcut uyari), `git diff --check` ve probe syntax check exit0. Uretim helper source/binary ve test-only fixture source/binary manifest SHA'lari yeniden uretildi. GUARD_READY canliyken iki owned dosyanin Node rename denemesi Windows'ta reddedildi; ikinci item foreign/alias/index hatasinda ilk owned bayti korundu ve negatif rezervasyon adlari temizlendi. Bu belirli fixture schedule'lari tum Windows race olasiliklarinin kaniti degildir.

Bagimsiz inceleme ilk kod commitinde yeni P1 bulmadi; ikinci item SHA uyusmazligi, hardlink sayisi 2 ve 8192/1MiB girdi asimi icin negatif kanit istedi. Ek gercek Windows fixture bu dort kosulda helper exit2, ilk blob ve eski DB baytlari korunuyor; odak test yeniden exit0. ARM/disposition kapsamindaki kalan kosullar yine NO_GO.

## Kalan kabul engeli

GUARD_READY tek basina kalici sahiplik/rollback karari degildir. N=2 disposition icin tum item guardlari sonrasinda ARM, ilk owned disposition sonrasi crash'te A absent/B owned uzlasmasi, iki parentin terminal fsync boyunca yeniden kimlik denetimi, ACK kaybi ve global ad/receipt semantigi ayri RED/GREEN ister. Ara parent zincirinin tarihsel FileId'si journal'da yoktur; transient swap-back genel WN13 kaniti degildir. Fresh, multi-blob genel GC ve S04 acilmaz; S01 VERIFIED/GO degil.
