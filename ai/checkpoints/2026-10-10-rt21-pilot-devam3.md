# Checkpoint: 2026-10-10 - RT21 pilot devam3 (worker izolasyon teshisi yarida)

## Gorev

- AITE-RUNTIME-ACCEPTANCE-003 v2.0; RT21/PRO56 sky_backend pilotu
- Onceki kayit: 2026-10-10-rt21-pilot-devam2.md (iki KRITIK BULGU duzeltmesi plani)
- Kullanici talimati: kaldigim yere checkpoint; "devam et" dendiginde ayni yerden surdur

## Tamamlanan isler (bu devirde, push edildi)

1. KRITIK BULGU 1 duzeltildi: job-dispatcher baseline asamasi artik buildVerifiedLoopRunner ile
   DockerMavenRunner yolunu kullaniyor (provisioning + izinli mirror; execution yine network:none).
   Commit: 9171338 (fix: baseline DockerMavenRunner uzerinden calisiyor ...)
2. KRITIK BULGU 2 kanitlandi: requestDigest idempotency_key'i ZATEN iceriyor (services.ts:314;
   39e9378'den beri). DB dogrulamasi: eski FAILED job digest'leri yeni key ile eslesmiyor.
   Yeni test: tests/contract/rt21-pilot-remediation.test.ts (7 test: AYNI payload+FARKLI key =>
   FARKLI digest; eski FAILED job yeni istegi engellemiyor).
3. Yeni bulgu (pilot 3. kosuda): worker server spawn EINVAL - opencode.cmd shell:false ile
   spawn EDILEMEZ (Node v24 CVE-2024-27980). Commit: a4bd45d (fix: worker server spawn EINVAL -
   .cmd shim yerine gercek opencode.exe). defaultWorkerServerManager artik gercek exe kullanir,
   bulunamazsa cmd /c shim (extraArgs).
4. npm test: 363/363 PASSED (43 dosya); release-verify.mjs exit 0; build/typecheck TEMIZ.

## Pilot kosulari (bu devirde)

- Kosu 1 (f1d99b37): FAILED generation, spawn EINVAL (a4bd45d oncesi)
- Kosu 2 (f760e3c1): FAILED generation, spawn EINVAL (a4bd45d oncesi)
- Kosu 3 (73d074c5): dispatch 300s; baseline_ok + analysis_ok gecti; generation MODEL_TIMEOUT
- Kosu 4 (640643a3): ayni; MODEL_TIMEOUT 300s
- Baseline artik BASELINE_FAILED vermiyor (duzeltme calisiyor; sky_backend buildPlan test_framework=none
  dondugu icin runBaseline NO_TESTS => exit 0 => baseline_ok gecildi)

## KESIN TESHIS (MODEL_TIMEOUT; yarida kalan teshis zinciri)

1. workerToolFlags ciktisi (worker-config.ts DEFAULT_DISABLED_TOOLS): bash/write/edit/patch/task/
   webfetch/grep/glob/list/read=false. 'question' ve innova-atlassian MCP araclari listede YOK.
2. Pilot kozunun kullandigi worker server (port 14096) config'i: mcp.innova-atlassian enabled:true
   (kullanici ~/.config/opencode/opencode.json'dan miras; --pure flag'i MCP config'i SILMIYOR).
3. Model (gercek davranis, diag-finish3.mjs): hedef sinif kaynak koduna erisemedigi icin
   Confluence/Jira'da arama yapiyor ("TLCSKY-9441 buldum ama kaynak kod yok"), sonra 'question'
   tool'u ile kullaniciya soru soruyor (state:running) -> session finish almıyor -> MODEL_TIMEOUT.
4. Iki katmanli cozum plani:
   a) worker-config.ts DEFAULT_DISABLED_TOOLS'a interaktif/MCP araclari ekle: question + confluence_*
      + jira_* + innova-atlassian araclari (allowlist mantigi: DEFAULT_ALLOWED_TOOLS bos kalmali).
   b) Worker server izolasyonu: XDG_CONFIG_HOME + XDG_DATA_HOME + XDG_CACHE_HOME + XDG_STATE_HOME
      worker'a ozel temp dizinlere cekilirse mcp keys BOS geliyor (diag-xdg.mjs: dogrulandi).
      OPENCODE_CONFIG tek basina YETMEZ (config merge; diag-isocfg.mjs: mcp miras kaldi).
      Provider/model tanimini XDG altindaki opencode/opencode.json'a tasimak gerekiyor
      (litellm + LITELLM_API_KEY {env:...} referansi; diag-xdg6.mjs: provider keys=litellm geldi).

## Yarida kalan nokta (devam et dendiginde buradan)

