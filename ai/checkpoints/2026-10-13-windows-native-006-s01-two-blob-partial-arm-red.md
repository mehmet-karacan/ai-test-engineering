# S01 iki blob kismi ARM RED matrisi

Tarih: 2026-10-13. Baz: coordinator `1ed409f`, S01 merge sonrasi. Kapsam yalniz iki yeni blob, iki farkli mevcut parent ve PREPARED journal. Uretim N=2 auto-open, terminal ROLLED_BACK ve GC acilmadi.

## Gercek Windows kesitleri

Eski GUARD-only helper'a `GUARD_ARM` gonderildiginde PUBLISH_1 fixture helper EOF ile exit1 verdi: beklenen RED, fiziksel disposition protokolu yoktu. Test-only `AITEST_FAULT_FIXTURE` derlemesine, iki canli GUARD_ITEM ve GUARD_FINAL sonrasi held owned handle'lara sira ile disposition koyan `GUARD_ARM` eklendi. Her disposition sonrasi test-only marker FlushFileBuffers ile kalici yazilir ve helper bekler; prob marker'i gordukten sonra gercek `taskkill /F` uygular. Uretim binary'sinde ARM komutu ve fault marker'lari yoktur.

| Komut | Kill noktasi | Gozlenen fiziksel durum | Startup |
| --- | --- | --- | --- |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=first` | A destination disposition sonrasi | A adlari yok, B stage korunuyor; eski DB SHA degismedi | `RESTORE_RECOVERY_REQUIRED`, exit0 prob |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=second --reverse-layout` | A stage ve B destination disposition sonrasi | Iki owned ad yok; eski DB SHA degismedi | `RESTORE_RECOVERY_REQUIRED`, exit0 prob |

Her iki kill sonrasi yeni **uretim** recover-session ayni PREPARED journal ile ACCEPT, GUARD_BEGIN, iki GUARD_ITEM ve GUARD_FINAL/`GUARD_READY` sonucuna ulasti. Bu yalniz fiziksel kismi layout'un yeniden pinlenebildigini gosterir; journal terminal kararini kanitlamaz. Prob iki owned adin beklenen varlik/yoklugunu ve old DB byte hash'ini kontrol eder. WAL/SHM sentinel, terminal fsync kill ve ACK kaybi bu dar fixture'da yoktur.

`cmd /c scripts\build-windows-file-helper.cmd tests\fixtures\native --fault-fixture`, uretim helper build, `node scripts/verify-windows-file-helper.mjs`, `npm run build`, iki secili hardkill probu exit0. Genel 54/15/7 regresyonu bu dilimde yeniden kosulmadi; onceki GUARD-only sonucuyla karistirilmaz. Test-only binary/manifest ve uretim binary/manifest ayni kaynak SHA ile yeniden uretildi; uretim binary fault marker taramasi verifier'da PASS. Fixture `.obj` untracked ve unstaged kalir; onceki cleanup policy reddi sonrasi tekrar silme denenmedi.

## Kesin engel ve sonraki dilim

Uretim recovery worker yalniz tek blob predicate'ini kabul ediyor; N=2 PREPARED her iki kesitte de fail-closed. `GUARD_READY` ve test-only ARM kill sonrasi journal'da hangi owned disposition'larin tamamlandigina dair kalici receipt yok. Yeni helper mevcut adlarin yoklugunu ve eski DB kimligini pinleyebilse de N=2 terminal yazimi ile ACK kaybi uzlastirmasi henuz kurulmus degil. Bu nedenle su anki kodda N=2 icin ROLLED_BACK fsync ve old-generation auto-open acmak guvenli kabul edilmez. Sonraki kabul: ayni child'da iki parent/name/receipt/DB guard, kismi ARM yeniden giris, her iki disposition sonrasi terminal fsync ve ACK kaybi kesitleri; negative foreign/alias ve WAL/SHM orakli. 8192 byte gecerli GUARD_ITEM boundary fixture'i de aciktir. S01 VERIFIED ve G1/G2/G3 NO_GO.
