# Windows native production teslimi

Karar: kullanicinin Windows native OpenCode + MCP kurulumuna hazir. Kabul
kaydi: ../ai/acceptance/production-final.json. Test edilen kod 437b043:
148 dosya / 1261 test PASS, 0 atlama. Sonraki metadata commitleri bu kodu
degistirmez; main build ve kurulu MCP kimligi teslimde tekrar kontrol edilir.

## Dogrulama

- Genel Maven/JaCoCo olcumu, uygun dusuk coverage sinif onerileri ve secim
  beklerken model0; secimden sonra gercek GLM test uretimi.
- Sentetik canary: 1 dosya / 3 yeni test, 6/6 PASS, LINE11/11 ve BRANCH10/10;
  iki hedef de %80 idi. Asil proje korundu, model kimligi rapora tasindi.
- Kesinti/devam, repo degisimi, stale sonuc, kalici butce, cok hedefli
  checkpoint ve rapor kaynak/manifest koruma regresyonlari.
- Gercek tarayicida etkilesim/PDF/export ve 500 sinif/10000 test raporu.
- Izole temiz kurulum, idempotent upgrade, JSONC+BOM byte backup, ozel skill
  koruma; bozuk/disabled komut ve worker0 negatifleri; veri koruyan kaldirma.
  Dummy provider testi yerel konfigurasyon kanitidir; canli provider kaniti
  ayri gercek GLM canary kosusudur.
- Agir hash okumasi DB writer'i bekletmez; response assembly tutarlilik
  kilidi korunur. 10k kanitta sorgu saniyeler alabilir; polling'i araliksiz
  donguye cevirmeyin. Tek makine olcumleri kapasite veya SLA garantisi degil.

## Kurulum

1. Onayli main checkout'unu alin. Devam eden isleri pause edip OpenCode/MCP'yi
   kapatin; upgrade oncesi operations.md backup prosedurunu uygulayin.
2. CMD'de `node scripts/install.mjs`. Node24+, OpenCode ve projeyle uyumlu
   yerel Maven/JDK gerekir. Docker, WSL veya PS1 onkosulu yoktur.
3. configuration.md ile worker_profiles, provider/model ve yetkili proje
   koklerini ayarlayin. Ilk worker explicit `AITEST_WORKER_ENABLED=1` ile
   acilir; upgrade kayitli worker/custom ortam ayarlarini korur.
4. `node scripts/verify-install.mjs` basarili olmali. READY/CONFIGURED yerel
   model bagidir; canli provider yetkisi ilk gercek istekte de dogrulanir.
5. OpenCode'u Java projesinin gercek dizininde yeniden acin. Ornek istek:

   > Once genel coverage'i cikar ve uygun siniflari oner. Ben secince satir
   > ve dal icin %80 hedefle test uret, mevcut testleri koru ve sonucu dogrula.

Sonucu gercek outcome/verification/coverage/test sayilariyla kabul edin.
TARGET_NOT_MET veya BASELINE_FAILED basari diye sunulmaz. `test_apply`
varsayilan preview'dir; asil repoya yeni test eklemek icin plan kimligine
sabitlenmis apply ve OpenCode insan formu onayi ayri karardir. APPLIED ancak
uygulanan asil projenin hash-dogrulanmis owned kopyasindaki tum proje
testleri PASS oldugunda verilir (`FULL_PROJECT_SNAPSHOT`). Basarisiz veya
iptal edilen dogrulama kendi degismemis dosyalarini geri alir; cakismalar
CONFLICT/RECOVERY_REQUIRED ile acik kalir. Application kaniti generation
outcome/coverage olcumlerini yukseltmez. Native Maven Windows
hesabinin dosya ve ag yetkileriyle calisir; OS sandbox degildir.

Uygulama yalniz yeni Java test dosyasi ekler; mevcut dosyayi degistirmez.
Native atomik aktarim icin runtime ve proje ayni Windows volume'de olmalidir.
Belirsiz journal/surec sahipliginde kullanici dosyasi silinmez. `mode=recover`
eski islemi geri alir; yeniden uygulama icin yeni onay gerekir. Olusturulan bos
test dizinleri geri almada korunabilir. Schema10 uygulama defteri ekler;
upgrade oncesi DB+blob+jobs yedegi gerekir, eski surume yalniz DB dosyasini
geri tasiyarak donulmez.

## Isletim

%99.99 hatasiz islem bir isletim hedefidir; test paketi veya bir canary bu
orani kanitlamaz. Gercek kullanimda is sonuclari, kesinti kurtarma, sure ve
veri butunlugu izlenmelidir. Her sinifta %80 hedefine ulasma garantisi yoktur;
butce ve test edilebilirlik sonucu etkiler.

Lint 89 mevcut uyari / 0 hata; bu teslimde artirilmadi. CI kapali. Bu kabul
aktif 009 Windows MCP kapsamidir; eski 006/391 full verifier GO karari bu
kaynak icin yeniden verilmedi. `--local` kendi basina production onayi
sayilmaz. Nihai yayin/tag/deploy (G3) kullanici kararidir.

Hata halinde job_id, stop code, rapor ve runtime loglarini guvenli alanda
koruyun. DB/blob/jobs verisini backup/restore proseduru olmadan silmeyin.
