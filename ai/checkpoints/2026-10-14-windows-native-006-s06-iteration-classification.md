# S06 iteration classification checkpoint

- Tarih: 2026-10-14
- Kapsam: WN55/WN57 candidate Maven test sonucu siniflandirmasi
- Degisen urun dosyalari: `src/orchestration/build-plan.ts`, `src/orchestration/candidate-loop.ts`
- Yeni regresyon: `tests/unit/s06-iteration-classification.test.ts`
- `classifyTestRun` Surefire/Failsafe malformed, failed, timeout, non-zero, no-test ve all-skipped durumlarini typed reason code'a indirger.
- Candidate loop exit 0 + malformed veya all-skipped raporu coverage kazanci olarak kabul etmez; rejected karari ve `UNSTABLE` reason kaydeder.
- Baseline ayni siniflandirma yardimcisini kullanir; malformed raporun testsiz sonuca sessizce donmesi engellenir.
- `assertBaselineUsable` artik yalniz `PASSED` baseline'i trusted kabul eder; `UNSTABLE` ve `NO_TESTS` baseline trusted akisa giremez.

## Kanit

- RED: yeni testte mevcut kod malformed report ile `adopted` dondu.
- GREEN: `npm.cmd exec -- vitest run tests/unit/s06-iteration-classification.test.ts tests/unit/p05-target-resolver.test.ts` -> 2 dosya, 12/12 PASS.
- Focused S06: `npm.cmd exec -- vitest run tests/unit/s06-iteration-classification.test.ts tests/unit/w03-baseline.test.ts tests/unit/p06-effective-scope.test.ts tests/unit/w04-evaluator.test.ts tests/unit/coverage-math.test.ts tests/integration/maven-jacoco.test.ts` -> 6 dosya, 54/54 PASS.
- Typecheck: `npm.cmd run typecheck` -> PASS.
- Lint (degisen 3 dosya): `npm.cmd exec -- eslint src/orchestration/build-plan.ts src/orchestration/candidate-loop.ts tests/unit/s06-iteration-classification.test.ts` -> PASS.

## Kalan S06 aciklari

- Effective Maven profile/pluginManagement/toolchain modelinin tam cozumlenmesi hala statik POM discovery seviyesinde; gercek `help:effective-pom` baglantisi yok.
- Custom source/test root icin effective modelden gelen profile degerleri ve inherited JaCoCo execution'lari yeni gercek multi-module fixture ile kapsanmadi.
- JaCoCo malformed/inconsistent counter provenance ve accepted final replay kapsamli WN57-WN60 matrisi bu parcada ele alinmadi.
- Full repository suite parent coordinator tarafinda calistirilmalidir; customer checkout, S02/S03 inventory ve S05 scheduler dosyalarina dokunulmadi.
