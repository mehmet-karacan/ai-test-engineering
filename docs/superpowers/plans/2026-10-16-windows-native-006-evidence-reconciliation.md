# Windows Native 006 Evidence Reconciliation Implementation Plan

> **For agentic workers:** This plan is executed natively in the coordinator session. Every evidence change ends with diff/privacy checks, a Turkish ASCII commit, and a push.

**Goal:** Reconcile the 391-entry Windows-native acceptance universe against real test, pilot, review, and privacy artifacts without fabricating `PASSED` evidence.

**Architecture:** Build a public, redacted evidence matrix that maps WN01-WN80 and each retained/replaced legacy ID to an existing test command or private runtime artifact. Generate the private manifest only after the matrix and final test run agree. Keep the release verifier fail-closed when an obligation has no valid artifact or when the evidence is only partial.

**Tech Stack:** Node.js, Vitest, Windows native runner, JSON evidence manifest, Git checkpoints and handoffs.

**Spec:** `AKTIF_GOREV.md` sections 11-12; `ai/acceptance/scope-windows-native-v1.json`; `ai/acceptance/legacy-to-006.json`.

## Global Constraints

- Customer checkout `C:\innova\projeler\gpu-fusion` is read-only for this work; no apply, reset, clean, commit, or push there.
- Runtime raw logs, model responses, SQLite, JaCoCo, and Report06 stay outside the repository.
- Evidence entries require a real command/artifact, exact hash/bytes, current source/build identity, and the correct scope/level.
- Unknown, skipped, blocked, failed, or unsupported predicates remain non-PASSED and keep full gate `NO_GO`.
- New commits use local Git identity `mehmet-karacan <karacan.mehmet@hotmail.com>` and Turkish ASCII messages.
- Broad tests run only after the matrix/ledger changes are complete.

## Review Focus

- WN01-WN66 package predicates must point to the existing focused test files that are included in the final Windows suite.
- WN70-WN74 GPU Fusion predicates must use the existing G1/WN72/WN73/customer-integrity private artifacts; a negative or baseline-only pilot cannot be promoted to `PASSED`.
- Legacy mapping must include only `RETAINED`/`REPLACED` rows and preserve `OUT_OF_SCOPE_BY_USER` exclusions.
- Manifest identity must match HEAD, source tree, lockfile, build input, dist stamp, scope, job/run, artifact hash, and byte size.
- Full `GO` is permitted only when every mandatory ID has valid evidence; otherwise the final result must show exact missing/invalid IDs.

---

### Task 1: Build the evidence matrix

**Files:**
- Create: `ai/checkpoints/2026-10-16-windows-native-006-evidence-matrix.md`
- Create: `ai/handoffs/2026-10-16-windows-native-006-evidence-matrix.md`
- Reference: `AKTIF_GOREV.md`, `ai/acceptance/scope-windows-native-v1.json`, `ai/acceptance/legacy-to-006.json`, existing test files and pilot checkpoints.

- [ ] Enumerate WN01-WN80 and map WN01-WN66 to concrete existing test paths by package (S00-S07).
- [ ] Map WN70-WN74 only to existing pilot/G1/customer-integrity artifacts; preserve negative pilot outcomes as non-PASSED.
- [ ] Expand only retained/replaced legacy rows and attach each to its mapped WN proof; keep nine out-of-scope rows excluded.
- [ ] Record every command, evidence level, scope, artifact path, hash/bytes, and unresolved blocker in the redacted matrix.
- [ ] Add a continuation prompt and commit/push the matrix stage.

### Task 2: Produce the reconciled private manifest

**Files:**
- Private only: `%LOCALAPPDATA%\ai-test-engineering\pilot\windows-native-006-evidence-manifest-r<N>.json`
- Modify: `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md`
- Create: final reconciliation checkpoint and handoff.

- [ ] Refresh build stamp after all tracked source/document changes.
- [ ] Generate the next manifest revision from the matrix and the current `--print-identity` output.
- [ ] Verify each artifact path, SHA-256, byte count, status, predicate, command, and job/run relation.
- [ ] Do not mark an ID `PASSED` when the matrix has no real evidence; retain `NOT_RUN`, `BLOCKED`, or `FAILED` with a reason.
- [ ] Commit/push the public reconciliation records; keep the JSON private.

### Task 3: Final verification and tests

**Files:**
- No product code changes expected; update only final checkpoint/handoff after results.

- [ ] Run the final typecheck/build/lint and full Windows suite after Tasks 1-2 are complete, using the private AC67 artifact and the native contention lock.
- [ ] Run `node scripts/release-verify.mjs --scope windows-native-v1 --manifest <private-manifest>` and capture machine-readable result.
- [ ] Confirm branch/worktree/remote equality, no native lock/temp residue, secret scan clean, and customer checkout unchanged.
- [ ] Commit/push the final result and report `GO` only if every required predicate is actually verified; otherwise report exact `NO_GO` blockers.
