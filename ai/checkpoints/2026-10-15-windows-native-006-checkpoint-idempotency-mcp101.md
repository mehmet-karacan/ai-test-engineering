# 2026-10-15 Windows Native 006 - Checkpoint idempotency ve mcp101

## Durum

- Urun worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering`.
- Branch: `codex/windows-native-006`; mevcut uncommitted degisiklikler korunuyor; commit/push yapilmadi.
- Customer checkout'a yazilmadi. Pilot yalniz owned temiz snapshot `X:\gpu-fusion-prod-20261015-source-clean` uzerinde calisti.
- Usage guard kontrolu: Codex kullanimi `%11`; `%5` duraklatma esigi asilmadi.

## OpenCode devralma noktasi

OpenCode mcp100 akisinda DateUtils icin ikinci accepted candidate Maven'da 18/18 gecmesine ragmen ikinci checkpoint yayininda su hatayla durdu:

`SqliteError: UNIQUE constraint failed: artifacts.sha256, artifacts.relative_store_path`

`publishCheckpoint`, her accepted setteki blob icin yeni `artifacts` satiri ekliyordu. Sonraki checkpoint onceki accepted blobu da tasidigi icin content-addressed artifact tekrar ekleniyor, transaction fail-closed kesiliyordu.

## Uygulanan duzeltme

`src/orchestration/checkpoint-store.ts` accepted blob kaydini idempotent hale getiriyor:

1. `(sha256, relative_store_path)` ile mevcut artifact aranir.
2. `job_id`, `kind`, `sha256`, byte sayisi, `READY` statusu ve action (`pin_reason`) birebir dogrulanir.
3. Ayni READY artifact varsa yeniden kullanilir; uyusmazlik `ACCEPTED_ARTIFACT_CONFLICT` ile reddedilir.
4. Her yeni checkpoint icin sadece `checkpoint_blobs` baglantisi eklenir.

## Test-first kaniti

- Yeni regresyon: `tests/unit/p03-checkpoint-identity.test.ts` ayni accepted blobu parent checkpoint sonrasi yeniden kullanmayi deniyor.
- Duzeltme oncesi test unique constraint'i yeniden uretti.
- Duzeltme sonrasi P03: **1 dosya / 31 test PASS**.
- Odak suite: **8 dosya / 140 test PASS**.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS; tree digest `4e92bd592a60447030f1e30e15bcb95e6f2ee067bc882b76041569c08b648138`, 315 dosya, 2 dist artifact.

## mcp101 canli kaniti

- Job: `f6220ee2-667e-4509-bbc8-f29c822832b2`.
- Harness: `X:\gpu-fusion-prod-20261015-mcp101-dateutils-run.mjs`.
- Runtime DB: `%LOCALAPPDATA%\ai-test-engineering\pilot\gpu-fusion-prod-20261015-mcp101-dateutils\state.db`.
- Storage: `X:\storage`.
- Target: `tr.com.innova.gpu.utils.DateUtils`; model `litellm/GLM-5.3-Flash-IT`; coverage hedefi LINE+BRANCH %100.
- Normal MCP akisi: `project_inspect/query -> test_start -> status -> test_cancel(pause) -> test_resume -> baseline -> generation`.
- Pause/resume: `PAUSED -> RUNNING`, ayni job; resume fresh-start ile baseline yeniden kuruldu.

### Candidate ve checkpoint sonucu

| Iteration | Attempts | Son karar | Maven | Coverage kaydi | Checkpoint |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 reject, 2 adopted | ADOPTED | 13/13, 0 fail/error/skip | LINE 2339 bps, BRANCH 3545 bps | `d1db46c5-7866-4e87-9a45-42e9b1876274` |
| 2 | 3 adopted | ADOPTED | 18/18, 0 fail/error/skip | LINE 2516 bps, BRANCH 4272 bps | `0b637ea5-6434-401b-9885-3882e5ee9bc1` |
| 3 | 4 provider error, 5 adopted | ADOPTED | 18/18, 0 fail/error/skip | LINE 3156 bps, BRANCH 5272 bps | `36b9b6e7-97f0-4438-867d-cd054864e7c1` |
| 4 | 6 reject, 7 adopted | ADOPTED | 18/18, 0 fail/error/skip | LINE 3333 bps, BRANCH 5363 bps | `5f8a1065-857e-4ac2-9cd6-de2c3075d8e8` |

Attempt 1 ve 6 mevcut `DateUtilsTest.java` dosyasini degistirme denemesi olarak policy ile reddedildi. Attempt 4 provider hatasi verdi; repair attempt 5 accepted oldu.

Checkpoint zinciri generation 1 -> 2 -> 3 -> 4 olarak dogrulandi. Ikinci ve sonraki checkpoint'lerde onceki accepted blob artifact ID'leri yeniden kullanildi; `checkpoint_blobs` baglantilari 1 + 2 + 2 + 2 = 7, accepted artifact satirlari content surumleri icin 4 ve duplicate row yok. Manifest ve accepted blob dosyalari `X:\storage` altinda SHA-256/byte ile dogrulandi.

### Terminal durumu

25 dakikalik kontrollu harness suresi dolunca MCP server kapatildi. Job, sahipsiz `RUNNING` birakilmamasi icin ayri kisa MCP harness ile `test_cancel(reason=cancel)` cagrilarak `CANCELLED` yapildi. `test_result`:

- lifecycle: `CANCELLED`
- outcome: `null`
- verification_level: `UNVERIFIED`
- best checkpoint: `5f8a1065-857e-4ac2-9cd6-de2c3075d8e8`
- Report06: uretilmedi
- production degisikligi: owned snapshot ve customer checkout'a yazim yok

Bu nedenle WN73 hala **NOT_PASSED**; mcp101 checkpoint-idempotency duzeltmesinin canli kanitidir, tam WN73 terminal/Report06 kabulü degildir.

## Devam noktasi

1. Bu duzeltmeyi S04/P03 checkpoint idempotency kaniti olarak koru; uncommitted degisiklikleri silme.
2. WN75 icin mevcut Report06 kanitlerinden biri kullaniciya sunulup review karari kaydedilmeli.
3. S09 partial manifest'e mcp101 kaniti `NOT_PASSED`/`CANCELLED` olarak eklenmeli; full gate `NO_GO` kalir.
4. Yeni live pilot gerekiyorsa mcp101 DB'si resume edilebilir; yeni pilot acmadan once kullanici review ve kalan WN73 terminal/Report06 kapsami netlestirilmeli.

## Handoff prompt

`AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, bu checkpoint ve `ai/handoffs/2026-10-15-windows-native-006-checkpoint-idempotency-mcp101.md` dosyalarini oku. Mevcut uncommitted degisiklikleri koru. `checkpoint-store.ts` accepted artifact idempotency fixini ve P03/odak suite kanitini tekrar bozma. mcp101 job `f6220ee2-667e-4509-bbc8-f29c822832b2` CANCELLED, best checkpoint `5f8a1065-857e-4ac2-9cd6-de2c3075d8e8`; WN73 NOT_PASSED, WN75 kullanici review ve S09 partial/full manifest acik. Commit/push yapma; usage `%5` veya altina inerse yeni checkpoint yazip duraklat.
