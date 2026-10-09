# AKTIF_GOREV - AI Test Engineering

## Belge kimligi ve uygulama emri

- Gorev kimligi: AITE-FOUNDATION-001
- Belge surumu: 1.0
- Hazirlama ve arastirma tarihi: 2026-10-09
- Hedef repository: `https://github.com/mehmet-karacan/ai-test-engineering`
- Hedef: OpenCode uzerinden kullanilan, kalici hafizali, test-only calisan bagimsiz test muhendisligi MCP urununu uctan uca gelistirmek.
- Teslim bicimi: Tek onayli gorev, icinde dogrulanabilir uygulama asamalari. Sadece iskelet, tasarim, prompt paketi veya demo teslim etmek bu gorevi tamamlamaz.
- Kullanici arayuzu: Mevcut OpenCode CLI/TUI. Yeni kullanici CLI'i ve web UI gelistirilmeyecek.
- Git kimligi: `mehmet-karacan <karacan.mehmet@hotmail.com>`.
- Yeni Git commit mesajlari ve projeye ait Turkce aciklamalar Turkce ASCII yazilacak. Teknik kimlikler ve kullanici kaynak dosyalari donusturulmeyecek.

**Uygulayici modele talimat:** Bu belgeyi yalniz ozetleme. Repository'nin gercek durumunu kontrol et, gelistirme hafizasini kur ve asagidaki sozlesmeye uygun urunu uygula. Her asamayi gercek testlerle dogrula. Kesinti olursa kayitli kanitlardan devam et. Kapsami kendiliginden daraltma, yeni urun kapsami ekleme veya eksik entegrasyonu basarili ilan etme.

**Iki farkli kod alani:** Buradaki production korumasi, urunun TEST_ONLY goreviyle uzerinde calistigi MUSTERI/JAVA PROJESININ kaynaklari icindir. Bu MCP urununu gelistirirken `ai-test-engineering/src/`, kendi build dosyalari, yardimci Java modulu ve kendi testleri elbette olusturulacak/degistirilecektir. Bu ayrim gelistirmeyi engelleyen genel bir yazma yasagina donusturulmemelidir.

### Ilk okuma sirasi

1. Bu belgenin 1-5. bolumlerini ve 22. bolumdeki bitis kriterlerini oku.
2. Mevcutsa `AGENTS.md`, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, son handoff ve Git durumunu oku.
3. Yeni kurulumda 18. bolumdeki gelistirme hafizasini kur; mevcut kayitlari ezme.
4. 19. bolumdeki asamalari sirasiyla uygula; ilgili teknik bolumleri ihtiyac halinde yeniden oku.
5. 20. bolumdeki kabul matrisi ve 23. bolumdeki kaynak kayitlari, uygulamanin referansidir.

Bu belgedeki teknik API ornekleri urunumuzun TASARLANACAK sozlesmeleridir; OpenCode veya MCP SDK'sinin var oldugu varsayilan metotlari degildir. Dis SDK cagrilarinda gercek kurulu surumun tipleri ve resmi belgeleri esas alinacaktir.

---

## 1. Dogrulanmis baslangic durumu ve gizlilik

### 1.1 Repository incelemesi

2026-10-09 tarihinde GitHub connector ile repository metadatasi ve kok icerigi kontrol edildi. Repository boyutu 0, varsayilan dal bilgisi `main`, gorunurluk `public`. Kok icerik sorgusu `This repository is empty.` sonucunu verdi. Dolayisiyla incelenecek mevcut uygulama, README, AGENTS veya son commit bulunmuyordu. Henuz olusmamis dal icin commit SHA uydurma. Bu belge hazirlanirken repository'ye yazma, commit, push veya gorunurluk degisikligi yapilmadi. [S01]

Uygulayici calismaya basladiginda yeniden kontrol eder. Arada kaynak kod eklenmisse korur, mevcut mimariyi analiz eder ve bu goreve gore eksiklerini tamamlar. Bos repository varsayimiyla kullanici dosyalarini silmez.

### 1.2 Public repository siniri

Repository public oldugundan su icerikler Git'e, CI artifact'lerine veya issue'lara otomatik gitmeyecek:

- Gercek kurum ici API adresleri, kurum ici duyuru gorselleri, model yetki dokumleri ve kullaniciya ozel OpenCode/LiteLLM ayarlari.
- API key, bearer token, parola, Maven settings kimlik bilgileri, TLS ozel anahtarlari, ortam degiskeni dokumleri.
- Musteri projelerinin kaynak kodlari, gercek testleri, local path listeleri, SQLite DB, runtime loglari ve kaynak icerebilen JaCoCo HTML raporlari.
- Gercek projelerden alinmis prompt/response, patch, checkpoint veya CI loglari.

Kodda genel ve sentetik ornekler kullan. Yerel ozel konfigrasyonu kaynak repository'si disinda sakla. Public gorunurlugu kendiliginden degistirme. Kurum ici bilgi yayinlanmasi gerekiyorsa once kullanicidan ayri karar al. Bu urunun public olmasi, kurum verisini dis modele gonderme yetkisi vermez.

### 1.3 Kesinlestirilen urun cumlesi

> Kullanici, yetkilendirilmis Java projesinde OpenCode'u acar ve "PaymentService icin coverage %90 olsun" der. Sistem projeyi ve sinifi dogru bulur; sadece test olusturur veya gelistirir; Maven/JUnit/JaCoCo ile sonucu olcer; hedefe kadar kontrollu iterasyon yapar; kesilirse ayni gorevden devam eder; sonunda gercek sonucu ve kanitlarini sunar.

Kurulum/onay/prerequisite ihtiyaci ile gunluk kullanim ayridir. Bir defalik guvenli kurulum yapilmadan herhangi bir makinede sifir ayarla calisma garantisi verilmez. Normal test gorevinde kullanicidan komut dizisi, framework surumu, JaCoCo XML yolu veya elle checkpoint yonetimi istenmez.

---

## 2. Degismeyecek urun kurallari

| ID | Kural |
| --- | --- |
| R01 | Zekam'dan bagimsiz repository, uygulama, veri deposu ve kurulum. GPU/SKY/kurum projesi adlarini is mantigina gomme. |
| R02 | Kullanici mevcut OpenCode CLI/TUI'yi kullanir. Ayrica `aitest run` gibi bir urun CLI'i, React dashboard veya IDE eklentisi yazma. |
| R03 | Urun, gercek orkestrasyon ve kalici durum yoneten MCP uygulamasidir; sadece SKILL.md veya modelin sozlu planindan ibaret degildir. |
| R04 | Musteri projesinde production kaynaklar, production kaynak dosyalari disindaki davranis etkileyen kaynaklar, POM/build ve coverage politikalari degismez. |
| R05 | Yalniz dogrulanmis test koklerinde yeni test veya mevcut test iyilestirmesi. Mevcut basarili testler silinmez, disable edilmez, anlamsizlastirilmaz. |
| R06 | Test sonucu ve coverage, modelin beyanindan degil guvenilir runner'in gercek ciktilarindan hesaplanir. |
| R07 | Yalniz yuzde verildiginde varsayilan secili hedef basina LINE ve uygulanabilir BRANCH hedefidir. Hedef, proje ortalamasi ile gizlenmez. |
| R08 | Hedef saglanmazsa dusuk sonuc basari gibi sunulmaz. Son dogrulanmis iyilestirme korunur; engel/belirsizlik/deneme kaniti raporlanir. |
| R09 | Oturum, model, baglanti veya makine kesintisinden sonra kalici job/checkpoint ile devam zorunludur. |
| R10 | SQLite proje baglantilarini, kod/test envanterini ve is gecmisini tutar. Buyuk ciktilar hash'li artifact deposunda saklanir. |
| R11 | Runtime veri ve musteri proje kopyalari product repository'sinin ve hedef repository'nin disinda, kullaniciya ozel yerde kalir. |
| R12 | Urunun AI ile gelistirme gecmisi repository icindeki `ai/` altinda tutulur. Runtime hafizasiyla karistirilmaz. |
| R13 | JaCoCo'yu MCP calistirir; kullanicinin IDE'den coverage calistirmasi gerekmeyecek. |
| R14 | OpenCode sonucu + offline HTML muhendislik raporu + JSON + ham JaCoCo/test/diff/checkpoint kanitlari uretilir. |
| R15 | Model/provider kimlikleri konfigure edilir; ayni gorev baska yetkili modelle devralinabilir. Dis saglayiciya sessiz fallback yapilmaz. |
| R16 | Ilk teslimat cok modullu Maven, dogru sinif cozumu, regresyon korumasi ve test kalite denetimini icerir. |
| R17 | Kullaniciya ait dirty/untracked dosyalar korunur. Otomatik stash/reset/clean, kaynak repo'ya otomatik commit/push yoktur. |
| R18 | Tek kapsamli teslimat; asamalar sadece gelistirme ve checkpoint duzenidir. Eksik ana ozellikler 'sonra yapilir' diye kapatilmaz. |
| R19 | Guvenlik yalniz prompt'a veya OpenCode izinlerine dayanmaz; model ciktilari ve calistirilan kod guven sinirlarindan gecirilir. |
| R20 | Modelin gizli dusunce zinciri istenmez/saklanmaz. Devam icin acik plan, karar gerekcesi, kanit ve siradaki eylem yeterlidir. |

Hedefe ulasmak R04/R05/R06/R19 kurallarini asma gerekcesi degildir. Production refactoring sadece AYRI bir kullanici onayli gelistirme isi olabilir; bu urunun test gorevi onu otomatik uygulamaz.

---

## 3. Arastirma bulgulari ve alinacak tasarim kararlari

Bu bolumdeki dis kaynak gozlemleri arastirma sonucudur. Bunlardan sonra verilen secimler bu urune ait tasarim kararlaridir; dis projelerin ayni kurumsal garantileri verdigi iddia edilmez.

### 3.1 Gercek uygulamalarla karsilastirma

| Kaynak | Dogrulanan yaklasim | Urune alinacak fikir | Dogrudan alinmayacak kisim |
| --- | --- | --- | --- |
| CoverUp | Python tarafinda eksik coverage bolgesine gore aday uretme, test calistirma, hata/coverage geri beslemesi ve checkpoint kodu var. [S02] | Coverage-gudumlu kucuk hedefler, basarisiz deneme hafizasi, gercek kazanima gore aday kabul. | Python motorunu Java'ya hazir cozum sayma. Incelenen kaynakta test devre disi birakma ve eksik import kurma yollarini aktarma. |
| ChatUniTest | Java icin generate/validate/repair ayrimi, package/import onarimi ve coverage geri beslemesi var. [S03] | Java baglami, sinirli deterministik onarim, derleme hatasini sonraki denemeye tasima. | POM'a baglanan dogrudan urun bagimliligi yapma. Incelenen COVERUP sinifinda coverage analizi exception'inda `true` donen yol bizim dogrulamamizda basari olamaz. |
| TestWeaver | Repository, Python deneyleri icin execution feedback, slicing ve hedefe yakin test secimini anlatiyor. [S04] | Kalan bosluga odakli baglam, onceki en yararli adayi yeniden kullanma, anlamsiz tekrarlarin azaltilmasi. | Python trace/slicing altyapisinin Java'da hazir oldugunu varsayma. JaCoCo XML'den olmayan execution trace'i uydurma. |
| Meta TestGen-LLM | Mevcut testleri gelistirme ve uretilen adaylari gercek calistirma/coverage filtrelerinden gecirme yaklasimi. [S05] | Aday uretimi ile kabul kararini ayir. | Makaledeki basari oranlarini kurum ici modellerimizin performans tahmini olarak kullanma. |
| Qodo Cover | README bakimin 2025-06-15 itibariyla surdurulmedigini belirtiyor. [S06] | Genel coverage feedback fikrine ek referans. | Bakimi duran projeyi cekirdek bagimlilik/fork tabani olarak secme; lisans/guvenlik denetimi olmadan kod kopyalama. |

Incelenen somut dosya/icerik SHA'lari 23. bolumdedir. Bunlar Git blob SHA'laridir; repository commit SHA'si diye etiketleme.

### 3.2 OpenCode ve MCP icin kritik uyumluluk bulgusu

OpenCode'un resmi SDK'si server/client ve session API'lerini sunuyor. Bu hazir ajan motoru kullanilacak; yeni genel amacli kod ajani yazilmayacak. SDK ve server surumleri birlikte dogrulanacak. [S07]

2026-07-28 MCP degisiklikleri yeni protokol davranislarini ve Tasks'in ayri uzantiya tasinmasini iceriyor. Resmi TypeScript SDK ana dali v2 paketlerini belgeliyor. Buna karsilik bu arastirmada OpenCode `dev/packages/opencode/package.json` dosyasinda `@modelcontextprotocol/sdk: 1.29.0` goruldu. Bu, kullanicinin yuklu binary surumunu kanitlamaz fakat 'en yeni MCP SDK her OpenCode ile otomatik uyumludur' varsayimini gecersiz kilar. [S08][S09][S10]

**Karar:** Is mantigindan bagimsiz, ince MCP transport adapter'i yaz. OpenCode icin dogrulanmis 2025-11-25/v1 uyumluluk profili ve yeni protokol icin v2 stdio profili ayni typed tool registry'yi kullansin. Paket isimlerini ve protokol yasam dongulerini karistirma. Iki profil de contract testlerinden gececek. Kullaniciya ayri CLI sunulmadan kurulumun sectigi server entrypoint/config ile profil belirlenebilir. Otomatik protokol algilama yazilacaksa resmi SDK destegi ve gercek test kaniti gerekir; elle uydurulmus initialize/discover melez protokol yazma.

Is hafizasi MCP session/task uzantisinda olmayacak: `job_id`, checkpoint ve durum bizim storage katmanimizdadir. Tasks/Sampling/Roots desteklenmese de ana islevler calisir. Proje yolu typed tool parametresiyle acik aktarilir. SSE baglantisini yeniden acmak, urun job'unu yeniden baslatmak anlamina gelmez.

### 3.3 Guvenlik ve olcum karari

OpenCode SECURITY.md, izin sisteminin sandbox olmadigini acikca soyluyor. Bu nedenle 'production'a dokunma' prompt'u ve Git worktree tek basina guvenlik siniri kabul edilmeyecek. [S11]

JaCoCo bytecode tabanlidir; satir bilgisi debug metadata'sina baglidir ve exception handling BRANCH sayaci degildir. Surefire agent baglantisi, argLine ve fork ayarlari olcumu etkiler. XML/HTML uretmek tek basina dogru olcum yapildigini kanitlamaz. [S12][S13][S14]

**Karar:** Degismez kaynak snapshot'i + aday test degisiklikleri + izole calistirma + gercek bytecode/rapor provenance'i. Guvenilir coverage yoksa hedef saglanmis sayilmaz. Guvenlik kabiliyeti yoksa fail-closed preflight, production koduna yazilabilir host fallback degil.

### 3.4 Teknoloji secimi

| Alan | Secim | Gerekce/uygulama kurali |
| --- | --- | --- |
| Uygulama | TypeScript strict + Node.js 24 LTS ailesi | OpenCode TS SDK ve resmi MCP SDK ekosistemi. Patch surumunu uygulama basinda destek/guvenlik durumuyla sabitle. [S15] |
| MCP | Resmi TypeScript SDK, izole v1/v2 adapterleri | OpenCode uyumlulugu ve yeni protokol gecisini is motorundan ayir. |
| DB | SQLite + `better-sqlite3`, tek storage adapter'i | Yerel, transaction tabanli kalici durum; native binary uyumlulugunu Windows/Linux'ta test et. [S16] |
| Semalar | Zod + uretilen JSON Schema | Model ciktilari, tools, config ve artifact surumlerini dogrula. |
| Java analizi | Urune ait kucuk JavaParser yardimci modulu | AST, imza ve kontrollu symbol resolution; siniflari regex ile tahmin etme. Kutuphane hedef projenin POM'una eklenmez. [S17] |
| Build/test | Hedef projenin Maven/JUnit/Mockito yapisi | Musteri framework'unu otomatik yukseltme veya degistirme yok. |
| Coverage | JaCoCo XML sayaclari + ham exec/HTML | Hesap deterministik; HTML modeli karar veren olcum araci degildir. |
| Test izolasyonu | OCI uyumlu, non-root, kisitli runner; Windows'ta onayli WSL2/container ortami | Kaynaklar read-only; yalniz build/test output/tmp alanlari yazilabilir. Kurulumda kabiliyet dogrulanir. [S18] |
| Model calistirma | Kontrollu OpenCode worker adapter'i | LiteLLM'e mevcut provider uzerinden erisim. Ayrica genel LLM agent framework'u yazma. |
| Rapor | Statik HTML + JSON + ham artifact'ler | Tarayicidan yerel acilir; React/backend dashboard gerektirmez. |
| Urunun testleri | TypeScript test runner'i + Java fixture projeleri + MCP contract testleri | Gercek Maven/JaCoCo ve fault injection zorunlu. |

