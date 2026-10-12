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
- P08 sonrasi tam regresyon: `npm.cmd test` 66 dosya, 588/588 PASS; `npm.cmd run build` PASS.
- Install/uninstall kod baglantisi: install ilk kurulumda hash tabanli `install-manifest.json` yazar; uninstall ortak runtime-path resolver ve `ownedUninstall` kullanir.
- `npm.cmd test -- --run tests/unit/w09-install.test.ts`: 7/7 PASS; `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint` PASS (90 warning, 0 error).

## Kalan

- Gercek Windows temiz install/uninstall e2e ve upgrade rollback uygulamasi halen ayridir; test bu turda kod sozlesmesi/static entry kanitidir.
- Aktif DB uzerinde restore cagrisini durduran quiesce/operasyon akisi ve Docker runtime kaniti halen gereklidir.
