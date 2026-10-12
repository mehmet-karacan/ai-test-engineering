# Checkpoint - AITE-PRODUCTION-READINESS-005 P07-A facts projection ve export kapisi

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR07
- Onceki HEAD: 0d90ce845177684ab2c0aff353b711042b63d418
- Paket: P07-A gercek rapor facts projection, DB status projection ve fail-closed export
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F

## Yapilanlar

- Accepted checkpoint degisikliklerinden test eklenen/degisen ve production degisen dosya sayilari gercek proje agacina gore projekte ediliyor.
- Final replay Surefire/Failsafe toplam, basarili, basarisiz ve skip sayilari report JSON/HTML/summary projection'ina baglandi.
- Worker attempt role/provider/model kimlikleri report facts projection'ina baglandi; iteration reason serbest model metni yerine sabit facts kodlarina indirildi.
- Final replay dogrulanmadan test-only policy PASSED olamiyor; replay dogrulama sonucu ve gap kodlari rapora yaziliyor.
- Report export verification sonucu kontrol edilmeden job COMPLETED yapilmiyor; typed `REPORT_EXPORT_FAILED` yolu final verification failure ile FAILED lifecycle'a gidiyor.
- Exporter nested binary Buffer kabul ediyor, dosya yazimini tmp+rename ile yapiyor; canonical manifest bos/duplicate/reserved/empty entry ve bytes/hash uyumsuzlugunu fail-closed reddediyor.
- `test_status` ve `test_result` stale checkout JaCoCo XML'i yerine DB final replay coverage ve dogrulanmis report facts projection'i okuyor.

## Kanit

- `npm.cmd run typecheck`: PASS.
- Odak suite: 8 dosya, 81/81 PASS.
- Yeni `p07-report-projection.test.ts`: accepted changes, run summary, status kimligi, binary byte korumasi, bytes/hash ve bozuk manifest negative kapilari.
- Untracked `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` degistirilmedi ve commit'e alinmayacak.

## Kalan

- Report06 referans layout/davranisinin normal MCP renderer'ine baglanmasi.
- Final replay JaCoCo XML/HTML, Surefire/Failsafe XML, log, accepted patch ve checkpoint manifest kanitlarinin export manifestine byte-birebir eklenmesi.
- Gercek runtime end-to-end report/status/print/offline/DOM/link kabul senaryolari.
- P08 kurulum, P09 tam regression/release gate ve P10 handoff.
