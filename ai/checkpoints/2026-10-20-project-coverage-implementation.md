# Checkpoint - Genel JaCoCo ve kullanici sinif secimi

- Tarih: 2026-10-20; kullanici onayli ek kapsam `ai/tasks/2026-10-20-project-coverage-plan.md`; dal `codex/coverage-proposals-20261020`.
- Yeni `project_coverage` tek kalici job baslatir; tek Maven alt kokunu cozer; native lease/process/toolchain ve frozen baseline yoluyla tum mevcut testleri calistirir. CLI JaCoCo 0.8.12 agent/test/report zinciri POM plugin'i olmayan projeleri destekler.
- Sonuc hash/boyut dogrulamali immutable artifact'te saklanir. `test_result.coverage_scan` genel LINE/BRANCH, raporlar ve sinif onerilerini sinirli ozetle sunar; basarili tarama WAITING_INPUT/COVERAGE_ANALYZED olur. Henuz model/aday yoktur. Kullanici secimi mevcut test_start + coverage_scan_id ile gider; source/build digest, proje ve onerilmis FQN dogrulanir.
- Salt owned execution kopyasinda eksik neutral .mvn pinleri tamamlanir; source/exec digest ve defaults ayri kayitlidir. Anlamli ancestor .mvn ayari gizlenmez: typed blocker. POM/production/kullanici testi degistirilmez. Eksik/atlanmis/basarisiz test ve stale/partial JaCoCo onerilere cevrilmez.
- Bagimsiz review'daki CLI resume modu kaybi, dis handler native-root kontrolu, ayni FQN'li modul onerileri ve ertelenmis baslatma/iptal yarisi RED/GREEN testlerle kapatildi. Son bagimsiz incelemede actionable bulgu kalmadi.

## Gercek Windows/stdio olumlu kontrol (Sky kaniti degildir)

- Kullanici checkout'u olmayan private fixture, JaCoCo plugin'i olmayan POM; installed JDK21/Maven3.9.16, normal stdio MCP. Scan job `2efc16c8-6d61-4f3e-9fdf-dabc0f75c85c`, 3/3 mevcut test PASS; LINE 7/11 (%63.64), BRANCH 5/10 (%50), uygun tek sinif onerisi. Secim oncesi agent_tasks=0.
- Test secimi sonrasi ayri job `3ab26d26-ae47-4616-a636-7d9856019982`, model tam `litellm/GLM-5.3-Flash-IT`, TARGET_REACHED/AFFECTED_SCOPE. Final replay 8/8 PASS; LINE 11/11 ve BRANCH 10/10 (%100), tests_added=1, modified=0, production_changed_files=0, TEST_ONLY PASSED, apply NOT_REQUESTED. Kaynak digest once/sonra ayni.
- Private store `%LOCALAPPDATA%/ai-test-engineering/pilot/coverage-positive-20261020`. scan-result.json SHA `28e281b3486f14189009e1d9c09ada2f2055bedbc635bbbb88e540f6c4ad53a1`; generation-result.json SHA `4675b97d628dc2c7545ffb75955cce2dfc4d0b88a0f0b2d0882b5a849de6e7e5`; Report06 SHA `8a2bad0f79e3524eca6d0a199c7adff5aa00c2e51913516c7792f64f22fab37d`. Ham log/model/kod Git'e alinmadi.

## Gercek Sky dogrulamasi - bloke

- Maven koku `C:/innova/projeler/sky-microservis/sky_backend`; process-local JDK21, source hash `4891b39c5ecbc3a4528bd89e48f06b78084d7ca6b00eaea463ae6c71f802d647` once/sonra ayni.
- Ilk scan `5c17a2a1` eksik implicit config nedeniyle NATIVE_INPUT_PIN_UNAVAILABLE oldu; neutral owned-input duzeltmesi sonrasi scan `4e5018eb-80f4-4052-b377-09f6d5b64ef2` native preflight ve gercek Maven kosusuna ulasti.
- Gercek komut pinned prepare-agent/test/report ve tum strict skip=false bayraklarini kullandi. Maven exit0/BUILD SUCCESS, fakat Sky POM satir341 literal `<skipTests>true</skipTests>` nedeniyle log `Tests are skipped` ve `Skipping JaCoCo execution due to missing execution data file` dedi. Sonuc BASELINE_FAILED / Baseline NO_TESTS / NO_DISCOVERED_TESTS; worker=0, candidate=0, hic coverage veya sinif onerisi uydurulmadi.
- Sky'da olumlu coverage/generation kabul kaniti YOKTUR. Musteri test konfigurasyonu etkinlesmeden bu akis Sky icin tamamlanamaz; asil POM'a dokunulmadi. Private store `%LOCALAPPDATA%/ai-test-engineering/pilot/sky-coverage-20261020`.

## Devam

- Uygulama odaklari: parser/ranking 12/12, CLI/owned plan4/4, scan/selection flow4/4, public resume15/15 PASS; typecheck/build PASS, lint0 error/89 warning. MCP v1/v2 dokuz-tool kontrati dahil 5dosya/33test PASS.
- Kod commitinden sonra temiz adayda tam Windows suite, typecheck/build/lint/local gate; son kaynak, Sky negative ve olumlu kontrol kanitlarini final handoff'a bagla. Onceki r19 GO yalniz b30b9d8 icindir; yeni feature icin otomatik full-GO iddiasi yapilmaz.
