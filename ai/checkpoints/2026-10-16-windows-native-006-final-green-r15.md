# Windows-native-006 final green suite checkpoint

- Date: 2026-10-16; branch: `codex/windows-native-006`.
- Code HEAD tested: `4a2e4cf` (`Coverage gecmisinde deterministik siralama sagla`).
- Final command:

```text
$env:AITEST_AC67_MODEL_OUTPUT=<private-artifact>; npm.cmd test -- --maxWorkers=2 --testTimeout=60000 --hookTimeout=60000 --retry=1
```

- Result: exit 0; 120/120 test files passed; 978/978 tests passed; 0 failed; Vitest duration 554.13s.
- OpenCode real server smoke: `npm.cmd exec -- vitest run tests/integration/opencode-worker.test.ts --maxWorkers=1` -> 1/1 file and 3/3 tests passed. Global OpenCode v2.0.30 postinstall binary was repaired from the installed Windows x64 optional package; no repository files or customer checkout changed.
- Earlier parallel-suite failures were transient Windows native process starvation: the affected restore/recovery files each passed in isolation, and the final retry suite passed with the explicit 60s test/hook limits.
- Typecheck, lint and build passed on the current code. Build stamp was regenerated after `4a2e4cf`.
- The deterministic coverage-history tie-breaker uses SQLite `rowid` after `created_at`, so same-millisecond before/after snapshots are ordered by insertion.
- Privacy: raw model output, native logs, SQLite state, Report06 and GPU Fusion customer files remain outside Git. Customer checkout was not modified, committed, pushed, reset or cleaned.

## Next

Commit/push this checkpoint, regenerate the build stamp on the resulting HEAD, create private manifest r15 with current source/build identity and previous manifest SHA, then run the full verifier. The manifest must contain all 391 mandatory rows only with real command/artifact references.
