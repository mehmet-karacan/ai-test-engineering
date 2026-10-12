# Checkpoint - AITE-PRODUCTION-READINESS-005 P06-B2 module coverage report listesi

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR05
- Onceki HEAD: 26a654682e16d962858feae0400fc334d291d412
- Paket: P06-B2 multi-module coverage report provenance
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F

## Yapilanlar

- Schema v7 provenance kaydina module coverage report + digest listesi eklendi.
- Baseline ve final replay listeleri affected target module'lerinin tum report yollarini tasiyor; candidate tek module listesi de ayni semada yaziliyor.
- Eski tekil `coverage_report_path` alani geriye uyumluluk icin korunuyor; yeni liste authoritative projection olarak saklaniyor.

## Kanit

- `npm.cmd run typecheck`: PASS.
- Migration/provenance/coverage odak suite: PASS.
- `coverage_report_paths_json` persist ve idempotency testi: PASS.

## Kalan

- P06-B2 disindaki Docker capability/egress, kurulum, tam gate, canli provider ve pilot kaniti NOT_RUN/BLOCKED.
- Sahipsiz `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` degistirilmedi ve commit'e alinmayacak.
