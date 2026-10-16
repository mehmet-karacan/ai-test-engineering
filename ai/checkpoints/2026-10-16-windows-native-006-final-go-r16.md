# Windows-native-006 full acceptance GO checkpoint

- Date: 2026-10-16.
- r15 private manifest: `%LOCALAPPDATA%/ai-test-engineering/pilot/windows-native-006-evidence-manifest-r15.json`.
- r15 SHA-256: `f2aad81df38a702633e5266383e04246ba23d8f754c09e3342aa48afecd1d0aa`.
- r15 source commit: `62ea5f78529b772f015e255ddf978715179317e5`; tree digest `18e880a5786b31c4fd2a796f36ad5c09ec8763f4ecabb99bdc93ab985eb54020`.
- Full verifier command: `node scripts/release-verify.mjs --scope windows-native-v1 --manifest <private-r15>`.
- Result: `FULL GATE: GO`; mandatory 391, verified 391, missing 0, invalid 0, duplicate 0; live pilot `PASSED`; platform `PASSED`; exit 0.
- Evidence universe: WN01-WN80 plus 311 retained/replaced legacy rows. Nine `OUT_OF_SCOPE_BY_USER` rows remain explicitly mapped but are outside the mandatory Windows universe.
- Final Windows suite evidence: 120/120 files and 978/978 tests passed with OpenCode v2.0.30 smoke 3/3.
- Privacy and customer fence: raw model/native/Report06 evidence stays private; `C:\innova\projeler\gpu-fusion` was not modified, committed, pushed, reset or cleaned.

## Final identity transition

This checkpoint itself will be committed as the last public repository change. After that commit, regenerate the private manifest as r16 with the new source/tree/build identity and r15 SHA as `previous_manifest_sha256`; run the full verifier once more. Do not edit the repository after r16 GO.
