# Checkpoint: AITE-REMEDIATION-002 D01 - Installer konfigurasyon koruma + PS1'siz kurulum

- Tarih: 2026-10-10
- Asama: D01

## Yapilan is

1. **config-merge.ts** (src/configuration/config-merge.ts): mergeConfigRecord (minimal merge; yalniz record_path'teki kaydi degisir, diger ust alanlar korunur); stripJsonComments (JSONC yorumlari, stringleri koruyarak); atomik temp+rename; preimage/postimage SHA-256; kalici backup (backup_dir); merge dogrulama + rollback; sentinelHash; removeConfigRecord.
2. **install.mjs / verify-install.mjs / uninstall.mjs** (scripts/): PS1'siz Node.js kurulum girisleri; cmd.exe uzerinden `node scripts/install.mjs` ile calisir. Install: prerequisite + npm install/build + runtime dizinleri + config + **minimal merge** + MCP handshake smoke. Verify: prerequisite + dist + runtime + config + smoke. Uninstall: yalniz sahipligi bilinen girdi (removeConfigRecord + backup), runtime veri otomatik silinmez.
3. **mcp-handshake-smoke.mjs** (scripts/): gercek stdio server + initialize + tools/list + tools/call dogrulamasi (kurulumun baglanti kaniti).
4. **Kritik bulgu ve kurtarma:** uninstall denemesi mevcut opencode.json'daki `innova-atlassian` kaydini sildi (uninstall aitesi onceki hatali backup'i kullandi). Backup zincirinde de yoktu (install.ps1 mcp=null hatasindan once kaybolmustu). Kullanici oturum kaydindeki orijinal degerle geri eklendi: `zekam mcp serve innova-atlassian` + env referanslari.

## Dogrulama

- install.mjs: exit 0, KURULUM TAMAMLANDI; minimal merge (backup'li, idempotent: tekrar cagri degisiklik yapmiyor); korunan ust alanlar `$schema, snapshot, enabled_providers, provider, small_model, model, autoupdate, mcp`.
- innova-atlassian korunuyor: mcp keys `["innova-atlassian","ai-test-engineering"]`; provider/model/enabled_providers ayni.
- verify-install.mjs: exit 0, DOG RULAMA TAMAM.
- uninstall.mjs: exit 0; yalniz ai-test-engineering girdisini kaldiriyor + backup; diger ayarlar korunuyor.
- mcp-handshake-smoke.mjs: exit 0.

## Onemli bulgular

- PS 5.1'de native STDERR + `ErrorActionPreference=Stop`: `npm notice` ciktisi exception'a ceviriyor (D01 bulgusu, install.ps1'de de duzeltildi).
- Node 20+ spawnSync'te `.cmd` dosyalari `shell:false` ile EINVAL; `shell:true` (win32) veya `cmd /c` ile cagirilmali.
- PowerShell'ten `node -e` ile `process.argv[1]` undefined; ESM scriptlerde argv tabanli self-check guvenilmez, dogrudan `process.exit(main())` kullanildi.
- JSON string escape: tool sonucu text content'te `\"status\":\"ok\"` olarak geliyor; ham `"status":"ok"` includes calismaz.

## Sonraki adim

- D02: test_start'i CandidateLoop'a dispatch (8 arac: test_resume/test_cancel/test_result/test_apply MCP yuzeyine); gercek orkestrasyon.
- install.ps1'in mcp=null islemi duzeltildi mi kontrol: guncel dosyada `Add-Member -Name mcp -Force -Value $null` kaldirildi mi (D01 regresyon testi).