Bu secimler icin tum patch surumlerini burada tahmin ederek yazma. Ilk asamada kullanilabilir stabil surumleri lockfile, toolchain manifesti ve kanitli uyumluluk matrisiyle sabitle. Degisiklik gerekiyorsa gerekceli ADR yaz; urun sozlesmesini daraltma.

---

## 4. Ilk tam teslimatin kapsam siniri

### 4.1 Zorunlu olarak calisacaklar

- Tek veya cok modullu Maven projelerinde kaynak, modul, package, sinif ve mevcut testlerin kesfi.
- Bir veya birden fazla acik hedef sinif; modul/package hedefinin mevcut somut sinif listesine cozulmesi. Buyuk kapsamda hedef sayisi gosterilir ve butce/talep netligi kontrol edilir.
- Mevcut JUnit 4/5 altyapisiyla test uretimi ve iyilestirme; Mockito yalniz projede mevcut ve desteklenen ise kullanilir.
- Otomatik baseline, analiz, senaryo tasarimi, aday test gelistirme, onarim, test, coverage, kalite denetimi, regresyon ve raporlama.
- Siki test-only koruma; degismez kaynak kopyasi; kontrollu fixture degisiklikleri.
- Proje baglantilari ve kod/test envanteri iceren SQLite; versiyonlu artifact deposu.
- Kalici job, lease/fence, checkpoint, guvenli durdurma, model degisimi ve kesintiden devam.
- Hedef, sinir, plateau, kaynak degisikligi, altyapi eksigi ve kalite sorunlarini ayiran durma kararlari.
- Yerel offline HTML/JSON/JaCoCo/test/diff ciktilari ve onayli test uygulama yolu.
- Windows kullanicisi ve Linux ortaminda kurulum/entegrasyon dogrulamasi; desteklenen runtime'lar acikca belgelenir.
- Kisa OpenCode kullanim skill'i/agent tanimi; tum is motorunu prompt'a tasimaz.
- Urun gelistirmesi icin `AGENTS.md` + `ai/` sureklilik duzeni.

### 4.2 Bilincli olarak bu gorevin disinda

Yeni CLI/UI, Zekam entegrasyonu, merkezi cok kullanicili SaaS, uzak paylasimli SQLite, Kubernetes platformu, Jenkins/PR botu, otomatik production refactoring, baska programlama dillerinin test uretimi, canli musteri DB'sine baglanma, browser/E2E test platformu bu goreve eklenmeyecek.

Gradle test yurutucusu ve tam PIT/mutation orkestrasyonu da bu teslimatin zorunlu cekirdegi degildir. Gradle projesi sessizce Maven sanilmaz; `UNSUPPORTED_BUILD_SYSTEM` raporlanir. Var olan mutation raporunu opsiyonel artifact olarak referanslamak mumkundur; calistirilmadiysa mutation quality 'dogrulandi' yazilmaz. Gelecek adapter arayuzleri tasarlanir, sahte implementasyonlarla destek iddia edilmez.

Java/JDK uyumlulugu fixture matrisiyle kanitlanir. En az Java 8/JUnit4, Java 17/JUnit5 ve Java 21/cok modul senaryolari hedeflenir; her hedefin toolchain'i kendi build kurallarina uyar. JavaParser yardimcisinin JDK'si, musteri projesinin bytecode hedefini degistirmez. Desteklenmeyen language feature veya eski plugin kombinasyonunda acik tani sonucu verilir.

---

## 5. Kullanici akisinin tam sozlesmesi

### 5.1 Bir defalik kurulum

Kurulum; urunu kullaniciya ozel yerel konuma yerlestirir, uyumlu server paketini secer, OpenCode MCP baglantisini mevcut konfigrasyonu ezmeden ekler. Java/Maven/runner/OpenCode/model/prerequisite kontrollerini yapar. API key repoda veya kurulum ciktilarinda yazilmaz. Degisiklikten once konfigurasyon yedegi alinir; uninstall sadece urunun sahipligi bilinen girdilerini kaldirir.

MCP server executable'i, kurulum scripti veya OpenCode `serve` kullanimi yeni kullanici CLI'i sayilmaz. Kullaniciya yeni bir test komut dili ogretme. Normal kullanim mevcut OpenCode icinde dogal dildir.

### 5.2 Normal test gorevi

1. Kullanici Java projesinde OpenCode'u acar ve hedefini soyler.
2. OpenCode kisa tool aciklamasi/skill yardimiyla `test_start` cagrisi yapar. Proje kokunu mutlak yol olarak aktarir. MCP kendi process CWD'sini hedef proje sanmaz.
3. Server yolu yetkili koklere gore dogrular, projeyi/checkout'u tanir veya kaydeder; envanteri degisen dosyalar icin gunceller.
4. Hedef `PaymentService` birden fazla yerde varsa paket, modul ve mevcut baglamla coz. Tek anlamli cozum yoksa adayi kullaniciya sor; ilk grep sonucuna gore yazma.
5. Proje guven profili, model, kaynak/fixture yazma politikasi ve runner hazirligi dogrulanir.
6. Kaynak manifesti ve izole snapshot olusturulur. Mevcut testler gercekten calistirilir, baseline saklanir.
7. AI analiz/tasarim yapar; motor aday testleri kontrollu sekilde uygular, calistirir ve bagimsiz dogrular.
8. Her kabul edilen test setiyle checkpoint alinir; hedef saglanmadiysa kalan aciklara gore devam edilir.
9. Son temiz dogrulama, kalite ve kaynak butunlugu tamamlanir; HTML/JSON/diff/JaCoCo raporlari uretilir.
10. Sonuc `READY_FOR_REVIEW` olarak sunulur. Hedef kod calisma kopyasina uygulama acik onayla yapilir; otomatik commit/push yapilmaz.

### 5.3 Devam ve inceleme

- "Kaldigin yerden devam et": proje/checkout ile eslesen yarim isi bul, kaynak ve checkpoint'i dogrula, ayni job'dan devam et.
- "Baska modelle devam et": yetkili model profilini degistir; onceki analiz/deneme/test kanitlarini yeni oturuma ver. Mevcut sonucu sifirlamadan yeni worker kaydi ac.
- "Sonucu goster": DB'den son dogrulanmis ozeti getir; dosya yolu/artifact referansini ver. Yeni test calistirma.
- "Durdur": yeni aday baslatma; calisan islemleri guvenle durdur ve kalan durumu kaydet.
- "Bu projede hangi paketleri/siniflari test ettik": envanter ve gercek run gecmisini sorgula; package kapsaminda calismayi her sinifin basarili oldugu iddiasina donusturme.

Birden fazla yarim gorev varsa en yeniyi korlemesine surdurme. Proje + konum + hedef + durum ile aday listele; bir tane guvenilir eslesme varsa otomatik devam et.

### 5.4 Dogal dil ve otomasyonun siniri

MCP dogal dili kendiliginden anlamaz; model typed tool'u secer. 'Tek cumle yeter' deneyimi, kurulan OpenCode tool/agent baglaminda gercek prompt smoke testleriyle dogrulanir. Genel bir MCP istemcisinin, her modelinin ve her dogal dil ifadesinin otomatik dogru tool sececegi garanti edilmez.

Diger MCP istemcileri ayni sunucu ve job motorunu kullanabilir; ilk dogrulanacak insan arayuzu OpenCode'dur. Modelin kendi basina `bash/edit` ile test yazmasi desteklenen guvenli akis degildir. Test engineering agent'inin rolunu MCP araclarina yonlendirecek sekilde sinirla; genel build agent'inin urun disindaki yetkilerini urunun guvenlik garantisiymis gibi anlatma.

---

## 6. Mimari ve sorumluluk sinirlari

```text
OpenCode CLI/TUI veya baska MCP istemcisi
    |
    | Kisa, typed MCP tool cagrilari
    v
MCP Adapter (OpenCode-uyumlu v1 / yeni protokol v2)
    |
    v
Application Services + Durable Job Orchestrator
    |-- Project Discovery / Java Inventory
    |-- Test Plan / Gap Prioritizer / Plateau Analyzer
    |-- Policy Guard / Patch Applier / Independent Verifier
    |-- SQLite Repository / Artifact Store / Recovery Manager
    |-- Offline Report Generator
    |
    |-- OpenCode Worker Adapter
    |      -> Sinirli worker session
    |      -> Yetkili kurum ici LiteLLM provider/model
    |
    `-- Isolated Maven Test Runner
           -> Build / JUnit / Surefire / JaCoCo
           -> Dogrulanabilir run evidence
```

### 6.1 Moduler monolit

Tek urun deposu ve yerel uygulama: gereksiz mikroservis, Redis, mesaj broker'i veya ikinci DB kurma. MCP request handler'lari is mantigini icermez; application service cagirilari yapar. Is motoru transport, model ve storage adapterlerinden bagimsizdir. Sonradan UI ayni application katmanini kullanabilsin; simdi UI implementasyonu yoktur.

Uzun isler event loop'u bloke etmeden yurutulur. Maven process'leri ve Java analiz process'i supervision altinda olur. DB transaction'i boyunca model veya process sonucu beklenmez. Varsayilan bir workspace icin tek aktif yazici/test iterasyonu; farkli projelerde kaynak butcesi izin verdiginde paralellik mumkundur.

### 6.2 Gercek otonom dongu

`test_start` kalici kaydi olusturur ve kisa surede `job_id` doner. Motor, MCP process'i hayattayken ilerler. Her iterasyon icin ana sohbetten yeni yonetim talimati bekleyen script koleksiyonu kabul edilmez.

MCP stdio process'i OpenCode kapaninca sonlanabilir. Ilk teslimatta surekli arka plan servisinin hayatta kalacagi vaat edilmez. EOF/termination algilandiginda calisan cocuklar icin kontrollu kapatma ve checkpoint uygulanir. Sert kesintiden sonra restart recovery calisir. 'Oturum kapansa da devam eder' yerine, gercekte durduysa `INTERRUPTED` ve `resume_available` gosterilir.

Kisa status cagrisi veya ust siniri olan long-poll, UI thread'ini ve tool timeout'unu kilitlemez. Ilerleme ciktilari DB event sirasiyla yeniden okunabilir; kaybolan SSE olayi is gecmisi kaybi sayilmaz.

### 6.3 AI worker modeli

AI worker'i rol bazli gorevlendir: Analyzer, Test Designer/Developer, Reviewer/Gap Analyzer. Bunlar mantiksal rollerdir; her rol icin ayri model veya dort daimi ajan zorunlu degildir. Tek yetkili modelle de tum akis calisabilmelidir. Bagimsiz dogrulama, mutlaka farkli LLM demek degildir; test/coverage kanitini modelden bagimsiz olcen kod demektir.

Worker'a sadece gerekli sinif, bagimlilik imzalari, mevcut testler, policy, acik coverage alanlari ve onceki ilgili denemeler verilir. Ilgili ek kodu almak icin sinirli, salt-okunur context yetenegi sunulabilir. Tum repository'yi her iterasyonda modele gonderme. Baglam kesilmisse bunu kaydet; gorulmeyen dosyalari modelin bildigini varsayma.

Varsayilan worker cikisi **proposal/changeset** olsun. Model test dosyasinin yeni icerigini veya desteklenen patch'i, beklenen onceki hash'i ve senaryo kimliklerini uretsin. Guvenilir `PatchApplier` izinleri ve butunlugu dogruladiktan sonra yalniz staging alanina yazar. Worker dogrudan host proje/DB/rapor dosyalarini degistiremez.

OpenCode worker'in `bash`, genel `edit/write/patch`, `task`, web ve diger MCP araclarini kapat. Gerekli salt-okunur araclari allowlist ile ac. Otomatik formatter, LSP baslatma, repo plugin'i ve shell hook'u gibi dolayli calistirma yollarini da ele al. Host kullanici konfigrasyonunu tum olarak miras almak yerine kontrollu worker ayarini kur. Bos `mcp: {}` veya inline config'in mirasi temizledigini varsayma. Etkin ayarlarin testini yap. [S19]

Worker kendi `test_start` aracini goremez; recursive worker/job zinciri yasaktir. Provider erisimi disinda musteri verisini disariya tasiyan araci olmayacak. Yetkili model degisimi politika ve job event kaydiyla yapilir.

### 6.4 Model cikti sozlesmeleri

Asagidaki schema'lar urun tarafinda versiyonlu olusturulacak:

- `ProjectContext`: snapshot, hedef kimlikleri, framework, kaynak referanslari, baglam eksikleri.
- `AnalysisArtifact`: gozlenen davranislar, contract kaynaklari, bagimliliklar, mevcut test durumu, belirsizlikler.
- `TestPlan`: senaryo ID, hedef davranis/metot/bosluk, girdi, mock/fixture, beklenen gozlenebilir sonuc, assertion gerekcesi, oncelik.
- `CandidateChangeSet`: base checkpoint, parent hash, path, action, before/after hash, yeni icerik/patch, ilgili scenario ID'leri.
- `ReviewArtifact`: finding ID, severity, dosya/konum, kural, kanit, onerilen duzeltme; salt model gorusu oldugu etiketi.
- `GapAnalysis`: kalan alan, denenen yaklasimlar, evidence reference, blocker sinifi, belirsizlik, siradaki strateji.
- `WorkerHandoff`: son dogrulanmis snapshot/checkpoint, kalan plan, basarisiz denemeler, policy ve sonraki tek anlamli eylem.

Zorunlu alan eksikligi, schema surum uyumsuzlugu, kesilmis JSON ve path disina yazma istegi kabul edilmez. Sinirli format duzeltme denemesi yap; hala hataliysa `INVALID_MODEL_OUTPUT`. Markdown icindeki rastgele ilk code block'u valid patch kabul etme. Tool/model structured output destegi yoksa ayni schema'yi yerelde kontrol eden metin-JSON yolu kullanilabilir; dogrulama kaldirilamaz.

---

## 7. MCP arac ve veri sozlesmesi

### 7.1 Yuksek seviyeli araclar

| Arac | Temel giris | Sonuc ve yan etki |
| --- | --- | --- |
| `project_inspect` | `project_root`, opsiyonel refresh | Yetkili projeyi tanir/kaydeder, envanter ozeti ve preflight durumu verir; test/production degistirmez. |
| `project_query` | `project_id` veya root, `view`, filtreler, cursor | Projeler, moduller, paketler, siniflar, testler, coverage/is gecmisi icin sinirli sorgu. Serbest SQL kabul etmez. |
| `test_start` | root, targets, hedef yuzde, opsiyonel model/profile, idempotency key | Dogrulanmis parametrelerle tek kalici job baslatir; kisa surede handle doner. |
| `test_status` | job ID veya proje baglami, event cursor | Durum, aktif asama, son dogrulanmis olcum, unverified aday, gereken eylem. |
| `test_resume` | job ID veya proje baglami, opsiyonel model profile | Checkpoint/source/lease dogrulayarak mevcut isi surdurur; yeni job gibi davranmaz. |
| `test_cancel` | job ID, pause/cancel nedeni | Process tree'yi guvenle durdurur; artifact'leri silmez. Pause/devam edilebilir iptal ayrimi sonuc alaninda aciktir. |
| `test_result` | job ID, ozet/detay, artifact turu | Rapor/diff/log/coverage referanslari ve kaynak butunlugu; keyfi dosya okuma yok. |
| `test_apply` | job ID, onayli checkpoint/diff digest, hedef workspace | Sadece acik onayli test degisikliklerini uygular. Varsayilan kapali/onay gerektiren yetenek; 16. bolumdeki sozlesme. |

Sunucu kaynak saglayabiliyorsa raporlar `aite://jobs/<id>/...` gibi server'a ait URI'lerle de sunulabilir. Resource okumasi artifact registry ve boyut siniriyla yapilir; `file://` uzerinden keyfi host dosyasi acilmaz. Kullanicinin yerel acabilmesi icin raporun dogrulanmis absolute path'i de sonuc icinde verilir.

