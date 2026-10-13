# S01 iki blob PREPARED kurtarma karar matrisi

Tarih: 2026-10-13. Karar: iki yeni blob icin otomatik recovery NO_GO; mevcut fail-closed davranis korunur.

## Gercek Windows RED fixture

`scripts/probe-restore-two-blob-layout.mjs` iki farkli mevcut blob parent dizini, iki yeni artifact row ve eski hedef DB ile restore'u ayri child'da baslatir. Her kesitte `taskkill /F` uygular; journal receipt sayisini, iki stage/destination/pending adini, parent FileId farkini ve eski DB SHA256'yi dogrular. `node scripts/probe-restore-two-blob-layout.mjs` exit0:

| Kesit | Kalici stage receipt | Fiziksel blob 1 / blob 2 | Acilis |
| --- | ---: | --- | --- |
| PREPARED | 0 | yok / yok | fail-closed |
| RECEIPT_1 | 1 | yok / yok | fail-closed |
| LINK_1 | 1 | stage / yok | fail-closed |
| RECEIPT_2 | 2 | stage / yok | fail-closed |
| LINK_2 | 2 | stage / stage | fail-closed |
| PUBLISH_1 | 2 | destination / stage | fail-closed |
| PUBLISH_2 | 2 | destination / destination | fail-closed |

`--cut=PUBLISH_1 --expect-old` exit1 `startup generation outcome`: uygulanmamis iki-blob old-open icin RED. `--cut=PUBLISH_1 --reverse-layout` fixture-owned adlari FileId degistirmeden ters cevirir; stage / destination gozlendi, exit0/fail-closed. Ters duzende `--expect-old` RED exit1. Bu dis tasima tarihsel yayini gizleyebildigi icin receipt tek basina silme yetkisi degildir.

## Kapanmayan crash invariant'lari

Mevcut `recover-session` yalniz tek blob icin `blobRootPath`, `blobParentRelative`, `blobParentId` ve rezervasyonlar tutar. `ROLLBACK_COMMIT` sadece bu tek parent'i yeniden dogrular. TS predicate ve adapter `publishedBlobs.length === 1` kosuluyla acilir. Native komut dongusu `std::getline` ile sinirsiz satir okur; iki parent icin buyuk tek komut guvenli bounded protokol sayilamaz. Journal validator stage tekilligini inceler, fakat tum destination/stage/pending adlarinin global case-insensitive capraz tekilligi terminal otoritesi olarak kanitlanmadi.

Guvenli N=2 protokolunun asgari kosullari: journal sirasina bagli `BEGIN(2)` ve her blob icin boyu sinirli `GUARD(index, root, parent, uc ad, receipt)`; her root/parent ve owned file handle'i ayni child'da canli; iki blobun tum adlari, FileId/hash/linkCount ve capraz alias kontrolu tamamlanmadan hicbir owned dosyaya delete disposition yok; ardindan `ARM` ve tum parent/DB kimlikleri tekrar dogrulanirken native ROLLED_BACK fsync. ARM ilk disposition sonrasi kill olursa A absent+B owned layout'u ayni journal receipt'leriyle sonraki acilista uzlastirilabilmeli. Terminal flush sonrasi ACK kaybinda iki silmenin bitisi kanitlanmali. Ikinci blob foreign isim/alias/both-present/pending/parent-swap ise ilk blobun da baytlari korunmali. Bu komut ve kesitlerin hicbiri henuz uygulanip dogrulanmadi.

Bu nedenle iki blob icin terminal ROLLED_BACK yazilmaz, path tabanli cleanup veya genel GC acilmaz. Tek blob dar kurtarma kaniti ve genel S01 NO_GO ayri kalir. S04/customer/G1 acilmaz.

## Regresyon ve devam noktasi

`node scripts/probe-restore-hardkill.mjs --native` exit0 (15 kesit); bes odak test dosyasi 54/54 PASS; `npm run build`, `npm run lint` (0 hata, 89 mevcut uyari), `git diff --check` ve `node --check scripts/probe-restore-two-blob-layout.mjs` exit0. Sonraki is, yukaridaki N=2 protokolunu ayri bir kanitli dilimde tasarlayip tum negatif ve partial-ARM kill kesitlerini RED/GREEN yapmaktir. Bu kayit bir uretim recovery acilisi degildir.
