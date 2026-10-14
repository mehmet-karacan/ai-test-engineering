# AITE-006 S04 migration, durable inventory ve AgentTask store

Durum: IN_PROGRESS. Bu checkpoint migration ve kalici store diliminin kanitidir; S04 WN32-WN42 veya 006 full kabul iddiasi degildir.

## Uygulanan degisiklik

- `migrations.ts` v8 ile `inventory_scans`, `file_inventory`, `agent_tasks`, `agent_attempts`, `job_approvals`, `owned_processes` eklendi. Eski `worker_attempts` satirlari korunarak task ve artifact ref kolonlariyla genisletildi. `(location_id,generation)`, `(scan_id,path)`, `(job,idempotency_key)` ve attempt ordinal unique kurallari var.
- `InventoryRepository` generation acma, owner/fence kontrollu page append, ayni page retry idempotency, row_version CAS, COMPLETE/PARTIAL/STALE seal ve OFFSET kullanmayan keyset listesi sagliyor. Sealed generation'a yeni satir yazimi reddediliyor.
- `AgentTaskRepository` Zod kontratini kalici JSON/digest olarak sakliyor. `claimTask`, `recordAttempt`, `completeTask` kisa transaction'larda owner/fence/lease expiry, task revision, row_version ve result task/job fence'ini kontrol ediyor. Model cagrisi transaction icinde tutulmuyor.
- Remote URL/scp credential bilgileri kimlikten ayiklaniyor; `.git`/son slash varyantlari ayni remote'a, remote'suz canonical root'lar ayri local project'e baglaniyor. Case-normalizasyonu Windows root anahtarinda uygulanıyor; eski remote adaylari normalize edilerek okunuyor.
- `InventoryScanResultSchema` S03/S05 ortak bounded result olarak export edildi; 6 KiB AgentTaskResult ozet ve artifact/job fence kurallari korunuyor.

## Kanit

- `npm.cmd exec -- vitest run tests/unit/s04-project-identity.test.ts tests/integration/wn-project-identity.test.ts tests/integration/wn-agent-recovery.test.ts tests/unit/s04-inventory-persistence.test.ts tests/unit/s04-agent-task-repository.test.ts tests/unit/s04-agent-contracts.test.ts --maxWorkers=1`: 6 dosya / 16 PASS.
- `npm.cmd exec -- vitest run tests/unit/s04-agent-task-repository.test.ts tests/unit/storage.test.ts tests/unit/fin03-relations.test.ts tests/unit/p08-skip-upgrade.test.ts --maxWorkers=1`: 4 dosya / 28 PASS.
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run lint`: 0 hata, 89 mevcut uyari.
- `npm.cmd run build`: exit 0; Windows helper dogrulamalari gecti.
- `node scripts/release-verify.mjs --local`: `LOCAL_PASS`; full evidence manifesti yoklugu nedeniyle production/full kabul degil.
- `git diff --check`: temiz.

## Acik devam

- RecoveryManager/checkpoint-store ile task cursor, accepted set ve kalan butceyi ayni resume akimina baglamak.
- S03 `scanFileInventory` caller'ini durable scan generation'a baglamak; rename/delete tombstone ve fiziksel FileId receipt kanitlarini tamamlamak.
- S05 scheduler/worker session wiring, model onay event'i ve WN32-WN42 gercek iki-process/backup kabul kapilari.
- S02 customer toolchain ve 006 full evidence gate acik; bu dilim local kanittir.