`project_root` MCP tarafinda canonical/real path'e cevrilir; register edilen yetkili kokler disina cikilmaz. Giris parametresi olarak shell komutu, SQL, calistirilacak script veya keyfi model endpoint'i alinmaz. Bunlar operatorun yerel guvenilir profillerinden secilir.

### 7.2 Test hedefi

```json
{
  "project_root": "C:/work/sample-project",
  "targets": [{"selector": "PaymentService", "kind": "class"}],
  "coverage": {"percent": 90, "metrics": ["LINE", "BRANCH"]},
  "mode": "TEST_ONLY"
}
```

Bu ornek urunumuzun tool girdisidir. `project_root` dogal dilde kullanicinin tekrar yazacagi sey degildir; istemci tarafindaki baglamdan aktarilir. Yalniz yuzde girildiginde metrics varsayilani iki metrik olur. Yuzde 0-100 araliginda ve en fazla iki ondalikli kabul edilir; ic hesap basis point/tamsayi kullanir.

Hedef cozumu tamamlandiginda is kapsaminda canonical module ID, kaynak path, tam Java adi, class/kaynak iliskisi ve kapsam fingerprint'i sabitlenir. Paket/modul hedefi sessizce butun repository'ye genisletilemez. Ileride dosya eklenirse aktif hedef listesine otomatik katilmaz; yeni kapsam onayi veya yeni job revision gerekir.

### 7.3 Her mutating tool icin ortak kurallar

- `schema_version`, correlation/request ID, `job_id`, `project_id`, durum ve makine-okunur reason code.
- Start/resume/apply tekrarlari ayni etkiyi ikinci kez uygulamaz. Semantic request fingerprint + aktif gorev eslestirmesi; gercekten yeni deneme isteniyorsa acik `new_attempt` davranisi.
- Parametre hatasi, policy ihlali ve is sonucu farkli hata siniflari. Business target-not-met protokol parse hatasi degildir.
- `readOnlyHint`/`idempotentHint` gibi metadata, izin veya guvenlik yerine gecmez. Yan etkili arac dogru etiketlenir.
- `test_status` yuzdeyi yalniz son trusted run'dan verir. Calisan adayin tahmini coverage'i resmi sonuc gibi gosterilmez.
- Buyuk log/raporlar tool context'ini doldurmaz; sinirli ozet, cursor ve artifact referansi doner.
- STDOUT sadece MCP protokolu. Loglar STDERR ve yerel dosyada. Maven output'u MCP STDOUT'una karismaz.

### 7.4 Surum ve istemci uyumlulugu

Uygulamanin basinda gercek kurulu OpenCode binary/SDK/protocol matrisini kaydet. v1 profili icin eski handshake, v2 icin resmi yeni lifecycle kullan; her ikisini ayni handler'da kontrolsuzce karistirma. `latest` isimli belgenin installed SDK ile ayni oldugunu varsayma.

MCP Tasks uzantisi bu urunun job store'u degildir. Destekleniyorsa ek adapter olabilir; ilk ana akis, tool request/result ve job ID ile calisacak. Sampling'e veya istemcinin modelini MCP'ye otomatik vermesine bagimlilik yoktur. LiteLLM model secimi onceden konfigure edilen worker profilinden yapilir.

---

## 8. Proje tanima ve kalici envanter

### 8.1 Proje ve checkout kimligi

Bir Git remote ayni olan iki clone veya worktree ayni CALISMA ALANI degildir. `projects` mantiksal urunu; `project_locations` yerel checkout'u temsil eder. Canonical root, dosya sistemi kimligi/ortam, Git common-dir ve remote'un kimlik bilgilerinden arindirilmis hali kaydedilir. Remote'suz lokal projeye de UUID verilir.

Git branch tek basina snapshot kimligi degildir. HEAD + tracked dosya hash'leri + ilgili dirty/untracked kaynak hash'leri + build/config fingerprint'i ile mevcut gercek durum tespit edilir. Symlink/case farklari ve Windows drive/junction davranisi hesaba katilir. Kullanici klasoru tasirsa kimlik eslestirmesi dogrulanir; baska proje ayni ada sahip diye eski checkpoint baglanmaz.

Gizli veriler path/URL icinde olabilir: credentials, query string ve userinfo temizlenir. Secret degeri hash'lenerek bile gereksiz kayda alinmaz; secret referansi ve profil surumu yeterlidir.

### 8.2 Kesif sirasi

1. Dosya sistemi ve Git hakkinda salt-okunur metadata kontrolu.
2. Statik POM/modul/profil/env dosyasi envanteri; hassas degerleri toplamadan.
3. Guven siniri icinde Maven effective model/build metadata cozumu. Maven extension/plugin'leri calisabilecegi icin hostta masum XML sorgusu gibi davranma.
4. Effective source/test roots, module dependency DAG, plugin surumleri, Surefire provider, JDK/toolchain ve mevcut coverage ayarlari.
5. JavaParser yardimcisiyla package/class/interface/enum/record/nested type/metot imzalari, konumlar ve kaynak hash'i.
6. Mevcut test sinif/metotlari, parameterized/dynamic test kabiliyetleri, fixture ve ortak test utility'leri.
7. Statik kod-test iliskileri ve daha once dogrulanmis runtime iliskileri.
8. Aranan hedefin cozulmesi ve hedefe gerekli kadar derin baglamin yuklenmesi.

Yalniz `src/main/java` ve `src/test/java` varsayimina baglanma; effective modelden custom root'lari al. Uretilmis source ve aggregator POM kaynakli sahte hedefler ayri siniflanir. Maven artifact/dependency 'paketi' ile Java package kavrami ayni tablo alanina sikistirilmaz.

JavaParser symbol resolution eksik classpath nedeniyle tamamlanamazsa 'cozuldu' yazma. Bilinen iliskileri kullan, unresolved alanlari kaydet; kritik target/FQCN belirsizliginde yazmayi durdur. Reflection/dynamic wiring sebebiyle statik iliskiyi gercek execution baglantisi diye gosterme.

### 8.3 Envanterin guncellenmesi

Envanter satirlari kaynak snapshot/parser version ile iliskilidir. Degisen Java dosyasinin sembolleri yenilenir; silinenler yeni snapshot'ta yok olarak isaretlenir fakat gecmis kayitlari silinmez. POM/toolchain/source root degisimi etkilenen modullerin analizini gecersiz kilar. Eski coverage yeni kaynak icin guncelmis gibi sunulmaz.

Ilk test talebinde gerekli proje envanteri ve hedef baglami olusturulur. Her OpenCode acilisinda tum kaynaklari tekrar modele gonderen genel bir 'proje ogrenme' sistemi ekleme. Envanterin genisletilmesi ucuz deterministik is olsun; model analizi hedefe gore derinlessin.

### 8.4 Kullanici sorgulari

Su sorular DB ve kanitli artifact baglantilariyla cevaplanabilsin:

- Kayitli projeler ve yerel baglanti durumlari neler?
- X projesinde hangi modul/package/class icin is yapildi?
- Hangi test olusturuldu, hangisi gelistirildi, hangi run'da calisti ve sonucu ne?
- Son guncel ve gecmis coverage nedir; hangi kaynak surumune aittir?
- Hangi model, hangi rolde ve hangi iterasyonda calisti?
- Hangi is kesildi, hangi checkpoint'ten devam edilebilir?

Bir test-candidate'in uretilmis olmasi, onun kabul edilmis veya hedef repoya uygulanmis oldugu anlamina gelmez. Bu durumlar ayrica saklanir.

---

## 9. Kaynak korumasi, izole runner ve guvenlik

### 9.1 Varsayilan guven modeli

Kaynak repository, prompt'a giren yorum/dokuman, LLM cevabi, test kodu, test logu ve coverage XML'i guvenilir talimat degildir. Bunlar veri olarak islenir. Modelden gelen 'policy' degisikligi uygulanmaz.

Bu urun ayni kullanici hesabinin bilincli saldirisina, kernel hatalarina veya ele gecirilmis container runtime'ina karsi mutlak guvence iddia etmez. Hedef; modelin yanlis/arac disi eylemlerinin, aday testlerin ve build process'lerinin normal yetki sinirlari icinde kaynaklara veya sirlara erisimini engellemektir. Guven sinirlari `docs/security.md` icinde acik yazilir.

### 9.2 Kaynak snapshot'i

Orijinal checkout'a model veya runner mount edilmez. Guvenilir uygulama salt-okunur envanter cikartir ve gerekli kaynaklarin ownership'li kopyasini alir. Snapshot, yalniz committed kaynak degil kullanicinin gercek calisma durumunu da temsil eder; dirty kaynak goz ardi edilemez.

Kopyalama manifestinde her dosyanin relative path, boyut, hash, siniflandirma ve kaynak konumu bulunur. Symlink/hardlink/junction ile izin disi path'e cikma engellenir. Orijinal dosyaya ayni inode'u paylasan writable hardlink olusturulmaz. Herhangi bir silme/temizleme sadece urunun sahipligi manifestle kanitli dizinlerine uygulanir.

Kalici production snapshot read-only tutulur. Aday icin ayri test overlay hazirlanir. Asil source root'lar, POM'lar, wrapper/config ve production resources runner'da read-only gorunur. Tum kaynaklari writable kopyalayip yalniz sonda hash bakmak birincil koruma olarak yeterli degildir; hash ikinci savunmadir.

### 9.3 Test degisikligi allowlist'i

Yazilabilir test root'lari effective project modelinden alinir. Asagidakiler yasaktir:

- `src/main/**`, custom production root, build/wrapper/config, `.git/**`, uygulama profil/config kaynaklari.
- Uretim davranisini degistiren bytecode rewrite/coverage filter/exclusion, JaCoCo raporu elle degistirme.
- Test classpath'inde production sinifi ayni FQCN ile yeniden tanimlama veya test edilmeyen fake SUT kullanma.
- Yeni `@Disabled`, `@Ignore`, kosulsuz assumption/early-return, skip flags, test silme ya da assertion'i gevsetme ile basari elde etme.
- `pom.xml`, dependency/plugin versiyonlari, `build.gradle`, `.mvn`/wrapper, test secim ve coverage politikasi degisikligi.
- Reflection ile private metodu dogrudan test etme veya API'yi test icin public yapma.
- Guvenli kapsami asan agent/classloader/META-INF service/test engine ve benzeri calisma davranisi degisiklikleri.

Fixture degisiklikleri path, dosya turu, boyut, sahiplik ve etkiledigi testler bakimindan kontrol edilir. Var olan fixture'i degistirmek diger testlerin anlami uzerinde etkili olabilir; regresyon kapsamindan kacirilmaz. Metinsel allowlist'te bulunan bir dosya semantik guvenlik denetiminden muaf degildir.

### 9.4 Runner'in teknik siniri

Ilk teslimatin strict runner'i OCI/container adapter'i ile uygulanir. Linux ve kurumun onayladigi Windows/WSL2/container yolu icin capability preflight yaz. Varsayilan olarak:

- Non-root kullanici, gereksiz capabilities kapali, privilege escalation yok.
- Read-only source/build policy mount'lari; sadece ilgili build output, `.m2` icin is-ozel cache veya onayli depolar, tmp ve output yazilabilir.
- Host home, kullanicinin diger projeleri, Git credential, model auth dosyasi, Docker socket container'a verilmez.
- Test/Java process'ine LiteLLM/OpenCode secret'i aktarilmaz. Worker ile runner ayni credential ortaminda calismaz.
- Network varsayilan kapali. Dependency hazirlama gerekirse onayli registry/mirror/proxy profiliyle ayri asama; test runtime'ina sinirsiz dis ag verme.
- CPU, bellek, disk, process ve wall-clock sinirlari. JVM/Maven cocuk process'leri ve container kimligi job/run ile kayitli.
- Timeout/iptalde sadece ilgili process tree/container durdurulur; ayni makinedeki diger Java/OpenCode islemleri oldurulmez.

Container seceneklerinin tek basina kusursuz sandbox oldugunu soyleme; mount, network, user ve secret politikalarini fault testleriyle dogrula. [S18]

Container/prerequisite yoksa `BLOCKED_ISOLATION` ve kurulacak kabiliyeti raporla; admin yetkisi, Docker lisansi veya kurum izni varmis gibi otomatik kurma. Salt envanter ve rapor okuma calisabilir; riskli hostta otomatik test calistirma fallback'i kullanma. Operatorun onayli baska bir OS sandbox'i varsa ayni testleri gecen adapter ile kullanilabilir, siki korumayi kaldirarak degil.

Windows path/WSL path mapping, CRLF, bosluk/Turkce karakter iceren klasorler ve case-insensitive cakismalar dogrulanir. Musteri projesi Linux ortaminda calisamayan Windows-native dependency gerektiriyorsa bunu desteklenmeyen runner kombinasyonu olarak raporla; Linux'ta gecen fixture'i tum Windows projelerine genelleme.

### 9.5 Worker izolasyonu

OpenCode server sadece loopback veya job-ozel guvenli kanal uzerinden erisilebilir; rastgele guclu auth secret'i kullan, `0.0.0.0`/public port yok. Basic auth bilgisi loglarda redakte edilir. SDK'nin yeni server acarken config mirasini nasil ele aldigi test edilir. [S07][S11]

Model worker'a, gerekiyorsa sadece sanitized baglam kopyasi mount edilir; hedef checkout yoktur. Kurum ici API'ye erisim allowed endpoint profiliyle sinirlidir. Repository icindeki `.opencode`, AGENTS, plugin, LSP/formatter config'leri yetkili ayar olarak otomatik yuklenmez. Onlardan yararli test konvansiyonlari cikartilabilir ama araca yeni yetki verilemez.

Proposal-only akisinda code generation dogrudan dosya yazma gerektirmez. Okuma genisletme gereksinimi guvenilir context service ile cozulur. Worker oturumu gereksiz olcum/build yapmaz; test runner'in sonucu tek gercektir.

### 9.6 Parser, log ve rapor guvenligi

XML parser external entity/DTD network resolution yapmaz. JaCoCo'nun normal DOCTYPE bildirimini guvenli bicimde okuyabilmek ile harici entity cozmek ayri konudur. Buyuk/derin XML ve zip/file boyut sinirlari bulunur. JSON/patch path traversal, symlink yarisi ve Windows reparse point testleri ekle.

HTML'de kaynak kodu, model metni, log ve test adlari escape edilir. Markdown/HTML ham olarak inject edilmez. Harici JS/font/CDN/analytics yoktur; yerel rapor ag baglantisi gerektirmez. ANSI/terminal escape karakterleri temizlenir. Secret redaction log olusturulurken uygulanir; raw sifreli olmayan logu once disariya yazip sonra temizlemek yeterli degildir.

---

## 10. Maven/JUnit/JaCoCo olcum sozlesmesi

### 10.1 Build profili ve baseline

Her job icin gercek toolchain ve `BuildPlan` olustur: reactor root, hedef/etkilenen moduller, JDK, Maven executable/wrapper, aktif profiller, settings referansi, test provider, plugin surumleri, VM args, test filtreleri, kaynak/test/build dizinleri ve coverage kaynagi. Kaydet ama secret degerlerini kaydetme.

Maven effective model'i ve reactor dependency sirasi kullanilir. `-pl`/`-am` secimi build planinin sonucudur; tum projelere sabit komut yapistirma. Parent aggregator ile dependency relation ayni degildir. [S20]

Mevcut testleri once calistir. Baslangicta failing/unstable test varsa `BASELINE_FAILED` veya `BASELINE_UNSTABLE` olarak ayir. Bunlari disable edip yeni testleri basarili gosterme. Ortam sorunu ile hedef kod/test sorunu kanitla ayrilir.

