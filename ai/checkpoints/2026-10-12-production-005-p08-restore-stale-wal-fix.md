# Checkpoint - AITE-PRODUCTION-READINESS-005 P08 restore stale-WAL kacisi duzeltildi

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR08 (P08) / PP44 restore/rollback zinciri
- Kol: GLM-5.3-Flash-IT koordinator Windows followup kolu
- Branch: `codex/glm-prod005-windows-followup` (detached HEAD `6f043d1a54361e9a32bb1beb5d01f6565f43cbcf` uzerinden acildi; degisiklik oncesi switch yapildi)
- Ortam: Windows, Node v24.14.1, npm 11.11.0, vitest 4.1.11
- Repo-local kimlik: `mehmet-karacan <karacan.mehmet@hotmail.com>` (dogrulandi; global config dokunulmadi)
- Kapsam: Windows CMD + Node + Git; Docker/Docker egress/PP17, macOS, canli pilot/benchmark ve CI CALISTIRILMADI; bu alanlar icin evidence/PASS URETILMEDI

## Okunan baglam

- AKTIF_GOREV.md, ai/PROJECT_STATE.md, ai/BACKLOG.md, ai/ACCEPTANCE_MATRIX.md
- ai/handoffs/2026-10-12-production-005-coordinator-handoff.md
- ai/checkpoints/2026-10-12-production-005-p08-pp44-realbin-e2e.md ve 2026-10-12-production-005-p10-p09-reconciliation.md

## Incelenen Windows kapsami kod alanlari (kod okumasi)

- `scripts/install.mjs`, `scripts/verify-install.mjs`, `scripts/uninstall.mjs`, `scripts/mcp-handshake-smoke.mjs`: fileURLToPath tabanli repoRoot, dynamic dist import, minimal OpenCode merge, install-manifest sahipligi, READY/NOT_READY readiness ayrimi; yeni kod acigi bulunmadi
- `src/configuration/runtime-paths.ts` + `tests/unit/p08-runtime-paths.test.ts`: win32/USERPROFILE/XDG dallari, bos env fail-closed; acik yok
- `src/configuration/config-merge.ts`, `config-loader.ts`, `config-schema.ts`: atomik temp+replace, preimage/postimage hash, sentinel merge; acik yok
- `scripts/release-verify.mjs` + `release-digest.mjs` + `write-build-stamp.mjs` (P09 local verifier): build-stamp/digest provenance, fail-closed full gate; acik yok
- `src/mcp/stdio-entry.ts`: config/DB/profile cozumleme; acik yok

## Bulunan ve dogrulanan bug: restoreBackup stale WAL geri oynatma kacisi

- Yer: `src/storage/lifecycle-ops.ts` `restoreBackup`
- Kusur: restore yalniz `targetDbPath` dosyasini degistiriyordu; hedef DB'nin yanindaki eski
  `-wal`/`-shm` dosyalarini silmiyordu. PP44 e2e'sindeki gibi AYNI konuma restore'da, hard-kill/crash
  sonrasi `-wal`'da kalmis committed icerik sonraki acilista restore edilen DB'ye geri oynatiliyor ve
  backup'in birebir icerigi bozuluyor (restore edilen "trusted" veriye backup'ta olmayan satir karisiyor).
