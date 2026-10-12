# AITE-PRODUCTION-READINESS-005 - PR02/PR03 hattina yeniden denetim (Qwen PR04-PR06 worktree)

## Kapsam ve karar

- Gorev: PR02/PP04-PP09 (lease acquisition atomikligi, fencing/expiry/heartbeat, recovery owner guvenligi, cancellation/timeout/process cleanup, late-write) + PR03/PP10-PP15 (immutable contract/source identity, accepted blob/manifest, wrong-job/hash/size, best-pointer CAS, crash/resume/butce/cursor provenance) denetimi ve uygulanabilir aciklari kapatmak.
- Denetlenen HEAD: `28f928892cbbe1a31991ef99f45acb3639f8bfe3` (branch `codex/qwen-pr04-pr06-next`, `origin/main` ile ayni).
- Calisma agaci: temiz (untracked/staged yok).
- **Karar: gercek yerel kod acigi BULUNMADI; kod degisikligi yapilmadi.** Onceki "done" iddialari (P02/P03 LOCAL_VERIFIED) bu kosuda kod + test olarak yeniden dogrulandi; eski dokuman metnine guvenilmedi.

## Bulgu bazinda durum (mevcut kod + test, eski dokuman degil)

| ID | Senaryo | Gercek kod davranisi (HEAD) | Test | Sonuc |
| --- | --- | --- | --- | --- |
| PP04/R01 | Aktif A varken B acquire | `lease-manager.ts` `acquire` saglikli baska owner'da transaction icinde ATTI (LEASE_HELD); DB owner/token/pointer degismez | durability (53-59), w05 (153-162), p03 | fail-closed, testli |
| PP05/R02 | Expired lease checkpoint/lifecycle | `checkpoint-store.ts` `publishCheckpoint` lease fence + `expires_at <= now` -> LEASE_EXPIRED; `assertFence` STALE_FENCE/LEASE_EXPIRED | durability (168-176), fencing (67-71) | fail-closed, testli |
| PP06/R05 | Aktif A varken recovery B | `recovery-manager.ts` `planRecovery` once `leases.acquire` -> baska owner'da typed ret; INTERRUPTED/FAILED yapmaz | durability (315-324) | fail-closed, testli |
| PP10/R03 | Accepted blob eksik/bozuk/wrong-job | `verifyCheckpoint` blob varligi/hash/boyut/job-dizin kontrolu; `publishCheckpoint` manifest<->blob birebir eslesme | p03 (PP10: 154-231) | fail-closed, testli |
| PP11/R04 | null/eslesmeyen source identity | `source-snapshot.ts` `computeSourceChange` null/bos recorded -> degisim; `planRecovery` tier (manifest->source_identities->legacy fail-closed) | p03 (PP11: 241-310), w05 (128-142) | fail-closed, testli |
| PP12 | clean commit/dirty/rename/POM | canonical `source_digest` (sirali path+sha256) + `build_digest`; `git rev-parse HEAD` | p03 (PP12: 333-396) | fail-closed, testli |
| PP13/R06 | Stale parent / best-pointer CAS | `publishCheckpoint` parent=GERCEK best, expected generation CAS, gerizekalim/foreign-job RED | p03 (PP13: 411-461), durability (178-203) | fail-closed, testli |
| PP15 | Resume butce/cursor/contract | `resumeDispatch` + `resumeBudgetFromManifest` yalniz trusted manifest; accepted set immutable blob'dan; deadline `created_at + total_job_minutes` | p03 (PP15: 471-513), p05b-resume (94-146) | fail-closed, testli |
| PP08 (gec yazim) | Late sonuc pointer/lifecycle degistiremez | Checkpoint lease+row-version CAS; dispatcher catch yolu CANCELLED/PAUSED'u overwrite edemez (957-983); basari yolunda son fence kontrolu (771-775) ile terminal yazim (937-938) arasinda `await` YOK (ayni senkron blok) -> concurrent cancel penceresi yok | p02-dispatch-cleanup, fin07 | fail-closed, testli |
| PP09 | spawn/timeout yakalama, log butcesi, taskkill sadece win32 | `docker-runner.ts`/`maven-runner.ts` `child.on("error"/"exit")`, `MAX_*_LOG_BYTES` bolumlu append, `stopChild` taskkill yalniz win32 | (kod; Linux spawn-failure runtime kaniti bu hostta yok) | kod mevcut; runtime NOT_RUN |

