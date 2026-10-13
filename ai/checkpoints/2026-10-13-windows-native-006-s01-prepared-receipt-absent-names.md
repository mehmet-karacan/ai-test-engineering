# S01 PREPARED receipt, uc ad yok kesiti

Tarih: 2026-10-13. Durum: dar eski nesil acilisi kanitlandi; S01 NO_GO.

## Karar ve sinir

Tek yeni blobun stage receipt'i PREPARED journal'a fsync edildikten sonra LINK komutu gonderilebilir. Receipt, LINK'in gerceklesmedigini kanitlamaz. Bu nedenle kurtarma yalniz receipt kimligi kalici ve degismezken, hedef/stage/pending adlarinin **kurtarma aninda** ayni native recover-session icinde root ve son parent FileId ile eslesip CREATE_NEW/share=0/FILE_DELETE_ON_CLOSE rezervasyonlariyla bos oldugu kanitlanirsa eski DB'yi acar. Eski DB/WAL/SHM ve staged DB native handle/kimlik korumasi terminal ROLLED_BACK fsync'e kadar surer. Dosya silme yok. Tarihte LINK/publish yapilmadigi veya baska yere tasinmis blob orphan'i olmadigi iddia edilmiyor.

## Gercek Windows kaniti

- RED: `node scripts/probe-restore-hardkill.mjs --native --mode=PREPARED_RECEIPT --expect-prepared-old` ilk calismada exit 1: `startup gate mismatch`, fiili startup fail-closed. Cut, non-null stage receipt PREPARED fsync sonrasinda ve LINK gonderilmeden once parent'a `taskkill /F` uygular; native pending delete-on-close ile kaybolur.
- GREEN: ayni komut exit 0; receipt non-null, DB MOVE yok, uc ad yok, eski job aciliyor, journal ROLLED_BACK ve yeni blob yok.
- `--wal-sentinel` ekli ayni komut exit 0; checkpoint edilmemis eski WAL satiri eski nesille okunuyor.
- `--prepared-native-cut=guard` ve `--prepared-native-cut=terminal-flush`: her biri exit 0. Fixture-only flush marker'i native `FlushFileBuffers` sonrasini kanitliyor; helper bu noktalarda `taskkill /F` ile kesiliyor.
- `--prepared-negative=occupied`, `stage-occupied`, `pending-occupied`, `parent-swap`: her biri exit 0 ve startup fail-closed. Mevcut adin FileId'si kime ait olursa olsun otomatik silinmiyor.
- `node scripts/probe-restore-hardkill.mjs --native --mode=LINK --precreate-parent` exit 0: receipt non-null, native LINK sonrasi stage adi mevcut; startup fail-closed. Bu, receipt'in tek basina yokluk izni olmadigini siniyor.
- `node scripts/probe-restore-hardkill.mjs --native` 15/15 exit 0: genel ara kesitlerin 14'u fail-closed, COMMITTED yeni nesil. Bes odak Vitest dosyasinda 54/54 PASS. `npm run build` exit 0.

## Kalan aciklar

- Uc ad daha once kullanilip foreign move/delete ile bosalmis olabilir; tarihsel orphan yoklugu ve GC silme yetkisi kanitlanmadi. Genel blob sahipligi/alias gate'i kapali.
- Birden cok blob, fresh target, eksik parent, ara parent zinciri tarihsel FileId, aktif raw DB yarislari ve tam WN11-13 kabul ayrica acik. Bu kesit S01 VERIFIED yapmaz.
