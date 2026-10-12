# Checkpoint - AITE-PRODUCTION-READINESS-005 P06 strict Maven gate

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / P06-B2
- Paket: Maven test/coverage execution policy
- Kullanici dosyasi: `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi ve stage edilmeyecek.

## Yapilanlar

- Baseline, candidate ve final replay Maven cagrilarina ortak strict property seti baglandi.
- `skipTests`, `maven.test.skip`, `skipITs`, `testFailureIgnore`, `maven.test.failure.ignore` ve `jacoco.skip` false; `failIfNoTests` true olarak zorlanir.
- Boylece POM/profile icindeki sessiz test atlama, failure-ignore veya JaCoCo skip ayari coverage/test sonucunu false-success yapamaz.

## Kanit

- P05 target resolver + P06 effective scope + W03 baseline + P07-B runtime evidence: 4 dosya, 35/35 PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: 0 error, 90 warning.

## Kalan

- Effective Maven profile'lerinin gercek kurum fixture'inda operasyonel kaniti ve Docker customer dispatcher kabul kosusu ayridir.
- P08 gercek Windows upgrade/rollback/uninstall kosusu ve P10 full handoff aciktir.
