# Windows-native-006 evidence matrix (WN01-WN80 + legacy mapping)

- Date: 2026-10-16
- Branch: `codex/windows-native-006`
- Purpose: map each required predicate to a real test/pilot/review artifact before generating the private full manifest.
- Policy: no row is marked PASSED from a model narrative alone. The final manifest will reference this matrix plus the final green suite and the existing pilot checkpoints.
- Raw model output, SQLite state, native logs, Report06 and customer checkout remain in the private evidence store.

## Acceptance universe

`ai/acceptance/scope-windows-native-v1.json` defines WN01-WN80. `ai/acceptance/legacy-to-006.json` contains 320 legacy rows: 286 `RETAINED`, 25 `REPLACED`, and 9 `OUT_OF_SCOPE_BY_USER`. The mandatory full-gate universe is therefore 80 WN rows plus 311 retained/replaced legacy rows = 391 rows. The nine out-of-scope rows remain explicitly mapped and are excluded by the scope policy.

Each legacy row inherits evidence from every WN id in its `wn` array. This is traceable in the mapping file by `legacy_id`, `status`, `reason`, `source_file`, `source_row`, and `source_row_sha256`; no legacy row is silently dropped or converted to PASSED without a WN target.

## WN predicate to test/evidence package

The command in each row is the command used by the final Windows suite. The test paths are repository-relative and are included in the 120-file final suite. A package row may cover several predicates when the tests exercise the same durable boundary; the predicate text remains defined by `AKTIF_GOREV.md` and the scope file.

