# S01 native kurtarma worker dilimi - WN11/12/13 NO_GO

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`.
- v2 restore gunlugu `RECOVERING` fazini, immutable recovery base count'u ve her ters MOVE icin fsync edilen `recoveryReceipts` dizisini tasir. Fiziksel ters MOVE gunluk fsync'inden once kesilirse sonraki `RECOVERY_READY` pinli FileId/byte/SHA ve ad duzeni kaniti tek eksik receipt'i `evidence=RECOVERY_READY` ile kaydeder.
- `Storage` acilisi, native initial identity ve nonterminal gunlukte senkron child worker cagirir. Worker DB ve artifact owner lock'larini edinir, checksum/transition'lari tekrar okur, native `recover-session` READY layout'unu receipt prefix'iyle dogrular, ancak sonra ACCEPT/MOVE gonderir. Her basarili ters MOVE gunluge fsync edilir. Eski DB/WAL ve staged hash'i eslesince `ROLLED_BACK` kaydedilir; belirsizlikte acilis bloke olur. Blob silinmez.
- Gercek Windows fixture: ilk eski DB MOVE tamamlanip forward receipt yazilmadan kesinti ve son ters MOVE tamamlanip recovery receipt yazilmadan kesinti. Iki durumda eski `test_jobs.old` SQLite acildi; ikincisinde `RECOVERY_READY` receipt fsync edildi. Native count=0 CLOSE ve adapter fixture'lari dahil 3 dosyada 26 test PASS. `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint` exit 0; lint 89 onceki warning, yeni warning yok.
- Worker betigi `scripts/restore-recovery-worker.mjs` repo icinde paketlenir; runtime `../dist` importlarini kullanir. Release mandatory file ve build-input listesine eklendi. Ayrik kopya kurulum fixture'i henuz kosulmadi.

## Acik sinirlar

- Bu iki fixture tam 15 kritik hard-kill kesitini kanitlamaz. Eski 15-cut probe betiginin native degisikligi kayboldu; tekrar uretilip her kesitte eski veya tam dogrulanmis yeni generation assert edilmelidir.
- Worker `session.close()` ile terminal `ROLLED_BACK` fsync arasinda native raw-writer guard'ini kaybeder. Production restore da `session.close()` ile `COMMITTED` fsync arasinda ayni boslugu tasir. Startup worker lock'u birakildiktan sonra `Storage` SQLite handle acmadan once de aralik vardir. WN12 terminal identity/fence kaniti ve raw SQLite rakip testi olmadan kapanmaz.
- Normal production `restoreBackup` cagrilarinda native helper halen opsiyoneldir. Fresh hedef native session tarafindan bilincli bloke edilir. WN11/12/13 ve S01 VERIFIED denmez; S04 migration kapali kalir.
- Gercek Windows helper path/no-follow ve GC icin tum adversarial alias/hard-kill kanitlari tamamlanmadi. G1/G2/G3 kapali.

## Sonraki 15 kesitlik probe

- Kaybolan native probe degisikligi `scripts/probe-restore-hardkill.mjs --native --expect-recovery` olarak yeniden kuruldu. Gercek `taskkill /F` ile 15/15 kritik kesitte exit 0: PREPARED/LINK/BLOBS_READY ve 11 tasima/yayin ara kesitinde eski `test_jobs.old` acildi; COMMITTED kesitinde yeni `artifacts.new` acildi ve eski job yoktu. MOVE_DB/WAL/SHM kesitlerinde eski DB/WAL kimligi ve SHM yol varligi ayrica assert edildi. Yeni blob rollback'te silinmedi.
- Ilk tam denemede `OLD_SHM_MOVED` 30 s probe bekleme suresi doldu; ayni kesit 45 s ile tekil tekrar exit 0 ve sonraki tam 15 kesit kosusu da exit 0. Bu bir performans/harness belirsizligidir; yalniz ilk timeout'u PASS diye saymadik.
- Native raw-open alt fixture'inda ayri better-sqlite3 owner acikken restore `WINDOWS_RESTORE_SESSION_PROTOCOL` ile bloke oldu; hedef DB/WAL/SHM hash'leri ayni kaldi. Bu belirli zamanlamanin kanitidir, evrensel raw writer dislamasi degildir.
- Halen WN12 terminal close/fsync sirasi ve startup lock acigi; WN13 path/GC tam kaniti; nativeHelper production default/fresh hedef acik. Bu nedenle 15 kesit yesil olsa da S01 VERIFIED degildir.