## Late-write (PP08) analizi

Dispatcher basari yolu, son `assertLease`/lifecycle kontrolu (job-dispatcher.ts:771-775) ile terminal `updateOutcome`/`updateLifecycle` (937-938) arasinda `await` icermez; `reportExporter.export` senkron. Bu nedenle iki thread/cancel bu ic parcali (non-atomic) araya sikişamaz; kullanicinin `handleTestCancel`'i (job-tools.ts:106) ancak asenkron gap'lerde (final replay run, worker prompt, loop iterasyonlari) is yapar ve o gap'lerdeki yazimlar lease fence + catch yolu CANCELLED korumasiyla korunur. Denetimde baska bir late-write acigi gorulmedi.

## Kanit (bu kosuda, gercek komut)

- `git status`: temiz; `git rev-parse HEAD` = `28f928892cbbe1a31991ef99f45acb3639f8bfe3`.
- `npm.cmd test -- --run tests/unit/durability.test.ts tests/unit/fencing.test.ts tests/unit/w05-recovery.test.ts tests/unit/fin07-lifecycle.test.ts tests/unit/p02-dispatch-cleanup.test.ts tests/unit/p03-checkpoint-identity.test.ts tests/integration/p05b-resume.test.ts`: 7 dosya, 63/63 PASS.
- `npm.cmd run typecheck`: exit 0 (temiz).
- `npm.cmd run build`: exit 0 (temiz).
- `npm.cmd run lint`: 0 error / 89 warning (tarihsel ayni).
- `npm.cmd test -- --run` (tam): 67 dosya, 596 PASS / 2 FAIL. 2 FAIL = `tests/security/pilot.test.ts` (AC67 gercek-model pilotu; `tmp/pilot-stdout.txt` varligi gerektirir, dosya yok; pilot PAUSED_BY_USER) -> PR02/PR03 disinda, bu denetimle ilgisiz.

## Acik kalan (NOT_RUN/BLOCKED; ortam kani gerektirir)

- PP07/PP08 "owned container gercekten durur" (Docker stop/kill + wait/inspect) ve iki ayri process TTL/owner kaybi: Docker/izole ortam + iki OS process bu hostta yok -> NOT_RUN.
- PP09 Linux spawn-failure/timeout event kaniti: host win32; Linux runtime kaniti bu hostta yok -> NOT_RUN (kod seviyesi taskkill-yalniz-win32 + log butcesi mevcut).
- PP14 hard-kill (blob/manifest/DB commit/accepted karar arasi): deterministik kod seviyesi crash noktasi testleri mevcut (p03 loop fail-closed); gercek hard-kill live kaniti NOT_RUN.

## Sinirlar

- `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` (kullaniciya ait) degistirilmedi, stage edilmedi.
- PR04/PR05/PR06/PR07/PR08 (kapsam disi) dokunulmedi.
- CI (kullanici karariyla kapali) acilmadi; gercek runtime/Docker kabuluretim fake green uretilmedi, NOT_RUN/BLOCKED olarak ayri tutuldu.

## Devam noktasi

- PR02/PR03 yerel (kod + test) hatti bu denetimde temiz bulundu; kod degisikligi gerekmedi.
- Kalan PR02/PR03 kaniti yalniz runtime: Docker/izole ortam + iki OS process + gercek hard-kill (NOT_RUN/BLOCKED). Bunlar bu hostta uretilemez.
