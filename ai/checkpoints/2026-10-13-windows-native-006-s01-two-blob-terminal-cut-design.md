# S01 iki blob terminal kesitleri: fixture kaniti ve uretim karari

Tarih: 2026-10-13. Baz: coordinator `3af26ef`, S01 merge sonrasi. Uretim `restoreBackup`, recovery worker, journal semasi ve N=2 terminal/auto-open davranisi degismedi. Ortak C++ kaynagi nedeniyle uretim binary/manifest yeniden derlendi. Yalniz `AITEST_FAULT_FIXTURE` derlemesinde, iki canli blob GUARD ve iki disposition sonrasi journal `ROLLBACK_COMMIT` satirini held DB/root/parent/name guard altinda yazip fsync eden test yolu eklendi. Uretim EXE'de N=2 `ROLLBACK_COMMIT` halen exit2; `AITEST_NATIVE_*` fault marker yok.

## RED ve gercek Windows kesitleri

Ilk RED: test-only terminal yolu yokken `--terminal-cut=before --wal-sentinel` marker'i olusmadi, prob exit1. Yeni test-only yol ile uc secili Temp fixture exit0:

| Kesit | Journal / isimler | Acilis |
| --- | --- | --- |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=first --terminal-cut=before --wal-sentinel` | Iki disposition sonrasi, WriteFile oncesi taskkill: PREPARED byte-for-byte ayni; A/B stage/dest/pending yok | `RESTORE_RECOVERY_REQUIRED` |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=first --terminal-cut=after --wal-sentinel` | `FlushFileBuffers` sonrasi kalici marker, taskkill: ROLLED_BACK; A/B adlari yok | Eski job ve WAL sentinel satiri acildi |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=first --terminal-cut=ack --wal-sentinel` | Journal fsync sonrasi helper exit2, stdout EOF'ye dek `ROLLBACK_COMMITTED` ACK yok: ROLLED_BACK; A/B adlari yok | Eski job ve WAL sentinel satiri acildi |

Fixture eski DB+gercek uncheckpointed SQLite WAL+SHM snapshot'i kurar. Sentinel satiri yalniz WAL'da oldugu main DB byte karsilastirmasi ve WAL frame uzunluguyla dogrulanir. Her kesitte eski DB/WAL SHA, SHM yolu ve ayrik kopyada eski+sentinel satirlari dogrulanir. Yeni restore kaynak bloblarinin iki ayri mevcut parent'i, stage COPY kimlikleri ve journal transition validator korunur. Terminal istegi gercek journal FileId/bytes/SHA ve validator tarafindan uretilen ROLLED_BACK JSONL satiriyla yapilir.

Bu test-only kesitler, dar schedule'da per-disposition kalici receipt olmadan **tek child iki owned handle'i pinleyip disposition koyar, terminal fsync eder, sonra handle'lari birakir** sirasinin eski nesli acma acisindan uygulanabilir oldugunu gosterir. Bu, N=2 uretim GO kaniti degildir: foreign move/alias, farkli parent transient swap-back, ikinci disposition failure, WAL/SHM raw writer yarisi, partial WriteFile/power loss ve public API ACK belirsizligi kapsam disi. ACK kesitinde dogrudan native helper exit2 olculdu; `restoreBackup` API outcome uzlasmasi uygulanmadi. Preterminal kill'de ARM ilerleme receipt'i yok; startup fail-closed kalir. Journal sema genislemesinin dar N=2 terminal protokolu icin zorunlu oldugu kanitlanmadi; uretim tasarimi ve negatifler tamamlanmadan sema degistirilmez.

`npm run build` ve helper provenance exit0; uc secili Windows terminal probe exit0. 54/15/7 genis suite tekrarlanmadi. 8192 byte gecerli GUARD_ITEM boundary fixture'i acik. S01 VERIFIED, S04, G1/G2/G3 ve customer gate NO_GO.
