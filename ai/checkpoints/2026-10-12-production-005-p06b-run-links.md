# Checkpoint - AITE-PRODUCTION-READINESS-005 P06-B2 run links

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR05
- Onceki HEAD: 36a966395253d017030c30be95dec919935028e1
- Paket: P06-B2 coverage run kimliklerinin snapshot ve manifest baglantisi
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F

## Yapilanlar

- Baseline provenance kaydinin id'si accepted checkpoint manifestindeki `baseline_run_id` alanina baglandi.
- Accepted candidate kosusunun provenance id'si `last_trusted_run_id` olarak manifest'e baglandi.
- Final replay provenance id'si `coverage_snapshots.run_id` alanina yaziliyor.
- Frozen baseline coverage okumasi mtime, session ve frozen source filename ile dogrulaniyor; original checkout XML'i fallback degil.

## Kanit

- `npm.cmd run typecheck`: PASS.
- `npx.cmd vitest run tests/unit/p06-effective-scope.test.ts tests/unit/fin03-relations.test.ts tests/unit/p03-checkpoint-identity.test.ts tests/unit/p05-target-resolver.test.ts --reporter=dot`: 4 dosya, 57/57 PASS.
- Dispatcher lint: 0 error; iki warning dosyanin onceki unused import warning'idir.

## Kalan

- Manifest'te her stage icin birden cok module coverage report digest listesinin tam modele alinmasi.
- Source digest ve binary class identity'nin `coverage_snapshots.source_sha256/binary_class_id` alanlarina gercek envanter kimligiyle yazilmasi.
- Baseline inventory'nin test silme/skip artisi regression gate'i ve final rapor projection'i.
- Docker capability/egress, kurulum, tam gate, canli provider ve pilot kaniti NOT_RUN/BLOCKED.
- Sahipsiz `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` degistirilmedi ve commit'e alinmayacak.
