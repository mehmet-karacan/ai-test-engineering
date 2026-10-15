# 2026-10-15 Windows Native 006 - GPU Fusion MCP WN72/WN73 checkpoint

## Kapsam

- Customer checkout: `C:\innova\projeler\gpu-fusion`.
- Checkout HEAD: `485a544bc87754f4d3c7181ec291d6389798ace5`; commit/push yapilmadi.
- Urun worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering`.
- Son build tree digest: `8ee36a0262be1dc2...` (`npm.cmd run build` PASS).

## Son regresyon ve S09 evidence

- `tests/security/pilot-full.test.ts` fixture'i legacy Docker env'sinden cikarilip varsayilan Windows native runner'a alindi. Guncel build tree digest `8ee36a0262be1dc2...`; P01 **40/40**, RG41/RG42 + AC67 **2 dosya/5 test PASS**, lint exit 0 (89 warning), local release `LOCAL_PASS`.
- Guncel aday build ile `npm.cmd test -- --maxWorkers=1 --no-file-parallelism`: **118 dosya PASS / 2 dosya FAIL, 957/959 test**, exit 1. Windows Job Object cancellation failure'i tekil `wn-job-object` **7/7 PASS**, FIN03 relation failure'i tekil `fin03-relations` **11/11 PASS** olarak tekrarlandi; full suite tek kosu yine tam yesil kabul edilmedi.
- Gercek GLM model cevabi `%LOCALAPPDATA%\ai-test-engineering\pilot\ac67-real-model-20261015\model-response.txt` ile gecici `tmp\pilot-stdout.txt` altinda baglanarak AC67 **3/3 PASS** yeniden kosuldu; gecici dosya temizlendi.
- Partial manifest private store: `%LOCALAPPDATA%\ai-test-engineering\pilot\windows-native-006-evidence-manifest-r2.json`, SHA-256 `40db045036ff00e4d78da430750bc80bc1902c1fe496f75c349aed63ab8060df`, revision 2 ve r1 onceki hash bagli. Full verifier guncel source/build identity ile `NO_GO`: 391 mandatory, 0 verified, 390 missing, 1 invalid; WN73 live pilot `NOT_PASSED`, platform `NOT_RUN`.

## Kod dilimi

- Worker request timeout 15 dakikaya cikarildi; `WORKER_COMPLETION_GRACE_MS=60000` ve `workerRequestBudget` ile istek lease'ten en az 60 saniye once sonlaniyor; dispatcher, resume ve scheduler lease TTL'leri worker/job deadline ile uyumlu hale getirildi.
- Pause/cancel akisi owned native process cleanup fence'i tamamlanmadan lease'i birakmiyor; terminal gec yazi PAUSED/CANCELLED durumunu ezemiyor.
- Resume native path spelling'i onaylanan kaydin yolu ile sabitleniyor; Windows `X:\` ve `x:/` farki yeni toolchain kimligi uretmiyor.
- Native toolchain kaydi mevcut identity'ye ek olarak base/output/version alanlarini sakliyor ve mevcut eski kayitlar icin optional alan uyumlulugunu koruyor.
- Frozen baseline ve candidate workspace Windows cleanup'inda sinirli ENOTEMPTY/EBUSY retry eklendi.
- OpenCode `createSession` HTTP yolu 30 saniyelik typed timeout ile bounded hale getirildi; model prompt'u baslamadan duran session olusturma istegi artik AgentTask'i lease sonuna kadar kilitlemiyor.

## Kanit

### WN72

- Son build ile pause'suz prod-like pilot `mcp95u`, job `cbe48d92-dca9-4768-9efe-d73bb86f9f61`: `COMPLETED / TARGET_ALREADY_MET`, `verification_level=AFFECTED_SCOPE`, LINE 10000 bps, final replay/test facts 49/49 PASS, skipped 0, test-only policy PASS, production degisikligi 0, Report06 `PUBLISHED`.
- Rapor yolu `X:\storage\jobs\cbe48d92-dca9-4768-9efe-d73bb86f9f61\reports\index.html`; repo disi kopyalanmis evidence storage `%LOCALAPPDATA%\ai-test-engineering\pilot\gpu-fusion-prod-20261015-mcp95u-evidence-storage` altindadir.
- Bu kanit guncel build ile normal MCP -> Windows native Maven -> JaCoCo -> Report06 zincirini ayni job'da gosterir.

### WN73

- Son kontrollu MCP pilot `mcp95s`, job `ce3c7b13-63e6-425f-a473-ab220af69728`:
  - `test_cancel(reason=pause)` gercekten `PAUSED` dondu.
  - `test_resume` ayni job icin `RUNNING` dondu; native preflight identity kapisi gecildi.
  - Resume dispatch baseline'i yeniden kurdu ve generation'a ulasti; ayni job/task ledger'i kullanildi.
  - GLM worker denemesi 15 dakikalik bounded timeout'ta `INTERRUPTED` oldu; scheduler retry'si basladi.
  - Son wire stderr terminal kaydi `POLICY_VIOLATION: Lease suresi bitti` ile job'i `FAILED` yapti; final Report06 uretilmedi. Pilot kontrollu olarak durduruldu.
- Sonuc: WN73 **NOT_PASSED (pause/resume zinciri kanitli, bounded worker timeout ve sonrasinda lease expiry nedeniyle terminal sonuc yok)**. Bu negatif sonuc fail-closed davranistir; WN73 PASS yerine yazilamaz.
- Raw pilot ve kopyalanmis evidence storage repo disindadir: `%LOCALAPPDATA%\ai-test-engineering\pilot\gpu-fusion-prod-20261015-mcp95s*`.
- Yeni kontrollu MCP pilot `mcp95v`, job `3c725559-ec07-4237-970a-4826e1d77607`, uyumlu JDK 17 ile baseline'i gecti; ayni job generation'da `PAUSED`, resume sonrasi `RUNNING` oldu ve generation'a dondu.
- `mcp95v` 30 dakikalik harness deadline'inda model cevabi terminale ulasmadan `test_cancel(reason=cancel)` ile kontrollu temizlendi; DB'de ikinci AgentTask lease'i aktifti, `LEASE_EXPIRED`/`Lease suresi bitti` olayi olusmadi. Bu, yeni 60 saniyelik completion grace/lease siralamasinin lease-expiry hatasini bu kosuda tekrarlamadigini gosterir; final candidate, Report06 ve terminal outcome uretilmedigi icin WN73 hala **NOT_PASSED**.
- `mcp95v` raw runtime ve tam job evidence storage repo disinda korunuyor: `%LOCALAPPDATA%\ai-test-engineering\pilot\gpu-fusion-prod-20261015-mcp95v` ve `...\gpu-fusion-prod-20261015-mcp95v-evidence-storage`.

## Testler

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS, guncel tree digest `8ee36a0262be1dc2...`.
- Worker budget odagi: `tests/unit/worker.test.ts` **1 dosya/21 test PASS**; AgentTask/recovery/orchestration odagi **3 dosya/13 test PASS**; candidate bridge kontratlari **2 dosya/3 test PASS**.
- OpenCode worker response + bridge kontratlari: **3 dosya/9 test PASS**; session-create timeout negative kaniti dahil.
- `npm.cmd run lint`: exit 0, 0 hata, 89 mevcut warning.
- `tests/unit/wn-native-toolchain-record.test.ts`, `tests/integration/p05b-resume.test.ts`, `tests/integration/wn-release-gate.test.ts`: **3 dosya / 23 test PASS**.
- `tests/unit/p01-release-gate.test.ts`: **40/40 PASS**; `tests/security/pilot-full.test.ts` + `tests/security/pilot.test.ts`: **2 dosya / 5 test PASS**.
- Son tek-isci full suite: **118 dosya PASS / 2 dosya FAIL, 957/959 test**, exit 1. Failure'lar `wn-job-object` cancellation timing ve `fin03-relations` fixture'inda goruldu; ayni guncel build'de izole tekrarlar sirasiyla **7/7** ve **11/11 PASS** oldu. Full suite tek kosu tam yesil sayilmadi.
- WN75 kullanici Report06 inceleme kaydi ve bagimsiz final review henuz tamamlanmadi.

## Devam noktasi

1. WN73 icin GLM worker cevabini terminale tasiyacak hizli/uyumlu endpoint veya model kosusunu tamamla; `mcp95v` pause/resume ve lease-grace kanitini sakla, final candidate/Report06 yokken WN73'u PASSED yapma.
2. WN75 icin Report06 `index.html`, test/coverage facts ve result kaydini kullaniciya sun; kullanici onayi/redi kaydet.
3. S09 partial manifest revision-2 (`windows-native-006-evidence-manifest-r2.json`, SHA-256 `40db0450...`) ve son full/izole regresyon kanitlarini bagimsiz review'a sun; full gate `NO_GO` kaldigi surece GO verme.

## Handoff prompt

`AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, bu checkpoint ve `ai/handoffs/2026-10-15-windows-native-006-gpu-fusion-mcp-w72-w73.md` dosyalarini oku. Mevcut uncommitted degisiklikleri koru; customer checkout'a commit/push/reset/clean yapma. WN72/WN73 kapsaminda mcp95s job `ce3c7b13-63e6-425f-a473-ab220af69728` negatif lease-expiry kanitini ve mcp95v job `3c725559-ec07-4237-970a-4826e1d77607` pause/resume + JDK17 + lease-grace kanitini incele. Hizli/uyumlu GLM endpoint/model ile terminal candidate/Report06 sonucu al; WN75 kullanici review kaydi, S09 manifest/full regression/final review kapilarini calistir. Kullanım kalan yuzde 5 veya altina inerse yeni checkpoint yaz, bu promptu guncelle, hedefi `paused` yap ve dur.
- Final build after pinRoot regression test: `npm.cmd run build` PASS; current tree digest `569f360007bc5b2a...`. `tests/unit/wn-command-contract.test.ts` is now 10/10 PASS and explicitly verifies parent `.mvn` is excluded when pinRoot is owned workspace root.
