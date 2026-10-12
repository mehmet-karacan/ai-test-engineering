# Checkpoint - AiTE-PRODUCTiON-READiNESS-005 P07-B/P08 gercek runtime kanitlari (PP37/PP41-PP44)

## Kimlik

- Tarih: 2026-10-12 (UTC)
- Gorev: AiTE-PRODUCTiON-READiNESS-005 v1.0 / PR07 + PR08 kapanis kanit hatti
- Baslangic HEAD: `4140d9ba26e9b35ed0ddf1dbf11f2854b1682d14` (origin/main ile esli)
- Branch: `codex/qwen-prod005-platform` (bu sessiyon icin olusturuldu; main = 4140d9b)
- Kullanici sinirlari: kullanici OpenCode config'ine (`C:\Users\mkaracan\.config\opencode`) DOKUNULMADi; canli pilot `PAUSED_BY_USER` baslatilmadi; Ci acilmadi; `JavaMetadataScannerCoverageTest.java` bu worktree'de untracked/kullanici dosyasi olarak korunur (bu worktree'de fiziksel olarak mevcut degil; stage edilmedi). Tum runtime veri `C:\Users\mkaracan\AppData\Local\Temp\opencode\` izole store'unda.

## Ortam (gercek)

- Node v24.14.1, npm 11.x, vitest 4.1.11, Git 2.55.0, Windows 10/11 host, CMD+Node.
- Docker 29.8.2 (linux containers) calisiyor; `maven:3.9-eclipse-temurin-21` imaji mevcut; `node:24-alpine` bu oturumda pull edildi.
- Gercek headless browser: Microsoft Edge 155.0.4283.45 (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`), Chrome da mevcut.
- `npm.cmd ci`: 236 paket. Referans hash byte-exact yeniden dogrulandi: `docs/reporting/reference/innova_test_raporu_tasarim_06.html` = 257845 bayt, SHA256 `e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80`.

## PP37 - gercek browser/DOM/print/offline/link (KAPANDi - yerel host runtime kaniti)

Yeni test: `tests/integration/p07b-browser-e2e.test.ts` (4 test). Gercek Maven final replay
(`tests/fixtures/sample-maven-project`, `buildPlan` goals, exit 0) + gercek `collectFinalReplayEvidence`
(jacoco_xml/surefire_xml/run_log eksiksiz) + gercek `ReportExporter` (PUBLiSHED + verifyExport passed)
urettigi Report06 HTML'i gercek Edge'ta acilir:

- DOM: stage satirlari (baseline NOT_RUN / progress NOT_RUN / final KNOWN), gercek surefire run ozeti
  (`3 test / 3 gecti`) ve stage secim etkilesimi (gercek JS `click` -> `data-active-stage="progress"`,
  satir `active` + `aria-selected="true"`) gercek browser DOM'unda dogrulandi.
- Print: gercek browser CLi `--print-to-pdf` ile gercek PDF uretildi (bu host'ta CDP `Page.printToPDF`
  "Printing is not available" donuyor; CLi print layout'i gercek browser tarafinda kanitli). PDF `%PDF`
  header + 45KB+ boyut dogrulandi.
- Offline: harici http(s) script/img/link yok; CSP `connect-src 'none'` / `font-src 'none'`.
- Link: DOM'daki evidence linkleri rapor dizinindeki gercek dosyalara cozuldu; manifest artifact
  sha256/bytes diskle birebir eslesti (gercek hash/boyut dogrulamasi).

Sonuc: 4/4 PASS (`npx.cmd vitest run tests/integration/p07b-browser-e2e.test.ts`, 55.02 sn).
Browser yoksa test truthful skip (sahte yesil yok).

## PP41 - gercek Windows CMD install/verify/uninstall (KAPANDi - izole store kaniti)

izole env (`LOCALAPPDATA`/`USERPROFiLE` -> `C:\Users\mkaracan\AppData\Local\Temp\opencode\p08e2e-probe`):

- `cmd /c node scripts\install.mjs`: exit 0 (257.8 sn; npm ci + build + runtime dizinleri + config +
  OpenCode entry + handshake smoke). Kayitli entry `node dist/mcp/stdio-entry.js` + `AiTEST_CONFiG` +
  `AiTEST_DB_PATH` birebir dogru config/DB path'ine bagli.
- `cmd /c node scripts\verify-install.mjs`: exit 0 - "gercek kayitli entry config/DB ile eslesiyor",
  config mevcut, handshake smoke gecti.
- Readiness ayrimi: `NOT_READY: MCP handshake basarili; test uretimi icin AiTEST_WORKER_ENABLED=1 ve
  worker_profiles gerekir` (handshake pass urun-ready DEGiL - PP43 ile tutarli).
- `cmd /c node scripts\uninstall.mjs` (gercek kosu): exit 0 - OpenCode `ai-test-engineering` kaydi
  silindi (backup: `backups/config-backup-*.json`), sahip olunan config dosyasi hash kontrolu ile
  kaldirildi, diger kullanici ayarlari korundu; runtime veri (DB/config/blob) OTOMATiK SiLiNMEDiKORUNDU;
  repo icindeki `dist` build ciktilari kaldirildi.

## PP42 - gercek Linux native path (KAPANDi - Docker linux kaniti)

Gercek linux container (`node:24-alpine`, dist `runtime-paths.js` ile):

- Default: `root=/root/.local/share/ai-test-engineering`, `config=/root/.local/share/ai-test-engineering/config/config.json`,
  OpenCode config `/root/.config/opencode/opencode.json` (native `path.join`; backslash yok).
- `XDG_DATA_HOME=/tmp/xdg-data`: `root=/tmp/xdg-data/ai-test-engineering`,
  `config=/tmp/xdg-data/ai-test-engineering/config/config.json` (ayni native root).
- Windows tarafinda bosluk/Unicode path kapilari mevcut testlerde (w09/p08-runtime-paths) korunur.
- macOS makine kaniti: NOT_RUN (macOS host yok; darwin yolu unit test'te kapsanir).

## PP43 - worker/model/dependency/Docker readiness ayrimi (KAPANDi - gercek Docker probe)

- `tests/security/fin02-capability.test.ts` gercek Docker capability probe 4/4 PASS: source write denied,
  host secret isolated, network egress denied, non-root, memory limit, `capability_verified=true`;
  `CustomerRunnerFactory.ensureVerified` -> kind=docker, `host=null` (host fallback yok).
- Readiness ayrimi: install `NOT_READY` (PP41 yukarida) + worker flag/profile env'i yalniz acikca
  verildiginde entry'ne gider; worker kapaliyken dispatch `TARGET_NOT_MET_BLOCKED` + `WORKER_DiSABLED`
  (kaynak dogrulandi: `job-dispatcher.ts:608-613`, `candidate-loop.ts:614-623`).
- Docker capability yoksa probe fail-closed (BLOCKED_iSOLATiON / BLOCKED_DEPENDENCiES /
  BLOCKED_EGRESS_ENFORCEMENT_UNAVAiLABLE) - kod + mevcut testler; bu host'ta Docker mevcut oldugu icin
  negatif Docker yolu bu oturumda yeniden kosulmadi (onceki P04 kanitlari gecerli).

## PP44 - upgrade/migration/backup/restore/rollback/uninstall (gercek uninstall e2e + yerel testler)

- Gercek uninstall e2e (PP41 store): owned entry + owned config hash kontrolu ile kalindi; backup
  olusturuldu; diger ayarlar ve runtime verisi korundu (yukarida).
- Upgrade/migration/backup/restore: mevcut gercek `better-sqlite3` unit entegrasyonlari
  `tests/unit/p08-upgrade-restore.test.ts` (3/3) + `fin11-lifecycle-ops` (lifecycle/backup/restore 15/15
  odak kosusu): migration re-open idempotent + son trusted job/artifact korunur; aktif job varken
  quiesce gate; online backup (DB + blob manifest) restore'da integrity/schema/blob check.
- Gercek binary upgrade/rollback e2e (surum atlayi ile calisan install -> upgrade -> geri): NOT_RUN
  (ayri runtime kaniti; bu host'ta surum atlamasi simule edilmedi).

## Odak ve tam suite durumu (truthful)

- P07/P08 odak suite (18 dosya: p08-runtime-paths, p08-upgrade-restore, p07b-report06-surfaces,
  p07-report-projection, p07b-report06-evidence, p07-report-path-authority, p07b-runtime-evidence,
  w09-install, fin11-lifecycle-ops, w06-facts-contract, w07-export, p01-release-gate, p04-isolation-policy,
  domain, failclosed, p03-checkpoint-identity, p02-dispatch-cleanup, p05-target-resolver): 176/176 PASS.
- Yeni browser e2e: 4/4 PASS. fin02 gercek Docker: 4/4 PASS.
- `npm.cmd run typecheck`: PASS. `npm.cmd run lint`: 0 error (90 mevcut warning; onceki 89 + yeni test
  dosyasinin 1 mevcut-kural uyarisi). `npm.cmd run build`: PASS.
- Tam suite bu oturumda yeniden kosulmadi (kullanici talimati: gereksiz full suite yok). Onceki P09
  kaydi (70 dosya, 620/620) tarihsel olarak gecerli kalir; yeni 4 test ile toplam test dosyasi sayisi
  71'ye cikmistir (bu oturumda tam kosu ile yeniden sayilmadi).

## Kalan NOT_RUN/BLOCKED (acik)

- P07-B gercek MCP customer dispatcher (Docker) COMPLETED/Report06 runtime kosusu: provisioning
  egress enforcement yoklugu (BLOCKED_EGRESS_ENFORCEMENT_UNAVAiLABLE) + bos job cache volume'i
  nedeniyle henuz bu host'ta kosulmadi; onceki P04/P07 checkpoint'lerindeki NOT_RUN durumu korunur.
- PP44 gercek binary upgrade/rollback e2e: NOT_RUN.
- PP42 macOS makine kaniti: NOT_RUN (macOS host yok).
- PP07/PP08/PP09/PP14 iki-process, owned-container, Linux spawn ve hard-kill kanitlari: NOT_RUN (onceki).
- Canli pilot: `PAUSED_BY_USER`; full gate: `NO_GO` (evidence manifest eksik); production GO verilmedi.

## Sonraki tek somut is

- Docker egress enforcement (network policy/proxy) saglanirsa P07-B gercek customer dispatcher
  COMPLETED + Report06 export runtime kosusu (PP37 browser kaniti hazir; rapor yuzeyleri gercek).
