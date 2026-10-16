# Windows-native-006 evidence reconciliation handoff

- Matrix checkpoint: `ai/checkpoints/2026-10-16-windows-native-006-evidence-matrix.md`
- Scope: WN01-WN80 plus 311 retained/replaced legacy ids; nine out-of-scope rows remain excluded by policy.
- Current code HEAD before matrix commit: `cb41368`; customer checkout remains read-only.
- Next: commit/push matrix, run final typecheck/lint/build/full Windows suite, then generate private next manifest from current HEAD and run the full verifier.
- Do not fabricate PASSED entries. If a command or artifact cannot be verified, preserve NO_GO and record the missing id.

## Continuation prompt

Read `AGENTS.md`, `AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, this matrix and the latest handoff. Commit/push the matrix, run the final verification sequence, generate the next private manifest with current source/build identity and previous manifest SHA, then run the full verifier. Keep raw evidence private and do not touch `C:\innova\projeler\gpu-fusion`.