Hic mevcut test bulunmamasi tek basina hata degildir: hedef production class derlenebiliyorsa ve mevcut test framework'u kullanilabilir ise test eklenebilir. Test run'inda 0 test calismasi, 'butun testler gecti' demek degildir. Framework bagimliligi yoksa POM degistirmeden mevcut izinlerle cozum yoksa `BLOCKED_TEST_FRAMEWORK`.

### 10.2 JaCoCo baglantisi

Oncelik mevcut JaCoCo konfigurasyonudur. Desteklenen projede build dosyalarina dokunmadan agent/goal cagrisi yapilabilir; bu yontem her POM'da calisir diye varsayma. Var olan `argLine`, late evaluation, JDK argumanlari ve diger agent'lar korunur. Fork kapaliysa olcum kabiliyeti ayrica kontrol edilir. Bir agent'in iki kez eklenmesi veya kapsam degistiren sessiz override kabul edilmez. [S13][S14][S21]

Yapilandirmayi degistirmeden guvenilir olcum saglanamiyorsa `BLOCKED_COVERAGE_CONFIGURATION`. Sahte rapor, eski `.exec` veya ayni path'te bulunan rastgele XML ile devam etme.

Her run icin taze ve job/run'a bagli exec/report alanlari kullan. Moduller/forklar arasi cakisma olmasin. Gecmis run'in exec'ini append/merge etmek yasaktir. Sadece ayni run, ayni kaynak/bytecode fingerprint'i ve kanitli fork/subrun kapsamindaki exec'ler kontrollu birlestirilebilir. Baseline ve final run veri birikimiyle karsilastirilmaz.

### 10.3 Cok modullu olcum

Her modulun production class ve report kapsam kimligi bilinir. Report-aggregate mevcut uygun reactor bagimliliklariyla kullanilabilir; tek goal cagrisi tum modul verisini kendiliginden uretir kabul edilmez. [S22]

Esas hedef, (modul + FQCN + kaynak/bytecode kimligi) ile cozulur. Ayni FQCN farkli modullerde varsa dogru rapor secilir. Parent/child/aggregate XML sayaclari birlikte toplanip coverage iki kat sayilmaz. Ust seviye gorunum detay sayaclari yerine gecmez.

Nested/synthetic class'larin hedefe dahil olma politikasi baslangicta aciklanir ve fingerprint'e alinir. Default tek Java sinifi denildiginde cozulmus FQCN'nin JaCoCo class sayaclari hedeflenir; ayni source dosyasindaki nested/synthetic class'lar ayri gorunur ve sessizce hedefe eklenmez. Kaynak dosyasi veya paket hedefinde dahil edilen class listesi acikca sabitlenir. Kaynak satir orani hesaplanacaksa ayni source line bir kez sayilir, class/method LINE sayaclari korlemesine toplanmaz. Kapsam daraltilarak hedefe ulasilmis gibi davranilmaz.

### 10.4 Coverage dogrulama ve hesap

Olcum kabulunden once:

1. Trusted runner run ID/completion kaydi, baslangic-bitisi, process exit ve log/artifact hash'leri uyumlu olmali.
2. Beklenen testler kesfedilmis ve gercekten calismis olmali. Yeni testlerin Surefire naming/provider disinda kalmasi yakalanmali.
3. Sonuc XML'i bu run'dan, bu module/source/class dosyalarindan uretilmis olmali.
4. JaCoCo'nun exec-class eslesmesi ve class ID/bytecode provenance'i kontrol edilmeli; source ayniligi tek basina yeterli degil. [S23]
5. LINE/BRANCH sayaclari negatif/bozuk olamaz; toplam/alt kapsam tutarsizliklari acik hata olmali.
6. Kaynak/build/coverage politikalari degismemis olmali. Denominator degisikligi sessiz ilerleme sayilmaz.

Yuzde hesap:

```text
n = covered + missed
n > 0 ise coverage = covered / n
hedef_basis_points = 9000  # %90
hedef_saglandi = covered * 10000 >= hedef_basis_points * n
```

Karsilastirma gosterim icin yuvarlanmis yuzdeyle yapilmaz. %89.96 ekranda %90 yuvarlansa bile %90 hedefi saglanmamistir. Sayaclar tasabilecek buyuklukteyse BigInt/guvenli tamsayi kullan.

BRANCH toplam 0 ise `NOT_APPLICABLE`; bu %100 olarak yazilmaz. LINE olcumunun debug bilgisi yoksa `UNAVAILABLE`, basarili N/A degil. Hedefin hic executable icerigi yoksa `NO_EXECUTABLE_TARGET`; test muhendisligi basarisi uydurma. Eksik class/report 0 coverage veya N/A yerine `INVALID_COVERAGE_EVIDENCE` olur.

Birden fazla hedefte aggregate ortalama degil HER hedefin gerekli metrikleri saglanmalidir. Biri %100 digeri %80 ise ortalama %90 diye tum gorev basarili olamaz.

### 10.5 JaCoCo'nun soylemedigi bilgiler

JaCoCo'nun satir uzerindeki missed/covered branch sayisi, tek basina hangi boolean alt kosulunun veya true/false kenarinin eksik oldugunu tam olarak bildirmez. Kaynak AST/kozul analizi ile aday senaryo turetilebilir ama XML'de olmayan branch ID/trace kesin bilgi diye kaydedilmez.

Exception davranislari BRANCH artisi olmadan da onemli olabilir. Test kalite planinda exception, boundary, yan etki ve is davranisi kapsami ayrica tutulur. Coverage esiklerinin saglanmasi, kodun hatasizligini veya butun gereksinimlerin dogrulandigini kanitlamaz.

### 10.6 Regresyon ve final run

Hizli iterasyonda hedef test secimi uygulanabilir; kabul icin etkilenen modul ve ortak fixture/test utility kapsamindaki mevcut testler tekrar calisir. Finalde desteklenen proje test profiliyle tam reactor unit test regresyonu yapilir. Unit test profili ile integration/deployment lifecycle karistirilmaz; canli ortama baglanan IT'ler otomatik unit kapsaminda calistirilmaz.

Bazi moduller ortam eksiginden dogrulanamiyorsa kapsam acik raporlanir: `verification_scope=PARTIAL`, `TARGET_REACHED_UNVERIFIED_SCOPE` gibi sonuc tam basari yerine review gerektirir. Baseline ve finalde farkli test secimleriyle olculen sonuclar farklilik notu olmadan karsilastirilmaz.

Son kabul edilen test setini temiz artifact alaninda yeniden derle/calistir. Yeni/degisen testler icin en az bir ek tekrar ile basit flakiness kontrolu yap. Bunun flakiness yoklugunu kesin kanitlamadigini raporda abartma. Adaylarin run'lari final report yerine gecmez.

---

## 11. Test muhendisligi ve aday kabul dongusu

### 11.1 Analiz ve tasarim

Ilk LLM cagrisi kod yazmak degil, hedef davranis ve mevcut testlerin analizi olabilir; analiz zaten gecerlilik kaniti olan artifact'te varsa gereksiz yeniden uretme. Senaryolar kod konumu/contract referansi ve beklenen gozlenebilir sonucuyla tanimlanir.

Uygulanabilir oldugu olcude su alanlari incele: normal davranis, null/bos/gecersiz girdi, alt-ust sinir ve komsu degerler, exception/alternatif sonuc, dependency failure, koleksiyon/bos/tek/cok eleman, precision/rounding, tarih/saat/timezone, state transition, yan etki, idempotency, siralama ve concurrency. Her sinifa butun basliklar icin yapay test zorunlulugu getirme; uygulanmayan basligin nedeni kaydedilir.

Beklenen sonucun kaynagi belirgin olmalidir: mevcut contract/dokuman, kabul edilmis test, API davranisi veya gerekceli analiz. Production kodu potansiyel bug iceriyorsa modeli sadece kodun mevcut yanlis ciktisina gore assertion ayarlamaya yonlendirme. `SUSPECTED_PRODUCTION_DEFECT` finding'i ac, production'a dokunma; belirsiz contract icin insan karari gerektigini acikla.

Test adlari mevcut proje konvansiyonuna uyar. Nesneleri gercek constructor/public davranis uzerinden kur. SUT'u tamamen mock'layip kendi stub'inin sonucunu test etme. Private implementasyon detayini coverage icin hedefleme. Projede var olan Mockito surumu ve mock maker yetenegini dogrulamadan static/final/constructor mocking destegi varsayma.

### 11.2 Iterasyon asamalari

```text
Eksik davranis/coverage bolgesini sec
  -> Senaryo ve assertion oracle tasarla
  -> Aday test degisikligini uret
  -> Schema + path + test-only + semantik risk kontrolu
  -> Izole aday alana uygula
  -> Derle ve hedef testleri calistir
  -> Hata varsa sinirli onarim ve yeniden deneme
  -> Etkilenen mevcut testlerle regresyon
  -> Taze coverage ve kalite incelemesi
  -> Kabul / reddet / inceleme gerektiren aday
  -> Kabul edilen set icin kalici checkpoint
  -> Hedef / plateau / butce / altyapi / iptal kontrolu
```

Repair, yalniz test tarafinda yapilir. Import/package/syntax icin deterministik duzeltme mumkun; business assertion sonucu icin `actual` degerini beklenen olarak korlemesine kopyalama. Derleme hatasini gecirmek icin production API degistirme veya dependency ekleme yoktur.

Ayni candidate fingerprint daha once reddedilmisse ayni denemeyi yeni isimle tekrar kabul etme. Hata kayitlari normalize edilerek ilgili code hash/scenario/strategy ile eslestirilir; kaynak degistiyse eski hata mutlak yasak degil yeni baglamdir.

### 11.3 Kalite kapilari

**Hard gate:** Test-only ihlali, derleme/test failure, yeni skip/ignore, mevcut testin kaybi, no-test execution, bariz bos/tautolojik assertion, SUT shadowing, secret/ag/dosya policy ihlali, sahte/stale coverage, mevcut test davranisini zayiflatan bilinen degisiklik adayi reddeder.

**Semantik review:** Assertion'in dogru davranisi olcmesi, gerekli exception/side-effect dogrulamasi, asil davranis yerine mock'u test etme, gereksiz duplicate, kirmasi kolay implementation coupling, boundary ve hata senaryosu yetersizligi incelenir. Statik detector ile AI review'in karar ve kanitlari ayri kaydedilir. Heuristik/LLM denetimi matematiksel test dogrulugu garantisi degildir.

Mevcut testlerde yalniz toplam test sayisina bakma. Annotation ve metot envanteri, Surefire/JUnit sonuclari ve degisiklik incelemesi birlikte kullanilir. Parameterized/dynamic test ID'leri degisebilir; normalize edilmis test kimligi ve calisan invocation bilgisi ayri tutulur. Test adini degistirip eski senaryoyu ortadan kaldirma yakalanmalidir.

Assertion'siz yalniz exception atmadi diye gecen test genel kabul yolu degildir. Gercek `assertDoesNotThrow`/JUnit4 exception kontrati veya anlamli Mockito verification senaryoya gore kabul edilebilir; sadece `assert` kelimesi var/yok regex'iyle kalite karari verilmez. Testin kendi assertion helper'lari da goz onune alinir.

### 11.4 Kazanimin kabul edilmesi

Bir adayda tum hard gate'ler gecmeli. Coverage olcumu ayni kapsamla karsilastirilir; daha once dogrulanmis hedeflerin kapsami/testleri bozulamaz. Anlamli yeni davranis/assertion kazanci, coverage artmasa da kabul edilebilir; bu kazanima coverage artisi yazilmaz ve plateau sayacini sebepsiz sifirlamaz.

Kabul edilen sonucun `coverage_gain`, `behavior_gain`, `quality_findings`, `regression_scope` bilgileri ayridir. Tek kriter satir yuzdesi degildir. Test kalitesinin dusuk oldugu %90'lik aday, daha iyi dogrulanmis setin yerini alamaz.

Rejected candidate dosyalari orijinal projeye veya best set'e karismaz. Son kabul edilen test seti ve tum delta zinciri/reconstruction manifesti korunur. Aday reddedildiginde kullanicinin degisikliklerini silerek geri alma yok; yalniz urunun staging alani yeniden olusturulur.

### 11.5 Butceler

Baslangic varsayilanlari konfigure edilebilir ve job'a snapshot olarak yazilir: 20 candidate iterasyonu, aday basina en fazla 2 onarim, 3 dogrulanmis iterasyonluk no-progress penceresi. Plateau karari icin en az iki farkli uygulanabilir strateji veya neden strateji kalmadigina iliskin kanit gereklidir.

Model request timeout, test-run timeout, toplam is suresi, token ve kaynak butcesi ayridir. Varsayilan toplam is suresi ornegin 120 dakika olarak operator profilinde tanimlanabilir; bu hedefin o surede bitecegi vaadi degildir. Baseline hizina gore kontrollu timeout ayarlamasi ve kullanici tarafindan butce arttirilarak resume desteklenir. Sonsuz dongu yasaktir.

Model cagrisi yarim kaldiginda provider'in islemedigini bilemeyebilirsin. Retry ayni semantic action ID'ye baglanir; duplicate patch kabul edilmez ama provider ucretinin kesinlikle tek olacagi iddia edilmez.

---

## 12. Plateau ve test edilebilirlik engelleri

Coverage'in birkac tur sabit kalmasi 'maksimum budur' kaniti degildir. Motor iki ayrimi korur: **ilerleme durumu** ve **erisim/test edilebilirlik kaniti**.

| Engel sinifi | Beklenen davranis |
| --- | --- |
| `MISSING_SCENARIO` | Uygulanabilir yeni girdi/edge case/exception yolu planla. |
| `MOCKING_OR_FIXTURE_GAP` | Mevcut framework ve test kokleri icinde farkli izolasyon/fixture dene. |
| `UNCONTROLLED_ENVIRONMENT` | Saat, env, dosya/ag gibi bagimliligin test-only kontrol edilip edilemedigini kanitla. |
| `CONFIGURATION_BARRIER` | Framework, JaCoCo, JDK, plugin veya runner kabiliyeti eksigi; production/POM degistirmeden guvenli yolu yoksa blokla. |
| `SUSPECTED_UNREACHABLE_CODE` | Statik akis/kozul kanitini ve belirsizliklerini raporla; LLM gorusunu kesin ispat sayma. |
| `VERIFIED_POLICY_BARRIER` | Izin verilen test-only sinirlarinda belirli yontemin neden kullanilamadigini goster. |
| `MODEL_STRATEGY_EXHAUSTED` | Denenen stratejiler ilerlemedi; baska strateji/modelle devam edilebilecegini acik birak. |
| `BUDGET_EXHAUSTED` | Deneme/zaman/kaynak siniri; 'kod test edilemez' sonucunu cikarma. |
| `UNKNOWN` | Henuz cozulmeyen acigi belirsiz olarak koru. |

Her gap icin kaynak snapshot, modul/FQCN, metot imzasi, satir/AST referansi, missed sayaclar, scenario/attempt ID'leri, denenen yontem, gercek hata/coverage kaniti, blocker sinifi ve sonraki olasi adim saklanir.

Private metot, static/final sinif veya sabit saat goruldu diye otomatik blocker deme. Public akis ve projede halihazirda bulunan test teknikleriyle erisim denenir. Olasi cozum production refactoring ise yalniz bilgi amacli ayri finding olarak yazilir; mevcut test gorevine uygulanmaz.

Gorev %83'te kalirsa rapor 'hedef %90, dogrulanmis sonuc %83, hedef saglanamadi' der. 'Ulasilabilir maksimum %83' ifadesi yeterli kanit olmadan kullanilmaz. %83'luk gercek ve kaliteli test kazanimi review icin korunur.

---

## 13. SQLite veri modeli ve kalici proje hafizasi

### 13.1 Fiziksel standart

Tek kullaniciya ozel SQLite, birden fazla proje ve checkout'u yonetir. Runtime veri kokunde `state.db` bulunur. Network share/UNC/NFS uzerinde WAL DB kullanma; senkronize cloud klasorleri de varsayilan veri yeri olmasin. SQLite WAL okuyucu/yazici davranisi ve backup sinirlari yerel dosya sistemi tasarimina gore ele alinacaktir. [S24][S25]