- diag-xdg7.mjs yazildi (C:\Users\mkaracan\AppData\Local\Temp\opencode\), CALISTIRILMADI:
  mcp izole + provider'li XDG ortaminda model cagrisinin neden bitmedigini debug log ile gosterecek.
  Cikti: diag-xdg5/6'da TAMAMLANDI alinamadi (finish=null; 60s'de bile assistant mesaji YOK).
  Suphe: XDG izolasyonunda LITELLM_API_KEY miras kaliyor (env spread) ama provider auth/auth.json
  (XDG_DATA_HOME altinda) bos oldugu icin model cagrisi sessiz hata veriyor olabilir; ya da
  prompt_async accepted ama model loop'u baska sebepten bekliyor. diag-xdg7'nin DEBUG log ciktisi
  bunu netlestirecek.
- Diag ortami notu: aitest-worker-iso4 dizini (XDG root) config'i litellm provider + model iceriyor;
  aitest-worker-iso7 dizini ayni config ile yazildi (diag-xdg7.mjs icinde).

## Kanitlar (bu devirde)

- Commit 9171338: baseline DockerMavenRunner + rt21-pilot-remediation testleri (363/363)
- Commit a4bd45d: worker server spawn EINVAL duzeltmesi
- diag-spawn.mjs: cmd-file shell:false THROW EINVAL; exe/cmd /c OK
- diag-worker.mjs: WORKER_HEALTH true + session olustu (a4bd45d sonrasi)
- diag-model.mjs: kisa prompt "Say OK" -> 2s'te cevap; usage input=9263/output=7 (model CALISIYOR)
- diag-role3/4.mjs: test_designer intro iceren promptlar 90-100s'te bile cevapsiz (kesintiye ugrayan akis)
- diag-role5.mjs: "Bu bir smoke testtir; kod uretme" eki 2s'te cevap; "rolo-sadece" 22.5s'te cevap
  VERDI ama AGENTS.md icerigini okudu ("Durumu okudum. Mevcut konum: Gorev...") -> session kullanici
  projesi baglaminda (workDir) agent akisina giriyor
- diag-finish2.mjs: assistant finish="tool-calls" mesajlari; son mesaj finish=null
- diag-finish3.mjs: 'question' tool state:running (model kullaniciya soru soruyor, yanit bekliyor)
- diag-cfg.mjs: port 14096 config mcp.innova-atlassian enabled:true (kullanici MCP'si miras)
- diag-xdg.mjs: XDG_CONFIG_HOME ayri dizin -> mcp keys [] (izolasyon CALISIYOR)
- diag-xdg6.mjs: XDG + OPENCODE_CONFIG -> mcp [] + provider litellm VAR; ama model cagrisi bitmedi
- DB: state.db test_jobs son kayit 640643a3 FAILED generation BLOCKED_ENVIRONMENT

## Devam adimlari (sira ile)

1. node diag-xdg7.mjs calistir; DEBUG log ciktisindan model cagrisinin neden bitmedigini netlestir
2. Cozumu uygula:
   a) worker-config.ts DEFAULT_DISABLED_TOOLS genislet (question + confluence/jira + MCP araclari;
      allowlist bos kalmali - K03/B02 politika korunur)
   b) worker-server-manager.ts: XDG_CONFIG_HOME/XDG_DATA_HOME worker'a ozel temp dizin; worker
      opencode/opencode.json (provider litellm + model + mcp:{}) o dizine yazilir (secret yazilmaz;
      {env:LITELLM_API_KEY} referansi korunur)
3. Test yaz: workerToolFlags yeni disabled araçlar; server manager izole XDG; flags'te question=false
4. npm test + release-verify.mjs
5. Commit (Turkce ASCII) + push
6. node rt21-pilot2.mjs: pilot yeniden; baseline_ok sonrasi generation'da model cevabi beklenir
7. Candidate kabul: staging/accepted dosyalar yalniz sky_backend src/test/java (PATCH_ONLY)
8. Coverage >= %90 hedefi; final replay + rapor kanitlari
9. Kabul matrisi + PROJECT_STATE + yeni checkpoint guncelle

## Sinirlar (degismedi)

- Production/POM degisikligi YASAK; yalniz sky_backend src/test/java altina yeni test dosyasi (PATCH_ONLY)
- Runtime veri (DB, blob, log) bu repoya yazilmaz; pilot script Temp\opencode altinda
- CI kapali (kullanici karari); secret degerleri repoya/config'ine yazilmaz ({env:...} referansi)
- Git kimligi: mehmet-karacan <karacan.mehmet@hotmail.com> (repo-local)

## Komutlar (kanitli)

- npm.cmd test -> 363/363 PASSED
- node scripts/release-verify.mjs -> exit 0
- node C:\Users\mkaracan\AppData\Local\Temp\opencode\rt21-pilot2.mjs -> pilot
- diag-*: ayni dizinde (spawn/worker/model/prompt/msg/finish/question/flags/server/cfg/iso/xdg)
