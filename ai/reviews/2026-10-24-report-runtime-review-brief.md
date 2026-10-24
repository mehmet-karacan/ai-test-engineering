# Report runtime independent review brief

Base50b27fb0f8daf94fb91d539caec0559211fca885; branch codex/report-runtime-sync-20261024; workspace d03b. User: fix stale report runtime snapshot, verify, commit/push remaining changes.

Review current uncommitted diff plus new src/application/report-runtime.ts, src/orchestration/report-finalization.ts and two new integration tests. Root bug RED: old published report stays RUNNING/READY_FOR_REVIEW after DB terminal;4failed2passed. Fresh projection now preserves exact binary evidence/counters/date and reexports HTML/JSON/manifest. Bad/unpublished input is not repaired. SQL immediate transactions serialize cache reprojection vs finalizer. Status/result use returned locked job snapshot (race2RED observed beforefix).

New finalizer moves DB terminal update and verified export under one real SQLite transaction; assertLease before/after; event/commit/export failure rolls back and revokes attempted PUBLISHED marker. Dispatcher delegates actual terminal publication. Test covers actual SQLtrigger failure after export, verification failure, pause/cancel and lostlease. Existing successful older reports are repaired lazily by status/result after full manifest verification; no new model or customerMaven run.

Plan ai/tasks/2026-10-24-report-runtime-sync-plan.md. Review read-only: no source/index/branch/runtime/customer writes; no subagents. Focus authority of old reports, transaction/error/race behavior, exact evidence byte preservation and teststrength. You may run only the two new integration files independently (no full native suite, no real customer/model). Return concrete severity/path/line/reproducer, set-aside behaviors and readiness.