- Tablo/kolon adlari ASCII `snake_case`, tutarli tek dil (English teknik adlar).
- Kolon sirasi: `id`, iliskisel FK alanlari, is alanlari, teknik audit alanlari.
- Kalici entity ID: uygulamada uretilen UUID, `TEXT` ve format dogrulamasi. Import/backup/yer degisiminde kimlikler korunur. Farkli workspace'ler zorla birlestirilmez.
- Tarihler UTC epoch milliseconds `INTEGER`; kullaniciya gosterimde timezone donusumu acik. Sureler monotonic clock ile olculur, persisted zaman ile karistirilmaz.
- Path'ler canonical goreli/mutlak anlamiyla ayri; URL'ler sanitized. SHA-256 `TEXT` 64 hex; bos deger yerine gereken yerde NULL.
- Durum alanlari CHECK/uygulama schema'si ile kisitli; sayaclar INTEGER ve negatif olamaz. Yuzdeler sadece gorunum, gercek covered/missed saklanir.
- `foreign_keys=ON`, WAL, kritik state icin `synchronous=FULL`, bounded `busy_timeout`, kisa transaction ve retry politikasi.
- Parameterized SQL, indeksler, migration version ve transaction'li schema degisimi. SQL string birlestirme ile kullanici filtrelerini calistirma.
- SQLite `VARCHAR(n)` uzunlugu kendiliginden garanti ediyor diye varsayma; gereken alanlarda `CHECK(length(...))` ve uygulama dogrulamasi kullan.
- Her tablo/kolon icin anlam, tip, nullability, enum/deger birimi, FK, unique, index ve retention aciklamali `docs/data-dictionary.md` uret. SQLite'ta bulunmayan native COMMENT ozelligini varmis gibi kullanma; SQL aciklamasi + dictionary yeterli.

Bu fiziksel model urunumuzun secimidir. Tam DDL/migration ve repository katmani gelistirilecek; yalniz tablo isimlerini README'ye yazmak tamamlanmis storage sayilmaz.

### 13.2 Mantiksal tablolar

Asagidaki model asgari veri iliskilerini tanimlar. Ayni anlam korunarak gereksiz tablolar birlestirilebilir, ancak proje/envanter/run/model/checkpoint kaniti kaybolamaz. Degisiklik ADR ve veri dictionary'sinde belirtilir.

| Tablo | Ana alanlar / baglanti | Temel kisit |
| --- | --- | --- |
| `projects` | id, name, normalized_remote, identity_kind, latest_snapshot_id | Remote tek basina evrensel unique proje kimligi degildir. |
| `project_locations` | project_id, canonical_root, git_common_dir_fingerprint, platform, last_seen_at | Ayni canonical checkout kaydi tekrarlanmaz. |
| `project_profiles` | project_id/location_id, profile_name, policy_version, config_digest, secret_reference_names | Secret degerleri yok; surumlu guven/build/worker secimi. |
| `project_snapshots` | location_id, parent_snapshot_id, head_commit, dirty_digest, source_manifest_artifact_id, build_digest, parser_version | Kaynak/konfig degisimini ve gorulen dosyalari belirler. |
| `modules` | snapshot_id, parent_module_id, relative_path, group_id/artifact_id/version, packaging, roots_artifact_id | Snapshot + modul yolu unique. |
| `java_packages` | module_id, qualified_name, source_set | Modul + source set + package unique. |
| `code_symbols` | package_id, enclosing_symbol_id, kind, fqn, signature, relative_path, source_sha256, line_start/end | Tip/metot imzasi + modul baglami; nested/overload ayrimi. |
| `test_cases` | module_id, symbol_id, test_kind, logical_key, source_path, source_sha256, disabled_baseline | Test tanimi; runtime parameter invocation bundan ayri. |
| `test_links` | test_case_id, target_symbol_id, link_kind, confidence, evidence_artifact_id | `STATIC`, `INFERRED`, `OBSERVED` iliskileri ayri. |
| `test_jobs` | location_id, source_snapshot_id, best_checkpoint_id, policy/profile digest, lifecycle, phase, outcome, request_digest | Aktif esdeger talep icin idempotency; job surumu. |
| `job_targets` | job_id, symbol_id/module_id, selector, resolved_scope_digest, line_target_bps, branch_target_bps | Job + canonical hedef unique; kapsam degisimi revision gerektirir. |
| `iterations` | job_id, parent_checkpoint_id, ordinal, strategy_key, candidate_digest, decision, gain_type | Job + ordinal unique; rejected/adopted ayrimi. |
| `test_scenarios` | job_target_id, iteration_id, logical_key, plan_artifact_id, status, oracle_kind | Tasarlanan/uygulanan/dogrulanan senaryo farkli. |
| `test_runs` | job_id, iteration_id, workspace/run fingerprint, scope, command_manifest_artifact_id, status, exit_code, duration_ms | Guvenilir tamamlanma marker'i ve run'a bagli rapor. |
| `test_results` | test_run_id, test_case_id optional, runtime_test_key, status, assertions/diagnostic artifact, duration_ms | Parametre/dynamic invocation gercek kimligi. |
| `coverage_snapshots` | test_run_id, source_snapshot_id, evidence_artifact_id, class_manifest_digest, coverage_policy_digest, validity | Yalniz dogrulanmis rapor accepted olabilir. |
| `coverage_counters` | coverage_snapshot_id, target/symbol/module, counter_kind, covered, missed | Kapsam + counter unique; ham tamsayi olcum. |
| `coverage_gaps` | job_target_id, source_fingerprint, gap_key, location, blocker_kind, status, evidence_artifact_id | Ayni satir numarasini kaynak degisiminde ayni gap sanma. |
| `gap_attempts` | gap_id, iteration_id, strategy_key, scenario_id, result, evidence_artifact_id | Basarisiz denemeler de korunur. |
| `quality_findings` | job_id, iteration_id, rule_id, severity, origin, location, status, evidence_artifact_id | AI gorusu ile deterministik bulgu farkli origin. |
| `worker_runs` | job_id, iteration_id, role, provider_id, requested_model_id, resolved_model_id, session_id, config_digest, prompt/output artifacts, usage | Model kimligi tahmin edilmez; unknown acikca NULL/etiketli. |
| `artifacts` | job_id optional, kind, relative_store_path, sha256, bytes, schema_version, sensitivity, status, pin_reason | READY blob kimligi degismez; keyfi host path referansi yok. |
| `checkpoints` | job_id, parent_checkpoint_id, iteration_id, manifest_artifact_id, source_digest, verification_level, generation | Commit edilmis manifest; en iyi/test edilen/yarim durum ayrimi. |
| `job_events` | job_id, sequence, event_type, phase, origin, payload_artifact_id optional, occurred_at | Job + sequence unique, append-only. |
| `job_leases` | job_id/location_id, owner_id, fencing_token, expires_at, heartbeat_at, process_identity | Ayni isi iki process kabul edemez; monoton fence. |
| `apply_operations` | job_id, checkpoint_id, location_id, patch_digest, approval_reference, state, journal_artifact_id | Ayni onayli degisiklik iki kez uygulanmaz. |
| `schema_migrations` | version, checksum, applied_at | Tek sirali migration, checksum uyumu. |

Mutable tablolarda `created_at`, `updated_at`, `row_version`; immutable/event tablolarda `created_at` ve gerekiyorsa sequence yeterlidir. FK alanlarini teknik audit alanlari arasina saklama. Farkli job/project'e ait artifact veya snapshot'in yanlis baglanmasini application transaction dogrulamalari ve uygun composite constraint'lerle engelle.

Kod dosyalarinin her surumunu DB BLOB'u olarak saklama. Analiz icin kaynak excerpt gerekiyorsa hassas artifact olarak tutulur. Envanter kaydinin bulunmasi tam source export saklandigi anlamina gelmez.

### 13.3 DB operasyonlari

Model/test calisirken DB transaction acik kalmaz. State update, event append ve checkpoint pointer degisikligi tek kisa transaction icinde commit olur. Optimistic row version + lease fence kontrolu gerekir.

Schema migration once backup ve disk kontrolu yapar. Migration yarim kalirsa sifir DB yaratip gecmisi kaybetme. Daha yeni bilinmeyen schema acilirsa yazmayi durdur. `integrity_check`/FK kontrolu maintenance senaryolarinda calisir; her tool cagrisi pahali tam tarama yapmaz.

DB yedegi resmi desteklenen backup/snapshot yontemiyle alinir. Acik WAL varken yalniz `state.db` dosyasini kopyalamak yedekleme sozlesmesi degildir. Artifact manifestleriyle es zamanli mantiksal backup noktasi olustur. Restore sonrasinda eksik blob ve hash uyumsuzlugu raporlanir. [S25]

Retention tum veriyi sinirsiz tutmaz: kota, onemli checkpoint pin, eski rejected candidate ve log icin saklama politikasi olsun. Varsayilan otomatik temizleme son/best checkpoint'i, uygulanmamis onayli patch'i veya resume icin zorunlu blob'u silemez. Kullanici verisi silme acik kapsam/onay ve referans kontrolu gerektirir.

---

## 14. Kalici job, checkpoint ve kesintiden devam

### 14.1 Durum modelini ayir

`lifecycle`, `phase`, `outcome`, `verification_level` ve `apply_state` ayri alanlardir. 'Completed' her zaman hedef basarisi demek degildir.

- Lifecycle: `QUEUED`, `RUNNING`, `WAITING_INPUT`, `PAUSED`, `INTERRUPTED`, `COMPLETED`, `FAILED`, `CANCELLED`.
- Phase: discovery, preflight, baseline, analysis, planning, generation, repair, verification, gap_review, final_validation, reporting.
- Outcome ornekleri: `TARGET_REACHED`, `TARGET_ALREADY_MET`, `TARGET_NOT_MET_PLATEAU`, `TARGET_NOT_MET_BUDGET`, `BLOCKED_TESTABILITY`, `BLOCKED_ENVIRONMENT`, `BASELINE_FAILED`, `INVALID_COVERAGE_EVIDENCE`, `POLICY_VIOLATION`, `SOURCE_CHANGED`, `QUALITY_REVIEW_REQUIRED`.
- Verification: `UNVERIFIED`, `TARGET_ONLY`, `AFFECTED_SCOPE`, `FULL_DECLARED_SCOPE`.
- Apply: `NOT_REQUESTED`, `READY_FOR_REVIEW`, `APPLYING`, `APPLIED`, `CONFLICT`, `REJECTED`.

Gecerli gecisler state machine tablosu ve testleriyle tanimlanir. `TARGET_REACHED` icin butun ilgili quality/regression/integrity gate'leri gecmis olmalidir. Hedef olculdu ama kapsam eksikse outcome/gate summary bunun basari sayilmasini onler.

### 14.2 Checkpoint icerigi

Her checkpoint manifestinde en az:

- Job/proje/location/hedef kimlikleri ve kullanici hedefi.
- Kaynak snapshot, HEAD/dirty/build/policy/parser/toolchain fingerprint'leri.
- Son kabul edilen test seti, parent checkpoint ve reconstruction bilgisi.
- Baseline ve son trusted test/coverage run ID'leri, artifact hash'leri.
- Analiz/tasarim planlari, kabul/red adaylar, kalan gap/scenario ve strateji gecmisi.
- Aktif asama, siradaki eylem, onceki hata, kalan butce.
- Requested/resolved model ve worker session referansi; devam etmek icin eski session zorunlu degil.
- Manifest schema surumu, generation/fencing token, dogrulama seviyesi ve olusturma zamani.

Kritik her asama gecisinden sonra checkpoint al. Kabul edilmemis aday `candidate` olarak kaydedilebilir ama best/tested checkpoint'e terfi etmez. Gecmis source/regresyon kapsamiyla olculen best sonuc yeni kaynakta gecerli gibi gosterilemez.

### 14.3 Atomic yayinlama protokolu

Dosya sistemi ve SQLite tek ortak transaction paylasmaz. Bunu 'transaction actik her sey atomik' diyerek gecistirme:

1. Artifact'i job'a ait gecici dosyaya yaz, boyut/hash/schema dogrula; desteklenen flush/fsync uygula.
2. Ayni dosya sistemi icinde content-addressed immutable konuma atomic rename/publish yap. Partial file READY olmaz.
3. Manifest blob'u da ayni sekilde publish et.
4. Kisa DB transaction'inda lease fence ve parent generation dogrula; READY artifact referanslarini, event'i ve checkpoint pointer'ini commit et.
5. Publish edilmis fakat DB tarafinda referanslanmamis blob'lar guvenli grace suresi ve referans kontrolu sonrasinda orphan GC ile temizlenebilir.
6. DB manifest'i var ama blob eksik/bozuksa checkpoint kullanilmaz; onceki guvenilir checkpoint ve acik recovery tani sonucu kullanilir.

Windows file locking/antivirus kaynakli rename hatalarinda bounded retry ve acik hata olsun. Process crash ve disk dolu senaryolariyla her adimi test et. Kritik kabul islemi sirasinda transaction'in yarisi 'done' gozukemez.

### 14.4 Lease, fencing ve is sahipligi

Ayni workspace/job'u iki MCP process'i ayni anda yonetemesin. Lease acquire/renew transaction'li; token monoton artar. Her state/candidate kabul/pointer guncellemesi token kontrol eder. Eski worker token'i geri donerse sonucu stale olarak kaydet ve best set'e uygulama.

Lease suresi bitmesi eski JVM'in oldugunu kanitlamaz. Worker/container PID ile birlikte baslangic zamani ve instance ID sakla. Resume'da once sahipligi bilinen eski process'in durumunu kontrol et/durdur veya karantinaya al. PID reuse nedeniyle alakasiz process oldurme.

Kilitleri sadece bellekte veya `job.lock` varligina baglamak yeterli degildir. Farkli job ayni kaynak test output alanini paylasmaz. Model cagrilarinda at-least-once ihtimali olabilir; kalici aday kabulu idempotent olur.

### 14.5 Resume algoritmasi

1. Uygun yarim isi proje/location baglamindan bul; birden cok aday varsa netlestir.
2. Lease/fence al, eski process/yarim operation durumunu cozumle.
3. DB schema, checkpoint manifest ve tum zorunlu blob hash'lerini dogrula.
4. Hedef checkout'un kaynak/build/dirty fingerprint'ini yeniden kontrol et.
5. Degisiklik yoksa son kabul edilmis test setini geri kur. Tamamlanma kaniti olmayan test/coverage run'ini basarili kabul etme; ilgili dogrulamayi tekrar calistir.
6. Kaynak/build degismisse onceki calismayi silme. `SOURCE_CHANGED` ile stale olcumu belirt; kontrollu rebase/rebaseline icin yeni job revision/snapshot olustur. Hangi artifact'in yeniden kullanilabildigini gerekcelendir.
7. Yeni worker'a kompakt Handoff artifact'i ver; onceki tum sohbeti tekrar okutma. Gecerli analiz/plan tekrar uretimi zorunlu olmasin.
8. Siradaki guvenli asamadan devam et; daha once reddedilmis adaylari ayni baglamda yeniden deneme.

Model degisikligi, coverage hedefini ya da policy'yi sifirlamaz. Kullanici gercekten yeni hedef/butce verirse revision/event ile kaydet; eski hedefteki basari iddialarini yeniden yazma.

### 14.6 Kesintinin yonetilecegi noktalar

Discovery, analiz cevabinin alinmasi, candidate uretimi, patch yazimi, test derleme, test kosusu, coverage raporu, checkpoint publish/DB commit, final report ve test apply esnasinda kill/restart deneyleri yapilacak. Normal exception testi tek basina process kesintisi testi sayilmaz.

---

## 15. Ciktilar ve profesyonel rapor

### 15.1 Yerlesim

Platformun kullaniciya ozel uygulama veri dizinini kullan; operator override yapabilir fakat guvensiz paylasimli root reddedilir. Ornek mantiksal yapi:

```text
<USER_APP_DATA>/ai-test-engineering/
  state.db
  config/                    # Ozel profil ve secret referanslari
  blobs/sha256/              # Immutable, hash ile adreslenen artifact'ler
  projects/<project-id>/     # Envanter/cache manifestleri
  jobs/<job-id>/
    checkpoints/
    candidates/
    workspace/               # Sahipligi kanitli izole calisma alani
    runs/<run-id>/
    reports/
      index.html
      report.json
      summary.txt
      changes.patch
      manifest.json
      jacoco/
      test-results/
  logs/
  backups/
```

