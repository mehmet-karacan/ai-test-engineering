# 006 handoff - S09 partial manifest ve tam regresyon

Tarih: 2026-10-15
Worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering`
Branch: `codex/windows-native-006`
HEAD: `a22004e89f1750ed6af9ad75b2d3976d0b10aac4`

## Devralinan kanit

- GPU Fusion prod-like normal MCP: job `c412eafc-d484-4058-a6d0-911bc623d2c0`, COMPLETED/TARGET_ALREADY_MET, `verification_level=AFFECTED_SCOPE`, LINE 100%, BRANCH 90%, 2/2, Report06 PUBLISHED. Customer HEAD sabit; commit/push yok; iki onayli yerel modified dosya korunuyor.
- Product verification projection duzeltmesi odak 41/41 PASS.
- P05-B 13/13, native pin/runner 19/19, S09 `wn-release-gate` 3/3, birlesik focus 11 dosya/76 test PASS.
- P01 release gate 40/40 PASS; typecheck/build/lint PASS (lint 0 error, 89 warning); `release-verify --local` LOCAL_PASS.
- Son build/release tekrarinda tree digest `4d6b650e5ddfe2fe...` (315 dosya, 2 dist), typecheck/build/lint PASS ve full gate tek nedenli `NO_GO` (`EVIDENCE_MANIFEST_EKSIK`, 391 missing).
- Sonraki odak dogrulamasi: S04 kimlik/recovery/agent/inventory 4 dosya/17 test PASS; S06 Maven/JaCoCo + S07 install/Report06 6 dosya/33 test PASS; S09 scope gate 3/3 PASS.
- Verification projection follow-up: `INVALID_COVERAGE_EVIDENCE` ve typed blocker outcome'lari `UNVERIFIED`, olculmus target outcome'lari `AFFECTED_SCOPE`; report/catch row-version zinciri P07 odak 7 dosya/41 test ile dogrulandi.
- AC67 follow-up: gerçek GLM OpenCode fixture çıktısı ve Maven/JaCoCo zinciri `tests/security/pilot.test.ts` 3/3 PASS; private raw/model evidence repo dışı pilot store'da. RG41/RG42 full normal MCP pilotu için kanıt yok.
- Normal MCP native fixture denemesi inspect/query + `test_start` sonrasi `BLOCKED_ISOLATION` / `NATIVE_INPUT_PIN_UNAVAILABLE` ile fail-closed durdu; job'lar `dc58a42a-9127-4fbb-9c42-d0fa0c082fc2`, `3a9f8e5f-211d-4b04-bf0f-40f977960444`. Model/pause/report acilmadi; WN72/WN73 PASS degil.

## Uygulanan degisiklikler

- `release-verify.mjs`: partial statuslari + `manifest_status`, `revision`, `previous_manifest_sha256`; partial kayit full GO'yu bloke eder.
- `windows-process-supervisor.ts`: null native pinleri `-` olarak helper'a iletir, config sonradan olusursa pin kapisi reddeder.
- `p05b-resume.test.ts`: ownership negatif dali helper kurulumuna bagimli degil.
- `tests/integration/wn-release-gate.test.ts` yeni scope/partial/CLI kontratlarini siniyor.

## Siradaki is

1. Tek worker tam regresyon sonucu kayitli: 120 dosya/952 PASS/6 FAIL; iki host fixture'i ayrica 8/8 PASS ile duzeltildi. AC67'nin iki ortam failure'i gerçek model fixture kanıtıyla hedefli 3/3 PASS oldu; tam suite tekrar kosulmadi. RG41/RG42 normal MCP pilotu ve native input pin blocker'i external evidence olarak acik.
2. S04-S07 ve S09 odaklari son turda PASS; fixture/model/pilot kanitini kod PASS diye yazma.
3. Full gate gercek 391-ID evidence, platform, pilot ve user review olmadan `NO_GO` kalacak. Manifest uydurma.
4. Kullanim limiti kalan %5'e ulasirse yeni checkpoint yaz, bu handoff promptunu kullan ve duraklat.

## Devam promptu

`C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering` icinde bu handoff ve checkpoint'i oku; kullanici tum kalan asamalara onay verdi, tekrar izin isteme. GPU Fusion customer checkout'una commit/push yapma. Mevcut tek-isci regresyon ve S04-S09 odak kanitlarini yeniden kullan; full suite'i yalniz yeni risk varsa tekrarla. Gercek evidence yoksa full GO verme, WN72/WN73/WN75'i uydurma PASS yapma. Kullanim %5'e indiginde yeni checkpoint yazip goal'i duraklat.