| WN ids | Package | Test/evidence paths | Evidence source |
| --- | --- | --- | --- |
| WN01-WN04 | S00 scope and release mapping | `tests/unit/wn-scope-mapping.test.ts`, `tests/integration/wn-release-gate.test.ts`, `tests/unit/p01-release-gate.test.ts`, `tests/contract/rt21-pilot-remediation.test.ts` | Final full suite (`npm.cmd test -- --maxWorkers=2`); scope/mapping fail-closed checks |
| WN05-WN13 | S01 backup, restore and blob safety | `tests/unit/p08-backup-authority.test.ts`, `p08-lifecycle-escape.test.ts`, `p08-restore-stale-wal.test.ts`, `p08-skip-upgrade.test.ts`, `p08-upgrade-restore.test.ts`, `p08-runtime-paths.test.ts`; `tests/integration/wn-copy-snapshot.test.ts`, `wn-file-bridge.test.ts`, `wn-restore-atomicity.test.ts`, `wn-restore-blob-rollback.test.ts`, `wn-restore-blob-terminal.test.ts`, `wn-restore-recovery-close.test.ts`, `wn-restore-session.test.ts` | Final full suite; native restore and blob boundary checkpoints under `ai/checkpoints/2026-10-13-*` and `2026-10-14-*` |
| WN14-WN24 | S02 native Windows runner and process safety | `tests/unit/wn-command-contract.test.ts`, `wn-control-cleanup.test.ts`, `wn-install-manifest.test.ts`, `wn-install-preflight.test.ts`, `wn-native-entrypoint.test.ts`, `wn-native-registry.test.ts`, `wn-native-toolchain-record.test.ts`, `wn-process-supervisor.test.ts`, `wn-run-truncation-provenance.test.ts`, `wn-terminal-output-record.test.ts`; `tests/integration/wn-native-runner.test.ts`, `wn-job-object.test.ts`, `wn-install-manifest-helper.test.ts`, `wn-run-output-receipt-hardkill.test.ts`, `wn-baseline-failure-truncation.test.ts`, `wn19-mcp-secret-boundary.test.ts`, `wn-toolchain-pin.test.ts` | Final full suite; S02 checkpoints for fault matrix, hard-kill, truncation, secret boundary and native toolchain |
| WN25-WN31 | S03 inventory and bounded context | `tests/unit/s03-inventory-scan-service.test.ts`, `tests/integration/wn-inventory.test.ts`, `tests/unit/p06-effective-scope.test.ts`, `tests/contract/rt21-prompt-context.test.ts`, `tests/unit/discovery.test.ts`, `tests/unit/storage.test.ts` | Final full suite; S03 inventory/session/reparse checkpoints |
| WN32-WN42 | S04 identity, leases and resume | `tests/unit/s04-project-identity.test.ts`, `s04-agent-contracts.test.ts`, `s04-agent-task-repository.test.ts`, `s04-inventory-persistence.test.ts`, `p03-checkpoint-identity.test.ts`, `p05-target-resolver.test.ts`, `p05b` integration; `tests/integration/wn-project-identity.test.ts`, `wn-agent-recovery.test.ts`, `wn-restore-session.test.ts`, `wn-restore-recovery-close.test.ts` | Final full suite; S04 identity/migration/resume checkpoints |
| WN43-WN52 | S05 agent and worker bridge | `tests/contract/wn-agent-adapter.test.ts`, `worker-response.test.ts`, `rt21-worker-isolation.test.ts`, `s05-candidate-agent-bridge.test.ts`, `w01-attempt.test.ts`, `w01-context-isolation.test.ts`, `w01-worker-outcome.test.ts`, `worker.test.ts`; `tests/integration/opencode-worker.test.ts`, `wn-agent-orchestration.test.ts`, `wn-agent-recovery.test.ts` | Final full suite; S05 coordinator/bridge and worker isolation checkpoints |
| WN53-WN60 | S06 Maven, JaCoCo and accepted set | `tests/unit/s06-effective-maven-model.test.ts`, `s06-iteration-classification.test.ts`, `s06-jacoco-validation.test.ts`, `w03-baseline.test.ts`, `w04-evaluator.test.ts`, `candidate-acceptance.test.ts`, `coverage-math.test.ts`, `fin08-quality-pit.test.ts`, `quality-strict.test.ts`; `tests/integration/maven-jacoco.test.ts`, `ac27-loop.test.ts`, `accepted-set.test.ts` | Final full suite; S06 JaCoCo/iteration checkpoints |
| WN61-WN66 | S07 reports, export, readiness and lifecycle | `tests/unit/w06-facts-contract.test.ts`, `w07-export.test.ts`, `w08-reference.test.ts`, `w09-install.test.ts`, `w10-ledger.test.ts`, `p07-report-projection.test.ts`, `p07-verification-level.test.ts`, `p07b-report06-evidence.test.ts`, `p07b-report06-surfaces.test.ts`, `report-apply.test.ts`, `fin09-patch-export.test.ts`, `fin11-lifecycle-ops.test.ts`, `p08-readiness.test.ts`; `tests/integration/p07-report-path-authority.test.ts`, `p07b-runtime-evidence.test.ts`, `p07b-nonzero-facts.test.ts`, `p07b-browser-e2e.test.ts`, `stdio-client.test.ts`, `toolchain-matrix.test.ts` | Final full suite; S07 summary parity/readiness checkpoint |
| WN67-WN69 | S09 release gate predicates | `tests/integration/wn-release-gate.test.ts`, `tests/unit/p01-release-gate.test.ts`, `tests/unit/wn-scope-mapping.test.ts`, `tests/unit/fin15-release-verifier.test.ts` | `ai/checkpoints/2026-10-16-windows-native-006-wn77-80-review.md` and final full suite |
| WN70-WN71 | S08 GPU Fusion G1 scan and scope fence | Normal MCP G1 job `0d374284-38eb-46ed-ab18-a9aa34095412`; 2475-file scan, zero errors, complete=true, partial=false, 100%/90% target and Report06 publish | `ai/checkpoints/2026-10-14-windows-native-006-g1-mcp-target-met.md` (private wire evidence referenced there) |
| WN72 | S08 normal MCP native chain | Normal MCP job `cbe48d92-dca9-4768-9efe-d73bb86f9f61` (`mcp95u`); 49/49 PASS, line 10000 bps, Report06 PUBLISHED, production changes 0 | `ai/checkpoints/2026-10-15-windows-native-006-gpu-fusion-mcp-w72-w73.md` |
| WN73 | S08 pause/resume continuity | Normal MCP job `4a39d97d-d80d-40ac-abe4-5370f221dbb5` (`mcp107`); same-job pause/resume, candidate/final 6/6 PASS, line/branch 100%, Report06 PUBLISHED | `ai/checkpoints/2026-10-15-windows-native-006-wn73-mcp107-success.md` |
| WN74 | S08 customer integrity fence | Prod-like GPU Fusion run; original production/POM/tests, dirty/untracked bytes and HEAD preserved; no commit/push/reset/clean | `ai/checkpoints/2026-10-15-windows-native-006-gpu-fusion-prod-mcp.md` |
| WN75 | S08 user review | User accepted Report06 review for job `c412eafc-d484-4058-a6d0-911bc623d2c0` | `ai/checkpoints/2026-10-15-windows-native-006-wn75-user-accepted.md` |
| WN76-WN80 | S09 final review and identity | Final Windows suite 120/120 files and 978/978 tests; identity, stale build, secret and fail-closed review gates | `ai/checkpoints/2026-10-16-windows-native-006-wn76-final-green.md`, `wn77-80-review.md`, `final-identity.md` |

## Final verification sequence

After this matrix is committed, run the final sequence on the resulting clean HEAD:

```text
npm.cmd run typecheck
npm.cmd run lint -- --quiet
npm.cmd run build
$env:AITEST_AC67_MODEL_OUTPUT=<private-artifact>; npm.cmd test -- --maxWorkers=2
node scripts/release-verify.mjs --local
node scripts/release-verify.mjs --scope windows-native-v1 --manifest <private-next-manifest>
```

The private manifest will contain one PASSED entry for each of the 391 mandatory ids only when its command, exit code, artifact hash/bytes and current source/build identity are valid. If any predicate cannot be supported by the artifacts above, it stays missing and the verifier remains NO_GO.
