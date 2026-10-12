# Checkpoint - AITE-PRODUCTION-READINESS-005 P08 Gercek Eski Binary (v4) Kaniti

## Kimlik

- Tarih: 2026-10-12 (UTC)
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR08 (P08)
- Kol: Qwen3.8-27B-IT xhigh coordinator bagimsiz uygulama kolu
- Branch: `codex/qwen-prod005-p08-next2`
- HEAD: `10f3f4fe30422e142cb35a44b8153bc61c7c943f` (= `origin/main`; calisma agaci temiz)
- Ortam: Node v24.14.1, Git 2.55.0, Docker 29.8.2 (linux/amd64, WSL2), host Maven 3.9.16
- Repo-local kimlik: `mehmet-karacan <karacan.mehmet@hotmail.com>` (global config degistirilmedi)
- Kullanici sinirlari: canli pilot PAUSED_BY_USER baslatilmadi; CI acilmadi; kurum ic adres/secret dokumana yazilmadi; `JavaMetadataScannerCoverageTest.java` dokunulmadi.

## P00 Dogrulama (bu HEAD'te gercek baseline)

| Kosu | Sonuc |
| --- | --- |
| `npm ci` | exit 0 (236 paket, 0 vulnerability) |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `dist/build-stamp.json` SHA256 `8e938589cf325bede1bedeba2f7a8350f2c6488783f23d7d26e6849a0a7abe25` (source_commit `10f3f4f`, tree_digest `961654ce71a56842...`, 190 dosya) |
| Tam suite (`npm test -- --run`) | 74 dosya, **640 PASS / 4 FAIL**, exit 1; log SHA256 `7c15187edf806adea4abca348fbd0f7fd88139ea6108343fe5c79737ab689773` (4540 bayt, repo disi) |

Dort FAIL'in ayrimi (hepsi gercek logdan; onceki kayitla kiyaslandi):

- `tests/security/pilot.test.ts` 2 FAIL: `tmp/pilot-stdout.txt` yok (canli pilot `PAUSED_BY_USER` ortam kaniti; onceki kayitlarda da ayni, degisiklikten bagimsiz).
- `tests/unit/p01-release-gate.test.ts` 1 FAIL: "bos obligations listesi gecmez (PP02)" tam suite yukusu altinda 30 sn vitest timeout'una takildi; **izole kosuda 40/40 PASS** (exit 0, 260.44 sn). Kaynak baskisi kaynakli timeout; regresyon degil, izole kaniti gecerli.
- `tests/integration/p07b-browser-e2e.test.ts` 1 FAIL: browser print-to-pdf spawn `status=null` (environmental gozlem; bu oturumda izole yeniden kosu YAPILMADI). Regresyon iddiasi degil; sonraki kosuda izole tekrar dogrulanmali.

Onceki kayit "638 PASS/2 FAIL" iken bu kosu 644 testte 640 PASS/4 FAIL: fark, son iki commit'teki (`6ff4337`, `9ec01cc`) yeni test eklemlerinden gelir; iki AC67 kalici ortam FAIL'i ayni.

## P08: Gercek Eski Binary (surum v4) Kaniti

- Gercek eski binary kaynak commit'i: `0822c3dbe0140c233dcee07a561bac81b73a98f9` (`gorev: production readiness p05a resolver ve model`; migration seti v1-v4, en yuksek surum 4).
- Ayri worktree (repo disi, izole store): `git worktree add C:\Users\mkaracan\AppData\Local\Temp\opencode\p08-realbin-old 0822c3d` (detached HEAD `0822c3d`).

| Ad | Komut | Exit |
| --- | --- | --- |
| Eski bagimliliklar | `npm ci --no-fund --no-audit` (eski worktree) | 0 (236 paket) |
| Eski build | `npm run build` (tsc, eski worktree) | 0 |
| Eski binary gercek calisma | `node -e` icerisinde eski `dist/storage/storage.js`: `new Storage({dbPath}); s.migrate()` | 0; **`OLD_SCHEMA_VERSION=4`** (probe DB: `C:\Users\mkaracan\AppData\Local\Temp\opencode\p08-realbin-probe\state.db`) |

Cross-binary checksum kapisindigi (kaynak seviyesi):

- Eski ve yeni binary'nin `src/storage/migrations.ts` icindeki migration 1-4 SQL bloklari birebir ayni: v1 `3ba0581c28d6a0a4`, v2 `4b81b0f66ad81523`, v3 `bf7536eeab15530f`, v4 `09161c5089b870ea` (ilk 16 hex; `match=true`).
- Sonuc: yeni binary'nin `migrate()` (src/storage/migrations.ts:488-498) eski binary'nin uygulamis oldugu v4 `schema_migrations` kayitlarini checksum uyusmazligi ile REDDETMEZ; v4->v7 zinciri checksum kapisindan kaynak seviyesinde gecer.

## P08/PP44 Gercek Iki-Binary v4->v7 e2e: **NOT_RUN**

- Kapsam: gercek eski binary v4 store (install/config/DB + trusted job/artifact) -> gercek yeni binary process ile v4->v7 upgrade -> trusted veri korunumu -> online backup -> rollback restore.
- Bu oturumda tamamlanamadi (sure tahsisi); talimat geregi yeni test dosyasi YAZILMADI ve uretim kodu DEGISTIRILMEDI.
- Durum etiketi: `NOT_RUN` (basarisizlik iddiasi DEGIL; sahte PASS yok).
- Uygulanabilirlik ön kosullari dogrulandi: eski binary build/calisma, gercek v4 DB, migration checksum eslesmesi, storage API uyumlulugu (`createJob/ensureLocation/updateLifecycle/updateOutcome/publish` imzalari eski-yeni ayni).

## Kalan Acik Maddeler (durum degismedi)

- P07-B customer dispatcher COMPLETED + Report06 export: NOT_RUN (egress enforcement mekanizmasi yok -> typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` fail-closed).
- P08 PP44 gercek iki-binary v4->v7 e2e: NOT_RUN (bu checkpoint).
- PP42 macOS makine kaniti: NOT_RUN.
- Canli pilot/benchmark: `PAUSED_BY_USER`; full release gate `NO_GO` (evidence manifest eksik).

## Sonraki Tek Somut Is

- `p08-realbin-old` worktree + `C:\Users\mkaracan\AppData\Local\Temp\opencode\p08-realbin-e2e` store uzerinde PP44 gercek iki-binary e2e'yi kos: eski binary v4 store + trusted job -> yeni binary v7 migrate (exit + schemaVersion + veri korunumu) -> createBackup/verifyBackup/restoreBackup (exit + blob eslesmesi). Komut, exit, log SHA256 ve store kimlikleri bu checkpoint'e eklenecek.

## Sinir Kontrolu

- Uretim kodu degisikligi YOK (yalniz bu checkpoint + ledger satir guncellemeleri).
- Runtime kanitlar repo disi store'larda; repo'ya yalniz redakte ozet girer.
- Commit yalniz bu checkpoint ve ledger guncellemesini icerir; push `codex/qwen-prod005-p08-next2`.
