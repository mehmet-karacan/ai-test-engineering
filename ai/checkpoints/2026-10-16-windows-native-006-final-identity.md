# Windows-native-006 final identity ledger

- Tarih: 2026-10-16; branch `codex/windows-native-006`; commit `422b015126294733d2022b32e59aca6a9b027dde`; worktree temiz.
- Source tree digest: `16938b4af4377908c40df6b3eb9ccfc65ecea7cb83b46be467d38c99ed85304f`, file count 316.
- Build input digest: `746a53c00fd334dc13f2fea1499a9dcec00b64a293cb31528e0c8f5b0b4c57f9`; package-lock SHA-256: `dfccaf028a3da22f7438724422c36e0b80b5f2d0fbfc798b9952d4698124a58b`.
- Dist identity: `dist/mcp/stdio-entry.js` SHA-256 `e33817157eef91334b9cb69a7186f0298fa9b9821d9902c18e4de11a55b2c968` / 1654 bayt; `dist/index.js` SHA-256 `d7f54b1865563cd9b06ec9ec9dd818bde9bb80a1a8a56a3fd9e9db80f5f77e86` / 1729 bayt.
- Toolchain: Windows `win32-x64`, Node `v24.14.1`; native platform/Maven/JDK kaniti onceki redakte platform checkpoint'inde korunuyor.
- Build command `npm.cmd run build`: PASS. Local verifier `node scripts/release-verify.mjs --local`: `LOCAL_PASS`; output full acceptance'in bekledigini acikca belirtiyor.
- Final full suite: private AC67 model response env input, `npm.cmd test -- --maxWorkers=2`, session `98252`, 120/120 dosya ve 978/978 test PASS, exit 0, 680.32s.
- Bu kayit yalnız public kimlik/kanit ozetidir; private model response, raw log, customer source ve Report06 repo'ya alinmadi.

## Devam

Bu kimligi private `windows-native-006-evidence-manifest-r12.json` source/build alanlarina birebir tasi. Artifact hash/bytes degisirse manifesti yeniden olustur; full gate missing legacy evidence nedeniyle `NO_GO` kalabilir.
