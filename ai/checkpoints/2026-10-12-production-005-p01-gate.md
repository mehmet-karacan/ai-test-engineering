# AITE-PRODUCTION-READINESS-005 P01 release gate

## Kapsam

- P01/PR01/PP01-PP03 release verifier ve fail-closed full gate uygulandi.
- Bare/default komut FULL moddur; evidence manifesti yoksa non-zero ve `NO_GO` verir.
- `--local` yalniz yapisal/fixture kontroludur; `LOCAL_PASS` production onayi degildir.
- Evidence kaydi obligation id, predicate, evidence level, scope, command/exit, job/run ve artifact hash/bytes alanlarini zorunlu dogrular.
- Kaynak commit/tree, lockfile/build digest, dist hash, live pilot ve platform evidence ayrik dogrulanir.

## Kanit

- `npm.cmd test -- tests/unit/p01-release-gate.test.ts`: exit 0; 25/25 test gecti.
- `node scripts/release-verify.mjs --local`: exit 0; `LOCAL_PASS`, full kabul bekliyor.
- `node scripts/release-verify.mjs`: exit 1; `NO_GO`, `EVIDENCE_MANIFEST_EKSIK`.
- Manifest negatifleri: bos/mukerrer/eksik obligation, yanlis predicate/level/scope, yalniz `passed:true`, baska job/run, yanlis commit/tree/lockfile/build, bozuk JSON/hash, yol kacisi ve pilot/platform eksigi.
- Gevcut repo kanitinda gercek kabul manifesti yoktur; full gate'in non-zero sonucu beklenen fail-closed davranistir.

## Sinirlar

- Docker Linux daemon kaniti yok; platform evidence uydurulmadi.
- Canli kurum modeli/provider/pilot baslatilmadi; pilot durumu `PAUSED_BY_USER` / `NOT_PASSED` olarak korunur.
- Bilinmeyen sahiplikteki `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dosyasi degistirilmedi ve stage edilmedi.

## Devam noktasi

- P01: tamamlandi; commit/push sonrasi P02 lease/fencing testleri ve CAS davranisi.
- P02 kapsaminda aktif owner devralmasi atomik reddedilecek, expired lease takeover yapacak, stale/expired checkpoint pointer ilerletmeyecek.
