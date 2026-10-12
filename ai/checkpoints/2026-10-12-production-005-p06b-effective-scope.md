# Checkpoint - AITE-PRODUCTION-READINESS-005 P06-B2 effective Maven scope

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR05
- Onceki HEAD: b805aeabad2d6811fcef12f3976c42658be554f1
- Paket: P06-B2 effective affected-module scope ilk parcasi
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F

## Yapilanlar

- `buildPlan` affected module path'lerini normalize ve tekilleştiriyor.
- Multi-module reactor'da test-compile, test ve coverage komutlari gercek `-pl <modules> -am` secimiyle uretiliyor.
- Reactor disi affected module typed `BLOCKED_TARGET_RESOLUTION/AFFECTED_MODULE_UNKNOWN` ile reddediliyor; tahmini basari yok.
- Tek modullu projede gereksiz `-pl/-am` eklenmiyor.

## Kanit

- `npm.cmd run typecheck`: PASS.
- `npx.cmd vitest run tests/unit/p06-effective-scope.test.ts tests/unit/w03-baseline.test.ts tests/integration/maven-jacoco.test.ts --reporter=dot`: 3 dosya, 22/22 PASS.

## Kalan

- JaCoCo agent/session/class/source freshness ve provenance typed blocker.
- Baseline test inventory ve run provenance DB/manifest baglantisi.
- Tam P06-B2, Docker capability/egress, canli provider ve pilot kaniti NOT_RUN/BLOCKED.
- Sahipsiz `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` degistirilmedi ve commit'e alinmayacak.
