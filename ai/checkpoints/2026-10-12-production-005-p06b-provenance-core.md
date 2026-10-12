# Checkpoint - AITE-PRODUCTION-READINESS-005 P06-B2 provenance core

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR05
- Onceki HEAD: f4e4c88ee18ec8a453d378b26109f9931a423695
- Paket: P06-B2 typed coverage blocker ve test-run provenance cekirdegi
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F

## Yapilanlar

- POM discovery parent-relative plugin zincirinde JaCoCo ve Surefire mirasini dikkate aliyor.
- Coverage istenen hedef modulde JaCoCo yoksa `BLOCKED_COVERAGE_CONFIGURATION/JACOCO_PLUGIN_MISSING` donuyor; Maven kosusu baslatilmiyor.
- `BLOCKED_COVERAGE_CONFIGURATION` job outcome tipine ve dispatcher hata eslemesine eklendi.
- Schema v6 `test_run_provenance` tablosu ile baseline, candidate ve final replay kosulari; komut digest'i, exit/timed-out, Surefire/Failsafe inventory, log yollari, coverage XML yolu/hash'i ve zaman araligi ile kalici tutuluyor.
- Candidate loop her kosu icin callback, final replay test inventory ve baseline run zamanlarini dispatcher'a iletiyor.
- Candidate/final coverage okuyucusunda yeni kosu icin mtime, JaCoCo session ve frozen source filename kontrolleri uygulaniyor; eksik kanit counter'a cevrilmiyor.

## Kanit

- `npm.cmd run typecheck`: PASS.
- Odak suite: 6 dosya, 78/78 PASS.
- Coverage olmayan hedef modul typed blocker testi: PASS.
- Baseline JaCoCo olmayan POM'da runner'in cagrilmadigi typed blocker testi: PASS.
- Provenance idempotency ve test inventory toplami: PASS.
- Lint: yeni kodda 0 error; mevcut warning'ler korunuyor.

## Kalan

- JaCoCo report/session/class/source identity icin daha ayrintili fixture'lar ve final replay negative gate'leri.
- Coverage XML digest'inin coverage snapshot/run_id ve checkpoint manifestine tam baglanmasi.
- Baseline inventory'nin skip/silme/regresyon politikasi ile final rapora authoritative projection olarak aktarilmasi.
- Docker capability/egress, kurulum, tam gate, canli provider ve pilot kaniti NOT_RUN/BLOCKED.
- Sahipsiz `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` degistirilmedi ve commit'e alinmayacak.
