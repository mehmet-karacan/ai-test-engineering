# Checkpoint - AITE-PRODUCTION-READINESS-005 P05-B shared budget

## Kimlik

- Tarih: 2026-10-12
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / PR06
- Branch: main
- P05-B shared budget baslangic HEAD: 7878c71
- Onceki checkpoint: ai/checkpoints/2026-10-12-production-005-p05b-repair-contract.md
- Aktif sozlesme hash: CC741769116CEE3B2CD921256406A58560B0D65AD0A476C3471BB01AC378336F
- Commit/push: bu checkpoint ile birlikte yapilacak; son commit mesaji `gorev: production readiness p05b shared budget`

## Yapilanlar

- CandidateLoop icin ortak `attempt_budget` eklendi; dispatcher hedefler arasinda aday/repair maliyetini tuketiyor ve havuz bitince yeni hedef adayi baslatmiyor.
- Worker candidate generation exception'lari rejection/error fingerprint olarak kayda giriyor; bounded repair feedback'i ile kontrollu yeniden deneme yapiliyor.
- Repair ve shared budget sonucu logical iteration ile physical attempt ayrimi korunuyor; resume loop'u remaining logical window'i dogru araliga map ediyor.

## Kanit

- `npm.cmd run typecheck`: exit 0.
- `npx.cmd vitest run tests/unit/p05-target-resolver.test.ts tests/integration/accepted-set.test.ts tests/integration/ac27-loop.test.ts tests/unit/fin05-worker-chain.test.ts tests/unit/p03-checkpoint-identity.test.ts`: 5 dosya, 57/57 passed.
- Lint genel komutu mevcut `scripts/release-verify.mjs` icindeki 3 error nedeniyle non-zero; P05-B degisen TypeScript dosyalarinda yeni lint erroru yok, mevcut warnings korunuyor.
- Docker capability/egress, canli model/provider, gercek kurum pilotu ve full acceptance NOT_RUN/BLOCKED kalir.

## Kalan ve sinirlar

- P05-B tamamlanmadi: dogrudan `handleTestResume -> resumeDispatch` immutable model/butce entegrasyon testi, rejected hard-kill resume kaniti ve mode kapsam testi eksik.
- Accepted checkpoint'ten trusted baseline/coverage provenance'i P06 frozen baseline kapsaminda ele alinacak.
- Mode schema'sinda su an yalniz `TEST_ONLY` var; yeni mode uydurulmadi.
- `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` sahipsiz/untracked dosyadir; degistirilmedi ve commit'e alinmayacak.

## Devam noktasi

P05-B icin storage+migration kullanan uc-test harness'i eklenmeli: contract modeli resume'da korunur, rejected adaylar kalan butceyi tuketir, model mismatch fail-closed olur. Sonra P06'ya gecilebilir.
