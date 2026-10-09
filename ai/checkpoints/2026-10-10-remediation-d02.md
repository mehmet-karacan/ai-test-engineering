# Checkpoint: AITE-REMEDIATION-002 D02 - Gercek orkestrasyon MCP yuzeyine baglandi

- Tarih: 2026-10-10
- Asama: D02

## Yapilan is

1. **JobDispatcher** (src/orchestration/job-dispatcher.ts): test_start ile baslayan kalici isin asamalarini yurutur (preflight -> baseline -> analysis -> generation -> verification -> completed); GoalContract (job_id, targets, bps esikleri, butce, runner_kind); docker izolasyon gecidi (preflight bitmeden customer kodu calismaz); per-target coverage karari; worker'li candidate generation (workerEnabled).
2. **handleTestStart dispatch**: dispatcher'a gecici dispatch eklendi (F01 kapatmasi); dispatcher async ilerler, event loop'u bloke etmez; kisa surede job handle doner; AITEST_RUNNER (docker/host_dev_only) ve AITEST_WORKER_ENABLED ortam degiskenleriyle kontrol.
3. **job-tools.ts** (src/application/): handleTestResume (tek guvenilir eslesen otomatik; birden fazla is varsa aday listesi; COMPLETED is yeniden baslamaz), handleTestCancel (pause/cancel ayrimi; PAUSED test_resume ile devam), handleTestResult (DB'den outcome/lifecycle/verification/apply_state/best_checkpoint; keyfi path okuma yok), handleTestApply (APPLIED idempotent; PATCH_ONLY kapali varsayilan; guvenilir onay yoksa POLICY_VIOLATION).
4. **8 arac MCP yuzeyine baglandi**: project_inspect, project_query, test_start, test_status, test_resume, test_cancel, test_result, test_apply (RG11 kapatmasi).
5. Test beklentileri guncellendi (8 arac).

## Dogrulama

- typecheck: TEMIZ
- build: TEMIZ
- mcp-handshake-smoke.mjs: exit 0 (gercek stdio initialize + tools/list + tools/call)
- TypeScript test: 17 dosya, **168/168 PASSED**

## Sonraki adim

- D03: Test-only siniri, izolasyon ve process supervision (F05/F06; Runner arayuzu fail-closed; supervisor semantigi: close/exit identity; assertIsolationHolds sentinel dogrulama).
