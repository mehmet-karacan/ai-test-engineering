# 2026-10-15 Windows Native 006 - WN73 v2 fail-closed arac kilidi checkpoint

## Durum

- **Devam karari:** Kullanici 2026-10-15'te "işi sen alacaksın sen yap" talimatini verdi; guard paused kaydina ragmen calisma ayni OpenCode oturumunda devam ediyor. `update_goal(status=paused)` araci bu harness'ta yok; kayit `ai/checkpoints/2026-10-15-windows-native-006-usage-guard-opencode-pause.md` ve handoff'ta belgeli.
- Urun worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering` (branch `codex/windows-native-006`, HEAD `a22004e` + onceki 27 dosya uncommitted korundu).

## WN73 kok nedeni ve duzeltme (bu oturumun urettigi kanitlar)

### Kok neden dogrulamalari (canli 2.0.29 sunucusu uzerinden, model cagrisiz probe'lar)

1. **v2 prompt body semasi** (`/api/session/{id}/prompt` openapi.json): `id, text, files, agents, skills, metadata, delivery, resume` — `tools`/`system` YOK, `additionalProperties: false`. Eski `workerToolFlags` ciktisi v2 yolunda sessizce duser; request seviyesinde arac kisiti imkansiz.
2. **`permission(s)` deny yetersiz:** Config'e `{action:"*",resource:"*",effect:"deny"}` yazilinca tool modele sunulmaya DEVAM ediyor; cagri reddediliyor (`tool(error)`) ama model reddi gorup tekrar deniyor → `finish="tool-calls"` dongusu veya `finish="error"`.
3. **`tools` config anahtari etkili:** Resmi config semasinda `tools` (deprecated ama gecerli) `{"araclar": false}` araclarin toolset'ten TAMAMEN kaldirilmasini saglar. Canli dogrulama: `tools:{read:false,...}` ile tool-tesvik eden prompt'a model **tool part uretmeden** `finish="stop"`, text `CANNOT_READ`, **20.6 sn terminal** (litellm/GLM-5.3-Flash-IT).
4. `classifyFinish` zaten tipli: `tool-calls`→TOOL_STEP, `error`→SERVER_ERROR (terminal), `stop`→completed.

### Kod dilimi (WN73 fail-closed arac kilidi)

- `src/workers/opencode/worker-config.ts`: `WORKER_DISABLED_TOOLS_CONFIG` (DEFAULT_DISABLED_TOOLS + websearch/skill/subagent/todowrite/todoread) + `workerToolsConfigFlags()` + `WORKER_PERMISSION_DENY_ACTIONS`/`workerPermissionDenyRules()` (V2 aksiyon eslemesi: bash→shell, write/edit/patch→edit, task→subagent).
- `src/workers/opencode/worker-server-manager.ts` `buildWorkerConfigContent()`: worker config'e `tools: workerToolsConfigFlags()` (birincil kilit) + `permissions: workerPermissionDenyRules()` (ikinci savunma katmani) yaziliyor; digest degisir, stale reuse yok.
- `src/workers/opencode/worker-client.ts`: v2 prompt body dalina belgeleme — arac kisiti config uzerinden sunucu tarafinda uygulanir, body'ye eklenmez (schema additionalProperties:false).

### Testler (yeni)

- `tests/contract/rt21-worker-isolation.test.ts`: WN73 describe — `workerToolsConfigFlags` tum kritik araclar false; `workerPermissionDenyRules` V2 aksiyonlari deny; `buildWorkerConfigContent` tools+permissions yazar; disk uzerinden yazilan config kilidi tasiyor. **12/12 PASS.**
- `tests/contract/worker-response.test.ts`: v2 `/api` promptAsync body sozlesmesi — `tools`/`system` body'de YOK, `text`+`model` tasir, `no_reply=true`→`resume:false`. **8/8 PASS.**

## Dogrulama

- `npm.cmd run typecheck`: PASS.
- `npm.cmd test` odaklar: worker-response + rt21-isolation **20/20**; worker.test + w01-outcome + wn-agent-adapter + s05-bridge **39/39 PASS**.
- `npm.cmd run build`: PASS, tree digest `df58f6ca6c86b554...` (write-build-stamp + windows helper dogrulamalari PASS).
- Lint (dokunulan 5 dosya): 0 hata, 2 mevcut HEAD warning (`promptForJson`, `once` kullanilmayan import — onceki oturumun 89 warning setinden).
- Tam suite tek kosu: **101 dosya PASS / 19 dosya FAIL, 908/968 test**; failure'lar Windows-native ortem testleri (Maven/JDK manifest timeout, process ownership, Job Object, restore atomicity, `tmp/pilot-stdout.txt` canli pilot ciktisi eksikligi) — dokunulan worker modullerini import etmiyor; WN73 zinciri (worker-response + rt21 + s05 + w01) tam PASS.

## WN73 pilot ilerlemesi (mcp96a, 2026-10-15 06:58 UTC basladi)

- **WN73 pilot job:** `9e1517ce-5a50-4301-ae43-cb5e8e417c27` (mcp96a runtime DB, storage root `X:\storage`, temiz snapshot `X:\gpu-fusion-prod-20261015-source-clean`, targets GpuFileUtils+GpuReportService, coverage 100/LINE+BRANCH, model litellm/GLM-5.3-Flash-IT).
- Akis: QUEUED→preflight→baseline→generation→**pause** (PAUSED, handleTestCancel)→**resume** (resume_fresh_start)→generation.
- **Worker attempt 3 (yeni dist + tools kilidi ile): `decision:"adopted"`** — `candidate_accepted` event (sequence 8, phase verification); `Coverage kazanci: LINE 10000 bps, BRANCH 10000 bps` (6666→10000 bps = %100). Changeset hash `fe68f5c6...979e`; best_checkpoint `ccea75ad-9436-4d54-994f-1ab20f20f99f`.
- Onceki attempts: 1 EMPTY_FINAL (pause cakismasi), 2 TIMEOUT (15 dk worker request budget) — rejected.
- **Harness deadline kaniti:** Harness 25 dk penceresi verification (final replay) sirasinda doldu; in-process dispatcher olunce job RUNNING kaldi, agent task lease'i (15 dk) doldu → `test_resume` ilk denemede `POLICY_VIOLATION LEASE_HELD` (resume2'nin hala heartbeat'li lease'i vardi); lease expire olduktan sonra `test_resume` `resumed:true` ile devraldi (resume_fresh_start; baseline yeniden, coverage korunuyor).
- Resume sonrasi yeni worker attempts: GpuFileUtils task COMPLETED (226 sn), GpuReportService attempts FAILED→RUNNING (EMPTY_FINAL/timeout dalgalanmasi) — model tek seferde terminal cevap vermiyor; candidate loop budget (20 iterasyon) icerisinde.
- **Budget kaniti:** Job total_job_minutes 120 (created 06:58 UTC) → deadline 08:58 UTC. Resume4 harness'i config-240.json (240 dk, benim config — musteri checkout'una dokunmuyor) ile baslatildi (background, lease devralma dongusu ile).

## WN73 mcp96a terminal sonucu (2026-10-15 08:55 UTC)

- **Terminal: `FAILED / FINAL_VERIFICATION_FAILED`** (typed outcome — lease-dongusu askisi YOK; WN73'un istedigi bounded terminal kaniti saglandi).
- **Uctan uca akis kanitlandi:** QUEUED→preflight→baseline→generation→pause(PAUSED)→resume(resume_fresh_start)→generation→**candidate ADOPTED** (LINE 10000 bps, BRANCH 10000 bps — 6666→10000)→verification→final replay (5/5 test PASS, exit 0)→**kalite gate red** → FAILED terminal + **Report06 PUBLISHED** (`X:\storage\jobs\9e1517ce...\reports\` — index.html + manifest.json + report.json + summary.txt + evidence/).
- **Gate kokeni (dogru davranis):** Model, mevcut `GpuFileUtilsTest`'i yeniden yazdi (`tests_modified: 1`): baseline envanterindeki `deleteTmpFilesRemovesFiles`, `deleteTmpFilesEmptyList` testleri final envanterinde yok → PP31 `compareTestInventory` `missing_tests=[...]` → `replaySucceeded=false` → `FINAL_VERIFICATION_FAILED` + gap `MISSING_BASELINE_TESTS`.
- Final koşu facts: 5 test / 5 gecti / 0 basarisiz / 0 atlandi; `production_changed_files: 0`; `verification_level: UNVERIFIED` (coverage evidence jacoco.xml surefire scope'u eslesmedi → N/A).
- **WN73 pilot degerlendirmesi: PASS ILAN EDILMEZ** — WN73 kaniti terminal candidate + Report06 gerektirir; ikisi de uretildi ama job sonucu FAILED (aday, baseline test kimligini korumadi). Bu beklenen PP31 gate davranisi; WN73 pilot kaniti olarak terminal akis + typed outcome + Report06 PUBLISHED kaydedilir, job PASS deyildir.

## Devam noktasi

1. WN73 pilotu: `X:\gpu-fusion-prod-20261015-source-clean` temiz snapshot ile `X:\gpu-fusion-prod-20261015-mcp95y-run.mjs` harness kalibi (AITEST_CONFIG storage root X:\storage) kullanarak yeni job baslat; pause→resume→terminal candidate/Report06 bekle. Yeni dist (tools kilidi) ile.
2. Terminal candidate + Report06 yoksa WN73 PASS deme; typed blocker kaydet.
3. Basarili terminalde: final replay, test/coverage facts, WN75 kullanici review, S09 manifest reconciliation.
4. Gecici tanilama scriptleri (`%TEMP%\opencode\probe-*.mjs`, `query-mcpdb*.mjs`) temizlenecek.
5. Commit/push yapma (kullanici acik Git talimati yok).
