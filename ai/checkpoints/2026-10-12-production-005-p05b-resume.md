# Checkpoint - AITE-PRODUCTION-READINESS-005 P05-B resume kapanisi

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR06
- Branch: main
- Onceki checkpoint: ai/checkpoints/2026-10-12-production-005-p05b-shared-budget.md
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F
- Degisen temel alanlar: P05-B resume budget, contract/model provenance, persistent rejected attempts

## Yapilanlar

- Resume manifest'inde mutlak `iteration_limit` ve fiziksel `remaining_attempts` korunuyor; global config resume butcesini sifirlamiyor.
- Immutable job contract artifact'i resume'da model ve original budget kaynagi olarak okunuyor; string/object legacy model bicimleri destekleniyor, bozuk model ve model mismatch fail-closed.
- Frozen concrete target digest resume'da tum selector concrete listesinden yeniden kuruluyor; ilk selector digest'i kullanilmiyor.
- CandidateLoop'un her fiziksel denemesi `attempt_ordinal` ile kalici tutuluyor. Ayni logical iteration icindeki rejected repair/run denemeleri unique constraint tarafindan kaybedilmiyor.
- Schema v5 migration eski `candidate_iterations` kayitlarini koruyarak yeni attempt ordinal modeliyle tasiyor.
- `test_resume -> resumeDispatch -> dispatch` entegrasyon zinciri; ayni job, frozen target, model ve contract budget ile test edildi.
- Storage artifact yolu containment kontrolu Windows'ta `relative()` tabanli fail-closed kontrole alindi.

## Kanit

- `npm.cmd run typecheck`: PASS.
- `npx.cmd vitest run tests/unit/fin03-relations.test.ts tests/unit/p03-checkpoint-identity.test.ts tests/unit/w05-recovery.test.ts --reporter=dot`: 3 dosya, 46/46 PASS.
- `npx.cmd vitest run tests/integration/p05b-resume.test.ts --reporter=dot`: 1 dosya, 2/2 PASS.
- P05-B mevcut odak suite'leri onceki checkpoint ile birlikte korunuyor; tam urun acceptance ve live Docker/provider kaniti bu checkpoint'in kapsami disinda.

## Mode kapsami

- Tool schema'sinda desteklenen tek mode `TEST_ONLY`; baseline-only veya baska bir mode yok. Bu nedenle yeni mode davranisi uydurulmadi; test_start -> dispatcher -> report yolu TEST_ONLY kontratiyla kaldi.

## Kalan ve sinirlar

- P06-B kalan: effective Maven/affected module scope, JaCoCo agent/run/report freshness-provenance ve typed coverage blocker, baseline inventory.
- Docker capability/egress, canli model/provider ve kurum pilotu NOT_RUN/BLOCKED; local test PASS'i full acceptance olarak raporlanmaz.
- `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` sahipsiz/untracked dosyadir; degistirilmedi ve commit'e alinmayacak.

## Devam noktasi

P06-B2: effective Maven module scope ile JaCoCo freshness/provenance kapilarini ve baseline inventory'yi uygulamak; sonrasinda full local gate ve handoff.
