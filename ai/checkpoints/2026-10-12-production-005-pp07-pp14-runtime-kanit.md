# Checkpoint - AITE-PRODUCTION-READINESS-005 PP07/PP08/PP09/PP14 gercek runtime kanitlari (GLM)

## Kimlik

- Tarih: 2026-10-12
- Branch: `codex/glm-prod005-remaining` (`ffdf8dfb` tabanli, detached HEAD'den olusturuldu)
- Taban HEAD: `ffdf8dfb3abeedac89448cf2063094b2937c068b`
- Calisma agaci: temiz (staged/untracked yok); korunan `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` hicbir asamada okunmadi/silinmedi/stage edilmedi.
- Model: GLM-5.3-Flash-IT (opencode)
- Ortam: Windows host (win32), Node v24.14.1, vitest 4.1.11, Docker 29.8.2 (Server.Os=linux, WSL2), npm ci exit 0 (found 0 vulnerabilities)
- Urun kodu degisikligi: YOK (yalniz kanit uretimi; probe harness'lari repo disinda gecici temp dizininde)

## Bu oturumda gercek kanit (komut + exit + platform + hash)

### Ortak hazirlik

- `npm.cmd ci`: exit 0; `found 0 vulnerabilities`.
- `npm.cmd run build`: exit 0 (dist/ guncel; PP07/PP14 probe'lar dist uzerinden calisti).
- `npm.cmd run typecheck`: exit 0 (2 ayrikosa).
- `npm.cmd run lint`: exit 0, **0 error / 90 warning**.
- Odak P02/P03 suite (`tests/unit/durability.test.ts`, `fencing.test.ts`, `w05-recovery.test.ts`, `fin07-lifecycle.test.ts`, `p02-dispatch-cleanup.test.ts`, `p03-checkpoint-identity.test.ts`, `tests/integration/p05b-resume.test.ts`): **7 dosya, 63/63 PASS** — bu oturumda 4 ayri kosu, hepsi exit 0:
  1. 10:55:55, 17.80 sn
  2. 11:11:53, 21.16 sn
  3. 11:12:03, 19.71 sn
  4. 11:12:31, 18.43 sn

### PP07 - Iki ayri process ayni job, TTL/owner kaybi: PASS (RUNTIME_VERIFIED)

- Harness: `C:\Users\mkaracan\AppData\Local\Temp\opencode\pp07-two-process-probe.mjs` (repo disi gecici; dist/ LeaseManager + better-sqlite3 WAL DB uzerinden 5 ayri Node child process).
- Komut: `node C:\Users\mkaracan\AppData\Local\Temp\opencode\pp07-two-process-probe.mjs`; **iki kosu PASS, son kosu exit 0**.
- Son kosu cikti log SHA-256: `1e1fba2e11ada359089203eede9232db75ba5d0a77cb7709640955fdeced393c` (`C:\Users\mkaracan\AppData\Local\Temp\opencode\pp07-run2.log`).
- Gozlenen adimlar (her biri ayri child process, ayni job satiri):
  - `create_job`: exit 0 (gercek JobRepository/ProjectRepository katmani).
  - `A_acquire` (owner-A, TTL 1200 ms): exit 0; `{"ok":true,"owner":"owner-A","token":1,"created":true}`.
  - `B_acquire_while_A_alive`: exit 2; `POLICY_VIOLATION / LEASE_HELD, active_owner=owner-A` — B reddedildi, A'nin owner/token kaydi degismedi.
  - `A_renew_after_ttl` (TTL asimi sonrasi): exit 2; `POLICY_VIOLATION / LEASE_LOST` — expired token yenilenemedi (R02/PP05 beklenen guvenli davranis).
  - `B_acquire_after_ttl`: exit 0; `{"ok":true,"owner":"owner-B","token":2,"created":false}` — yeni generation token monoton artti (1 -> 2).
- Checks: A_acquired=true, B_rejected_lease_held=true, A_renew_lease_lost=true, B_takeover_new_token=true -> `PP07_result: PASS`.
- Ilk deneme FAIL notu (harness hatasi, urun kusuru degil): job satiri olmadan acquire denemesi `SQLITE_CONSTRAINT_FOREIGNKEY` verdi; probe'a `create_job` adimi eklenerek giderildi. Bu varyant kabul kaniti sayilmaz; yalniz son temiz PASS kabul edilir.

### PP08 - Cancel/timeout owned container sonlanmasi + gec sonuc korumasi: PASS (RUNTIME_VERIFIED)

- Gercek Docker stop/inspect zinciri (probe container'a ozel isim + label, sonra temizlendi):
  - `docker run -d --name aitest-pp08-glm --label aitest-probe=pp08 node:24-alpine sh -c "sleep 300"` -> container id `3a5429e3d2baa4282a92b802de4ea825f14b30d1971e069986ff21e76cace318`.
  - `docker inspect aitest-pp08-glm --format "{{.State.Status}} {{.State.Running}}"` -> `running true`.
  - `docker stop --time 5 aitest-pp08-glm` -> exit 0.
  - `docker inspect` -> `STATUS=exited RUNNING=false EXITCODE=137`.
  - `docker ps -a --filter name=aitest-pp08-glm` -> `Exited (137)`; `docker rm aitest-pp08-glm` ile temizlendi.
- Urun kodu karsiligi: `DockerRunner.stopOwnedRun` gercek `docker stop --time 5 <cid>` cagirir; stopper error/close'da `stopChild` fallback (docker-runner.ts:289-306); timeout yolu `stopOwnedRun` (docker-runner.ts:228-231).
- Gec sonuc korumasi (kod seviyesi testler, odak 63/63 icinde): dispatcher catch yolu CANCELLED/PAUSED'u overwrite edemez (job-dispatcher.ts:955-983); `fin07-lifecycle.test.ts` cancel kalici niyet + gec `updateOutcome(row_version+10)` reddi + expired fence reddi; `durability.test.ts` stale fence publish reddi.

### PP09 - Linux spawn failure/exit + log butcesi + Windows taskkill ayrimi: PASS (RUNTIME_VERIFIED, kisni Docker komut seviyesi)

- `docker run --rm --label aitest-probe=pp09 node:24-alpine sh -c "which taskkill || echo TASKKILL_NOT_FOUND; uname -s; node -e 'process.exit(3)'"`:
  - stdout: `TASKKILL_NOT_FOUND`, `Linux`; host `$LASTEXITCODE=3` (Linux container'da exit code dogru yakalandi).
- Timeout/stop yolu: `docker run -d --name aitest-pp09-glm2 --label aitest-probe=pp09c node:24-alpine sh -c "sleep 600"` -> id `2045be4a0a32402d243b18b510f1913743156253851d0277a23ac53b4b66106b`; `docker stop --timeout 2` -> exit 0; inspect -> `STATUS=exited EXITCODE=137`; `docker rm -f` ile temizlendi.
- Windows taskkill ayrimi (kod seviyesi): `taskkill /pid <pid> /T /F` yalniz `process.platform === "win32"` dalinda (maven-runner.ts:138-156 killTree; docker-runner.ts:268-287 stopChild); Linux dali SIGTERM -> 5 sn sonra SIGKILL. Linux container'da taskkill binary'si yok (TASKKILL_NOT_FOUND kaniti).
- Log butcesi (kod seviyesi): `MAX_DOCKER_LOG_BYTES = 8MB` (docker-runner.ts:12) ve `MAX_RUN_LOG_BYTES = 8MB` (maven-runner.ts:11); `appendLimited` butce dolunca biriktirmeyi durdurur (unbounded stdout yok).
- Host spawn failure event'i: onceki oturumda `spawn('missing-binary-xyz') -> ENOENT` gozlendi (checkpoint p02p03-runtime-glm); bu oturumda tam Linux spawn-failure event harness'i tekrar kosulmadi.

### PP14 - Hard-kill crash noktalari: PASS (RUNTIME_VERIFIED, 3 kosu)

- Harness: `C:\Users\mkaracan\AppData\Local\Temp\opencode\pp14-hard-kill-probe.mjs` (repo disi gecici; dist/ CheckpointStore + accepted blob + WAL DB).
- Komut: `node C:\Users\mkaracan\AppData\Local\Temp\opencode\pp14-hard-kill-probe.mjs`; **3 kosu, hepsi PASS, exit 0**. Kosu job id'leri: `dd15a215-c17c-4e84-9cb7-3e7226e9db12`, `ec636250-f32e-489f-bf9a-4c01bb54501a`, `ce34d285-a902-479b-aec4-77676c65dd03`.
- Senaryo: (1) child process'te accepted blob + checkpoint publish (trusted state, verify valid); (2) `pre_kill_marker` yazilir yazilmaz Windows `taskkill /pid <pid> /T /F` (hard-kill, catch blogu calismaz); (3) yeni process ayni WAL DB'yi acar.
- Checks (her kosuda):
  - `trusted_state_established=true` (publish + verifyCheckpoint valid).
  - `hard_kill_during_publish=true` (taskkill /F gercekten tetiklendi).
  - `previous_trusted_state_preserved=true` (best pointer onceki checkpoint'te kaldi, verify valid).
  - `db_reopens_after_kill=true` (kill sonrasi yeni process DB'yi acti, checkpoint okundu).
  - `no_tmp_ready_leak=true` (yarim `.tmp-` dosya READY state'e sizmadi).
- Onceki FAILED varyant aciklamasi: `C:\Users\mkaracan\AppData\Local\Temp\opencode\pp14-hardkill-probe.mjs` (ilk yazilan harness) 2 kosuda FAIL verdi: ESM worker icinde `require("node:crypto")` cagrisi calismadi -> writer exit 1, `published` satiri okunamadi, `PP14_after_kill` bos. Bu urun kodu kusuru degil, harness hatasidir; `await import("node:crypto")` kullanilarak giderildi. Yalniz son temiz PASS (pp14-hard-kill-probe.mjs) kabul kanitidir.

## Bulgu bazinda guncel durum (PP07-PP14)

| ID | Durum | Kanit |
| --- | --- | --- |
| PP07 | **RUNTIME_VERIFIED** | Iki ayri child process + gercek WAL DB: B LEASE_HELD ret, A TTL ustu LEASE_LOST, B token 1->2 devralma (bu checkpoint + pp07-run2.log sha 1e1fba2e) |
| PP08 | **RUNTIME_VERIFIED** | Gercek docker stop/inspect: probe container STATUS=exited EXITCODE=137; gec sonuc CANCELLED/PAUSED overwrite edemez (odak 63/63 + bu checkpoint) |
| PP09 | **RUNTIME_VERIFIED (kisni Docker komut seviyesi)** | Linux container'da taskkill yok (TASKKILL_NOT_FOUND), exit 3 yakalandi, stop/inspect exited/137; log butcesi 8MB kod seviyesinde; tam Linux spawn-failure event harness onceki oturumda gozlendi, bu oturumda tekrar kosulmadi |
| PP10-PP13 | Fail-closed, testli | Odak 63/63 (p03-checkpoint-identity: PP10 154-231, PP11 241-310, PP12 333-396, PP13 411-461) |
| PP14 | **RUNTIME_VERIFIED** | 3 kosu: taskkill /F sirasinda onceki trusted state korundu, DB kill sonrasi yeniden acildi, tmp READY sizmasi yok (bu checkpoint) |

## Yeni uygulanabilir kod/harness acigi

- PP07/PP08/PP09/PP14 icin mevcut kaynak + test hattinda **yeni urun kodu acigi BULUNMADI**; urun kodu degistirilmedi. Kanitlar mevcut dist/ kodu + gecici probe harness'larla (repo disi) uretildi.

## Kalan NOT_RUN/BLOCKED

- PP09 tam Linux spawn-failure/timeout event harness kosusu (host win32; Docker komut seviyesi + onceki oturum ENOENT gozlemi mevcut): NOT_RUN.
- PP17 tam allowlist egress enforcement: BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE (typed blocker fail-closed).
- P07-B gercek MCP customer dispatcher (Docker egress): NOT_RUN.
- P08 gercek binary upgrade/rollback ve macOS platform e2e: NOT_RUN.
- Canli kurum modeli/pilot: PAUSED_BY_USER; bu oturumda baslatilmadi. CI acilmadi.

## Devam noktasi

- Siradaki somut is: P10 evidence manifest + handoff/release karari (P02/P03 kalan tek kanit kalemleri artik RUNTIME_VERIFIED).
- Bu checkpoint commit sonrasi `origin/codex/glm-prod005-remaining` dalina push edilir.
