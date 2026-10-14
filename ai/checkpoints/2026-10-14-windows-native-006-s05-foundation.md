# S05 scheduler foundation checkpoint

- Gorev: AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0, S05 WN43-WN52.
- Kapsam: yeni `src/orchestration/agent-scheduler.ts`, yeni `src/workers/opencode/context-provider.ts` ve `tests/integration/wn-agent-orchestration.test.ts`.
- Scheduler en fazla iki aktif model gorevini calistirir; AgentTaskRepository claim/attempt/complete fence'lerini kullanir.
- Parent/child session kimlikleri, role/model binding ve context manifest kimligi adapter sinirinda birebir dogrulanir; uyusmazlik fail-closed raporlanir.
- Empty final, intermediate/provider/timeout/cancel/block sonucu `COMPLETED` sayilmaz; typed outcome ve AgentTaskResult status korunur.
- Context provider yalniz scoped relative path, root digest, secret-path dislama, symlink ve byte sinirlarini kabul eder; truncation yapmaz.
- Test: `npm.cmd exec -- vitest run tests/integration/wn-agent-orchestration.test.ts` -> 1 dosya, 3/3 PASS.
- Dogrulama: hedefli ESLint 0 hata/0 uyari; `npm.cmd run typecheck` exit 0.
- Kalan: OpenCode kurulu surumun gercek session parent/role/structured-output semasi ayri WN44/S08 contract testinde adaptera baglanacak; bu dilimde unsupported HTTP alanlari uydurulmadi.
