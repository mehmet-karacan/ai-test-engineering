# Checkpoint - AITE-PRODUCTION-READINESS-005 P04-P06 runtime kaniti

## Kimlik

- Tarih: 2026-10-12
- Entegre HEAD: `6ef54af`
- Branch: `main`
- Korunan dosya: `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi/stage edilmedi.

## Runtime kaniti

- Docker 29.8.2, Maven 3.9.16, Java 25.0.3, Windows 11.
- `tests/security/docker-isolation.test.ts` + `tests/security/fin02-capability.test.ts`: 2 dosya, 11/11 PASS.
- `tests/security/fin00-isolated-loop.test.ts` + `tests/contract/rt21-pilot-remediation.test.ts`: 2 dosya, 13/13 PASS.
- `tests/unit/p04-isolation-policy.test.ts` + `tests/security/rt01-host-fallback.test.ts`: 2 dosya, 13/13 PASS.
- `tests/integration/maven-jacoco.test.ts` + `tests/unit/p06-effective-scope.test.ts` + `tests/unit/w03-baseline.test.ts`: 3 dosya, 29/29 PASS.
- `tests/integration/p05b-resume.test.ts` + `tests/unit/p05-target-resolver.test.ts`: 2 dosya, 13/13 PASS.
- Gercek container probe'lari: read-only source write reddedildi, uid 1000, `network none` egress reddedildi, cgroup memory 536870912 byte.

## Sonuc ve sinir

- PR04-P06 uygulanabilir local/isolated kod kapilari yeniden dogrulandi; yeni urun kodu acigi bulunmadi.
- Maven mirror allowlist'i gercek egress enforcement yerine gecmez; enforced proxy/network policy yoksa urun typed blocker donuyor.
- Iki owner/hard-kill/Linux spawn runtime kaniti ve tam PP17 allowlist egress kaniti NOT_RUN/BLOCKED.
- Canli model pilotu `PAUSED_BY_USER`; evidence manifest yoksa full gate `NO_GO` kalir.