- Reproducer (repo disi, `Temp\opencode\p08-restore-wal-repro\repro4.mjs`; gercek ayri child process +
  SIGKILL ile stale WAL uretimi, gercek `createBackup`/`restoreBackup` dist'ten):
  - FIX ONCESI: `STALE_WAL_BEFORE_RESTORE=true`, `STALE_WAL_AFTER_RESTORE=true`,
    `JOBS_AFTER_REOPEN=[good-job, orphan-after-backup]`, `ORPHAN_SURVIVED=true`, `VERDICT=BUG_KANITLANDI` (exit 0)
  - FIX SONRASI: `STALE_WAL_AFTER_RESTORE=false`, `STALE_SHM_AFTER_RESTORE=false`,
    `JOBS_AFTER_REOPEN=[good-job]`, `ORPHAN_SURVIVED=false`, `VERDICT=GUVENLI` (exit 0)
- Ilk iki reproducer denemesi (repro.mjs/repro2.mjs) fixture hatasi nedeniyle gecerli stale-WAL durumu
  uretmedi (`VERDICT=GUVENLI`); kusur repro3/repro4 ile gercek iki-process kill akisiyla kanitlandi.
  Erken yanlis denemeler durustce burada kaydedildi.

## Uygulanan minimal duzeltme

- `src/storage/lifecycle-ops.ts` `restoreBackup`: hedef DB degisiminden once/sonra
  `${targetDbPath}-wal` ve `${targetDbPath}-shm` stale yan dosyalari `rmSync` ile temizleniyor
  (atomik temp+rename zinciri korunuyor; silinemeyen WAL varsa restore hatayla doner).
- Yeni test: `tests/unit/p08-restore-stale-wal.test.ts` (2 test):
  - ayni konuma restore'da stale -wal/-shm temizlenir; acilis yalniz backup icerigini verir (orphan yok, integrity ok)
  - farkli konuma restore temiz yan dosyalarla acilir
- Mevcut testlerin hicbirinin assertion'i silinmedi/ezilmedi.

## Dogrulama kaniti (gercek komut + exit)

- `cmd /c npm.cmd ci --no-fund --no-audit`: 236 paket, exit 0 (temiz worktree, node_modules yokken)
- `npm.cmd run typecheck` (`tsc --noEmit`): exit 0 (temiz)
- `npm.cmd run build` (`tsc && write-build-stamp`): exit 0 (192 dosya, 2 dist artifact)
- `npx.cmd vitest run tests/unit/p08-restore-stale-wal.test.ts`: **2/2 PASS** (exit 0)
- Hedefli P08/fin11 regresyonu (5 dosya): **16/16 PASS** (exit 0)
- Genisletilmis hedef suite (8 dosya: p08-runtime-paths, p08-restore-stale-wal, fin11-lifecycle-ops, p08-upgrade-restore, p08-skip-upgrade, p08-lifecycle-escape, w09-install, bootstrap): **36/36 PASS** (exit 0)
- `npm.cmd run lint`: **0 error / 89 warning** (exit 0; warninglar mevcut, yenisi eklenmedi)
- `node scripts/release-verify.mjs --local`: exit 0 (LOCAL_PASS; full gate'e dokunulmadi, full kanit uretilmedi)

## Sinir kontrolu

- Degisen dosyalar: `src/storage/lifecycle-ops.ts` (fix), `tests/unit/p08-restore-stale-wal.test.ts` (yeni), bu checkpoint
- Protected `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` stage edilmedi/silinmedi (checkout'ta yok; dokunulmadi)
- Docker, Docker execution/egress/PP17, macOS, canli model/pilot/benchmark ve CI calistirilmadi; PASS iddiasi uretilmedi
- Full suite zorunlu degildi, calistirilmadi; tam suite flake kayitlari (AC67/pilot) degismedi
- Runtime reproducer verisi repo disinda; repoya yalniz redakte checkpoint ve kod/test girdi
- AKTIF_GOREV.md degistirilmedi

## Kalan acik maddeler (durum degismedi)

- P07-B customer dispatcher COMPLETED + Report06 export: Docker egress enforcement altyapisi yok -> typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` (sonraki aktif goreve devredildi)
- P10 evidence manifest/release karari: full gate NO_GO (`EVIDENCE_MANIFEST_EKSIK`, 274 obligation); manifest gercek kanit olmadan uydurulmuyor
- Canli pilot/benchmark: `PAUSED_BY_USER`
- Full release gate: NO_GO (kanit eksigi suruyor)
