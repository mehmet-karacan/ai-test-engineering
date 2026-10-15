# Windows-native-006 native test contention fix handoff

- `tests/support/windows-native-test-lock.ts` test-only synchronous module-load lock'u ve dead-owner reclaim mantigi eklendi.
- Lock 12 agir Windows native integration dosyasinda kayitli; `testTimeout`/`hookTimeout` veya urun kodu degismedi.
- Odak kaniti: 2 dosya/31 test PASS; 11 dosya/115 test PASS, maxWorkers=2, exit 0, 356.44s. Typecheck ve diff-check PASS.
- Onceki full suite failures (Job Object PID marker, restore concurrent publish timeout) bu kilitli matriste tekrar uretilmedi. Final 120 dosya/978 test suite'i henuz tekrar kosulmadi.
- Sonraki is: asama commit/push kanitini dogrula; private AC67 artifact ile final full suite'i en son calistir; WN76/WN80 kararini yalniz sonuc ve verifier kanitiyla guncelle.
