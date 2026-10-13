# S01 PREPARED bos blob kurtarma kesiti

Tarih: 2026-10-13. Durum: dar kesit kanitlandi; S01 NO_GO.

## Kapsam

Yalniz mevcut hedef DB, tek yeni blob, PREPARED journal, sifir DB MOVE receipt, null stage receipt ve PREPARED oncesi kayitli artifact root ile son blob parent FileId durumunda otomatik eski nesil acilisi denendi. Native recover-session ayni child icinde DB/WAL/SHM/staged DB handle'larini, artifact root ve blob parent handle'larini, destination/stage/pending adlari icin CREATE_NEW + share=0 + FILE_DELETE_ON_CLOSE rezervasyonlarini ROLLED_BACK journal WriteFile + FlushFileBuffers bitene dek tutuyor. Her isim doluysa, FileId farkliysa veya kanit eksikse acilis fail-closed. Path tabanli blob silme yok.

## RED ve GREEN

- Onceki davranis: gercek `--mode=PREPARED --expect-prepared-old` taskkill probunda startup `RESTORE_RECOVERY_REQUIRED` ile kapali kaliyor; eski DB bozulmamisti. Bu, tek bloblu null-receipt kesitinin RED'i.
- Sonrasi: `node scripts/probe-restore-hardkill.mjs --native --mode=PREPARED --expect-prepared-old` exit 0, eski generation aciliyor, journal ROLLED_BACK, yeni blob yok. Guard sonrasi ve native FlushFileBuffers sonrasi `taskkill /F` kesitleri ayni sonuc ile exit 0. Son kesit fixture-only flush sonrasi marker'i bekleyip helper'i olduruyor; journal satirinin gorunmesini flush kaniti saymiyor.
- `--prepared-negative=occupied`, `parent-swap`, `stage-occupied`, `pending-occupied`: dort komutun her biri exit 0 ve startup fail-closed; eski DB/WAL/SHM hash kaniti korunuyor.
- `node scripts/probe-restore-hardkill.mjs --native` exit 0: 15 kesitte varsayilan davranis korunuyor; 14 ara kesit fail-closed, COMMITTED yeni nesil. PREPARED varsayilan fixture'da parent onceden mevcut olmadigindan dar recovery kosulu yok.
- `npx vitest run tests/unit/wn-restore-journal.test.ts tests/unit/wn-restore-session.test.ts tests/integration/wn-restore-session.test.ts tests/integration/wn-restore-atomicity.test.ts tests/integration/wn-restore-blob-terminal.test.ts --maxWorkers=1 --testTimeout=90000`: 5 dosya, 54/54 PASS.
- `npm run build`, `npm run lint`, `git diff --check`: exit 0. Lint mevcut uyarilari raporluyor. Uretim EXE icinde yeni `AITEST_NATIVE_EMPTY_ROLLBACK_HALT_AFTER_FLUSH` isareti ASCII ve UTF16LE aramada yok; fixture EXE icinde UTF16LE var.

## Binary kaniti

- Native kaynak SHA256: `9461dfd4de811f471f9bf283aaf49aa29ea51ce34edb57a69f8cec3c4ace5f37`.
- Uretim helper SHA256: `b6f7b183a2684aa0bdb67a8993ebd316717908c0de16b28b5e77efd886bcd0e0`.
- Fault fixture helper SHA256: `380a81a25b7c37fa7484881b9f949c0428f9c5875cc30159e50566da8d60fd53`.

## Acik sinirlar

- Stage receipt olusmus, LINK yapilmis, birden cok blob var, parent eksik veya fiziksel ad dolu durumlari otomatik kurtarilmiyor. Blob sahipligi belirsizliginde terminal journal yazilmiyor.
- Journal root ve son parent FileId'sini kaydediyor; ara parent zincirinin tarihsel FileId kaydi ve transient swap-back icin genel kanit yok. WN13/G1 kapali.
- Native flush basarili olup ACK kaybolursa ilk worker acilisi fail-closed kalabilir; sonraki acilis terminal ROLLED_BACK kaydini okuyup eski nesli acar. Ayni acilista ACK uzlasmasi kanitlanmadi.
- PREPARED WAL/SHM ve ara parent swap icin ayrik gercek fixture yok. Genel bloblu recovery, fresh target, GC fiziksel sahiplik ve tam WN11-13 kabul kapilari NO_GO.
