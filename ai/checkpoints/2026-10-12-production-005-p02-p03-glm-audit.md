# AITE-PRODUCTION-READINESS-005 - PR02/PR03 hatlari (P02/P03) GLM izole audit checkpoint

## Kapsam ve karar

- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 (sozlesme: AKTIF_GOREV.md); bu is yalniz P02/PR02 (PP04-PP09: lease/owner/fencing/heartbeat/cancellation/cleanup) ve P03/PR03 (PP10-PP15: checkpoint/source identity/resume zinciri) kapsamindadir.
- Branch: `codex/glm-prod005-p02-p03`; denetlenen HEAD: `c2c8cb973ff6426900b0aaa4bea6c6e9b33f6967` (detached HEAD'den yeni branch acildi; `origin/main` ile ayni commit).
- Calisma agaci: temiz (staged/untracked yok). `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` (kullaniciya ait) hicbir asamada okunamadi-silinmedi; stage edilmedi.
- **Karar: PR02/PR03 yerel (kod + test) hattinda gercek uygulanabilir kod/test acigi BULUNMADI; kod degisikligi yapilmadi.** Bu checkpoint onceki `2026-10-12-production-005-pr02-pr03-audit.md` bulgularini yeni HEAD'de bagimsiz olarak yeniden dogruladigini kayit altina alir; dokuman metnine guvenilmedi, kaynak kodlar tekil okundu.

## Bulgu bazinda durum (mevcut kod + test, yeni HEAD)

| ID | Senaryo | Gercek kod davranisi (HEAD c2c8cb97) | Test | Sonuc |
| --- | --- | --- | --- | --- |
| PP04/R01 | Aktif A varken B acquire | `lease-manager.ts` `acquire` saglikli baska owner'da transaction icinde ATTI (`LEASE_HELD`); DB owner/token/pointer degismez | durability (53-59), w05 (153-162), p03 | fail-closed, testli |
| PP05/R02 | Expired lease checkpoint/lifecycle | `checkpoint-store.ts` `publishCheckpoint` lease fence + `expires_at <= now` -> `LEASE_EXPIRED`; `assertFence` `STALE_FENCE`/`LEASE_EXPIRED`; `renew` expired token'i diriltemez | durability (168-176), fencing (67-71), fin07 (102-139) | fail-closed, testli |
| PP06/R05 | Aktif A varken recovery B | `recovery-manager.ts` `planRecovery` once `leases.acquire` -> baska owner'da typed ret; INTERRUPTED/FAILED yapmaz | durability (315-324) | fail-closed, testli |
| PP07 | Iki process/TTL ustu owner kaybi | heartbeat `leaseTtlMs/3` interval, renew fail -> `leaseLost` + `stopOwnedProcesses`; timer `finally` ile temizlenir | kod; iki OS process runtime kaniti bu hostta yok | kod mevcut; runtime NOT_RUN |
| PP08 | Cancel/timeout sonrasi gec sonuc | Checkpoint lease+row-version CAS; dispatcher catch yolu CANCELLED/PAUSED'u overwrite edemez (job-dispatcher.ts:955-983); son fence kontrolu (771-775) ile terminal yazim (937-938) arasinda `await` yok | p02-dispatch-cleanup, fin07 | fail-closed, testli; owned container stop (Docker) NOT_RUN |
| PP09 | spawn/timeout yakalama, log butcesi | `docker-runner.ts`/`maven-runner.ts` `child.on("error"/"exit")`, `MAX_*_LOG_BYTES` bolumlu append, `stopChild` taskkill yalniz win32 | kod; Linux spawn-failure runtime kaniti bu hostta yok | kod mevcut; runtime NOT_RUN |
| PP10/R03 | Accepted blob eksik/bozuk/wrong-job | `verifyCheckpoint` blob varligi/hash/boyut/job-dizin kontrolu; `publishCheckpoint` manifest<->blob birebir eslesme (mukerrer/unmanifested/mismatch RED) | p03 (PP10: 154-231) | fail-closed, testli |
| PP11/R04 | null/eslesmeyen source identity | `source-snapshot.ts` `computeSourceChange` null/bos recorded -> degisim; `planRecovery` tier manifest->source_identities->legacy fail-closed | p03 (PP11: 241-310), w05 (128-142) | fail-closed, testli |
| PP12 | clean commit/dirty/rename/POM | canonical `source_digest` (sirali path+sha256) + `build_digest`; `git rev-parse HEAD`; git fail -> fail-closed dirty | p03 (PP12: 333-396) | fail-closed, testli |
| PP13/R06 | Stale parent / best-pointer CAS | `publishCheckpoint` parent=GERCEK best pointer, expected generation CAS, dusuk generation ve foreign-job RED | p03 (PP13: 411-461), durability (178-203) | fail-closed, testli |
| PP14 | Hard-kill (blob/manifest/DB commit arasi) | Blob tmp+rename, manifest+blob+pointer tek DB transaction, publish fail -> loop rollback; crash noktasi negatifleri p03 loop | p03 (575-621), durability | kod seviyesi testli; gercek hard-kill live kaniti NOT_RUN |
| PP15 | Resume butce/cursor/contract | `resumeDispatch` + `resumeBudgetFromManifest` yalniz trusted manifest; accepted set immutable blob'dan; deadline `created_at + total_job_minutes`; model mismatch `CONTRACT_CONFLICT` | p03 (PP15: 471-513), p05b-resume | fail-closed, testli |

## Kanit (bu kosuda, gercek komut ve sonuc)

- `git rev-parse HEAD` = `c2c8cb973ff6426900b0aaa4bea6c6e9b33f6967`; `git status`: temiz; branch `codex/glm-prod005-p02-p03` detached HEAD `c2c8cb9`'den olusturuldu (`origin/main` ile ayni).
- `npm.cmd ci`: exit 0; 236 paket; `found 0 vulnerabilities`.
- `npm.cmd test -- --run tests/unit/durability.test.ts tests/unit/fencing.test.ts tests/unit/w05-recovery.test.ts tests/unit/fin07-lifecycle.test.ts tests/unit/p02-dispatch-cleanup.test.ts tests/unit/p03-checkpoint-identity.test.ts tests/integration/p05b-resume.test.ts`: 7 dosya, 63/63 PASS.
- `npm.cmd run typecheck`: exit 0 (temiz).
- `npm.cmd run lint`: 0 error / 89 warning (tarihsel ayni).
- Tam suite (`npm.cmd test -- --run`): **TAMAMLANMADI (kullanici karariyla durduruldu).** Durdurulmadan onceki kismi kosu: 585 passed / 8 failed / 5 skipped; 8 failed tamamen PR02/PR03 disi ortam-bagli kosularda (p01-release-gate local mod zamlanmasi, v2-wire gercek stdio wire, pilot/pilot-full PAUSED_BY_USER, rt01-host-fallback); bu audit'in konusu degil ve bu kosuda yeniden cosulmedi. Tam regression kaniti P09 checkpoint'ine aittir.

## Uygulama karari (kod degisikligi YOK)

- PP04-PP15'in tamaminda mevcut kaynak kodlar fail-closed davranisi zaten uyguluyor; bunu dogrulayan unit/integration testleri odak kosusunda gecti. Yeni bir yerel uygulanabilir kod/test acigi tespit edilmedi; kapsamdisi refactoring yapilmadi.
- PR02/PR03'un kalan kanit ihtiyaci yalniz runtime/ortam kaniti: Docker container stop/inspect, iki OS process TTL/owner kaybi, gercek hard-kill live proof, Linux spawn-failure. Bunlar bu hostta uretilemez; uydurulmadi ve NOT_RUN/BLOCKED olarak ayrildi.

## Acik kalan (NOT_RUN/BLOCKED; ortam kaniti gerektirir)

- PP07/PP08 "owned container gercekten durur" (Docker stop/kill + wait/inspect): Docker izolasyon kaniti bu audit konumunda uretilemez -> NOT_RUN.
- PP07 "iki ayri process ayni job'u tek owner yurutur" (TTL ustu heartbeat + owner kaybi): iki OS process testi bu hostta yok -> NOT_RUN.
- PP09 Linux spawn-failure/timeout event kaniti: host win32 -> NOT_RUN (kod seviyesi taskkill-yalniz-win32 + log butcesi mevcut).
- PP14 gercek hard-kill live kaniti: deterministik kod seviyesi crash negatifleri mevcut; live kanit -> NOT_RUN.

## Sinirlar ve korunmasi gereken kurallar

- Canli kurum modeli/pilot: PAUSED_BY_USER; bu kosuda baslatilmadi; egress/egitim kaniti uydurulmadi.
- CI kullanici karariyla kapali; workflow eklenmedi.
- Protected: `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi.
- Kapsamdisi PR04-PR08 dokunulmadi; yalniz P02/P03 denetlendi.

## Devam noktasi

- PR02/PR03 yerel hatti bu HEAD'de temiz; sonraki model "kod duzeltmesi" beklemesin, kalan is yalniz runtime kanit paketleri (Docker/iki-process/hard-kill) ve P07-B/P08/P10 aktif paketleridir.
- Bu checkpoint commit sonrasi `origin/codex/glm-prod005-p02-p03` dalina push edilir; push sonucu handoff'a yazilir.
