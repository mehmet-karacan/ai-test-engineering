# Windows native kurulum

Desteklenen yol CMD + Node.js 24+ ve yerel JDK/Maven kurulumudur. Docker, WSL veya PowerShell script calistirma izni gerekmez. Linux/macOS bu teslim kapsaminda degildir. Kurum policy ayarlarini degistirmeyin.

## On kosullar

Node.js 24+, npm, Git, OpenCode ve proje ile uyumlu yerel JDK/Maven gerekir. Terminalde `node --version`, `git --version`, `java -version`, `mvn.cmd -v` ve `opencode --version` ile kurulumlari kontrol edin. Maven/Java readiness urunun native dagitim kimligi ve version probe'u ile ayrica dogrulanir; yalniz PATH'te bulunmasi yeterli degildir.

## Kurulum

Repo kokunde CMD terminalinde:

```cmd
node scripts/install.mjs
```

Kurulum `npm ci` ve build yapar. Onceden kurulu MCP kullaniyorsaniz once devam eden isleri duraklatin ve OpenCode/MCP sureclerini kapatin; yuklu native moduller Windows'ta dosya kilidi olusturabilir. Upgrade oncesi DB/blob backup proseduru [operations.md](operations.md) icindedir.

Kurulum runtime dizinlerini ve eksikse config'i olusturur, mevcut config'i korur. OpenCode `mcp.ai-test-engineering` girdisini diger ayarlari koruyarak ve yedek alarak merge eder. `test-engineering` skill'i `%USERPROFILE%/.config/opencode/skills/test-engineering/SKILL.md` konumuna kurulur. Sahipligi kayitli ve degismemis eski skill guncellenir; once eski byte'lari backup'a alinir. Ozel veya kullanici tarafindan degistirilmis skill korunur ve backup yolu bildirilir; paket skill'i ile elle karsilastirip birlestirin. Tekrar kurulum ayni dosyalari degistirmez. Primary agent veya genel model izinleri kurulum tarafindan degistirilmez.

MCP handshake kurulum baglantisini dogrular. Model ve Maven readiness ayri raporlanir; `KURULUM TAMAMLANDI` tek basina generation veya production kabul kaniti degildir. Yeni skill icin OpenCode'u yeniden acin.

## Model ve proje ayari

Ilk kurulum worker'i acmaz; worker profilleri bostur. [configuration.md](configuration.md) icindeki profil, provider/model, yetkili proje kokleri ve explicit worker flag adimlarini tamamlayin. API key bu kurulumla yazilmaz; mevcut OpenCode provider ve secret referanslari kullanilir.

```cmd
node scripts/verify-install.mjs
```

Dogrulayici kayitli MCP/config/DB bagini, skill byte/hash eslesmesini, model yapilandirmasini, Maven capability probe'unu ve MCP handshake'i kontrol eder. Eksik veya farkli skill/model/toolchain `NOT_READY`/nonzero sonucudur. Bu kontrol canli model yetkilendirmesi veya tam release kabul testi degildir.

## Kaldirma

```cmd
node scripts/uninstall.mjs
```

Yalniz kayitli sahiplik hash'iyle eslesen dosyalar ve urunun MCP girdisi kaldirilir; degistirilmis skill/config korunur. Repo `dist/` kaldirilir. Runtime DB/blob/log gecmisi otomatik silinmez. PowerShell `install.ps1`, `verify.ps1`, `uninstall.ps1` dosyalari ayni Node girislerine yonlendiren uyumluluk wrapper'laridir.

## Ag ve offline ortam

Kurulum `npm ci` kullanir; kurumun onayli npm mirror/cache yapilandirmasini kullanin. Offline cache'in tamligini once ayri ortamda dogrulayin. Maven varsayilan calismasi offline'dir; bagimlilik hazirlama yalniz explicit onayli mirror profili ile acilir. Kurulum scripti otomatik toolchain veya provider kurmaz.
