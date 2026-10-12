# Checkpoint - AITE-PRODUCTION-READINESS-005 P07-B wire + P08 remaining final2 store kanitlari

## Kimlik

- Tarih: 2026-10-12 (UTC)
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR07 (P07-B wire) + PR08 (P08 install/lifecycle/upgrade/restore/uninstall) kalan kapanis kanitlari
- Branch: `codex/qwen-prod005-remaining`
- Baslangic HEAD: `ffdf8df` (gorev: glm qwen kanitlarini ana dala birlestir)
- Tum runtime veri izole store: `C:\Users\mkaracan\AppData\Local\Temp\opencode\p08-chain-final2` (repo disinda)
- Kullanici sinirlari: canli pilot `PAUSED_BY_USER` baslatilmadi; CI acilmadi; kurum ic adres/secret dokumana yazilmadi; `JavaMetadataScannerCoverageTest.java` korundu; global git config degistirilmedi; repo-local kimlik `mehmet-karacan <karacan.mehmet@hotmail.com>`.

## Uncommitted degisiklik (bu oturumda korunup dogrulandi)

- `src/storage/lifecycle-ops.ts`: ESM static `import Database from "better-sqlite3"` duzeltmesi.
  - Onceki: `verifyBackup` icinde `const Database = require("better-sqlite3")` (function scope).
  - Sonraki: dosya basinda `import Database from "better-sqlite3"`; `require` satiri kaldirildi.
  - Neden: dist ESM'de `require("better-sqlite3")` Node 24'te `ERR_AMBIGUOUS_MODULE_SYNTAX` uyarisi/duzen sorunu uretir; gercek urun `verifyBackup/restoreBackup` yollari duzeltmeyle ESM static import uzerinden calisir.
- `tests/integration/p07b-dispatch-egress.test.ts`: P07-B wire blocker testi (YENI).

## P07-B wire blocker testi (gercek stdio-entry + Docker)

