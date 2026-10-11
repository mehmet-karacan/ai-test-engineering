# AITE-PRODUCTION-READINESS-005 P04 - Izolasyon ve mirror politikasi (PR04; PP16, PP18, PP19)

## Uygulama (PR04)

- **PP16 (normal customer job probe'suz baslamaz):** `runner-factory.ts` `ensureVerified` artik `probeOnly` kapanisini kaldirir; normal MCP customer job'u (customerJob=true varsayilan) GERCEK tam capability probe (`probeRunnerCapability`: source-ro, host-secret, egress, non-root, memory, output) olmadan verified capability ALAMAZ. Onceki kusur: `ensureVerified({probeOnly:true})` probe'suz capability donduruyordu ve `job-dispatcher.ts/dispatch` bu yolu hic kullanmiyordu (dogrudan `docker info` + image inspect). Simdi `dispatch` normal docker yolunda `runnerFactory.ensureVerified(...)` ZORUNLU cagirir; probe basarisizsa `BLOCKED_ISOLATION` (CAPABILITY_PROBE_FAILED) ile job fail-closed olur; host fallback yok.
- **Capability kimligi (PR04):** `VerifiedCapability` artik `image`, `server_version`, `ostype` tasir; dispatcher dogrulanmis image kimligini `DockerMavenRunner`'a aktarir. Probe cache'i de baseDir hash'inden job/probe alanina ozel volume kullanir. Docker/imaj yoksa `BLOCKED_ISOLATION` (CAPABILITY_UNVERIFIED); capability cache'lenmez.
- **PP18 (fail-closed probe):** `docker-runner.ts` `readProbeStdoutOrFailClosed`: probe stdout logu yok/bos/okunamazsa ilgili capability false kalir ve errors'a yazilir; bos ciktidan "secret yok/izin yok" sonucu URETILMEZ. `probeRunnerCapability` sonunda `capability_verified=false` iken errors bos kalamaz (bos success yok).
- **PP19 (host secret izolasyonu):** Yeni `scanMavenSettingsForSecrets`: host `~/.m2/settings.xml` mount ONCESI taranir (password/privateKey/server-credential/tum env placeholder'lari). Credential'li/bos/eksik/okunamaz settings container'a GIRMEZ (SETTINGS_MISSING/EMPTY/UNREADABLE/SECRET_DETECTED). `buildVerifiedLoopRunner` scanner gecerse mount; gecmezse stderr ile reddeder. `DockerMavenRunner.run` de ikinci savunma hatti olarak throw eder (BLOCKED_ISOLATION/SETTINGS_SECRET_DETECTED).
- **PP19 (cache cross-job izolasyonu):** `DockerRunOptions.maven_cache_volume` + `DockerMavenRunnerOptions.maven_cache_volume`: paylasilan `aitest-m2-cache` yerine `aitest-m2-cache-<job_id>` job'a ozel volume; bir job digerinin cache'ine yazamaz. Provisioning run'i da ayni izole volume kullanir.
- **PR04 (kontrollu provisioning/egress):** `provisionDependencies` artik HOST settings'i container'a tasimaz; YALNIZ izinli mirror'lari iceren izole `provisioning-settings.xml` uretir (`buildProvisioningSettings`, mirrorOf external:*, credential'siz) ve bunu salt-okunur mount eder. `bridge` network YALNIZ bu settings allowlist'iyle birlikte kullanilir. Kritik PR04 bulgusu duzeltildi: cagiran yol (`run`) bos mirror listesinde preparation'i atladigi icin typed blocker'a ULASILAMIYORDU; simdi `run` ONCESI `enabled && mirrors.length===0` kontrolu `BLOCKED_DEPENDENCIES` typed blocker verir.
- **Typed outcome (PR04):** `job-state.ts` OUTCOME_VALUES'a `BLOCKED_ISOLATION` + `BLOCKED_DEPENDENCIES` eklendi; dispatcher hata yolu artik her typed blocker'i outcome'ta ayristirir (hepsi generic BLOCKED_ENVIRONMENT ezilmez). `isolation_capability_verified` event'i preflight'ta yazilir.

## Degisen path'ler

- src/runners/runner-factory.ts (probeOnly kapanisi, customerJob kontrati, capability kimligi: image/server_version/ostype)
- src/runners/docker-runner.ts (readProbeStdoutOrFailClosed, scanMavenSettingsForSecrets, maven_cache_volume, izole provisioning-settings.xml, run-oncesi bos-mirror blocker)
- src/orchestration/job-dispatcher.ts (dispatch ensureVerified ZORUNLU + capability event, buildVerifiedLoopRunner jobId + secret scan + job cache, typed outcome ayrisimi)
- src/domain/job-state.ts (OUTCOME_VALUES + BLOCKED_ISOLATION, BLOCKED_DEPENDENCIES)
- tests/unit/p04-isolation-policy.test.ts (YENI, 11 test: PP16/PP18/PP19 + typed blocker)
- tests/security/docker-isolation.test.ts (Docker yoksa ctx.skip NOT_RUN kaniti; sahte yesil yok)
- tests/security/fin02-capability.test.ts (ayni skip politikasi)
- docs/security.md (egress/cache/settings probe satirlari)

## Kanit (2026-10-12, P03 lint duzeltmesi sonrasi calisma agaci)

- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run build`: exit 0.
- `npx.cmd vitest run tests/unit/p04-isolation-policy.test.ts`: 11/11 PASSED (PP16 probe'suz capability yok/Docker yoksa BLOCKED, PP18 secret scanner + bos cikti fail-closed + Docker yoksa probe false+errors dolu, PP19 credential'li settings RED + job cache izolasyonu + uretilen provisioning settings yalniz izinli mirror).
- `npx.cmd vitest run tests/security tests/contract`: 90 PASSED / 10 SKIPPED / 0 FAILED (16 dosya; skip'ler Docker daemon yok: NOT_RUN kaniti korundu, sahte yesil cevrilmedi).
- `npx.cmd vitest run tests/security tests/contract tests/unit`: 495 PASSED / 10 skipped / 3 FAILED (fin15 2 + w10 1).

## Acik kalan (pre-existing / environmental)

- `tests/unit/fin15-release-verifier.test.ts` (2) + `tests/unit/w10-ledger.test.ts` (1): PR01 release-verifier kapsamli; TEMIZ (stashed) agacta da ayni 3 FAIL (git stash ile dogrulandi) - P04 ile iliskisiz, P01'de birakilan mevcut durum.
- Docker daemon bu hostta erisilemez: `tests/security/docker-isolation.test.ts` (6) + `fin02-capability.test.ts` (3) skip olarak NOT_RUN kanitini korur (P04 oncesi de FAIL'du; simdi skip = dogru durum).
- PP17 gercek Docker ile negatif egress/DNS/redirect testleri: kod duzeyinde egress `none` + izole provisioning settings uygulandi; gercek zorlama kaniti Docker/izole ortam gerektirir -> NOT_RUN/BLOCKED.
- PP16'nin tam kaniti (normal MCP'den gercek Docker ile probe'lu job) gercek Docker gerektirir -> NOT_RUN.

## Sinirlar

- Bilinmeyen sahiplikteki `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi, stage edilmedi.
- Coordinator commit/push adimi bu checkpoint ile birlikte yapilir; uzak HEAD ve commit SHA son kontrolde kaydedilir.
- PR05/PR06/PR07/PR08 P04 disinda; dokunulmedi.

## Devam noktasi

- P04 kod + yerel odak suite tamamlandi. Sonraki: P05 (tek resolver, model/mode, persistent butce, repair) veya kullanici onayli commit/push.
- Docker'li ortamda kosulacak: docker-isolation + fin02 + p04 gercek capability/egress negatif testleri (PP16/PP17 tam kaniti).
