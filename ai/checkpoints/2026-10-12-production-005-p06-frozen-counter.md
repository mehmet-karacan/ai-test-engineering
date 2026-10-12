# Checkpoint - AITE-PRODUCTION-READINESS-005 P06 frozen candidate/final ve exact counter

## Kimlik

- Tarih: 2026-10-12
- Paket: P06 candidate/final kaynak dondurma ve exact coverage karsilastirmasi
- Onceki commit: `25900d5 gorev: p02 dispatch cleanup acigini kapat`
- Kullanici dosyasi `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi ve stage edilmeyecek.

## Yapilanlar

- `IterateOptions.frozen_source_root` eklendi; dispatcher bunu baseline execution root'a bagliyor.
- Candidate workspace, `PatchApplier`, Maven plan ve ilk coverage okumasini canli `project_root` yerine frozen baseline workspace'ten kuruyor.
- Final replay ayni frozen source root'tan kuruluyor; accepted set yine ayri overlay olarak uygulanıyor.
- `evaluateCandidateGain` exact raw counter oranlarini cross-multiply ile karsilastiriyor; floored bps yalniz geriye donuk rapor/karar metni icin tutuluyor.
- Hedef esigi de raw counter ile exact degerlendiriliyor.

## Kanit

- `npm.cmd test -- --run tests/unit/w04-evaluator.test.ts tests/unit/p05-target-resolver.test.ts tests/unit/w03-baseline.test.ts`: 3 dosya, 38/38 PASS.
- `npm.cmd run typecheck`: PASS.
- Yeni testler canli checkout'a eklenen marker dosyasinin candidate ve final workspace'e kopyalanmadigini ve floored bps esitliginde exact raw gain'in kabul edildigini dogruluyor.

## Kalan

- Java21 multi-module writable target mount, profile/skip/failure-ignore ve JaCoCo agent zinciri ayri P06 bulgularidir.
- Docker customer runtime kaniti bu ortamda daemon olmadigi icin BLOCKED/NOT_RUN.