- Test: `tests/integration/p07b-dispatch-egress.test.ts` (1 test).
- Davranis: normal MCP `test_start -> dispatch -> test_status` uzerinden; provisioning ACIK + izinli mirror DOLU ama egress enforcement mekanizmasi (network policy/proxy) bagli DEGIL iken urun fail-closed `FAILED` lifecycle + typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` outcome doner. Sahte `COMPLETED`/`READY`/`PASS` yazilmiyor.
- Docker/imaj yoksa test truthful skip (NOT_RUN kaniti); bu host'ta Docker 29.8.2 + imaj mevcut oldugu icin test GERCEK calindi (skip degil).
- Sonuc: 1/1 PASS (fokus suite icinde, asagida).

## P08 final2 store - verify/uninstall/upgrade/restore zinciri (gercek kosu)

Store env: `LOCALAPPDATA` + `USERPROFILE` -> final2 izole store; `npm_config_cache` global.

| Ad | Komut | Exit | Kanit (store icinde) |
| --- | --- | --- | --- |
| Temiz install (onceki) | `node scripts/install.mjs` | 0 | `install.log` (sha256 `3eceb2f4...`, 2474 bayt) |
| Verify | `node scripts/verify-install.mjs` | 0 | `verify.log` (sha256 `3b645f4b...`, 970 bayt) |
| Chain (v4->v7 + quiesce + backup/restore) | `node p08-chain-upgrade.mjs` | 0 | `chain.log` (sha256 `fea0ad39...`, 1792 bayt) `CHAIN_ALL_OK=true` |
| Uninstall | `node scripts/uninstall.mjs` | 0 | `uninstall.log` (sha256 `07f4046d...`, 2034 bayt) |
| Build (dist yeniden uretim) | `npm.cmd run build` | 0 | `build-after-uninstall.log` (sha256 `cab09639...`, 94 bayt) |

### Verify (exit 0)
- "gercek kayitli entry config/DB ile eslesiyor", config mevcut, MCP handshake smoke gecti (initialize + tools/list + tools/call). `DOG RULAMA TAMAM`.

### Chain (exit 0, `CHAIN_ALL_OK=true`) - 8/8 adim OK
- `eski_surum_v4_db`: yalniz migration 1-4 (schema_version=4) fiziksel olusturuldu; trusted job + artifact yazildi.
- `upgrade_v4_to_v7`: guncel binary `Storage.migrate` ayni DB'yi acip v4->v7 migrate etti; integrity=ok.
- `upgrade_veri_korunumu`: trusted job lifecycle=COMPLETED outcome=TARGET_REACHED; son trusted artifact blob korunur=true.
- `upgrade_quiesce_gate`: aktif (RUNNING) job varken `assertQuiescedForUpgrade` reddetti (ACTIVE_JOBS_RUNNING).
- `quiesce_pause_after`: aktif job PAUSED yapilip quiesce sonrasi upgrade gecer.
- `backup`: online backup (DB snapshot + blob manifest + complete marker); verify schema/integrity/blob = true/true/true.
- `veri_kaybi_simulasyonu`: backup sonrasi yeni job RUNNING; trusted artifact satiri + blob silindi (kayip simule).
- `rollback_restore`: restore sonrasi trusted job=COMPLETED/TARGET_REACHED; backup sonrasi job geri alindi=true; blob+artifact geri geldi=true.

> Not: Bu chain, onceki temiz fixture'da (p08-chain / p08-chain-final) da `CHAIN_ALL_OK=true` vermistir; bu oturumda final2 store + guncel kod (ESM fix) uzerinde yeniden kosulup exit 0 kaydedildi.

### Uninstall (exit 0) - sahiplik dogrulanmis davranis
- OpenCode MCP `ai-test-engineering` kaydi KALDIRILDI (backup: `backups/config-backup-*.json`); `opencode.json` -> `{ "mcp": {} }`.
- Own `config.json` hash kontrolu ile kaldirildi; diger kullanici ayarlari korundu.
- Runtime veri (DB `state.db`, blob, log, config root) OTOMATIK SILINMEDi KORUNDU (store icinde hala mevcut).
- Repo icindeki `dist` build ciktilari kaldirildi (asagida yeniden uretildi).

### Build (dist yeniden uretim, exit 0)
- `npm.cmd run build` (tsc) exit 0; `dist/mcp/stdio-entry.js` yeniden olusturuldu (uninstall dist'i kaldirmissi).

## Odak testler (bu oturum, gercek kosu)

- Komut: `npm.cmd test -- --run tests/integration/p07b-dispatch-egress.test.ts tests/unit/fin11-lifecycle-ops.test.ts tests/unit/p08-upgrade-restore.test.ts tests/unit/p04-isolation-policy.test.ts`
- Sonuc: **4 test dosyasi, 22 test, 22 PASS, 0 FAIL, exit 0**, 35.31 sn. Log: `focus-tests.log` (sha256 `3a4f89e0...`, 998 bayt).
- P07-B wire testi Docker preflight'i gecerek GERCEK calindi (skip yok; 22 PASS icinde, skip sayisi yok).

## typecheck / build / lint

- `npm.cmd run typecheck`: exit 0 (TEMIZ). Log: `typecheck.log` (sha256 `c049f95c...`).
- `npm.cmd run build`: exit 0.
- `npm.cmd run lint`: exit 0, **0 error / 90 warning**. Yeni duzen degisikligi (lifecycle-ops.ts import + p07b-dispatch-egress.test.ts) yeni lint hatasi/uyarisi YOK. Log: `lint.log` (sha256 `21cbfac0...`).

## Durum ledger degisimi

- P07-B: gercek MCP customer dispatcher Docker egress **fail-closed typed blocker** wire kaniti eklendi (NOT_RUN -> LOCAL/gercek wire blocker kosuldu). Tam COMPLETED/Report06 export runtime henuz NOT_RUN (egress enforcement mekanizmasi yok).
- P08: PP41 (temiz install/verify/uninstall izole store) + PP44 (upgrade v4->v7 + trusted veri + quiesce gate + online backup/restore/rollback + owned uninstall) gercek runtime store kanitlari final2 store'da yeniden dogrulandi. Gercek binary surum-atlayi upgrade/rollback e2e ve macOS henuz NOT_RUN.
- Eski p08-chain processleri yok (dogrulandi: node process listesinde p08-chain/stdio-entry calisma yok).

## Kalan NOT_RUN/BLOCKED (acik)

- P07-B gercek customer dispatcher COMPLETED + Report06 export runtime kosusu: egress enforcement mekanizmasi (network policy/proxy) yok -> typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` fail-closed (sahte PASS yok). Tam COMPLETED kosusu NOT_RUN.
- PP44 gercek binary surum-atlayi upgrade/rollback e2e: NOT_RUN.
- PP42 macOS makine kaniti: NOT_RUN.
- PP07/PP08/PP09/PP14 iki-process, owned-container, Linux spawn ve hard-kill kanitlari: NOT_RUN (onceki).
- Canli pilot: `PAUSED_BY_USER`; full gate: `NO_GO` (evidence manifest eksik); production GO verilmedi.

## Sonraki tek somut is

- Docker egress enforcement (network policy/proxy) saglanirsa P07-B gercek customer dispatcher COMPLETED + Report06 export runtime kosusu; P08 gercek binary surum-atlayi upgrade/rollback e2e; P10 evidence manifest + handoff/release karari.
