# Windows native bridge bagimsiz ara inceleme

- Tarih: 2026-10-13. Incelenen coordinator HEAD: `9d34417`. Salt okunur inceleme; WN kabul veya production GO karari degildir.
- P1 restore: `src/storage/lifecycle-ops.ts` uretim akisi native session yerine JS `existsSync`/`renameSync`/`rmSync` kullaniyor. Path/sidecar yarisi acik. S01 native lifecycle ve startup recovery entegrasyonu bekleniyor.
- P1 resume: `src/orchestration/job-dispatcher.ts` ve `src/application/job-tools.ts` kaynak kokteki Maven `-v` probunu lease/process registry disinda baslatabiliyor. S02 lease + registry siralamasi ve canli owner fixture'i bekleniyor.
- P1 toolchain: `src/runners/maven-runner.ts` kimlik guard'i ile `.cmd` acilisi ayri anlarda; arada degisen dosya yeni baytlarla calisip eski kimlikle raporlanabilir. S02 launch aninda executable/config sabitleme ve drift fixture'i bekleniyor.
- P2 artifact crash: `src/orchestration/native-execution-toolchain-record.ts` immutable dosyayi DB artifact satirindan once yaziyor; aradaki kesintide ayni hash path `EEXIST` ile job'i bloke edebilir. S02 idempotent orphan dogrulamasi ve kill-cut fixture'i bekleniyor.
- P2 restore protokol: `src/storage/windows-restore-session.ts` child `exit` olayinda bekleyen stdout yanitini silebilir; `CLOSED` makbuzu kaybolabilir. S01 stdout drain/close ve hizli CLOSE tekrar fixture'i bekleniyor.
- Handle kopyalama olasiligi somut PoC olmadan bulgu sayilmadi. S01/S02/S03 VERIFIED degil, customer readiness ve full gate NO_GO; G1/G2/G3 kapali.
