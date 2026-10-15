# 006 S09 partial manifest ve native pin checkpoint

Tarih: 2026-10-15
Worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering`
Branch: `codex/windows-native-006`
HEAD: `a22004e89f1750ed6af9ad75b2d3976d0b10aac4`

## Bu dilimde tamamlananlar

- `scripts/release-verify.mjs` partial evidence kayitlarini kabul ediyor: obligation entry statuslari `NOT_RUN`, `BLOCKED`, `FAILED`, `PASSED`; `PASSED` disindaki kayitlar saklaniyor fakat `EVIDENCE_NOT_PASSED` ve full `NO_GO` korunuyor.
- Partial manifest metadata'si `manifest_status: PARTIAL`, pozitif `revision` ve `previous_manifest_sha256` alanlariyla denetleniyor. Revision 1 onceki hash'i null, sonraki revision'lar 64 hex SHA-256 tasimak zorunda. Partial manifest kendi basina full `GO` uretemiyor.
- `tests/integration/wn-release-gate.test.ts` eklendi: valid scope, partial revision, previous-hash link, bozuk link ve bilinmeyen flag/scope/eksik argument negatifleri.
- `src/runners/windows-process-supervisor.ts` eksik opsiyonel Maven girdilerini helper manifestine `-` olarak tasiyor; native helper sonradan olusan config'i child baslatmadan `pin_unavailable` ile reddediyor.
- P05-B ownership negatif fixture'i host helper durumuna bagimli olmaktan cikarildi; helper mevcut olsa da `NATIVE_PROCESS_OWNERSHIP_UNVERIFIED` dalini deterministik siniyor.

## Kanit

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: exit 0; 0 error, 89 mevcut warning.
- `npm.cmd run build`: PASS; tree digest `b7697df567b6eca6...`, 315 source/build files, 2 dist artifact.
- `node scripts/release-verify.mjs --local`: `LOCAL_PASS`, mandatory universe 391, full acceptance pending.
- P05-B: 1 file / 13 tests PASS.
- Native pin + runner: 2 files / 19 tests PASS.
- S09 scope gate: 1 file / 3 tests PASS.
- Birlesik focus: 11 files / 76 tests PASS.
- P01 release gate: 1 file / 40 tests PASS (205.02 s, serial Windows copy/CLI fixture kosusu).
- Tam tek-isci Vitest: 120 dosya / 952 PASS / 6 FAIL (958 test, 764.15 s). Iki host fixture'i (`wn19-mcp-secret-boundary`, `wn-native-entrypoint`) deterministik hale getirildi ve izole 2 dosya / 8 test PASS. Kalan 4 failure `pilot-full` (2) ve `pilot` (2) gercek model/pilot output'u yoklugu: dis kanit NOT_RUN olarak korunuyor, sahte PASS yapilmadi. Bu nedenle full suite WN76 icin halen external-evidence pending'dir; kod/regresyon odaklari PASS.
- Son verification projection degisikliklerinden sonra `npm.cmd run typecheck`, `npm.cmd run build` (tree digest `4d6b650e5ddfe2fe...`, 315 dosya, 2 dist), `npm.cmd run lint` (0 error, 89 warning), `release-verify --local` LOCAL_PASS ve bare full `NO_GO` (tek neden `EVIDENCE_MANIFEST_EKSIK`, mandatory 391/missing 391) tekrar alindi.
- Sonraki odak yeniden dogrulamasi: S04 kimlik/recovery/agent/inventory 4 dosya/17 test PASS; S06 Maven/JaCoCo + S07 install/Report06 6 dosya/33 test PASS; S09 scope gate 1 dosya/3 test PASS.
- Verification projection follow-up: coverage evidence'i olmayan `INVALID_COVERAGE_EVIDENCE` ve typed blocker outcome'lari `UNVERIFIED` olarak yaziliyor; target/target-not-met coverage outcome'lari `AFFECTED_SCOPE`. Report/catch row-version zinciri 7 dosya/41 P07 odak testi, typecheck/build/lint ile tekrar dogrulandi. Full gate yine `NO_GO` (`EVIDENCE_MANIFEST_EKSIK`).
- AC67 follow-up: gerçek OpenCode `2.0.29` + `litellm/GLM-5.3-Flash-IT#medium` owned fixture model output'u verdi; `tests/security/pilot.test.ts` 3/3 PASS. Ham/model evidence repo disi `%LOCALAPPDATA%/ai-test-engineering/pilot/ac67-real-model-20261015`; önceki tam suite'deki AC67 iki ortam failure'i hedefli kosuda kapandi, tam suite tekrar kosulmadi. RG41/RG42 normal MCP pilotu halen external kanit bekliyor.
- Normal MCP native fixture denemesi `dc58a42a-9127-4fbb-9c42-d0fa0c082fc2` + retry `3a9f8e5f-211d-4b04-bf0f-40f977960444`: inspect/query ve `test_start` kabul edildi; preflight `BLOCKED_ISOLATION` (`NATIVE_INPUT_PIN_UNAVAILABLE`) ile child/model/pause/report acilmadan durdu. Bu negatif kanit WN72/WN73 PASS degildir; runtime `%LOCALAPPDATA%/ai-test-engineering/pilot/ac67-mcp-native-20261015` altinda.

## Durum ve kalanlar

- GPU Fusion prod-like MCP kaniti onceki checkpoint'teki gibi `c412eafc-d484-4058-a6d0-911bc623d2c0` ile tamam; customer HEAD sabit, commit/push yok.
- Full release gate bilerek `NO_GO`: gercek 391-ID evidence manifesti, platform kaniti, pilot/model/pause kaniti ve kullanici Report06 review kaydi yok.
- S02-S08 runtime kabul matrisi halen acik; kod/fixture odaklari ile gercek Windows/pilot kanitlari ayri tutulacak.
- Tam suite'in kalan dört dis kanit hatasi icin gerçek OpenCode/model/pilot artifact'i veya kullanici review'u gerekir; bunlar olmadan S08/S09 full GO verilmeyecek. Bagimsiz final review ve WN72/WN73/WN75/G2/G3 karar kayitlari acik. Partial manifest uydurulmayacak.

## Sonraki modele devam promptu

`C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering` icinde bu checkpoint'i, handoff'u, AGENTS.md, AKTIF_GOREV.md ve PROJECT_STATE/BACKLOG/ACCEPTANCE_MATRIX'i oku. Kullanici onayi devam ediyor; tekrar onay isteme. GPU Fusion customer checkout'una commit/push yapma. Mevcut tek-isci regresyon sonucunu (120 dosya/952 PASS/6 FAIL), iki fixture duzeltmesinin 8/8 PASS sonucunu, S04-S07 odak 50/50 ve S09 3/3 kanitini kullan; full suite'i yalniz yeni risk varsa tekrarla. `typecheck`, build, lint ve release-verify sonuclari son checkpoint'te kayitli; kod degisirse yeniden al. Gercek evidence yoksa full GO veya uydurma manifest verme. WN72/WN73 model/pause ve WN75 kullanici review'u NOT_RUN/PENDING olarak tut. Kullanim limitinde %5 kalirsa yeni checkpoint yaz, bu promptu koru ve goal'i duraklat.
