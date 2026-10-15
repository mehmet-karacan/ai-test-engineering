# Handoff - Windows Native 006 GPU Fusion WN72/WN73

## Baslangic

1. `AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md` ve `ai/ACCEPTANCE_MATRIX.md` oku.
2. `ai/checkpoints/2026-10-15-windows-native-006-gpu-fusion-mcp-w72-w73.md` oku.
3. Urun worktree'sindeki uncommitted dosyalari koru; customer checkout `C:\innova\projeler\gpu-fusion` icin commit/push/reset/clean yapma.
4. Git status/HEAD/remote ve son build stamp'i kanitla.

## Devam promptu

WN72/WN73 ve S09 kapilarini tamamla. Son WN72 pilot job `cbe48d92-dca9-4768-9efe-d73bb86f9f61` son build ile `COMPLETED/TARGET_ALREADY_MET`, `AFFECTED_SCOPE`, final 49/49 PASS, production degisikligi 0 ve Report06 `PUBLISHED` verdi; repo disi evidence storage `gpu-fusion-prod-20261015-mcp95u-evidence-storage` altinda. WN73 pilot job `ce3c7b13-63e6-425f-a473-ab220af69728` icin `mcp95s` wire/DB/storage kopyasini oku: pause `PAUSED`, resume ayni job `RUNNING`, native preflight ve baseline gecildi, generation'daki GLM worker denemesi 15 dakika bounded timeout'ta `INTERRUPTED` oldu; scheduler retry sonrasinda stderr terminal kaydi `POLICY_VIOLATION: Lease suresi bitti` ile job `FAILED` oldu. Bu job WN73 icin NOT_PASSED/negative timeout + lease-expiry kanitidir. Yeni worker budget kodu `WORKER_COMPLETION_GRACE_MS=60000` ile istek/lease siralamasini duzeltti. `mcp95v` job `3c725559-ec07-4237-970a-4826e1d77607` JDK17 ile baseline'i gecip ayni job'da pause/resume ve generation'a ulasti; 30 dakikalik harness deadline'inda model terminale ulasmadigi icin kontrollu cancel edildi, lease-expiry olayi olusmadi fakat final Report06 yok. `mcp95v` raw/evidence storage disarida korunuyor. WN73'u bu kanitlarla PASSED sayma; hizli/uyumlu GLM endpoint/model ile terminal candidate/Report06 kaniti al. Son full suite 118/957/2/959 sonucu ve iki izole tekrar PASS kaniti kayitlidir; full suite tek kosuyu yesil varsayma. Report06 ve user review WN75 olmadan S08'i PASSED sayma. Full evidence manifest, full regression ve final review yoksa production GO verme.

## Kod notlari

- `MAX_WORKER_REQUEST_TIMEOUT_MS` worker/dispatcher/scheduler ve resume lease TTL'lerinde kullaniliyor.
- `handleTestCancel` lease'i native cleanup fence sonrasinda birakiyor.
- `resumeDispatch` native pinned path spelling'ini kullanarak Windows path-case drift'ini engelliyor.
- `NativeToolchainRecordStore` base/output/version alanlarini sakliyor; eski optional kayitlari effective identity ile uyumlu kabul ediyor.
- Frozen baseline/candidate cleanup'inda bounded Windows retry var.
- OpenCode `createSession` HTTP istegi 30 saniyelik typed timeout ile sinirlandi; model prompt'u baslamadan takilan session olusturma artik lease expiry'ye birakilmiyor.

## Dogrulanan komutlar

- `npm.cmd run build`: PASS, tree digest `8ee36a0262be1dc2...`.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: exit 0, 0 hata, 89 warning.
- Native record + resume + release gate: 3 dosya / 23 test PASS.
- Worker budget: `tests/unit/worker.test.ts` 1 dosya/21 test PASS; AgentTask/recovery/orchestration 3 dosya/13 test PASS; candidate bridge 2 dosya/3 test PASS.
- Worker response + bridge: 3 dosya/9 test PASS; session-create timeout negative testi dahil.
- `tests/security/pilot-full.test.ts` fixture'i varsayilan Windows native runner'a alindi. P01 `40/40`, RG41/RG42 + AC67 `2 dosya/5 test PASS`, lint exit 0 (89 warning), local release `LOCAL_PASS`.
- Guncel tek isci full suite: **118 dosya PASS / 2 dosya FAIL / 957 PASS / 959 test**, exit 1. Windows Job Object cancellation ve FIN03 relation failure'lari tekil ayni-build kosularinda `7/7` ve `11/11 PASS` verdi; full suite tek kosu tam yesil kabul edilmedi.
- Private partial manifest revision 2: `%LOCALAPPDATA%\ai-test-engineering\pilot\windows-native-006-evidence-manifest-r2.json`, SHA-256 `40db045036ff00e4d78da430750bc80bc1902c1fe496f75c349aed63ab8060df`. Full verifier `NO_GO` (391 mandatory / 0 verified / 390 missing / 1 invalid; WN73 `NOT_PASSED`, platform `NOT_RUN`).

## Kullanım siniri

Kullanım kalan yuzde 5 veya altina inerse: yeni checkpoint yaz, bu handoff promptunu son job/build kanitiyla guncelle, goal'u `paused` yap ve baska is baslatma. Reset kredisi kullanma; bunun icin ayrica kullanici onayi gerekir.
- Final build after pinRoot regression test: `npm.cmd run build` PASS; current tree digest `569f360007bc5b2a...`; command-contract test 10/10 PASS.
