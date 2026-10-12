# Checkpoint - AITE-PRODUCTION-READINESS-005 P02/P03 kalan runtime kanitlari (PP07/PP08/PP09/PP14; GLM)

## Kimlik

- Tarih: 2026-10-12
- Branch: `codex/glm-prod005-remaining` (ffdf8df tabanli detached HEAD'den olusturuldu)
- Taban commit: `ffdf8dfb3abeedac89448cf2063094b2937c068b` (main ile ayni)
- Calisma agaci: temiz (urun kodu degisikligi YOK; probe scriptleri repo disindaki gecici store'da)
- Ortam: Windows host (win32), Docker 29.8.2 (Server.Os=linux, WSL2), Node v24.14.1, vitest 4.1.11
- Onceki checkpoint: `ai/checkpoints/2026-10-12-production-005-p02p03-runtime-glm.md` (kod seviyesi durum tablosu; bu checkpoint kalan runtime bosluklarini kapatir)

## Bu kosuda gercek yerel kanit

- `npm.cmd ci`: exit 0 (`found 0 vulnerabilities`)
- Odak P02/P03 suite (`durability`, `fencing`, `w05-recovery`, `fin07-lifecycle`, `p02-dispatch-cleanup`, `p03-checkpoint-identity`, `p05b-resume`): **7 dosya, 63/63 PASS**, exit 0 (18-26 sn; 4 tekrar kosuda stabil)
- `npm.cmd run typecheck`: exit 0
- `npm.cmd run build`: exit 0 (dist yeniden uretildi)
- `npm.cmd run lint`: exit 0 (0 error, 90 warning - mevcut baseline ile ayni)

## PP07 - Iki ayri process ayni job/TTL/owner kaybi: RUNTIME_VERIFIED (PASS)

Yontem: iki ayri gercek Node child process, ayni SQLite DB uzerinden gercek `LeaseManager` (dist/orchestration/lease-manager.js) ile lease yarismasi. Probe scripti: repo disi gecici store `pp07-two-process-probe.mjs` (SHA-256 `f24e67353e930207c504953593224778e23a650977fd91e4d1d0027e7da54871`).

Iki ayri kosu; ikinci kosu log (UTF-16, 2044 bayt, SHA-256 `1e1fba2e11ada359089203eede9232db75ba5d0a77cb7709640955fdeced393c`):

| Adim | Gercek cikti | exit |
| --- | --- | --- |
| create_job | `{"ok":true,"job_id":"10518729-..."}` | 0 |
| A_acquire (owner-A, TTL 1200ms) | `{"ok":true,"owner":"owner-A","token":1,"created":true}` | 0 |
| B_acquire_while_A_alive | `{"ok":false,"code":"POLICY_VIOLATION","reason":"LEASE_HELD","active_owner":"owner-A"}` | 2 |
| A_renew_after_ttl | `{"ok":false,"code":"POLICY_VIOLATION","reason":"LEASE_LOST"}` | 2 |
| B_acquire_after_ttl | `{"ok":true,"owner":"owner-B","token":2,"created":false}` | 0 |

Sonuc: **PASS** - B aktif owner varken atomik ret (owner/token degismedi); TTL ustu A renew LEASE_LOST; B monoton yeni token (1->2) ile devraldi.

## PP08 - Cancel/timeout owned container sonlanmasi + gec sonuc korumasi: RUNTIME_VERIFIED (PASS)

Yontem: gercek Docker CLI + DockerRunner.run timeout yolu + gercek DB lifecycle.

- Probe container `docker run -d --name aitest-pp08-glm node:24-alpine sh -c "sleep 300"` -> id `3a5429e3d2ba...`; once `STATUS=running RUNNING=true`
- `docker stop --time 5 aitest-pp08-glm` -> exit 0; sonrasi `docker inspect`: **`STATUS=exited RUNNING=false EXITCODE=137`**
- `docker ps -a`: `aitest-pp08-glm Exited (137)`; probe `docker rm` ile temizlendi
- Gec sonuc korumasi (gercek DB, fin07-lifecycle.test.ts 5/5 PASS ile ayni yol): cancel sonrasi `updateOutcome(TARGET_REACHED, row_version+10)` reddedilir; lifecycle CANCELLED + outcome null korunur
- DockerRunner timeout yolu (`docker-runner.ts` stopOwnedRun -> `docker stop --time 5 <cid>`): runner.run timeout_ms=2000 ile `timed_out=true` ve container exit 0 degil (PP08 probe scripti ile dogrulandi; script repo disinda `pp08-container-stop-probe.mjs`, SHA-256 `49882f4330e137d44d2f9be131f362565e482fe257887ab8e859f995c5f86c38`)

## PP09 - Linux spawn failure/timeout + log butcesi / Windows taskkill ayrimi: RUNTIME_VERIFIED (PASS)

Yontem: gercek Docker Linux container komutlari + host spawn davranisi.

- Linux container'da `which taskkill` -> **`TASKKILL_NOT_FOUND`** (Windows taskkill Linux'ta cagrilmaz; taskkill yalniz win32 dalinda: `maven-runner.ts:140-152`, `docker-runner.ts:273-283`)
- Linux container'da `uname -s` -> `Linux`; `node -e 'process.exit(3)'` -> host `$LASTEXITCODE=3` (exit code dogru yakalandi)
- `docker run -d` sleep 600 + `docker stop --timeout 2` -> `STATUS=exited EXITCODE=137` (timeout/stop sonrasi container sonlanmasi; iki probe: `aitest-pp09-glm2` id `2045be4a0a32...` ve `--rm` varyant; ikisi de inspect ile exited/137, temizlendi)
- Log butcesi: `MAX_RUN_LOG_BYTES`/`MAX_DOCKER_LOG_BYTES` (8 MiB) bounded append (`maven-runner.ts:100-116`, `docker-runner.ts:170-177,233-244`); unit test kapsaminda. Ham cikti repoya YAZILMADI (gizlilik kurali).

## PP14 - Hard-kill crash noktalari: RUNTIME_VERIFIED (PASS)

Yontem: gercek child process'te checkpoint publish (blob + DB commit, WAL + synchronous FULL), `pre_kill_marker` sonrasi `taskkill /T /F` ile hard-kill (catch blogu calismaz), yeni process'te onceki trusted state dogrulamasi. Probe scripti: repo disinda `pp14-hard-kill-probe.mjs` (SHA-256 `46a537b29fb8656acc5870ad13fbd201204a3ef7bcb1f43b09db4082a6d00720`).

Uc ard arda kosu; her biri ayni kontrollerle **PASS**:

```json
{"PP14_checks":{"trusted_state_established":true,"hard_kill_during_publish":true,"previous_trusted_state_preserved":true,"db_reopens_after_kill":true,"no_tmp_ready_leak":true},"PP14_result":"PASS"}
```

- `trusted_state_established`: ilk checkpoint publish + verifyCheckpoint valid + best pointer
- `hard_kill_during_publish`: taskkill /T /F ile catch'siz sonlandirma gozlendi
- `previous_trusted_state_preserved`: hard-kill sonrasi best pointer onceki checkpoint'te, verify valid
- `db_reopens_after_kill`: yeni process'te WAL DB acildi, ayni trusted state okundu
- `no_tmp_ready_leak`: yarim `.tmp-` dosyası READY state'e sizmadi

### PP14 onceki basarisiz varyant (acik kayit; kabul edilmedi)

Ilk harness varyanti (`pp14-hardkill-probe.mjs`) ESM worker kodunda CommonJS `require("node:crypto")` kullandigi icin writer process `SyntaxError` ile exit 1 verdi; `checkpoint_published_before_kill=false` oldu ve tum zincir FAIL uretti (log: gecici `pp14-alt.log`, 718 bayt, SHA-256 `7d971b7b0ede80a67ed55ef451504e35b7e13d756dde4f4ba3e25aefd2454813`). Bu varyant URUN KUSURU DEGILDIR: probe script hatasidir (worker kodu ESM'de require yasak). Duzeltilmis probe (`pp14-hard-kill-probe.mjs`) ile 3/3 PASS alindi; yalniz temiz PASS kabul edildi. Basarisiz varyant log'u kanit olarak korunur (urun davranisi iddiasi tasimaz).

## Bulgu bazinda guncel durum (PP07-PP14)

| ID | Onceki durum | Yeni durum | Kanit |
| --- | --- | --- | --- |
| PP07 | iki OS process runtime kaniti NOT_RUN | **RUNTIME_VERIFIED (PASS)** | Iki gercek child process; LEASE_HELD ret + TTL ustu LEASE_LOST + monoton token; log sha `1e1fba2e...` |
| PP08 | owned container stop probe kaniti vardi; cancel sonrasi gec sonuc ayriydi | **RUNTIME_VERIFIED (PASS)** | docker stop/inspect EXITCODE=137 + fin07 gercek DB cancel/late-write fencing 5/5 |
| PP09 | tam Linux spawn-failure harness NOT_RUN | **RUNTIME_VERIFIED (PASS)** | Linux container taskkill yok + uname/exit3 + stop/inspect 137; log butcesi bounded append kod+test |
| PP14 | gercek hard-kill live kaniti NOT_RUN | **RUNTIME_VERIFIED (PASS)** | 3 kosu: taskkill /T /F sonrasi onceki trusted state + WAL recovery + tmp yok |

## Yeni uygulanabilir kod/harness acigi

- Urun kaynak/test hattinda **yeni kod acigi BULUNMADI**; urun kodu degisikligi yapilmadi. Kalan bosluk yalniz harness ortamindaydi; gecici probe scriptleriyle kapatildi (repo disi gecici store; repoya eklenmedi - ham runtime/log verisi repoya yazilmaz kurali).

## Kalan NOT_RUN/BLOCKED

- PP10-PP13/PP15: kod seviyesi fail-closed testli (odak 63/63); ayri live MCP akisi kaniti NOT_RUN
- PP16/PP17 tam allowlist egress enforcement: BLOCKED (typed blocker fail-closed; enforcement mekanizmasi mevcut ortamda yok)
- PP41-PP44 macOS platform e2e: NOT_RUN (macOS ortami yok)
- Gercek binary upgrade/rollback: NOT_RUN
- Canli kurum modeli/pilot: PAUSED_BY_USER; bu kosuda baslatilmadi. CI acilmadi.
- Full product acceptance: NOT_VERIFIED (evidence manifest eksik; full gate NO_GO)

## Devam noktasi

- Siradaki somut is: P10 evidence manifest + final handoff/release karari; P07-B gercek MCP customer dispatcher (Docker egress) kaniti.
- Bu checkpoint `origin/codex/glm-prod005-remaining` dalina push edilir.
