# S01 recovery worker terminal guard sirasi

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`.
- Recovery worker ters MOVE'lari ve eski DB/WAL/staged kimligini dogruladiktan sonra `ROLLED_BACK` kaydini native oturum canliyken fsync eder; ancak sonra CLOSE gonderir. Belirsiz close/worker exit sonucu parent acilisi fail-closed tutar.
- Gercek Windows RED fixture: `ROLLED_BACK` fsync donusunda worker durduruldu, ayri raw better-sqlite3 INSERT eski close->terminal sirada basarili oldu. Yeni terminal->close sirada ayni writer reddedildi; `taskkill /F` sonrasi eski `test_jobs.old` acildi. `tests/integration/wn-restore-recovery-close.test.ts -t terminal-fsync` 1/1 PASS.
- Ilgili 3 dosya/27 PASS; typecheck/build/lint exit 0, lint 89 onceki warning. Source/binary manifest degismedi.
- Worker owner lock'u parent `Storage` SQLite handle'ini acmadan once serbest birakiyor. Bu ara zamanda baska restore'un baslamasi halen P1/WN12 acik. Terminal checksum tek basina DB kimligi veya surec dislama kaniti degildir. Fresh native hedef, WAL sentinel, path/GC tam kanitlari da acik; S01 VERIFIED degil.
