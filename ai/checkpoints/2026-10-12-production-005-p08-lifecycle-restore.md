# Checkpoint - AITE-PRODUCTION-READINESS-005 P08 lifecycle restore

## Kimlik

- Tarih: 2026-10-12
- Paket: P08 backup complete marker, blob verification ve restore uygulamasi
- Onceki commit: `e80d33e gorev: p06 frozen workspace ve exact counter`
- Kullanici dosyasi `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi ve stage edilmeyecek.

## Yapilanlar

- Backup cikisina `complete.json` marker'i eklendi.
- Backup manifest JSON'u bozuk/eksik, blob path'i containment disi, hash'i veya byte boyutu farkliysa verification fail-closed oluyor.
- `restoreBackup` eklendi: verification gecmeden uygulama yapmiyor; DB'yi temp dosyadan yayinliyor ve dogrulanmis blob'lari hedef artifact root'a kopyaliyor.
- FIN11 testi ayni job kaydinin ve artifact blob'un ayri restore runtime'inda geri geldigini kanitliyor.

## Kanit

- `npm.cmd test -- --run tests/unit/fin11-lifecycle-ops.test.ts`: 1 dosya, 6/6 PASS.
- `npm.cmd run typecheck`: PASS.

## Kalan

- Install script'in gercek install-manifest/upgrade rollback baglantisi ve gercek Windows temiz install/uninstall e2e kaniti ayridir.
- Aktif DB uzerinde restore cagrisini durduran quiesce/operasyon akisi ve Docker runtime kaniti halen gereklidir.
