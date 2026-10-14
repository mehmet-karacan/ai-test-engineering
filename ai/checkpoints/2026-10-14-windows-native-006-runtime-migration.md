# Windows Native 006 - Runtime migration uyumu

Tarih: 2026-10-14
Branch: `codex/windows-native-006`

## Yapilan

- `src/storage/migrations.ts` icindeki migration v3 SQL bicimi, daha once uygulanmis runtime checksum'i ile uyumlu olacak sekilde eski byte duzenine alindi.
- Kullanici runtime DB'sinin kopyasi uzerinde guncel migration zinciri v3->v9 calistirildi.

## Kanit

- Runtime DB migration tablosu v3 checksum: `1994155f8f40016b7932b89595a0756ec379932064a636f799e9f4cff2baf568`.
- Yazilabilir kopya: `schema=9`, `integrity_check=ok`, `source_identities=true`.
- Odak testleri: `tests/unit/storage.test.ts` + `tests/unit/p08-skip-upgrade.test.ts` -> **14/14 PASS**.
- `npm.cmd run typecheck` -> PASS.
- `npm.cmd run lint -- --quiet` -> PASS (error yok).
- `git diff --check` -> PASS.
- `npm.cmd run build` -> PASS; Windows process/file/snapshot helper dogrulamalari PASS.
- `node scripts/verify-install.mjs` -> MCP handshake PASS, Maven `READY/CAPABILITY_PROBED`; migration checksum hatasi kalkti.

## Kurulum devam kaniti

- `node scripts/install.mjs` Bolum 5'te minimal OpenCode merge yapti; mevcut ayarlar korunarak backup olusturuldu.
- `verify-install.mjs` tekrarinda kayitli entry'nin config/DB ile eslesmesi PASS, MCP handshake PASS ve Maven `READY/CAPABILITY_PROBED`.
- Ilk kurulumun son readiness adimi, mevcut config basindaki UTF-8 BOM nedeniyle hata verdi; `scripts/install.mjs` config ve OpenCode JSON okumalarinda BOM normalizasyonu ile duzeltildi.
- Sonraki `npm ci` denemesi Windows `better-sqlite3` native dosya kilidi (`EPERM`) ile durdu; `npm install --no-fund --no-audit`, `npm.cmd run build` ve `verify-install.mjs` sonrasi bagimliliklar yeniden kullanilabilir durumda.
- Model worker readiness bilincli olarak acilmadi: mevcut uygulama config'inde profil yok ve OpenCode entry'sinde etkinlestirme bayragi yok. Gercek model session'i ve G1 kapisi icin kullanici model/provider karari gerekir.
