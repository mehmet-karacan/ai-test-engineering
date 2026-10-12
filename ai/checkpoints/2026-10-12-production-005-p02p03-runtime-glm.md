# Checkpoint - AITE-PRODUCTION-READINESS-005 P02/P03-P04 runtime kanit denetimi (GLM)

## Kimlik

- Tarih: 2026-10-12
- Branch: `codex/glm-prod005-runtime` (detached HEAD `4140d9ba`'den olusturuldu; `origin/main` ile ayni commit)
- Denetlenen HEAD: `4140d9ba26e9b35ed0ddf1dbf11f2854b1682d14`
- Calisma agaci: temiz (staged/untracked yok); korunan `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` hicbir asamada okunmadi/silinmedi/stage edilmedi.
- Ortam: Windows host, Docker 29.8.2 (linux/amd64, WSL2 Linux 6.18 kernel), Node 24.14.1, vitest 4.1.11.

## Bu kosuda gercek kanit

- `npm.cmd ci`: exit 0; 236 paket, `found 0 vulnerabilities`.
- Odak P02/P03 suite (`tests/unit/durability.test.ts`, `fencing.test.ts`, `w05-recovery.test.ts`, `fin07-lifecycle.test.ts`, `p02-dispatch-cleanup.test.ts`, `p03-checkpoint-identity.test.ts`, `tests/integration/p05b-resume.test.ts`): **7 dosya, 63/63 PASS** (19.84 sn).
- `npm.cmd run build`: exit 0 (dist uretildi; dist/orchestration/lease-manager.js + dist/storage/storage.js dogrulandi).

## Docker Linux runtime kaniti (PP08/PP09; iki kisa komut, evidence uydurulmadi)

- PP08 (owned container stop): `docker run -d --name aitest-pp08-probe node:24-slim sleep 120` -> container id `96c082dce3e6...`; `docker stop -t 1` sonrasi `docker inspect`: **STATUS=exited, EXITCODE=137**. Container onceye ait degil, probe'a ozel isimle acildi ve kaldirildi (`docker rm`).
- PP09 (Linux spawn/exit yakalama): `docker run --rm node:24-slim sh -c "uname -s; node -e 'process.exit(3)'"` -> stdout **Linux**, host `$LASTEXITCODE=3`; Linux container'da exit code dogru yakalandi. Ayni oturumda `spawn('missing-binary-xyz')` -> `SPAWN_ERROR: ENOENT` event'i ve `docker run sleep 30` + SIGTERM -> exit=null yakalama da gozlendi (host Node child_process davranisi).
- Docker daemon OS tipi: `linux/amd64 29.8.2` (`docker version` + `docker info --format OSType=linux`).

## Bulgu bazinda durum (PP07-PP14; yeni HEAD)

| ID | Durum | Kanit |
| --- | --- | --- |
| PP07 | Kod seviyesi testli; iki OS process TTL/owner kaybi runtime kaniti NOT_RUN | heartbeat `leaseTtlMs/3` + renew fail -> `leaseLost` + `stopOwnedProcesses` (job-dispatcher.ts:180-194); odak 63/63 |
| PP08 | Kod seviyesi fail-closed testli; **owned container stop mekanizmasi gercek Docker stop/inspect ile dogrulandi** (probe container exited/137); dispatcher catch yolu CANCELLED/PAUSED'u overwrite edemez (job-dispatcher.ts:955-983) | p02-dispatch-cleanup + fin07 + bu oturum docker stop/inspect probe |
| PP09 | Kod seviyesi testli; **Linux container'da exit code yakalama gercek Docker kosusuyla dogrulandi** (Linux/exit 3); Windows taskkill yalniz win32 dalinda (maven-runner.ts:140-152, docker-runner.ts:273-283); MAX_*_LOG_BYTES log butcesi mevcut; tam Linux spawn-failure harness kosusu NOT_RUN | maven-runner.ts + docker-runner.ts + bu oturum docker run probe |
| PP10-PP13 | Fail-closed, testli (odak 63/63) | p03-checkpoint-identity (PP10: 154-231, PP11: 241-310, PP12: 333-396, PP13: 411-461) |
| PP14 | Kod seviyesi deterministik crash negatifleri testli; gercek hard-kill live kaniti NOT_RUN | p03 loop (575-621) + durability |

## Yeni uygulanabilir kod/harness acigi

- PP07-PP14 icin mevcut kaynak + test hattinda **yeni yerel uygulanabilir kod/harness acigi BULUNMADI**; kod degisikligi yapilmadi. PP08/PP09 icin ek kanit bu oturumda gercek Docker Linux komutlariyla uretildi; yeni test dosyasi eklenmedi (mevcut fin02/docker-isolation gercek Docker kosusunda ayni yollari zaten kapsiyor).

## Kalan NOT_RUN/BLOCKED

- PP07 iki ayri OS process'in ayni job'u tek owner yurutmesi + TTL ustu owner kaybi: iki process harness kosusu NOT_RUN.
- PP09 tam Linux spawn-failure/timeout event harness kosusu (host win32; Docker komut seviyesi kanit bu oturumda alindi): tam harness NOT_RUN.
- PP14 gercek hard-kill live kaniti: NOT_RUN.
- PP17 tam allowlist egress enforcement: BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE (typed blocker fail-closed).
- Canli kurum modeli/pilot: PAUSED_BY_USER; bu kosuda baslatilmadi. CI acilmadi.

## Devam noktasi

- Siradaki somut is: P07-B/P08/P10 aktif paketleri (platform e2e + evidence manifest); PR02/PR03 icin kalan tek kanit iki-process/hard-kill runtime harness'idir.
- Bu checkpoint commit sonrasi `origin/codex/glm-prod005-runtime` dalina push edilir.
