# AITE-PRODUCTION-READINESS-005 - PR04-PR06 yeniden denetim

## Kapsam ve karar

- Gorev: PR04/PP16-PP19 (verified isolation, egress/mirror, host secret/cache) + PR05/PP20-PP23/PP27-PP33 (frozen baseline, Maven/JaCoCo provenance, final replay, target resolver) + PR06/PP24-PP26 (model/mode/repair/deadline).
- Denetlenen HEAD: `28f928892cbbe1a31991ef99f45acb3639f8bfe3`.
- Calisma agaci: temiz; kullanici Java coverage dosyasina dokunulmadi.
- Karar: uygulanabilir yeni urun kodu acigi bulunmadi; source/test degisikligi yapilmadi. Existing fail-closed kapilar kod ve testlerle yeniden dogrulandi.

## Bulgular

- PR04 normal dispatcher `ensureVerified` ile gercek Docker capability probe olmadan baslamiyor; Docker info/image varligi tek basina yeterli degil.
- Source read-only, non-root, host secret izolasyonu, kapali network, memory/cpu ve output writable probe'lari gercek container'da gecti.
- Maven dependency provisioning'de mirror allowlist tek basina egress enforcement sayilmiyor; enforce edilmis proxy/network policy yoksa `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` donuyor. Bu fail-closed davranis PP17 icin dogru, gercek allowlist runtime kabul kaniti ayri kaldi.
- Frozen workspace, effective module/target resolver, custom test root, stale/wrong-source JaCoCo, strict Maven test/coverage property'leri ve model identity propagation mevcut kapilarla dogrulandi.
- `model_profile` provider/model olarak birebir parse ediliyor; sessiz fallback yok. Desteklenen mode `TEST_ONLY`; worker yoksa generation basarisi yerine typed blocker/feedback akisi kullaniliyor.
- Bounded repair, no-progress, total deadline ve final replay accepted set akislari mevcut testlerle dogrulandi; gereksiz refactor yapilmadi.

## Kanit

- `npm.cmd test -- --run tests/security/docker-isolation.test.ts tests/security/fin02-capability.test.ts`: 2 dosya, 11/11 PASS.
- `npm.cmd test -- --run tests/unit/p04-isolation-policy.test.ts tests/security/rt01-host-fallback.test.ts`: 2 dosya, 13/13 PASS.
- `npm.cmd test -- --run tests/security/fin00-isolated-loop.test.ts tests/contract/rt21-pilot-remediation.test.ts`: 2 dosya, 13/13 PASS.
- `npm.cmd test -- --run tests/integration/maven-jacoco.test.ts tests/unit/p06-effective-scope.test.ts tests/unit/w03-baseline.test.ts`: 3 dosya, 29/29 PASS.
- `npm.cmd test -- --run tests/integration/p05b-resume.test.ts tests/unit/p05-target-resolver.test.ts`: 2 dosya, 13/13 PASS.
- `npm.cmd run typecheck`: PASS; `npm.cmd run build`: PASS; `npm.cmd run lint`: 0 error / 89 warning.
- Gercek Docker probe: read-only source write denied, non-root uid 1000, `network none` egress denied, cgroup memory limit 536870912 byte; Docker 29.8.2 ve Maven 3.9.16.

## Acik kabul sinirlari

- PP17 allowlist egress enforcement, iki ayri owner/process TTL, hard-kill ve Linux spawn/timeout kaniti bu Windows hostta tam runtime olarak kapanmadi; typed blocker/NOT_RUN korunuyor.
- Canli model pilotu `PAUSED_BY_USER`; `tmp/pilot-stdout.txt` olmadan AC67 live-model testi calistirilmaz.
- Full evidence manifest olmadan production gate `NO_GO` kalir.
