# AITE-006 S04 kimlik ve AgentTask kontrati dilimi

Durum: IN_PROGRESS. S01 kanit auditiyle VERIFIED; S04 migration/task repository henuz tamamlanmadi.

## Uygulanan degisiklik

- `ProjectRepository.ensureLocation` gorunen proje adini tek basina birlestirme anahtari olmaktan cikardi. Ayni remote farkli checkout'lari ayni project altinda farkli location olarak tutar; farkli remote veya remote'suz farkli canonical root yeni project olusturur.
- Eski DB'de ayni ad+remote icin birden cok aday varsa sessiz secim yapilmaz; `STORAGE_ERROR` + `PROJECT_IDENTITY_AMBIGUOUS` doner ve yeni location yazilmaz.
- `src/domain/agent-contracts.ts` S04/S05 ortak Zod runtime kontratlarini ekledi: `ArtifactRef`, bounded `AllowedContextScope`, `AgentTaskContract`, `AgentTaskResult`, model/budget/role alanlari ve task/job/revision fence kontrolu. Result summary UTF-8 6 KiB ile sinirli; artifact ref baska job'a ait olamaz.
- Ortak kontratlar `src/index.ts` uzerinden export edildi; S03/S05 kendi kopyasini olusturmamali.

## Kanit

- `npm.cmd exec -- vitest run tests/unit/s04-project-identity.test.ts tests/unit/s04-agent-contracts.test.ts tests/unit/storage.test.ts --maxWorkers=1`: 3 dosya / 18 PASS.
- `npm.cmd run typecheck`: exit 0.

## Acik devam

- S04 migration v8: `inventory_scans`, `file_inventory`, `agent_tasks`, approval/process kayitlari ve mevcut worker_attempts ile mapping.
- `claimTask`/`recordAttempt`/`completeTask` kisa transaction + lease/fence/CAS; iki process ve restart/revision testleri.
- Remote/case/junction fiziksel identity resolver ve services wiring; S03 inventory persistence; S02 customer ortam kapilari halen NO_GO.