Bu dosyalar hedef kaynak reposuna veya `ai-test-engineering/ai/` klasorune yazilmaz. Windows/Linux farkli path kurallari desteklenir; yukaridaki yapi literal sabit kullanici adi icermez.

### 15.2 OpenCode ciktilari

Progress'te asama, hedef, son dogrulanmis LINE/BRANCH, aktif deneme, gecen sure ve durum verilir. Her model token'ini log diye ekrana akitma. Durum metni JSON'daki motor gerceginden turetilsin.

Final ozet: hedef saglandi/saglanamadi, before/after sayaclar ve yuzdeler, eklenen/degisen testler, calisan/gecen/failing/skipped test sayilari, regression kapsami, production degisikligi 0 kontrolu, kalan engeller, model/roller, rapor ve patch yeri. Ornekteki rakamlar gercek run yoksa kullanilmaz.

### 15.3 HTML muhendislik raporu

Sade, kurumsal, okunabilir offline rapor; tek `index.html` ve goreli kanit dosyalari. Harici font/script/gorsel yok. Neutral/slate zemin, beyaz kart/tablo, az ve anlamli durum rengi. Erisilebilirlik icin durum sadece renkle belirtilmez; metin/ikon/etiket de olur. Gereksiz glow/gradient, buyuk pazarlama basliklari ve anlamsiz dashboard kartlari yok.

Zorunlu bolumler:

1. Proje/checkout/snapshot/hedef ve rapor zamani; kaynak kodun hangi halinin olculdugu.
2. Karar: `TARGET_REACHED` veya acik hedef-saglanamadi durumu; kalite/regresyon/safety gate sonuclari.
3. Sinif bazli once/sonra LINE ve BRANCH: covered/missed/toplam, yuzde, hedef; N/A ve unavailable ayri.
4. Yapilan test degisiklikleri ve senaryo bazli aciklama; yeni/degisen/kabul/rejected/uygulanan farki.
5. Test run ve regresyon kapsam bilgileri; skipped/failure/unstable durumlarini gizleme.
6. Iterasyon zaman cizgisi: strateji, model, sonuc ve neden kabul/red edildigi.
7. Kalan coverage gap'leri, denenen yontemler, engel kaniti/belirsizlik ve alternatif oneriler.
8. Production/build/coverage policy butunluk sonucu; kontrol kapsami ve istisna varsa acik hata.
9. AI katkisi: hangi model hangi rolde calisti; olcumlerin araclarca, yorumlarin AI tarafindan uretildigi ayrimi.
10. Ham JaCoCo HTML/XML/exec, test sonuclari, redakte log, changeset ve checkpoint manifestine goreli baglantilar.

Raporun resmi sonucu modele yazdirilmaz; dogrulanmis JSON'dan render edilir. AI aciklama metni ayri alanda kaynak/finding ID'leriyle gosterilir. 'Production degismedi' etiketi gercek manifest karsilastirmasi olmadan basilmaz.

### 15.4 JSON ve kanit paketi

`report.json`: schema_version, job/project/source/toolchain/model metadata, targets, baseline/final counter'lar, run summary, quality/integrity gates, gaps, iterations, outcome, verification_scope, apply_state, artifact manifest.

`manifest.json`: her artifact icin relative path, content hash, byte size, kind, schema/tool version ve gizlilik sinifi. Raporun bir dosyasi eksikse export verification bunu yakalar.

JaCoCo'nun ham `.exec`/XML/HTML verisi mevcut yurutme yolunun gercek urettigi sekilde saklanir. Basarisiz veya coverage yapilandirmasi olmayan job'da sahte JaCoCo raporu yaratma; engine HTML raporunda neden uretilmedigini belirt. Raw kaynak iceren HTML hassastir, otomatik mail/CI/public upload yapilmaz.

IDE incelemesi opsiyoneldir. IntelliJ veya baska IDE'nin destekledigi import bicimi kurulu IDE surumune gore dogrulanir; raporun kendisi IDE'ye bagli degildir. Kullanicinin sonuc almak icin IDE'den yeni coverage run baslatmasi zorunlu olamaz.

### 15.5 Zaman ve model maliyeti

Worker request suresi, test/build suresi, raporlama ve bekleme sureleri ayrica olculur. Saglayici token/usage donuyorsa kaydedilir; donmuyorsa `unknown`, sifir degil. Tahmini ucret, kurumun gercek fiyat profili yoksa uretilmez.

Bu urunun veya tek sinif test gorevinin kac saatte bitecegine garantili sayi koyma. Benchmark olcumleri model profili, cold/warm dependency cache, donanim ve fixture kapsamiyla raporlanir. Modelin cevap hizi ile gercek build/recovery dogrulama suresini ayir.

---

## 16. Test degisikliklerini kullanici projesine uygulama

Default teslimat staging'de dogrulanmis testler + patch + rapordur. Kullanici onayi olmadan orijinal checkout'a yazma yok. Bu, otomatik analiz/test dongusunde her adimda onay istemek anlamina gelmez; sadece son degisikligin kullanici dosyalarina aktarimidir.

`test_apply` icin:

1. Onay, tam job/checkpoint ve gosterilen patch digest'ine bagli olmali. Sonradan degisen patch eski onayi kullanamaz.
2. Istemcinin gercek onay akisinin desteklendigi dogrulanmali. Modelin kendi doldurdugu `approved: true` insan onayi kaniti degildir. OpenCode izinleri `ask` olabilir, fakat auto-approve aciksa tek basina guvenilir onay sayilmaz. [S27]
3. Varsayilan `allow_workspace_apply=false`. Guvenilir client approval adapter'i ve onay politikasi dogrulanmis kurulumda aktif edilebilir. Bu kabiliyet yoksa patch-only sonuc doner; kullaniciya yeni CLI yazilmaz, kullanici Git/IDE ile patch'i kendisi uygulayabilir.
4. Aktarmadan hemen once checkout HEAD/dirty/test preimage hash'leri tekrar kontrol edilir. Kullanici arada ayni dosyayi degistirmisse overwrite yapma; `APPLY_CONFLICT` ve acik fark raporu ver.
5. Yalniz allowlist test dosyalari degisir. Source/build/protected dosyalarin manifest'i once/sonra ayni olmali.
6. Multi-file degisiklikler icin once yedek + apply journal + temp files olustur. Tum dosyalari tek FS transaction'inda degistirdigini iddia etme; crash recovery ile eksik islemi tamamla veya guvenli geri al.
7. Tekrar cagrida ayni patch ikinci kez uygulanmaz; `APPLIED` kaydi ve mevcut hash'ler dogrulanir.
8. Otomatik commit/push yok; runtime urun, kullanicinin Git kimligini veya remote'unu degistirmez.

Onay kanalini destekledigini iddia eden OpenCode adapter'i gercek olumlu/ret/auto-approve/baglanti kopma senaryolariyla test edilir. Saglanamayan onay kanali gizlenmez; bu, staging'deki otomatik test gelistirme ve raporlamayi engellemez.

---

## 17. Model, kurulum ve konfigrasyon tasarimi

### 17.1 Model bagimsizligi

Provider kimligi, model kimligi ve insan-okunur model adi farkli alanlardir. Kullanici tarafindan verilen kurum ici model adlari harf/space/provider prefix dahil birebir dogrulanir. Otomatik trim/rename/provider prefix silme, modelin baska yetki kaydina donmesine sebep olamaz.

Kaynak kodda kuruma ait model alias'i, URL veya varsayilan dis provider sabitleme. Secim sirasi: job'a acik verilen yetkili profil, proje profili, kullanici varsayilan profili. MCP, ana OpenCode sohbetinin aktif modelini her istemcide kendiliginden bilemez; aktarilmayan bilgiyi tahmin etme. [S07][S26]

Bir defalik profil dogrulamasi models/config sorgusu ve minimal capability probe ile yapilir: API erisimi, arac/structured output ya da JSON uyumlu cevap, maksimum baglam icin gercek konfig, timeout/streaming davranisi. Modelin adindan kodlama basarisi veya tool-call destegi cikarilmaz.

### 17.2 Worker yasam dongusu

OpenCode binary varligi/surumu dogrulanir. SDK client, yonetilen worker server'a baglanir. Startup/health timeout ve port cakismasi sinirli retry ile ele alinir. Session ID job/role ile saklanir; sonlanma/cancellation kayitli olur. Server crash olursa ayni job'da yeni session olusturulur ve Handoff verilir.

Server/SDK dokumaninda alan adi uyusmazligi gorulurse installed type/OpenAPI semasi dogrulanir. Semantik olarak 'prompt async/format/model/session abort' yeteneklerini isteyen adapter yaz, belgede gordugun isimle calismayan runtime cagrisi birakma. Uygulama testleri gercek SDK schema'sini kontrol etsin.

Kimlik dogrulama hatasi, model yetkisi yoklugu, context overflow, provider timeout/429, schema cevabi bozuklugu ve server problemi farkli tani kodlaridir. Bekleyen is 'basarili' kapanmaz; retry edilebilir/edilemez ve kullanici aksiyonu belirtilir. Fallback listesi sadece onayli kurum ici profillerden gelir.

### 17.3 Kurulum paketi

- Repo icindeki scriptler Windows PowerShell ve Linux icin kurulum/verify/uninstall akisini sunar; test talebi icin yeni kullanici CLI'i yaratmaz.
- Runtime package, Java analiz helper'i, rapor template'leri, schema/migration ve kisa skill/agent birlikte paketlenir.
- Lockfile, artifact checksum ve surum manifesti dahil edilir. Global kontrolsuz `npx ...@latest` veya uzaktan script pipe'lama varsayilan kurulum olamaz.
- OpenCode config degisiklikleri merge/diff/yedek/idempotency ile uygulanir. Kullanicinin diger model, tool, skill ve proje ayarlari korunur.
- Host ve container tarafinda trusted CA/proxy/mirror ayarlari icin secret-reference bazli dokumantasyon bulunur. TLS dogrulamasini kapatma cozum degildir.
- Kapali agda mevcut artifact/mirror'larla kurulum ve offline fixture run yolu belgelenir. Internetin her zaman acik oldugu varsayilmaz.
- Test-only policy, varsayilan coverage metrics, kaynak butcesi, storage root, izinli proje kokleri, runner ve model profilleri configuration schema ile dogrulanir.

Kurulumun basarili oldugunun kaniti sadece 'npm install bitti' degildir: MCP initialize/discover profiline gore tool listing, project inspect, worker provider probe ve gercek sentetik Maven/JaCoCo smoke gerekir. Eksik kurum yetkisi veya sandbox kurulumu acik `BLOCKED` olarak gorulur.

---

## 18. Repository yapisi ve urunun AI gelistirme hafizasi

### 18.1 Hedef organizasyon

```text
ai-test-engineering/
  AGENTS.md
  AKTIF_GOREV.md
  README.md
  SECURITY.md
  CONTRIBUTING.md
  .gitignore
  .gitattributes
  .editorconfig
  package.json
  package-lock.json
  tsconfig.json
  ai/
    PROJECT_STATE.md
    BACKLOG.md
    ACCEPTANCE_MATRIX.md
    decisions/
    research/
    plans/
    checkpoints/
    handoffs/
    evidence/
  src/
    mcp/                     # Ortak tool registry, v1/v2 adapter
    application/             # Yuksek seviye use-case'ler
    domain/                  # Job/policy/checkpoint/sonuc semantigi
    discovery/
    orchestration/
    workers/opencode/
    runners/                 # Izole Maven/process/container yonetimi
    policies/
    coverage/
    verification/
    storage/
    reporting/
    configuration/
  java-support/              # Urune ait JavaParser/Java metadata yardimcisi
  schemas/
  migrations/
  templates/
  integrations/opencode/
    skills/test-engineering/SKILL.md
    agents/
    config.example.json
  scripts/
  tests/
    unit/
    integration/
    contract/
    recovery/
    security/
    fixtures/
  benchmarks/
  docs/
    architecture.md
    installation.md
    usage.md
    configuration.md
    data-dictionary.md
    compatibility.md
    security.md
    operations.md
    troubleshooting.md
    acceptance.md
  .github/workflows/
```

Dizinler bos dosya gostermelik olsun diye acilmaz; sorumluluklari olan gercek implementasyon gelir. Is mantigi adapter altina saklanmaz. Hafif organizasyon duzeltmesi gerekirse ADR ile yap; kullaniciya acik dosya adi `AKTIF_GOREV.md` degismez.

### 18.2 AGENTS baslangic protokolu

`AGENTS.md` kisa kalir; bu belgenin tamami kopyalanmaz. Sunlari yonlendirir:

1. Aktif gorevi ve `ai/PROJECT_STATE.md`'yi oku.
2. Git branch/HEAD/status/remote'u kontrol et; uncommitted dosyalarin sahibini tahmin ederek silme.
3. Son handoff, ilgili ADR, backlog ve kabul durumunu oku.
4. Onceki 'done' iddiasini ilgili commit/artifact/test kanitiyla kontrol et.
5. Siradaki onayli isi uygula; kapsam disi yeni backlog'u kendiliginden aktif goreve ekleme.
6. Anlamli parcadan sonra test sonucunu, kalan isi ve devam noktasini kaydet.
7. Her commit/push oncesi Git kimligi, ASCII, gizlilik ve staged diff kontrolu yap.

Mevcut baska proje AGENTS dosyalarini toplu degistirme. Bu urunun kurulumu hedef Java projelerinin AGENTS dosyasini ezmez.

### 18.3 Gelistirme kayitlarinin icerigi

`ai/PROJECT_STATE.md` kisa ve guncel:

- Aktif gorev/version, mevcut asama, gercek uygulama durumu.
- Son ilgili commit ve working tree'deki onemli degisiklikler.
- Gecen/kalan kabul kriterleri ve kanit referanslari.
- Acik blocker, varsayimlar ve operator tarafinda gerekli kabiliyetler.
- Sonraki modele verilen ilk somut is.

