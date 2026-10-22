# Yerel test muhendisligi ekrani teslimi

## Kapsam

Kullanici onayli AITE-LOCAL-UI-008. Mevcut MCP motoruna yerel browser UI: proje/JaCoCo genel analiz/onerilen sinif secimi/ayri line-branch hedefi/model secimi/test uretimi/gercek durum ve gecmis/dogrulanmis rapor ve patch. Yeni runtime dependency yok. npm run ui;127.0.0.1:4317, AITEST_UI_PORT istege bagli. Acilis calisma baslatmaz. Mevcut OpenCode config kullanilir; worker UI'da acik, AITEST_WORKER_ENABLED=0 ile kapatilabilir. Gercek caller eylemi olmadan Maven/model cagrisi yok; ozgun checkout'a otomatik test apply yok.

## Kaynak ve degisiklikler

- Kod ef073cab3617eedb32c9f2bbecb40ac02bf491ad. src/ui/backend/server/client/page/entry; package.json ui komutu. HTTP fixed endpoints, loopback, Host/Origin/session/CSRF/body64KiB, CSP ve hash/manifest/realpath sinirli rapor sunumu. Windows stored root/allowlist normalizasyonu adapter'da; eski MCP politikasi degismedi.
- CoverageGoal optional branch_percent, eski percent fallback korunur.80.01/70.01 ->8001/7001 DB/goal. Iki ondalik floating point karsilastirma sorunu RED->GREEN. Test_start mevcut scan/source/selector kapilarini kullanir, client project_root'undan uretim baslatmaz.
- Onceki007 arsiv SHA5bae0f670e721095741af261017e366d7ee63c596109476a76b8e58249709249; -text korumasi. Eski Report06/07 referanslari ve rapor akisleri korunur. Sonraki kapanis commit'i yalniz ai/ kabul/handoff kayitlaridir.

## Dogrulama

- Build tree21deb7ac843b19f05f0d4afefbf2a50358b4b0fb5cc6fd9cb890d88e7942f91b; buildinput40eb00ebef3e18cef7463cb967dedc1629244cd0401932249b95558bc61dfc73.
- Tam suite131/131 dosya1058/1058 PASS, exit0,536.20s,maxWorkers=1. AITEST_BROWSER_PACKAGES acik, eskiAC67 private model artifact'i girdi, yeni model kosusu yok. Private Temp/local-ui-full-suite.log SHA97143280c8b0cafd118dc5ad790b9a2f9910387540a47c28822022d92993fc1a.
- Odak5dosya20test PASS; bagimsiz finalreview4dosya19test PASS/bulgusuz. Typecheck/build/local gate PASS; lint0error89warning. Yeni U01..U08 LOCAL_VERIFIED; eski391 Windows full GO aktarilmadi.
- Gercek headless Edge sentetik workflow: analizden once uretim yok, explicitradioSpace/Tabfocus,80.01/70.01 girdi, running/completed, rapor popup, history10sayfalama, refreshpersistence, geciken proje cevabi,420+karakter/XSS ve mobile overflow PASS. JSerror0external0. Private %LOCALAPPDATA%/ai-test-engineering/pilot/local-ui-20261022: empty/selection/result desktop, selection/result mobile PNG ve result.json SHA4e939e79d780af08128e71e28f4ff3ed9813f0bf794fa1f9a6d9bd8c8dba55da.
- Ayni UI onceki job3ab26d26 readonly SQLite ve verified Report07 kopyasiyla acildi:8/8 test, LINE7/11->11/11, BRANCH5/10->10/10, error0. Private existing-job-desktop.png; receipt SHA259857e11bd1359f6a91cb4b026bf258965fb503dd24ff2468c3d438f7c58c1e. Yeni Maven/model yok.

## Gercek sinirlar ve devam

- Motor ara iterasyonlar icin rawcounter saklamiyor. UI live lifecycle/events sunar; egri yayin sonrasi dogrulanmis Report07 baseline/final rawcounter'lardan gelir. Eksik ara yuzde veya genelproje ile hedefsinf karisimi yok. Eski Report06'da baseline yoksa yalniz var olan final DB noktasi gosterilir.
- Refresh/DB gecmisi var; paused/kesilmis is otomatik resume edilmez. Calisirken serverterminali acik tutulur. Sky skipTests konusu sonraki ayri is, bu kapsamda POM/customer degisikligi veya canli pilot yapilmadi. Docker/macOS/CI kapsam disi/kapali.
- Son adim: kapanis kayitlari commit; main fast-forward, main build/local gate/MCP smoke, atomic main+feature push ve remote HEAD dogrulama; yerel ekrani ac. Ana dalda kullaniciya ait ai/handoffs/2026-10-14-g1-mcp-target-met.md ve java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java korunur.
