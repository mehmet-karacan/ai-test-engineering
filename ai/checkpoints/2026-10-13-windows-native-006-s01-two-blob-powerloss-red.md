# AITE-006 S01 N=2 terminal dayaniklilik RED kesiti

Durum: NO_GO. Bu dilim urun N=2 terminalini, worker predicate'ini veya otomatik acilisi etkinlestirmez.

## Kurulum ve sinir

Gercek Windows Temp fixture, farkli mevcut ebeveynlerde iki yeni blobu PUBLISH_1 sonrasi A destination/B stage duzeninde birakir. Ilk child A'ya, ikinci child B'ye disposition uygular. Eski DB ile gercek checkpoint edilmemis WAL satiri korunur; SHM varligi da olculur. Test derlemesi her disposition sonrasinda `AITE6_DISPOSITION_RECEIPT_V1` satirini yalniz test-owned `.receipt-N` dosyasina WriteFile+Flush ile yazar. Satir generation, index, stage/destination modu, root/parent/blob VolumeSerial+FileId, blob bytes/SHA ve UTF-16LE hex basename tasir. Probe bunlari urun journal'indaki stage receipt ve parent kimlikleriyle karsilastirir. Bu makbuzlar urun journal'ina girmez; recovery yetkisi degildir.

## Secili gercek Windows sonuclari

- `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=first --terminal-cut=partial --wal-sentinel`: exit 0. Test helper terminal JSONL satirinin yarisini WriteFile+Flush yapti, taskkill sonrasinda parser reddetti ve startup kapali kaldi. Eski DB/WAL SHA ve WAL satiri korundu.
- Ayni komut `--terminal-cut=flush-fail` ile: RED tani kesiti exit 0, `redConfirmed=true`, `durableSealObserved=false`. Helper tam satiri WriteFile yapti, journal FlushFileBuffers cagirmadan ayri test marker'ini flush edip durdu; taskkill sonrasi startup gorunur ROLLED_BACK kaydina guvenip eski nesli acti (`blocked=false`). Ilk fail-closed oracle kosusu exit 1 (`false !== true`) idi; tani kesiti bu gozlemi saklar. Bu gercek FlushFileBuffers EIO veya elektrik kesintisi degildir. Cache gorunurlugunun kalicilik kaniti sayilamayacagini gosterir.
- Ayni komut `--terminal-cut=ack` ile: exit 0. Journal Flush sonrasi ACK gonderilmeden child exit 2; stdout EOF/no ACK dogrudan olculdu. Terminal ROLLED_BACK goruldu; eski DB ve WAL satiri acildi.

`npm run build`, `node scripts/verify-windows-file-helper.mjs` ve `node --check scripts/probe-restore-two-blob-layout.mjs`: exit 0. Derlenen urun EXE'de ASCII/UTF-16LE `AITE6_DISPOSITION_RECEIPT_V1`, `AITEST_NATIVE_TWO_BLOB_TERMINAL_CUT`, `AITEST_NATIVE_TWO_BLOB_ARM_MARKER` bulunmadi; test EXE'de ucu de bulundu. Urun ve test EXE SHA'lari ayri manifestlere yazildi. Bu tarama yalniz fault kodunun urun ikilisine girmedigi yonunde yerel kanittir.

## Karar ve devam

N=2 urun recovery icin olasi cozum, iki disposition'in generation/index sirali kalici makbuzlarini ve terminal kaliciligini ayirt eden bir seal/protokolu icerebilir; bu fixture bu semanin zorunlu veya yeterli oldugunu kanitlamaz. Partial line, gercek Flush hatasi, helper olumu ve ACK kaybi ayri sonuc kararlarina baglanmalidir. PREPARED N=2 auto-open ve terminal yazimi kapali kalir. Test marker'lari urun journal'inin, gercek guc kaybinin veya Windows storage flush garantisinin yerine gecmez. Ara parent tarihsel FileId, alias, GC ve 8192-byte gecerli ITEM sinir fixture'i da acik kalir.
