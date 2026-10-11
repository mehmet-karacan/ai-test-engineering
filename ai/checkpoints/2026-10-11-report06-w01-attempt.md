# Checkpoint: 2026-10-11 - AITE-REPORT06-INTEGRATION-004 W1 devam (F02/N14 durable attempt)

## Gorev

- AITE-REPORT06-INTEGRATION-004 v1.0; W01 paketi devam (F02 + N14)
- HEAD: 1925b128e590f91ca1f5a3ee164abd7d48fdccd1 (commit'siz calisma agaci)

## Bu parcada tamamlanan isler

1. `src/storage/inventory-repository.ts`: updateWorkerAttemptOutcome (YENI) - istek oncesi yazilan
   attempt satirini typed status/session/message/digest/duration/usage/error_class ile bitirir.
2. `src/orchestration/job-dispatcher.ts` generateCandidateFromWorker (F02 duzeltmesi):
   - Attempt kaydi istek ONCESI durable yazilir (status:error/IN_PROGRESS placeholder)
   - promptDigest (sha256) input_digest olarak kaydedilir
   - Hata yolunda: typed WorkerRequestFailure -> status timeout/error/aborted + error_class outcome_kind;
     owned session abort + serverManager.stopOwnedServer()
   - Basari yolunda: status:ok YALNIZ CandidateChangeSetSchema.parse sonrasi; output_digest + duration
   - classBodyTruncated 12K asiminda error_class:CLASS_BODY_TRUNCATED_12K (F04 icin kanit alani)
3. `tests/contract/w01-attempt.test.ts` (YENI, 5 test): N14 kabul
   - ok yolu: input/output digest + duration + message_id kalir
   - timeout yolu: status timeout + REQUEST_TIMEOUT + usage null
   - aborted yolu: status aborted + CANCELLED
   - EMPTY_FINAL yolu: output_digest null + error_class EMPTY_FINAL
   - attempt gecmisi: ordinal monotn; repair_for_attempt zinciri

## Test kaniti (gercek komut + exit)

- Hedefli: tests/contract/w01-attempt.test.ts 5/5 PASSED (ilk kosuda FK constraint hatasi ->
  createTestJob fixture duzeltmesi -> yesil)
- Tam suite: npm.cmd test: **47 dosya, 395/395 PASSED**, 120.41s, exit 0
- typecheck: exit 0

## Pilot durumu (degismedi)

- PAUSED_BY_USER / NOT_PASSED; canli model denemesi YOK

## Sonraki somut eylem

- F03/N16: worker-server-manager.ts job/profil bazli izole config (ortak tmpdir yerine job bazli),
  secret allowlist env, config digest; tests/contract/w01-worker-isolation-v2.test.ts ile dogrula.
