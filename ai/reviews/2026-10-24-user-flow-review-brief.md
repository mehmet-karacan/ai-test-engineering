# User flow review brief

Base:9668d64d4ca082d285ea03a7a742b643f9d37af7. Branch:codex/user-flow-robustness-20261024. Review uncommitted diff plus tests/integration/user-flow-robustness.test.ts; executable files frozen while full suite runs.

User intent: test varied, incomplete and problematic user/OpenCode requests and fix actual functional bugs. This is not a security or penetration audit. Plan:ai/tasks/2026-10-24-user-flow-robustness-plan.md. Evidence:ai/checkpoints/2026-10-24-user-flow-robustness.md.

Changes: normalize copied root/selector whitespace; reject empty/duplicate coverage metrics, ignored explicit branch goal, malformed cursors and unscoped nonproject queries; canonicalize metric ordering for idempotency; preserve BRANCH-only goal without LINE; reject job/root and projectid/root conflicts; list known projects; return real paged coverage history with validity fields and deterministic tie order.

Review real registry/use-case/SQLite 51-case integration test and backwards compatibility. 17 initial RED, then7 extra RED, then metric-order1RED were observed before fixes. Focus tests green, actual SDK tools/list+roundtrip green. Full native suite running; do not claim its outcome until parent reads exit. Read-only review: no source/index/branch/db/customer/runtime writes; no tests while native full suite runs. Do not spawn further agents. Report severity/path/line/reproducer, test weaknesses, explicit set-aside behaviors and readiness.

Known old report publication-time RUNNING/READY_FOR_REVIEW snapshot is ledgered as a separate lifecycle/publication issue; canonical status/result terminal is authoritative. No new customer runs, session-file reads, deployment or CI changes.