`ai/BACKLOG.md`: is ID, ilgili R/AC, durum (`TODO`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`), bagimliliklar, evidence. 'Kod var' ile 'dogrulandi' ayri tutulur.

`ai/decisions/`: problem, incelenen alternatifler, secim, gerekce, risk, kaynak, kabul testi ve karar tarihi. Sonradan karar degisirse onceki kayit silinmez.

`ai/research/`: bu belgedeki kaynaklar, dogrulanan surum/blob/commit, alinan/reddedilen fikir ve uygulamaya etkisi. Sadece link koleksiyonu degil karar baglantisi bulunur.

`ai/checkpoints/`: gelistirme asamasi, degisen dosyalar, calistirilan komutlarin sanitized hali, test ozetleri, henuz dogrulanmamis alanlar.

`ai/handoffs/`: model degisimi/kesinti oncesi acik durum ve sonraki eylem. Model adi bilinmiyorsa `unknown`; GPT veya baska isim tahmin etme. Gizli dusunce zinciri yerine acik engineering summary kullan.

`ai/evidence/`: sadece urune ait sentetik testlerden sanitized kanitlar/manifestler. Buyuk test loglarini Git'e gommek yerine kucuk ozet ve uretilme komutu/hash kullan. Kurum ici gercek test logu/source bu klasore alinmaz.

### 18.4 Gelistirme kesintisinden sonra davranis

Kullanici "AGENTS.md dosyasini oku ve onayli aktif gorevden devam et" dediginde sadece bu belgeyle onayli isi devam ettir. Yeni model kayitlara dayanir ama gercek Git/dosya/test durumunu kontrol etmeden 'onceki model bitirmis' demez. Kayitlar eksikse mevcut koddan kanitli durum cikarir; tum sistemi sifirdan yazmaya veya repo temizlemeye baslamaz.

Iki model paralel calisacaksa dosya/is sahipligi ve merge sorumlusu acik olur. Ayni dosyaya kontrolsuz eszamanli yazma yok. Entegrasyonu yapmadan iki ayri branch'in tek urun olarak gectigini iddia etme.

---

## 19. Tek gorevin uygulama asamalari

Bu asamalar ayri MVP/gelecek surum teslimatlari degildir. Tam urunun ayni gorev altindaki tamamlanma sirasi ve devam noktalaridir.

| Asama | Yapilacak somut is | Asama cikisi / dogrulama |
| --- | --- | --- |
| P00 - Gercek durum | Repo/HEAD/visibility, yerel ortam, Git kimligi, mevcut dosyalar, arastirma teyidi; `ai/` ve AGENTS. | Baslangic raporu; kullanici dosyasi kaybi yok; uyumluluk ve gizlilik riski kayitli. |
| P01 - Calisan dikey cekirdek | TS proje, schema/domain, tek tool registry, resmi MCP adapterleri, config, storage migration, artifact store. | Gercek stdio client tool list/call testi; DB tekrar acilinca veri kalir. |
| P02 - Guvenli kesif | Snapshot/allowlist, JavaParser helper, POM/module/target discovery, envanter sorgulari. | Tek/cok modul/ayni sinif/dirty/Unicode path fixture'leri dogru cozulur. |
| P03 - Izole gercek olcum | Runner ve process supervisor, effective Maven plan, baseline, JaCoCo class provenance/parser, regresyon. | Gercek Java fixture derlenir/test edilir; coverage ham ve hesaplanan sonuclar eslesir. |
| P04 - OpenCode worker | Guvenli worker config, role prompts, typed artifact/changeset, model profiling, cancellation. | Gercek OpenCode SDK contract/smoke; scripted provider yalniz deterministik test amacli. |
| P05 - Test muhendisligi | Analiz/plan/generation/repair, aday kabul, kalite, gap stratejileri, per-target esikler. | Reachable hedef ve kaliteli no-coverage-gain testleri; kotu adaylar reddedilir. |
| P06 - Dayaniklilik | Job scheduler, fencing, checkpoint atomic publish, recovery, model degisimi, pause/cancel. | Sert process kill, disk/DB sorunlari, kaynak degisimi ve duplicate resume testleri gecer. |
| P07 - Cikti ve aktarim | HTML/JSON/JaCoCo/diff, artifact export verification, review/onay/apply journal. | Rapor sayilari gercek DB ile ayni; XSS/path/missing artifact/conflict/cutoff testleri gecer. |
| P08 - Kurulum ve kalite | Windows/Linux kurulum, config merge/uninstall, schema migration/backup/retention, docs ve CI. | Temiz ortam smoke, bootstrap ve yeniden kurulum idempotency; secret sizintisi yok. |
| P09 - Tam kabul | Butun AC matrisi, gercek model/proje pilotu, bagimsiz son inceleme, Git teslimati. | Eksikler acik; yalniz kaniti olan kriterler VERIFIED; urun ancak 22. bolume gore tamamlandi. |

Her asamada calisan testleri gec tutma. Ozellikle P03 gercek Maven/JaCoCo cikisi ve P04 gercek OpenCode entegrasyonu erken kurulmali; tum siniflari yazip entegrasyonu sona birakma.

P00 sonunda kutuphane/API uyumsuzlugu bulunursa ilgili adapteri duzelt, burada secilen is sozlesmesini koru. Ayri bir 'arastirma isi' verip ana uygulamayi belirsiz sure erteleme. Esas bilinmeyenler yerel surum, yetki ve sandbox kabiliyeti; bunlar once olculerek ele alinacak.

---

## 20. Kabul testleri ve kanit matrisi

Asagidaki AC'lerin her biri icin `ai/ACCEPTANCE_MATRIX.md`'de durum, test/fixture, calistirma kimligi, toolchain, sonuc ve kanit dosyasi/commit yer alsin. `NOT_RUN`, `BLOCKED`, `FAILED`, `PASSED` ayridir. Kodun mock testten gecmesi gercek Maven/OpenCode entegrasyon testi yerine yazilamaz.

### 20.1 Entegrasyon, proje ve kapsam

| AC | Senaryo | Beklenen kanit |
| --- | --- | --- |
| AC01 | Bos repo kurulum ve ikinci modelle devam | AGENTS/ai kayitlari var; mevcut kullanici dosyasi korunur. |
| AC02 | OpenCode-uyumlu MCP profili | Gercek istemci server'a baglanir, tool listeler ve dogru typed cevap alir. |
| AC03 | Yeni MCP protokol profili | Resmi v2 client ile ayni tool use-case'leri calisir; v1 API isimleri karismaz. |
| AC04 | Tek cumleli talep | 'PaymentService icin coverage %90 olsun' girisinden dogru root/target/metric ile is baslar. |
| AC05 | Cok modullu reactor | Dogru modul, build dependency sirasi, source/test roots ve class raporu bulunur. |
| AC06 | Ayni isim/farkli FQCN veya modul | Guvenilir baglam yoksa aday sorulur; yanlis sinifa test yazilmaz. |
| AC07 | Custom test root / parent profil | Standart olmayan kok ve inherited plugin/property dogru cozulur. |
| AC08 | Paket/modul veya cok hedef | Somut hedef listesi/fingerprint; her hedef ayri olculur; ortalama ile basari yok. |
| AC09 | Git'siz lokal proje / iki checkout | Kimlikler dogru; ayni remote iki workspace'i yanlis birlestirmez. |
| AC10 | Dirty/untracked kaynak | Gercek current source snapshot'a girer; stash/reset/clean ve veri kaybi yok. |
| AC11 | Windows bosluk/Unicode/case/path | Path cozumleme ve process argumanlari dogru; komut enjeksiyonu yok. |
| AC12 | Envanter stale/silinmis kaynak | Degisen bilgiler yenilenir; gecmis silinmez; eski coverage guncel sanilmaz. |

### 20.2 Gercek test ve coverage

| AC | Senaryo | Beklenen kanit |
| --- | --- | --- |
| AC13 | Java8/JUnit4 fixture | Gercek Maven run, test sonucu ve JaCoCo sayaclari. |
| AC14 | Java17/JUnit5+Mockito fixture | Framework korunarak yeni/anlamli test ve gercek run. |
| AC15 | Java21/cok modul fixture | Toolchain/bytecode ve modul raporu dogrulanir. |
| AC16 | Mevcut testi olmayan sinif | Framework varsa test uretilir; 0 test 'passed suite' sayilmaz. |
| AC17 | Bozuk/unstable baseline | Yeni test hatasi gibi raporlanmaz; eski test disable edilmez. |
| AC18 | JaCoCo argLine ve existing agent | Mevcut JVM ayari korunur; double agent ve fork=0 olcum sorunu yakalanir. |
| AC19 | Eski exec/XML veya class ID uyusmazligi | Olcum reddedilir, gercek yeniden olcum veya blocked sonucu gelir. |
| AC20 | Aggregate/child tekrar sayimi | Ayni kapsamin verisi iki kez sayilmaz. |
| AC21 | %89.96 sonucu, %90 hedef | Hedef saglanamadi; rounded gosterim karari degistirmez. |
| AC22 | Branch 0 / line debug yok / report eksik | N/A, unavailable ve invalid farkli; sahte %100 yok. |
| AC23 | Cok hedefte %100 ve %80 | Ortalama %90 gerekcesiyle tam basari ilan edilmez. |
| AC24 | Surefire tarafindan kesfedilmeyen yeni test | Uretilmis dosya var diye calismis sayilmaz. |
| AC25 | Exception testi coverage artirmiyor | Anlamli davranis kazanci kayitli; sahte branch artisi yok. |
| AC26 | Tam final regresyon | Hedef/etkilenen/tam beyan edilmis kapsam ve kaynak butunlugu kanitli. |
| AC27 | Erisilebilir %90 hedefi | Sentetik fakat gercek Java class'ta test-only ile hedef ve kalite gate'leri saglanir. |
| AC28 | Sinirli test-only hedefe ulasamiyor | Best set korunur; blocker/deneme kaniti, hedef-not-met ve sifir prod degisimi. |
| AC29 | Model uydurma coverage/sonuc donuyor | Model sayisi yok sayilir; gercek runner sonucu kullanilir. |
| AC30 | POM degistirmeden olcum mumkun degil | Acik configuration barrier; build dosyasi veya exclusion otomatik degismez. |

### 20.3 Kalite ve guvenlik

| AC | Senaryo | Beklenen kanit |
| --- | --- | --- |
| AC31 | Production/POM/config yazan patch | Path/policy guard reddeder; immutable manifest ayni. |
| AC32 | Test silme/ignore/skip/assertion gevsetme | Aday reddedilir; mevcut basarili test kapsam kaybi yok. |
| AC33 | Bos/tautolojik/duplicate/mock-SUT test | Kalite finding'i; hedefe katkisi varmis gibi kabul edilmez. |
| AC34 | Anlamli existing assertion helper | Yalniz kelime/regex yuzunden yanlis bos-test siniflamasi yapilmaz. |
| AC35 | Private reflection/public API degisikligi | Yasak aday; ayri production refactor onerisi uygulanmaz. |
| AC36 | Test source ile production FQCN shadow | Tespit edilir ve reddedilir. |
| AC37 | Test kaynaklarindaki prompt injection | Policy/arac yetkisi degismez, sirlar okunmaz, recursive MCP yok. |
| AC38 | Symlink/junction/traversal/komut enjeksiyonu | Yetkili kok disi okuma/yazma ve shell calistirma engellenir. |
| AC39 | Runner host source/home/secrets erisimi | Kontrollu saldiri fixture'i okuyamaz/yazamaz; denied kaniti var. |
| AC40 | Test process network/process/disk kotasi | Sinirlar gercekten uygulanir; musteri ortamina cikis yok. |
| AC41 | Sahte/bozuk XML, DTD/XXE ve XSS | Harici entity/ag erisimi yok; guvenli parse veya acik reject; rapor text escape. |
| AC42 | Global OpenCode config/plugin mirasi | Worker beklenmeyen MCP/bash/plugin/formatter yetkisi almaz. |
| AC43 | Model secret ve ic endpoint redaction | Log, rapor, ai evidence, Git diff ve paket export'unda sizinti yok. |
| AC44 | Sandbox/provider eksik | Sessiz insecure fallback yok; acik blocked/prerequisite sonucu. |

### 20.4 Kesinti, storage ve uygulama

| AC | Senaryo | Beklenen kanit |
| --- | --- | --- |
| AC45 | Analiz/generation sirasinda hard kill | Yeni oturum plan/checkpoint'i devralir; yarim aday accepted olmaz. |
| AC46 | Maven/JVM sirasinda kill ve resume | Process sahipligi dogrulanir; orphan/eski run basari sayilmaz. |
| AC47 | Artifact publish ile DB commit arasinda kill | Partial checkpoint gorunmez; orphan/eksik blob guvenle yonetilir. |
| AC48 | Ayni job'a iki resume/start | Tek aktif ownership ve tek kabul etkisi; duplicate dongu yok. |
| AC49 | Lease'i dusmus worker sonradan cevapliyor | Eski fence ile sonuc kabul edilmez. |
| AC50 | Yeni modele gecis | Onceki test/deneme/kalan plan korunur; eski session gerekmiyor. |
| AC51 | Kaynak/POM/dirty dosya arada degisiyor | Stale coverage yakalanir; rebaseline/revision acik, eski kazanim korunur. |
| AC52 | Disk dolu/DB busy/DB schema uyumsuz | Kanit kaybi/sahte completed yok; recoverable ya da acik blocked. |
| AC53 | Migration + WAL backup/restore | DB ve blob manifest tutarli; FK/hash dogrulamasi geciyor. |
| AC54 | Retention/kota | Resume/best/pending patch blob'lari yanlislikla silinmez. |
| AC55 | Cancel/pause/time budget | Sadece ilgili process durur; son verified set raporlu ve devam semantigi acik. |
| AC56 | Basarisiz ayni strateji tekrar ediyor | Fingerprint/deneme hafizasi tekrari onler; plateau maksimum ispat sayilmaz. |
| AC57 | Apply onayi yok/auto-approve belirsiz | Orijinal checkout degismez; patch-only guvenli yol. |
| AC58 | Apply onayi + sonradan dosya degisimi | Preimage conflict, overwrite yok. |
| AC59 | Multi-file apply sirasinda kesinti | Journal ile guvenli tamamlanma/geri alma; karisik durum saklanmaz. |
| AC60 | Tekrar apply | Idempotent; test degisikligi iki kez uygulanmaz. |

### 20.5 Rapor, dagitim ve tam kullanici deneyimi

| AC | Senaryo | Beklenen kanit |
| --- | --- | --- |
| AC61 | HTML/JSON/DB tutarliligi | Tum counter/outcome/model/gate bilgileri ayni; AI yorumu ayri. |
| AC62 | Offline HTML ve baglantilar | Harici ag istegi yok; ham JaCoCo/log/diff referanslari calisir. |
| AC63 | Basarisiz/blocked job raporu | Rapor yine uretilir; olmayan coverage/artifact uydurulmaz. |
| AC64 | Envanter/gecmis sorgulari | Proje-paket-sinif-test-run-model iliskileri dogru ve sayfalanmis. |
| AC65 | Windows/Linux temiz kurulum/tekrar/uninstall | Kullanici ayarlari korunur; calisan smoke ve sahiplik bazli uninstall. |
| AC66 | Model auth/429/timeout/context/schema hatasi | Acik tani, sinirli retry, checkpoint korunur; dis provider fallback yok. |
| AC67 | Gercek yetkili OpenCode+LiteLLM pilotu | Sahte provider degil gercek modelle gercek Java test gelistirme/dogrulama. |
| AC68 | Model veya OpenCode kapatilip ertesi oturum resume | Kullanici cumlesiyle ayni job'a doner; gercek sonuclar ve dosyalar korunur. |
| AC69 | Urun gelistirmesinde model handoff | Sonraki model ai/ kanitlarindan kalan isi bulur; sifirdan baslamaz. |
| AC70 | Git teslimati | Dogru local author/committer, Turkce ASCII mesajlar, tests/secret scan gecer, izinsiz force/publish yok. |

### 20.6 Fixture tasarimi ve test yontemi

Sentetik fixture'ler gercek Java/Maven projeleri olacak; urune ait olduklari icin bu fixture POM'larini biz olusturabiliriz. Runtime'in MUSTERI POM'una dokunma yasagiyla karistirma. Fixture'ler bagimsiz beklenen coverage counter'lari, exception/boundary davranisi ve fail durumlari uretir.

Deterministik orkestrasyon testlerinde scripted/fake worker kullanmak serbesttir. Amaci same-input/same-output state machine, bozuk cevap, retry, duplicate ve crash testidir. Bu testler gercek LiteLLM/OpenCode entegrasyonu diye etiketlenmez. Benzer sekilde XML fixture parse testi, gercek JaCoCo instrumentation testi yerine gecmez.

Security fixture'leri kontrollu, yerel ve sentetik tutulur; gercek kurum sistemi hedeflenmez. Test raporu snapshot/golden dosyalarinda secret veya gercek proje kodu bulunmaz. Flaky e2e'yi 'retry until green' ile gizlemek yerine nedenini bul ve kanitla.

---

## 21. Git kimligi, Turkce ASCII ve teslimat kurallari

### 21.1 Yalniz repository-local kimlik

Bu projenin yerel clone'unda:

```bash
git config --local user.name "mehmet-karacan"
git config --local user.email "karacan.mehmet@hotmail.com"
git config --local user.useConfigOnly true
```

Global Git konfigurasyonuna dokunma. `user.name`, GitHub authentication kullanicisini degistirmez; remote push icin mevcut yetkili kimlik kullanilir. Token uretme/kaydetme veya credential helper'i ezme yetkisi bu gorevin parcasi degildir.

Commit oncesi `git var GIT_AUTHOR_IDENT` ve `git var GIT_COMMITTER_IDENT` kontrol edilir. Ortam degiskenleri local config'i override ediyorsa bu repository islemi icin guvenli duzelt; diger projelerin ortam/ayarlarini degistirme. Commit sonrasinda author ve committer gercek logdan dogrulanir.

### 21.2 Metin standardi

Yeni commit baslik/govde ve urune ait Turkce dokuman/aciklamalar Turkce ASCII yazilir. Ornek: `feat: kalici test gorevi ve checkpoint altyapisi eklendi`.

Kod identifier'lari teknik ASCII English olabilir. Unicode iceren Java kullanici kaynagini, fixture girdi degerini, orijinal hata metnini veya upstream lisansi transliterate etme. ASCII standardi, veri butunlugunu bozacak global replace degildir. Upstream telif/lisans metinleri korunur.

Commit message kontrolu otomatik test/hook veya script ile uygulanir. Repository'ye ait yeni dokumanlarda Turkce Unicode kacagini denetle; veri/fixture/lisans istisnalari acik allowlist olsun. Unicode path fixture'i bu kurala takilarak silinmez.

### 21.3 Commit/push disiplini

- Her mantiksal ve dogrulanmis asamada uygun commit; bozuk entegrasyonu 'tamamlandi' commit'iyle kapatma.
- Staged diff'i oku. Kaynak/POM policy testleri, unit/ilgili integration testleri ve secret scan olmadan kod degisikligini push etme.
- Public repository'ye sadece bu urunun kodu, sentetik fixture'i ve sanitized gelistirme bilgisi gitsin.
- Runtime customer source/DB/log/token dosyalari `.gitignore` ve ek secret/content kontroluyle korunur.
- `git add -A` ile kontrolsuz her seyi ekleme. Untracked kullanici dosyalarini sahipligi bilinmiyorsa commit'e katma.
- Remote'u dogrula: `mehmet-karacan/ai-test-engineering`. Baska repository'ye push yok.
- Gercek mevcut branch/koruma kurallarina uy. Bos repoda kullanicinin belirttigi varsayilan `main` olusturulabilir; mevcut branch varken zorla degistirme yok.
- Push'ta non-fast-forward veya koruma varsa force push yapma; guvenli fetch/reconcile ve gerekirse acik blocker.
- Kullanici istemeden release publish, npm publish, public artifact upload veya kurum e-postasi gonderme.
- Bu gorevin uygulanmasinda verilen Git kurallari customer test job'larina tasinmaz. Urun hedef projeye otomatik commit/push yapmaz.

Repository lisansi henuz belirtilmediyse kullanici adina rastgele acik kaynak lisansi secme. Bagimlilik lisans envanteri ve gerekli notices saglanir; urunun lisans karari ayrica kayit altina alinir. Arastirma kodunu kopyalamadan algoritmik fikirleri yeniden uygula.

---

## 22. Definition of Done ve nihai teslim

### 22.1 Urun kodu icin tamamlanma kosullari

MCP adapter, job motoru, proje envanteri, SQLite migration/repository, worker, runner, JaCoCo, kalite/plateau, checkpoint/recovery, rapor, guvenli apply yolu, kurulum ve gelistirme hafizasi GERCEK implementasyonlariyla bulunmalidir. Bos fonksiyon, fake success, `TODO: later`, gerekli yolda NotImplemented, tum modeli mock'layan demo veya yalniz README tamamlanma sayilmaz.

Typecheck/lint/unit/integration/contract/recovery/security testleri calistirilir. Tum kritik policy ve state gecisleri test edilir. Urunun kendi coverage sonucu raporlanir; metrik oyunlariyla kendisine de sahte basari verilmez. Yeni harici bagimliliklar minimal, versiyonlu, lisansi bilinen ve lockfile'li olmalidir.

Bagimsiz son inceleme: gereksinim matrisi, guven sinirlari, veri modeli, state transition ve rapor sonuc semantigi uzerinde yapilir. Ayni LLM'nin 'her sey guzel' demesi gercek test kaniti yerine gecmez.

### 22.2 Ortamla ilgili dogrulama siniri

Kurum ici modele veya kullanici Java projesine erisim bu uygulama ortaminda yoksa tum diger gelistirme isleri ve sentetik gercek Maven testleri yine tamamlanir. Eksik gercek kurum smoke'unu PASSED yazma. Son durum:

- `IMPLEMENTATION_VERIFIED`: gercek yerel fixture/toolchain/contract/kesinti testleriyle dogrulanan uygulama.
- `INSTITUTIONAL_ACCEPTANCE_PENDING`: kurum ici endpoint/model/sandbox/proje yetkisi bekleyen gercek pilot kriterleri.
- `FULL_ACCEPTANCE_VERIFIED`: ilgili ortamda zorunlu gercek pilot ve resume dahil tum kriterler gecmis.

Bu ayrim kapsam daraltma degildir. Ana is icin yeni `AKTIF_GOREV-2` uretme; ayni gorevin acik kabul maddelerini `ai/` kayitlarinda tut. Teknik olarak eksik ozelligi 'ortam yok' bahanesiyle kapatma. Ortam erisimi yoklugunu ise model tahminiyle asma.

### 22.3 Kullaniciya verilecek nihai gelistirme ozeti

Uygulayici model sonunda sunlari kanitlariyla raporlar:

- Gercekte ne implement edildi, hangi R/AC'ler gecti?
- Kurulum ve mevcut OpenCode icinde ilk kullanim nasil yapiliyor?
- Proje kayitlari ve runtime veriler nerede, neler Git'e gitmiyor?
- Gercek Maven/JaCoCo ve gercek model pilot sonuclari; yapilmayanlar acik etiketli.
- Production/test-only/kalite/guvenli apply/resume kontrollerinin kaniti.
- Son commit/branch/push durumu ve varsa acik blocker.
- Son handoff/state dosyalari; bekleyen ortam kabulunu surdurme noktasi.

'Aktif gorev tamamlandi' ancak bu tanima uyuyorsa yazilir. %90'a ulasamayan bir Java test job'unun dogru raporlanmasi urunun bir ozellik testinde basarili olabilir; o Java job'unun coverage hedefi saglanmis demek degildir. Urun gelistirme basarisi ile runtime job outcome'u birbirine karistirilmaz.

---

## 23. Arastirma kaynaklari, gozlem siniri ve izlenebilirlik

Tum kaynaklar 2026-10-09 tarihli bu arastirmada resmi belge, arastirma makalesi veya projenin kendi repository'si uzerinden incelendi. Dinamik `main/dev/trunk` sayfalari sabit release degildir. Uygulama sirasinda gercek installed/release surumu kontrol edilip lockfile ve uyumluluk belgesine kaydedilecektir.

### S01 - Hedef repository durumu

- `https://api.github.com/repos/mehmet-karacan/ai-test-engineering`
- `https://api.github.com/repos/mehmet-karacan/ai-test-engineering/contents/`
- Connector gozlemi: public, size 0, default branch metadata main; contents 'This repository is empty'. Mevcut commit/body analizi yapilmis gibi davranilmaz.

### S02 - CoverUp

- `https://github.com/plasma-umass/coverup`
- `https://github.com/plasma-umass/coverup/blob/main/src/coverup/coverup.py`
- `https://arxiv.org/html/2403.16218v3`
- Kod gozlemi: `State` checkpoint, `improve_coverage` olcum/hata dongusu ve aday kabul; test disable/import kurma yollarinin urun politikamiza alinmamasi.
- Incelenen `coverup.py` blob SHA: `6ad93d812cdfe38e00c186e440d86b33e464ec64`.

### S03 - ChatUniTest

- `https://github.com/ZJU-ACES-ISE/chatunitest-maven-plugin`
- `https://github.com/ZJU-ACES-ISE/chatunitest-core`
- `https://github.com/ZJU-ACES-ISE/chatunitest-core/blob/main/src/main/java/zju/cst/aces/api/phase/solution/COVERUP.java`
- `https://github.com/ZJU-ACES-ISE/chatunitest-core/blob/main/src/main/java/zju/cst/aces/api/impl/RepairImpl.java`
- COVERUP blob: `4b6d505212aadd9f981e04a2963229a7678715fc`.
- RepairImpl blob: `51b22e2032e82878e4ad382b270b8526932ccbe2`.
- Gozlem: test repair/coverage feedback faydali; coverage exception'inda basari benzeri boolean donusu bizim motorumuzda kabul edilmeyecek. Tek dosya gozleminden butun projenin guvenligi hakkinda genelleme yapilmadi.

### S04 - TestWeaver

- `https://github.com/FSoft-AI4Code/TestWeaver`
- `https://github.com/FSoft-AI4Code/TestWeaver/blob/main/README.md`
- README blob: `eaa3b58af87d6c46b4a30f1e6e514aa95ddb3337`.
- Gozlem: execution-aware feedback/slicing/closest-test yaklasimi ve Python deneyleri. Bu arastirmada README kapsaminda incelendi; Java uyumlu hazir urun diye onerilmedi.

### S05 - Meta TestGen-LLM makalesi

- `https://arxiv.org/abs/2402.09171`
- Gozlem: mevcut test iyilestirme ve adaylari guvence filtrelerinden gecirme yaklasimi. Kurum ici model basari orani tahmini uretilmedi.

### S06 - Qodo Cover bakim durumu

- `https://github.com/qodo-ai/qodo-cover`
- Gozlem: README'deki 2025-06-15 bakim durdurma bildirimi; cekirdek bagimlilik yapmama karari.

### S07 - OpenCode SDK ve server

- `https://opencode.ai/docs/sdk/`
- `https://opencode.ai/docs/server/`
- Gozlem: programatik session/server/client ve model konfigurasyonu; gercek surumle API contract testinin gerekliligi.

### S08 - MCP protokol degisiklikleri

- `https://modelcontextprotocol.io/specification/2026-07-28/changelog`
- Gozlem: yeni protokol lifecycle'i, Tasks'in resmi uzantiya tasinmasi ve baglam/oturum varsayimlarinin degismesi. Urun job durumu protokol oturumuna baglanmadi.

### S09 - Resmi MCP TypeScript SDK

- `https://github.com/modelcontextprotocol/typescript-sdk`
- `https://ts.sdk.modelcontextprotocol.io/v2/`
- Gozlem: v2 server/client paketleri ile v1 bakim/uyumluluk ayrimi. OpenCode kurulumunda gercek destek kontrol edilecek.

### S10 - OpenCode'un somut MCP bagimliligi

- `https://github.com/anomalyco/opencode/blob/dev/packages/opencode/package.json`
- Blob SHA: `9def9a322eb3c47435a7b0f0009b4035f0de01d7`.
- Gozlem: bu dosyada package version 1.18.35 ve MCP SDK 1.29.0 goruldu. Bunlar kullanicinin yuklu OpenCode surumu veya resmi son stabil release iddiasi degildir.

### S11 - OpenCode guvenlik modeli

- `https://github.com/anomalyco/opencode/blob/dev/SECURITY.md`
- Blob SHA: `e7e59f4a27ac2bd2ed5005f8851dcb946c08f914`.
- Gozlem: izinlerin sandbox olmamasi ve server erisiminin korunmasi. Urun icin OS/runtime guven siniri karari buradan desteklendi.

### S12 - JaCoCo counter semantigi

- `https://www.jacoco.org/jacoco/trunk/doc/counters.html`
- Gozlem: bytecode/line/branch farki, debug bilgisi, exception handling ve sentetik kod etkisi.

### S13 - JaCoCo agent konfigurasyonu

- `https://www.jacoco.org/jacoco/trunk/doc/prepare-agent-mojo.html`
- Gozlem: argLine/propertyName ve agent/exec ayarlari. Trunk snapshot surumu sabit dependency olarak alinmadi.

### S14 - JaCoCo Maven entegrasyonu

- `https://www.jacoco.org/jacoco/trunk/doc/maven.html`
- Gozlem: fork/agent olcum gereklilikleri ve raporlama. POM'suz her ortamda kurulum iddiasi yok.

### S15 - Node.js desteklenen surum aileleri

- `https://nodejs.org/en/about/previous-releases`
- Gozlem: Node 24 LTS secimi; uygulama basinda stabil/guvenli patch surumu lock edilecek.

### S16 - SQLite Node adapter'i

- `https://github.com/WiseLibs/better-sqlite3`
- Gozlem: transaction/worker thread olanaklari, desteklenen Node ve binary kurulum gereksinimi. Proje performans iddialari bizim benchmark sonucumuz olarak aktarilmadi.

### S17 - JavaParser

- `https://github.com/javaparser/javaparser`
- `https://javaparser.org/getting-started.html`
- Gozlem: AST ve symbol solver; kutuphaneyi product helper'inda kullanma, hedef Java POM'una eklememe karari. Destek language level uygulama surumuyle dogrulanacak.

### S18 - Container yurutme kontrolleri

- `https://docs.docker.com/engine/containers/run/`
- Gozlem: user, filesystem, network ve resource yurutme secenekleri. Tek ayarin tum guvenligi sagladigi iddia edilmedi; urune ait policy ve acceptance testleri gerekir.

### S19 - OpenCode konfigurasyon ve entegrasyon

- `https://opencode.ai/docs/config/`
- `https://opencode.ai/docs/mcp-servers/`
- `https://opencode.ai/docs/skills/`
- Gozlem: konfigurasyon birlestirme, MCP server ve skill entegrasyonu; worker miras ayarlarinin ayrica dogrulanmasi.

### S20 - Maven cok modul

- `https://maven.apache.org/guides/mini/guide-multiple-modules.html`
- Gozlem: reactor ve modul bagimliliklari; hedef sinif/modul build planini deterministik kurma karari.

### S21 - Surefire parametreleri

- `https://maven.apache.org/surefire/maven-surefire-plugin/test-mojo`
- Gozlem: test/fork/argLine davranisinin kurulu plugin surumune gore dogrulanmasi.

### S22 - JaCoCo aggregate raporu

- `https://www.jacoco.org/jacoco/trunk/doc/report-aggregate-mojo.html`
- Gozlem: dependency kapsamli toplama; parent altindaki her modulun kendiliginden tek goal ile olculdugu varsayilmadi.

### S23 - JaCoCo class kimligi

- `https://www.jacoco.org/jacoco/trunk/doc/classids.html`
- Gozlem: olcumde kullanilan class/bytecode ile raporlanan class'in eslesmesi.

### S24 - SQLite WAL

- `https://sqlite.org/wal.html`
- Gozlem: yerel dosya sistemi, eszamanlilik ve WAL davranisi. Lease/fence ve blob protokolu urune ait ek tasarimdir.

### S25 - SQLite backup

- `https://sqlite.org/backup.html`
- Gozlem: desteklenen online snapshot/yedekleme. Blob referans tutarliligi urune ait ek sozlesmedir.

### S26 - LiteLLM proxy

- `https://docs.litellm.ai/docs/proxy/user_keys`
- `https://opencode.ai/docs/providers/`
- Gozlem: konfigure edilen proxy/provider uzerinden yetkili model erisimi. Kurum ici endpoint'e veya model listesine bu arastirmada girilmedi; kapasite/latency/izin iddiasi uretilmedi.

### S27 - OpenCode izin ve auto-approve davranisi

- `https://opencode.ai/docs/permissions/`
- Gozlem: allow/ask/deny ve auto mode ayrimi; insan onayi bool alanina veya kontrolsuz ask varsayimina birakilmadi.

### Uygulama sirasinda kaynak dogrulama kurali

Bu arastirma mimari karar vermek icin yeterli baslangic kaniti saglar; kutuphaneleri burada calistirip kurumda benchmark yapildigi anlamina gelmez. Uygulayici; kaynaklari gerektigi kadar yeniden kontrol eder, installed versiyonlari sabitler ve gercek entegrasyon testleriyle dogrular. Kaynak reposunun kendi aciklamasi ile incelenmis kod ve olculmus sonuc ayni kanit seviyesinde degildir.

---

## 24. Ilk uygulanacak ve son korunacak is

**Ilk uygulanacak is:** Repo/local ortam/Git kimligini dogrula; `AGENTS.md` ve `ai/` gelistirme hafizasini kur; R01-R20 ve AC01-AC70 izlenebilirlik matrisini olustur; ardindan P01'in calisan MCP + SQLite dikey akisina basla.

**Her kesintide korunacak is:** Gercek kod/diff, son dogrulanmis test kaniti, kalan kabul maddeleri ve bir sonraki adim. Model hafizasinin veya sohbet gecmisinin varligina guvenme.

**Son korunacak ilke:** Bu urun sadece daha fazla test yazmaz. Production koduna dokunmadan anlamli test gelistirir, olcer, kanitlar, kesintiden devam eder ve hedef saglanmadiginda bunu durustce raporlar.
