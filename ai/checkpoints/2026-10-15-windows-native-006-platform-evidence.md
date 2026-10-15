# 2026-10-15 Windows Native 006 - platform kaniti

## Kapsam

- Desteklenen son-kullanici platformu bu gorev sozlesmesine gore yalniz Windows'tur. macOS/Linux son-kullanici kaniti aranmaz; kullanici karariyla kapsam disidir.
- Bu kayit yeni test kosusu degildir. Mevcut WN76 full suite ve WN73 mcp107 native pilot kanitlarinin ayni Windows aday build'iyle uzlastirilmis platform ozetidir.

## Guncel aday kimligi

- Worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering`
- Branch/HEAD: `codex/windows-native-006` / `a22004e89f1750ed6af9ad75b2d3976d0b10aac4`
- Source tree digest: `9396b3e1476057982af9b968f45d4030e325a5c791b30a8c035564a3eb28e708`
- Build input digest: `746a53c00fd334dc13f2fea1499a9dcec00b64a293cb31528e0c8f5b0b4c57f9`
- Lockfile SHA-256: `dfccaf028a3da22f7438724422c36e0b80b5f2d0fbfc798b9952d4698124a58b`
- Build stamp: `dist/build-stamp.json`; Node `v24.14.1`, platform `win32-x64`; dist byte kimlikleri stamp ile eslesiyor.

## Runtime kaniti

- WN73 mcp107 job `4a39d97d-d80d-40ac-abe4-5370f221dbb5` Windows native runner ile gercek JDK `17.0.20.1` ve Maven `3.9.16` kullanarak baseline, candidate ve final replay tamamlandi.
- Native toolchain record, command/provenance, JaCoCo XML SHA'lari ve Report06 private store'da korunuyor: `%LOCALAPPDATA%\ai-test-engineering\pilot\gpu-fusion-prod-20261015-mcp107` ve `X:\storage\jobs\4a39d97d-d80d-40ac-abe4-5370f221dbb5\reports\`.
- WN73 final: 6/6 PASS, 0 failure/error/skip, LINE/BRANCH 100%, production degisikligi 0, test-only policy PASS.
- WN76: ayni Windows aday kimligine bagli private AC67 artifact ile `npm.cmd test -- --maxWorkers=2` 120/120 dosya ve 978/978 test PASS; typecheck/build/lint/diff-check/local release de PASS olarak kayitli.
- Windows install/entry/upgrade/restore/uninstall runtime kaniti onceki PP41/PP44 checkpoint'lerinde redakte ve private artifact referanslariyla korunuyor; bu kayit o kanitlari yeni bir kosu gibi sunmaz.

## Karar

- `platform_evidence.status = PASSED` (Windows native scope).
- Bu karar production GO, G2 apply veya publish yetkisi vermez. Legacy obligation evreni, WN69 ve WN77-WN80 final review'u ayridir.
- Customer checkout degistirilmedi; commit/push/reset/clean/apply yoktur.

## Sonraki is

WN69 partial manifest predicate'ini ve retained/replaced legacy kanitlarini mevcut gercek artifact'lerle uzlastir. Test kosularini final asamasina kadar baslatma; kanit olmayan legacy ID'leri PASSED olarak yazma.
