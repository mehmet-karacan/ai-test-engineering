# S01 iki blob ARM sonrasi journal RED matrisi

Tarih: 2026-10-13. Baz: coordinator `d130c45`, S01 merge sonrasi. Bu dilim sadece `scripts/probe-restore-two-blob-layout.mjs` oraklini genisletir. Uretim native, TS recovery worker, journal semasi ve public restore davranisi degismedi.

## Gercek Windows olcumu

PUBLISH_1 sonrasi iki farkli mevcut parent'ta iki yeni blob icin test-only native `GUARD_ARM` disposition marker'inda gercek `taskkill /F` uygulandi. Yeni **uretim** recover-session kalan fiziksel yerlesimi `RECOVERY_READY`/`ACCEPT` ve iki `GUARD_ITEM`/`GUARD_FINAL` ile pinledi. Sonra journal icin gecerli `ROLLED_BACK` transition satiri ve gercek FileId/bytes/SHA beklenen degerleriyle `ROLLBACK_COMMIT` gonderildi. Native exit2 verdi; journal byte-for-byte degismedi. Bu terminal reddi mevcut protokolun fail-closed kanitidir, terminal fsync kaniti degildir.

| Probe | ARM sonrasi A/B | Journal ve startup |
| --- | --- | --- |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=first` | `none/stage` | PREPARED, iki stage copy identity receipt, move0, recoveryReceipts yok, terminal reddi, old DB SHA ayni, startup blocked; exit0 |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut --arm-cut=second --reverse-layout` | `none/none` | Ayni journal ve old DB orakli; terminal reddi, startup blocked; exit0 |
| `node scripts/probe-restore-two-blob-layout.mjs --cut=PUBLISH_1 --guard-after-cut` | `destination/stage` | Uretim GUARD-only regresyonu, startup blocked; exit0 |

Ilk test-only helper kill ve sonraki uretim guard/terminal denemesi arasinda journal dosyasinin tam byte kopyasi korundu. Iki kalici `stageIntents.identity` makbuzu COPY kimligini kanitlar, **ARM disposition ilerlemesini kanitlamaz**. Ilk kesitte A yok/B owned, ikinci kesitte iki ad da yok; bu yokluk tarihsel silme ile foreign move ayrimini tek basina kanitlamaz. Her iki kesitteki old DB SHA sabit ve startup `RESTORE_RECOVERY_REQUIRED` ile kapali.

`npm run build` exit0 (helper provenance dahil), uc secili Windows probe exit0, script syntax ve `git diff --check` exit0. Genis 54/15/7 suite tekrarlanmadi. N=2 ROLLED_BACK fsync, ACK kaybi, WAL/SHM sentinel, foreign/alias adversarial ve genel auto-open bu dilimde uygulanmadi. 8192 byte gecerli GUARD_ITEM boundary fixture'i de acik. S01 VERIFIED ve G1/G2/G3 NO_GO.
