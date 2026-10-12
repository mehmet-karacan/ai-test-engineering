# Checkpoint - AITE-PRODUCTION-READINESS-005 P08 kurulum ve runtime resolver

## Kimlik

- Tarih: 2026-10-12
- Paket: P08 kurulum/config/entry/runtime path readiness
- Baslangic HEAD: 3318263
- Kullanici dosyasi: `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi ve stage edilmeyecek.

## Yapilanlar

- `runtime-paths.ts` ile config, DB, runtime root ve OpenCode config path resolver ortaklastirildi; `path.join` kullaniliyor.
- Varsayilan dependency provisioning kapatildi; kurum mirror endpoint'i default config ve kaynak test/gelistirme notlarindan cikarildi. Private mirror yalniz kullanici config'inden acikca saglanir.
- Windows/Linux/macOS runtime root dallari, XDG config/data ve Unicode/bosluk path icin resolver altyapisi eklendi.
- Kurulum scriptleri `npm ci` kullaniyor; kurulu OpenCode entry'sine `AITEST_CONFIG` ve effective config storage root'tan turetilen `AITEST_DB_PATH` yaziliyor.
- `mcp-handshake-smoke` kurulu config/DB ile calisabiliyor; `verify-install` gercek kayitli entry'nin command ve environment binding'ini parse edip dogruluyor.
- Kurulum sonucu handshake ile worker/test generation readiness ayrildi: worker flag/profile yoksa `NOT_READY` yaziliyor, hazirlik uydurulmuyor.
- MacOS shell runtime path ve OpenCode config root dali eklendi; install timeout hata nedeni gorunur hale getirildi.

## Kanit

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS.
- Domain/W09/RT21 odak suite: 3 dosya, 24/24 PASS.
- Degisen P08 kaynak/script lint: 0 error.
- Gercek gecici Windows kurulumu: `npm ci + build`, config/runtime dizinleri, OpenCode entry, MCP handshake ve `verify-install`: PASS.
- Gecici test profili temizlendi; kullanici OpenCode config'ine dokunulmadi.

## Kalan ve sinirlar

- P08 hala IN_PROGRESS/NO_GO: backup/restore/upgrade/rollback/uninstall'in kurulum entry'si ve gercek DB/blob migration kaniti ayri kosuda tamamlanmadi.
- Gercek worker/provider profile ile test-generation readiness ve normal customer job kabul kosusu Docker yoklugu nedeniyle BLOCKED.
- Linux/XDG ve macOS gercek makine kosusu yapilmadi; resolver unit kapsaminda.
- P09 full regression/release verifier reconciliation ve P10 handoff henuz yapilmadi.

## Sonraki somut is

- Lifecycle backup/restore/quiesce ve uninstall ownership kanitini kurulum akisi ile bagla; sonra P09 full gate/test ledger reconciliation'a gec.
