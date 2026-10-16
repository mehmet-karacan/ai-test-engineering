# Windows-native-006 final green handoff

- Evidence matrix: `ai/checkpoints/2026-10-16-windows-native-006-evidence-matrix.md`
- Final green suite: `ai/checkpoints/2026-10-16-windows-native-006-final-green-r15.md`
- Source code fix: `4a2e4cf`; customer checkout is read-only.
- Next action: commit/push checkpoint, rebuild, generate private r15 manifest from current HEAD and run `node scripts/release-verify.mjs --scope windows-native-v1 --manifest <private-r15>`.
- Do not copy raw evidence into Git and do not mark an obligation PASSED without a command and a hash/byte-verified artifact.

## Continuation prompt

Read `AGENTS.md`, `AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, the evidence matrix and this handoff. Use the final green suite (120/120 files, 978/978 tests) plus the real S08 pilot checkpoints to create the next private manifest. Update source/build identity after the checkpoint commit, preserve the previous manifest SHA, run the full verifier, and record the exact result. Keep `C:\innova\projeler\gpu-fusion` untouched.
