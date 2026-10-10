# AKTIF_GOREV - AI Test Engineering: Nihai Tamamlama ve Kurumsal Kullanima Hazir Surum

## Bolum haritasi

Bu harita ilgili bolume dogrudan gider; normatif gereksinimler bolum metni ve kabul registry'sinde birlikte takip edilir.

- [0. Gorev sozlesmesi ve yetki siniri](#0-gorev-sozlesmesi-ve-yetki-siniri)
- [1. Kaynak gercegi, onceki gorevler ve mevcut aciklar](#1-kaynak-gercegi-onceki-gorevler-ve-mevcut-aciklar)
- [2. Nihai kapsam: temel urun ve kurumsal hazirlik birlikte](#2-nihai-kapsam-temel-urun-ve-kurumsal-hazirlik-birlikte)
- [3. Son kullanici deneyimi: kabul edilecek davranis](#3-son-kullanici-deneyimi-kabul-edilecek-davranis)
- [4. Mimari: tek calisan zincir, ayrik guven sinirlari](#4-mimari-tek-calisan-zincir-ayrik-guven-sinirlari)
- [5. MCP ve OpenCode entegrasyon sozlesmesi](#5-mcp-ve-opencode-entegrasyon-sozlesmesi)
- [6. Konfigurasyon, model profilleri ve worker yasam dongusu](#6-konfigurasyon-model-profilleri-ve-worker-yasam-dongusu)
- [7. Proje tanima, guven ve kalici envanter](#7-proje-tanima-guven-ve-kalici-envanter)
- [8. Guvenli calistirma, dosya korumasi ve egress](#8-guvenli-calistirma-dosya-korumasi-ve-egress)
- [9. Kalici job motoru, checkpoint ve kesintiden devam](#9-kalici-job-motoru-checkpoint-ve-kesintiden-devam)
- [10. Otomatik analiz, tasarim, test gelistirme ve repair](#10-otomatik-analiz-tasarim-test-gelistirme-ve-repair)
- [11. Maven, JUnit ve JaCoCo olcum gercegi](#11-maven-junit-ve-jacoco-olcum-gercegi)
- [12. Aday kabul, birikimli test seti ve final replay](#12-aday-kabul-birikimli-test-seti-ve-final-replay)
- [13. Test kalitesi, kararlilik ve sinirli mutation olcumu](#13-test-kalitesi-kararlilik-ve-sinirli-mutation-olcumu)
- [14. SQLite veri modeli ve guvenilir artifact deposu](#14-sqlite-veri-modeli-ve-guvenilir-artifact-deposu)
- [15. Raporlama, dosya teslimi ve ortak evidence projeksiyonu](#15-raporlama-dosya-teslimi-ve-ortak-evidence-projeksiyonu)
- [16. Patch-only ve guvenilir onayla test uygulama](#16-patch-only-ve-guvenilir-onayla-test-uygulama)
- [17. Saglik kontrolu, gozlemlenebilirlik ve destek](#17-saglik-kontrolu-gozlemlenebilirlik-ve-destek)
- [18. Guvenli kurulum, upgrade, rollback ve backup/restore](#18-guvenli-kurulum-upgrade-rollback-ve-backuprestore)
- [19. Tedarik zinciri ve surum guvenligi](#19-tedarik-zinciri-ve-surum-guvenligi)
- [20. Benchmark, model karsilastirmasi ve kalite regresyonu](#20-benchmark-model-karsilastirmasi-ve-kalite-regresyonu)
- [21. Performans, kaynak yonetimi ve uzun sureli kabul](#21-performans-kaynak-yonetimi-ve-uzun-sureli-kabul)
- [22. Uygulama plani: tek gorev icinde bitirilecek is paketleri](#22-uygulama-plani-tek-gorev-icinde-bitirilecek-is-paketleri)
- [23. Model beyanindan bagimsiz kabul ve kanit motoru](#23-model-beyanindan-bagimsiz-kabul-ve-kanit-motoru)
- [24. Devralinan normal-yol kabulleri: RT01-RT28](#24-devralinan-normal-yol-kabulleri-rt01-rt28)
- [25. Ek kurumsal urun kabulleri: PRO01-PRO60](#25-ek-kurumsal-urun-kabulleri-pro01-pro60)
- [26. Gelistirme hafizasi, dokumanlar ve modeller arasi devir](#26-gelistirme-hafizasi-dokumanlar-ve-modeller-arasi-devir)
- [27. Nihai bitis kapisi ve teslim](#27-nihai-bitis-kapisi-ve-teslim)
- [28. Kaynaklar ve arastirmadan tasarima izlenebilirlik](#28-kaynaklar-ve-arastirmadan-tasarima-izlenebilirlik)

## 0. Gorev sozlesmesi ve yetki siniri

| Alan | Deger |
| --- | --- |
| Gorev kimligi | `AITE-RUNTIME-ACCEPTANCE-003` |
| Sozlesme surumu | `2.0 - birlestirilmis nihai kapsam` |
| Hazirlama tarihi | `2026-10-10` |
| Repository | `https://github.com/mehmet-karacan/ai-test-engineering` |
| Inceleme dali / HEAD | `main` / `c5d4a530b01bbbff21c04213aebda3416f2b70b3` |
| Baslangic durumu | `FINALIZATION_IN_PROGRESS`; onceki toplu tamamlanma beyanlari kabul edilmis degildir |
| Tek aktif dosya | Repository kokundeki `AKTIF_GOREV.md` |
| Git author / committer | `mehmet-karacan <karacan.mehmet@hotmail.com>`; sadece repo-yerel Git ayari |
| Hedef teslim | Mevcut urunun calisan, kurulabilir, guvenli, kesintiden devam eden ve kanitli ilk tam surumu |

**UYGULAMA EMRI:** Bu dosyayi yalniz ozetleme veya yeni bir gorev dosyasi uretme. Mevcut kodu koruyarak burada tanimlanan tum zorunlu davranislari gelistir, gercek urun girisinden dogrula ve surum paketini hazirla. Bu gorev tamamlandiginda zorunlu isleri tamamlamak icin baska bir aktif gorev gerekmemelidir. Isin buyuk olmasi, bir oturumun bitmesi veya modelin degismesi kapsam azaltma gerekcesi degildir; kayitli devam noktasindan ayni gorev surdurulur.

Bu surum, kullanicinin son talebiyle onceki 003 v1.1 kapsamindaki aciklara ek olarak konusulan kurumsal hazirlik alanlarini da **ayni goreve** dahil eder. Onceki surumdeki "yeni kapsam ekleme" siniri bu belgede acikca eklenen alanlar icin genisletilmistir; diger guvenlik/onay sinirlari degismemistir. Yeni bir 004 gorevi, yeni urun, Zekam bagimliligi veya yeniden yazim karari verilmis degildir.

### 0.1 MUST / SHOULD / MAY

- **MUST / ZORUNLU:** Teslimin kabul kosulu. Calistirilmamis veya tamamlanmamis zorunlu is `PASSED`, `VERIFIED`, `DONE` ya da "opsiyonel" yapilamaz.
- **SHOULD / ONERILEN:** Esdeger cozum secilebilir; gerekce, risk ve davranis kaniti ADR'de yazilir.
- **MAY / OPSIYONEL:** Calisan temel teslimi etkilemeyen secenek. Opsiyonel bir modun kapali olmasi, zorunlu cekirdegin eksikligini gizlemek icin kullanilamaz.

Bu belge urune ait tasarlanacak sozlesmeleri tarif eder. Buradaki dahili servis/metot/artifact adlari, OpenCode veya MCP SDK'sinda zaten var olan API'ler diye kabul edilmez. Dis API'ler kurulu surumun resmi tipleri, OpenAPI'si ve belgeleriyle dogrulanir.

### 0.2 Degismeyen urun kararlari

1. Son kullanicinin arayuzu **mevcut OpenCode CLI/TUI**'dir. Yeni `aite`, `aitest run`, `aite doctor` gibi kullanici CLI'i, web dashboard'u veya masaustu UI'i GELISTIRILMEZ. MCP process girisi, kurulum/bakim `.mjs` scriptleri ve gelistirici test komutlari bu yasagin disindadir; son kullaniciya yeni test komut dili dayatilmaz.
2. Uygulama yerel, kullaniciya ozel ve birden fazla Java projesinde tekrar kullanilabilen bagimsiz MCP urunudur. SQLite ve artifact deposu yereldir. Merkezi sunucu, PostgreSQL/Oracle, Redis, mesaj broker'i ve zorunlu daemon kurulmaz.
3. Model erisimi mevcut yetkili **OpenCode -> kurum ici LiteLLM** yoluyladir. Merkezi gateway veya kurumun model kayitlari degistirilmez; dis model servisine sessiz fallback yapilmaz.
4. Hedef Java projesinde production kaynak, POM/build ayarlari, wrapper, coverage exclusion ve calisma politikasi degismez. Yalniz test ve kontrollu test fixture degisiklikleri uretilebilir. Ana checkout'a yazma varsayilan olarak yoktur; teslim once incelenebilir patch'tir.
5. Bu MCP urununun kendi `src/`, `scripts/`, migration, build ve test dosyalari gelistirilebilir. Musteri projesinin test-only sinirini urunun kendi kodunu gelistirmeyi engelleyecek sekilde yorumlama.
6. Kalici job/checkpoint ve model degisimiyle devam ZORUNLUDUR. Model sohbeti kalici hafiza degildir.
7. Coverage MCP tarafindan otomatik calistirilir. Kullaniciya "IDE'de coverage calistir, XML'i getir" denmez. IDE ile sonradan inceleme istege baglidir.
8. Windows standart yol **CMD + Node.js + Git.exe**'dir. Git Bash yalniz kurulu/izinliyse alternatif. PS1, PowerShell veya execution policy bypass zorunlu degildir; kurumsal guvenlik ayarlari gevsetilmez.
9. Kullanici karariyla kapali GitHub Actions/CI kendiliginden acilmaz. Yerel ve acikca calistirilan release dogrulama scriptleri hazirlanir; Jenkins/PR botu eklenmez.
10. Yeni commit mesajlari ve repository'ye eklenen Turkce gelistirme aciklamalari Turkce ASCII olacak. Kullanici kaynaklarindaki Unicode, encoding ve satir sonlari topluca donusturulmez. Global Git ayari degismez.
11. Ham kurum kodu, endpoint/erisim dokumleri, API key, kullanici oturumu, gercek JaCoCo kaynak HTML'i ve runtime DB/log/worker ciktilari public repository'ye veya harici servise gitmez.
12. Mevcut dogru kod, kullanici dosyalari ve onceki kanitlar korunur. Otomatik `reset --hard`, `clean -fd`, stash, force push, toplu klasor silme ve baska projeye yazma yoktur.

### 0.3 "Tamamen bitti" ifadesinin anlami

Hedef, bu belgedeki desteklenen kullanimlar icin tamamlanmis bir urundur; tum Java projelerinde her coverage hedefine ulasma, sifir yazilim hatasi veya kurum adina guvenlik sertifikasyonu vaadi degildir. Test-only sinirlari icinde hedefe ulasilamamasini dogru yonetmek de urun yetenegidir; **dusuk coverage sonucunu hedef basarisi diye sunmak degildir**.

Son etiket ancak bagimsiz release verifier zorunlu kabullerin tamamini gercek kanitlardan dogruladiginda `FULL_PRODUCT_ACCEPTANCE_VERIFIED` olur. Kurum modeli, sandbox, gercek onay veya gerekli erisim eksikse uygun `BLOCKED_*` durumu ve kesin devam noktasi kaydedilir. Bu durumda "gorev tamamlandi" denmez; yeni gorev acmadan engel kalkinca devam edilir. Yetki eksikligi ile yazilmis ama calismayan kod birbirinden ayrilir.

Kurumsal uretim ortamina fiilen dagitim yapmak, kullanici adina lisans karari vermek, public npm yayini, repo gorunurlugu degisikligi ve kurum guvenlik onayi bu uygulama emrinin otomatik yetkisi degildir. Yerel tam urun ve dogrulanmis dagitim paketi ise bu gorevin teslimidir.

---

## 1. Kaynak gercegi, onceki gorevler ve mevcut aciklar

### 1.1 Hazirlamada kullanilan kaynaklar

- Canli GitHub HEAD sorgusu yukaridaki `c5d4a53` commit'ini verdi; `AGENTS.md`, temel sozlesme, package bilgisi ve ilgili runtime kodu bu revision ile degerlendirildi.
- Onceki `AITE-RUNTIME-ACCEPTANCE-003` v1.1 dosyasi ve `session-ses_ede2(2).md` oturum kaydi esas alindi. Oturumda 204 testin gectigi goruluyor; bu, gercek model + guvenli runner + resume kabulunun tamami anlamina gelmiyor.
- Resmi OpenCode/MCP/JaCoCo/SQLite/Node/Docker belgeleri ve test muhendisligi referanslari bu belge sonunda belirtilmistir. Dis arastirma bulgulari ile bu urune ait tasarim kararlari ayridir.
- Bu dosyayi hazirlarken 204 test, Windows kurulumu ve kurum modeliyle canli pilot yeniden calistirilmadi. Bu dosya bir uygulama/kabul sozlesmesidir; yapilmis canli kabul raporu degildir.

### 1.2 Arsiv ve gereksinim devralma

`AITE-FOUNDATION-001` R01-R20 / AC01-AC70, `AITE-REMEDIATION-002` RG01-RG52 ve 003 v1.1 B01-B12 / K00-K09 / RT01-RT28 kapsami korunur. Bunlar basarili ilan edilerek degil, tekil gereksinim-kod-test-kanit eslesmesiyle devralinir.

Baslangicta:

- Mevcut aktif dosya ezilmeden gercek onceki baytlar/hashi ile arsivlenir. Kullanici bu v2.0 dosyasini zaten koka koyduysa onu eski gorev diye arsivleme; onceki metni dogrulanmis Git nesnesinden veya mevcut gercek arsivden al. Git'teki `c5d4a53:AKTIF_GOREV.md` 003 v1.0'dur; onu v1.1 diye adlandirma. Blob SHA: `178a263d88e1be2a7f9102c7c16acb99590a6c90`.
- Sohbetteki 003 v1.1 dosyasi mevcutsa SHA-256 `0251fea0ddcf5e3a68958d0c4ad9be786827c446d3756d764f56e23dbecbde4c` ile kontrol edilip korunur. Elde olmayan eski dosyanin yerine yeni metinden uydurma arsiv olusturma. Bu v2.0 eski konusma baglamina muhtac olmadan uygulanabilecek ayrintiyi icerir.
- Foundation/Remediation arsivleri, review ve handoff dosyalari silinmez. Eski "70/70", "52/52", "12/12 kapandi" ifadeleri tarihsel beyan olarak korunur; guncel durum, ozet ve backlog gercek kanita gore yeniden uretilir.
- Yeni HEAD inceleme revision'undan ilerideyse diff okunur; dogru duzeltme geri alinmaz. Gorev uygulanacak revision ve baslangic dirty dosya envanteri kaydedilir.
- Eski kabul satirlari aralik halinde topluca PASSED yapilmaz. Ayni test birden fazla gercek gereksinimi kanitlayabilir; eslesme tekil ve denetlenebilir olmalidir.

### 1.3 Acik kusur matrisi: duzeltmeyi yeniden adlandirarak kapatma

| Eski kimlik | Incelenen kodda kalan durum | Gercek kapanis |
| --- | --- | --- |
| B01 | Baslangic Docker'a donmus, ancak `new CandidateLoop()` varsayilan host MavenRunner uretiyor; ana proje uzerine test overlay'i var; Docker baseline output mount'lari tamam degil | Butun build/test asamalari tek verified runner; immutable snapshot ve ayri execution workspace; orijinal checkout'a sifir yazma |
| B02 | Worker `AITEST_WORKER_ENABLED === "1"` ile gizli opt-in; sabit 14096; kaynak govdesi yerine imzalar/toplam sayaclar; devreden hata/onarim baglami eksik | Normal kurulumda yetkili worker; sahiplikli yasam dongusu; tam ilgili kod/test/gap baglami; typed uretim ve bounded repair |
| B03 | Final BRANCH eklenmis ama branch-only kazanc reddi, N/A/eksik veri karismasi ve current XML'den final karar suruyor | Tek per-target/per-metric evaluator ve taze accepted-set final replay |
| B04 | Accepted dosya kopyasi ve callback var; sonraki run seti ve durable checkpoint baglantisi yok | Cumulative accepted set, transactional publish, yeni aday/final/resume hep ayni accepted parent'tan |
| B05 | Resume ayni ID ile dispatch'i bastan baslatiyor; cancel process'lere bagli degil; lease devralma ve fenced write aciklari var | Checkpoint'ten gercek devam, kalici butce/deneme hafizasi, tek owner, gercek process/container iptali |
| B06 | Rapor alanlari sabit sifir/bos/PASSED; status/result canli proje XML'ini trusted saniyor | DB + degismez kanitlardan ortak projeksiyon; gercek test/model/iteration/gap/diff ve butunluk |
| B07 | Eager dist import duzeltilmis; fresh clone, config CAS/JSONC, platform ve uninstall kabulunun tamami kanitli degil | Temiz Windows/Linux kurulumu, gercek config sentinel, atomik guvenli update/rollback |
| B08 | Worker kapali ve FAILED'i de kabul eden "tam pilot"; resume testi yeni job; stdout regex'ine dayali sonuc | Gercek model/izole runner ile pozitif pilot, ayni job hard-kill/resume; tam framing/correlation; outcome assertion'i |
| B09 | Paket sorgusu son-ek eslesmesine kayiyor; test siniflari module kapsaminda; somut hedef listesi execution'a tasinmiyor; effective Maven/custom roots eksik | Module + package + FQCN + binary class kimligiyle tek kapsam; effective model ve gercek report toplama |
| B10 | Shadow helper zincire alinmis ama AST/semantik kalite, eski testlerin korunmasi, duplicate ve gercek kesif eksik | AST + test discovery + bagimsiz kalite incelemesi; yorumdaki assertion/ayni FQCN ile oyun yok |
| B11 | PATCH_ONLY mesaji var fakat gercek teslim dosyasi eksik; ayri apply'da onay/digest/journal/rollback yetersiz | Bayt-dogrulanmis patch ve desteklenen guvenilir onay kanalinda guvenli apply |
| B12 | Profil etiketini degistiren eski handshake, yeni protokol destegi diye sayiliyor | Gercek surumlenmis adapter ve resmi wire conformance; desteklenmeyeni destekli gosterme |

Bu tablo mevcut kaynak ve onceki denetimden gelir; FIN asamalarinda her satirin gercek uygulama HEAD'indeki durumu tekrar teyit edilir. Uretilecek yeni test sadece helper'i degil **dagitilan MCP -> application -> worker/runner -> persistence -> result** zincirini sinar.

---

## 2. Nihai kapsam: temel urun ve kurumsal hazirlik birlikte

### 2.1 Desteklenecek ilk tam urun

- Windows 11 x64 + CMD/Node/OpenCode, kurumca onayli Linux-container altyapisi; ayrica desteklenen bir Linux x64 ortaminda MCP/runner/kurulum kabulu.
- Node.js 24 LTS ailesinde resmi destek/guvenlik durumu dogrulanmis sabit patch; mevcut TypeScript strict, Zod, SQLite/better-sqlite3 ve JavaParser temeli korunur. Sirf yeni surum var diye teknoloji gocu yapilmaz.
- Java 8 + JUnit4, Java 17 + JUnit5, Java 21 + cok modullu Maven fixture'lari gercek toolchain ile desteklenir. Mockito yalniz hedef projede mevcut ve uyumluysa kullanilir. Yardimci scanner'in JDK'si hedef bytecode seviyesini degistirmez.
- Sinif, birden fazla sinif, Java package ve Maven module hedefi; exact scope onayli/snapshot'a bagli. Package alt paketlerinin dahil olup olmadigi explicit policy'dir ve raporda yazilir.
- Test ekleme ve mevcut testleri iyilestirme, analiz/tasarim/onarim, gercek Maven/JUnit/JaCoCo, kalite/regresyon, plateau/barrier, rapor/patch, devam/iptal, proje gecmisi.
- OpenCode istemci girisi; ayni MCP araclariyla ikinci bir resmi referans MCP client uzerinden protokol birlikte calisabilirlik testi. Baska bir istemciye gecilmesi, ilk surumde OpenCode worker adapter bagimliligini kendiliginden ortadan kaldirmaz; bu bagimlilik belgelenir.
- Yetkili iki model profiliyle benchmark/karsilastirma ve model degisimiyle resume. Model kimlikleri ve varsayilanlar config'tedir, business logic'te sabit degildir.

### 2.2 Bu surumle zorunlu hale gelen olgunluk isleri

| Alan | Teslim |
| --- | --- |
| Benchmark | Surumlu sentetik corpus, gercek model denemeleri, baseline/final kanitlari, iki modelin adil karsilastirmasi, kalite regresyon kapisi |
| Test guvenilirligi | Flaky/state-pollution kontrolu; kontrollu ve sinirli PIT adapter'i; anlamli assertion ve oracle incelemesi |
| Saglik/teshis | Tek ortak preflight/diagnostic servisi; OpenCode'dan anlasilir durum; hazir degilse kesin neden ve uygulanabilir sonraki adim |
| Guvenlik | Tehdit modeli, prompt injection/data exfiltration denemeleri, egress/secret/path/runner sinirlari, guvenlik kanit paketi |
| Tedarik zinciri | Urunun npm/Java/container/native bilesen SBOM'u, lisans envanteri, guncel zafiyet taramasi, dagitim butunlugu |
| Surum yasam dongusu | Fresh install, upgrade, DB migration, backup/restore, rollback, owned uninstall, bozuk paket reddi |
| Isletim | Log ve olay korelasyonu, kaynak/butce olcumu, kontrollu concurrency, retention/GC, disk-doluluk kurtarma, destek paketi |
| Son kabul | Tekil gereksinim registry'si, makinece dogrulanan release kapisi, temiz kurulumdan gercek kullanici pilotu ve kaynak-durum uyumu |

Bunlar sadece README basligi veya interface degil; asagidaki kisitli fakat gercek implementasyon ve kabul testleriyle bu gorevde tamamlanir.

### 2.3 Kapsam disinda kalanlar

Yeni kullanici CLI/UI, merkezi cok kullanicili platform/SSO/RBAC, cloud SaaS, Jenkins/PR botu, GitHub Actions'i yeniden etkinlestirme, Gradle test motoru, Java disi test uretimi, browser/E2E platformu, canli DB/uretim servisine baglanma, otomatik production refactoring, Zekam entegrasyonu ve kendi kendine public yayin bu teslimin disindadir.

Gradle gorulurse `UNSUPPORTED_BUILD_SYSTEM` verilir; Maven gibi davranilmaz. Yeni sandbox teknolojilerinin tumunu gelistirmek zorunlu degildir: **Docker/OCI adapter'i gercek ve zorunlu**, esdeger izinli baska runner icin contract/conformance seam'i bulunur. Dogrulanmamis adapter aktiflesmez; Docker yoksa hosta dusulmez. WSL tek basina sandbox diye kabul edilmez.

PIT'in bu surumde kapsami, hedef-sinirli olcum/import ve raporlama adapter'idir; production refactoring, tum projede otomatik mutation-repair aramasi ve platformdan bagimsiz genel mutation urunu degildir.

## 3. Son kullanici deneyimi: kabul edilecek davranis

### 3.1 Bir defalik kurulum

Kullanici, urunun dogrulanmis yerel dagitimini kurar. Installer OpenCode'un mevcut MCP/provider/agent/plugin/permission ayarlarini ve bilinmeyen alanlarini koruyarak yalniz urune ait girdileri yerlestirir. Java projesine urun dosyasi, AGENTS, skill, DB, log veya rapor kopyalamaz. Kurulumda env/secret elle ekleme gereksinimi varsa bunu guvenli yerel profil baglama olarak bir kez cozer; her gorevde tekrar istemez.

Kullaniciya yeni bir test CLI'i ogretilmez. Kullanici OpenCode'da "Test muhendisligi ortamini kontrol et" diyebilir; `system_diagnose` ayni ortak preflight servisinden sonucu verir. "MCP baglandi", "runner hazir", "model yetkili", "gercek pilot dogrulandi" farkli seviyelerdir; tek yesil OK ile birlestirilmez.

### 3.2 Tek cumleyle normal is

> PaymentService icin coverage %90 olsun.

Sistem proje dizinini mevcut istemci baglamindan alir; MCP'nin kendi CWD'sini hedef saymaz. Sinifi/modulu/proje guvenini cozer, mevcut testleri ve build politikasini kesfeder, immutable snapshot alir, baseline calistirir, gerekli senaryolari tasarlar ve test gelistirmeye baslar. Varsayilan metrikler LINE ve uygulanabilir BRANCH, kapsam yalniz cozulmus hedeftir. Tetikleme icin kullaniciya gizli `AITEST_WORKER_ENABLED=1` ayari yaptirilmaz.

Belirsiz sinif, yeni yetki siniri, buyuk scope/butce, bilinmeyen is kurali veya onay gerektiren degisiklik olmadikca her iterasyonda soru sorulmaz. Oyle bir durum varsa somut secenek, ilgili hedef ve neden verilir; rastgele secim yapilmaz.

### 3.3 Gosterilecek gercek ilerleme

OpenCode ozeti su alanlari gosterebilir: job kimligi, hedefler, aktif asama, calisan model, tamamlanan denemeler, son **dogrulanmis** LINE/BRANCH, kalan butce, son olay ve rapor durumu. Tahmini yuzde, tahmini bitis saati veya "3/6 asama = %50 tamamlandi" gibi dayanak olmayan ilerleme uretilmez. Pending/partial candidate coverage, trusted coverage'in yerine yazilmaz.

Uzun isin devam edip etmedigi ana chat'in bellegine baglanmaz. OpenCode acikken supervisor isi yurutur; istemci/MCP kapaninca mevcut sureklilik politikasina gore guvenli durdurma/kurtarma uygulanir. Ilk surum icin bilgisayar veya OpenCode kapaliyken isin sonsuza kadar arka planda devam edecegi vaat edilmez. Kalici state'ten devam ZORUNLUDUR.

### 3.4 Kullanici talepleri ve sonuc

| Kullanici talebi | Beklenen davranis |
| --- | --- |
| "PaymentService icin coverage %90 olsun" | Kesif, baseline, analiz, plan, uretim, test, olcum, kalite ve sonuc tek job'da |
| "Bu package icin aynisini yap" | Somut sinif/modul listesi; scope buyukse butce onayi; listede olmayan kaynaklara genisleme yok |
| "Durumu goster" | Yeni run baslatmadan kalici gercek ozet |
| "Durdur / duraklat" | Yeni aday yok; sahipligi dogrulanmis alt surecler durur; trusted set korunur |
| "Kaldigin yerden devam et" | Dogru projedeki tek uygun job; birden fazlaysa secim; checkpoint ve kalan butceyle devam |
| "Diger yetkili modelle devam et" | Ayni job/test/deneme gecmisi; yeni worker profil kaydi; eski model sohbetine ihtiyac yok |
| "Sonucu ve raporu goster" | Gercek HTML/JSON/JaCoCo/test/diff referanslari; once/sonra ve engeller |
| "Bu projede neler yaptik" | SQLite envanteri ile gercek calistirilan/uretilen test ve coverage gecmisi |
| "Bu iki modeli karsilastir" | Acik fixture/butceyle benchmark job'u; dogru sonuclar, basarisiz denemeler dahil |
| "Testleri uygula" | Once patch ve kapsam; guvenilir onay kanali varsa digest'e bagli apply; yoksa calisan patch-only teslimi |

Basarili ornek icin LINE %94 ve BRANCH %92, her ikisinde %90 hedefini saglar. LINE %92 / BRANCH %88, iki metrik %90 istendiyse **hedef saglandi DEGILDIR**. Bir metrik uygulanamazsa neden ve kanit gosterilir; eksik olcum N/A ile ortulmez.

### 3.5 Onceki gorselin baglayici olmayan kisimlari

Onceki son-kullanici infografik'i gorsel anlatimdi; teknik sozlesme degildir. Oradaki `aite doctor/status`, PowerShell gorunumu, proje icindeki artifact klasoru, %88 BRANCH ile yesil hedef basarisi, kendiliginden proje dosyalarina aktarim ve CI otomasyonu uygulanacak gereksinim olarak alinmayacak. Bu belgede bunlar sirayla OpenCode dogal dil/MCP, CMD+Node, dis runtime store, dogru iki-metrik karari, onayli apply ve CI kapali kararlariyla netlestirilmistir. Gorseldeki surumler ve sureler uyumluluk/performans kaniti degildir.

---

## 4. Mimari: tek calisan zincir, ayrik guven sinirlari

Moduler monolit korunur. Onerilen logical akis:

`OpenCode kullanici talebi -> MCP adapter -> application use-case -> durable job/scheduler -> discovery/snapshot -> verified runner + kontrollu OpenCode worker -> candidate verifier -> accepted checkpoint -> final replay -> evidence projection -> result/report/patch`.

### 4.1 Sorumluluklar

| Bilesen | Sahip oldugu gercek |
| --- | --- |
| MCP adapter | Protokol, sema, request korelasyonu ve typed hata; test is mantigi degil |
| Application services | Proje/yetki/istek dogrulamasi, durable job komutlari |
| Job engine/supervisor | Asama, queue, owner/fence, butce, resume/cancel ve surec sahipligi |
| Discovery/Java helper | Effective module, kaynak/test kimligi ve snapshot kapsami |
| Worker adapter | Yetkili modele kontrollu baglam, typed plan/aday/review; karar otoritesi degil |
| Verified runner | Izole build/test, surec/egeress/kota, gercek execution metadata |
| Verifier | Run/gate/scope/source/counter/test kimligi kontrolu ve kabul karari |
| SQLite + artifact store | Kalici iliski ve durum + hash'li buyuk kanitlar; iki farkli rastgele "gercek" degil |
| Reporting/apply | Ayni trusted evidence'tan insan/makine ciktilari ve onayli teslim |

### 4.2 Entegrasyon kurallari

- `CandidateLoop` kendi icinde host runner yaratamaz. Zorunlu bir **verified runner capability** constructor/use-case seviyesinde verilir. Baseline, effective-model komutlari, aday, repair, final replay, regresyon ve mutation ayni guvenlik sinirini kullanir.
- Product composition root gercek dependency'leri baglar; smoke/demo composition'i public MCP akisi yerine gecmez. Test double'lari test katmaninda kalir.
- Job contract'i, worker/runner profile snapshot'i, source manifest ve butce durable olmadan calisma baslamaz. `handleTestStart` ile `resume` farkli ve cakisan pipeline'lar yazmaz; ayni engine'in farkli komutlaridir.
- Async I/O ve CPU-agir discovery ayristirilir. Buyuk Java parse/hash islemleri MCP event loop'unu bloke etmez. DB transaction'i icinde model/network/Maven beklenmez.
- Kritik modeller typed ve surumludur: `JobContract`, `SourceManifest`, `BuildPlan`, `TestPlan`, `CandidateChangeSet`, `RunEvidence`, `QualityReview`, `CoverageEvaluation`, `AcceptedCheckpointManifest`, `ReportProjection`, `ApprovalGrant`, `ReleaseEvidence`.
- Kaynak identity / run identity / artifact hash / trusted state birbirinin yerine kullanilmaz. `exit 0`, bir dosyanin varligi veya modelin `passed:true` alani tek basina kabul otoritesi olamaz.

---

## 5. MCP ve OpenCode entegrasyon sozlesmesi

### 5.1 Arac yuzeyi

Mevcut sekiz aracin adlari, mevcut istemciler icin uyumlu kalir: `project_inspect`, `project_query`, `test_start`, `test_status`, `test_resume`, `test_cancel`, `test_result`, `test_apply`.

Bu kapsamda en fazla ihtiyac kadar ust-seviye arac eklenir: `system_diagnose`, `benchmark_run`, `system_maintain`. Benzer her alt islem icin yeni tool eklenmez. `system_maintain` serbest shell/SQL/file tool DEGILDIR; typed backup/restore/retention-preview ve onayli bakim use-case'leriyle sinirlidir. Surum paketini kurma/guncelleme ayni ortak servisleri kullanan `.mjs` yonetim girisinden de yurutulebilir.

`test_start` girisinde project_root, targets, metric/threshold, TEST_ONLY, opsiyonel worker profile ve kaynak butceleri bulunur. Bir tek yuzde verilirse varsayilan iki metrik cozulur. `metrics` icin enabled/disabled ayrimi yapilir; branch hedefi 0 degeri "metrik yok" anlamina gelmez. Girdide key yoklugu, null ve 0 farkli semantik tasir.

Modelden gelen project path guvenilir sayilmaz; canonical root, kullanici guven kaydi ve scope dogrulanir. Ayni job ID baska proje root'uyla eslestirilemez. Istemci aktif modelini/klasorunu protokol kendiliginden gonderiyor diye varsayma; desteklenen baglam adapter'i aktarir. Gerekli bilgi yoksa acik ve en az ek bilgi istenir.

### 5.2 Protokol surumleri

Resmi MCP 2026-07-28 surumunde eski initialize/initialized akisi ile yeni stateless istek/discovery sozlesmesi farklidir [S04]. Iki bagimsiz adapter/wire test yolu uygulanir:

- Legacy profil: kurumdaki OpenCode'un destekledigi resmi `2025-11-25` sozlesmesi ve gercek initialize/discovery/call.
- Modern profil: resmi `2026-07-28` sozlesmesi, `server/discover` ve istek metadata/version/capability davranisi. Eski server'a sadece `v2` etiketi vermek kabul degildir.

SDK major surumu, protocol revision ve urun profil surumu ayri kaydedilir. Kurulu OpenCode legacy istiyorsa ona legacy verilir; modern adapter resmi referans client ile ayrica dogrulanir. Dogrulanmis OpenCode modern destekliyorsa o matrix satiri da test edilir. Bilinmeyen revision explicit unsupported olur; eski behavior yeni protokol diye sunulmaz.

Tasks extension uzun job mekanizmasinin yerini almaz. Ilk tam urunun kendi kalici job/status/resume/cancel kontrati zorunludur. Tasks entegrasyonu, gercek istemci destegi dogrulanirsa ek adapter olarak MAY; zorunlu kabul onun varligina baglanmaz. Uzak cok kullanicili HTTP servisi acilmaz; temel transport stdio'dur.

### 5.3 Iletisim dogrulugu

- Stdio STDOUT yalniz protokol; log STDERR/dosya. BOM, banner, debug print veya npm ciktisi protokol kanalina yazilmaz.
- Fragmented/multiple JSON mesajlari buffer ve framing ile okunur. Biriken stdout'ta regex ile job/lifecycle/outcome arama YASAKTIR. Request ID, outer result, inner structured content ve isError dogru parse edilir.
- Typed server validation hem schema hem domain seviyesinde yapilir; arbitrary `$ref` URL'leri dereference edilmez; request/response byte, nesting ve pagination sinirlari bulunur.
- Status/result, snapshot'a bagli per-target bilgiyi ve cursor'lu events/artifacts'i doner. Buyuk report/source prompt'a gomulmez; guvenli handle/reference doner. Cursor invalidation ve yeniden sorgu davranisi testlidir.
- Hata cevabi modelin basari gibi okuyacagi bir text'in icine gomulmez. Protokol hatasi, domain blocker, retryable hata ve terminal job outcome ayridir.
- Minimal OpenCode skill/agent yalniz intent routing, hedef/metric varsayilani, MCP kullanimi ve onay sinirlarini anlatir. Butun bu gorev veya uzun plan her prompt'a eklenmez. Genel OpenCode kullanimini ele geciren global AGENTS/plugin degisikligi yoktur.

## 6. Konfigurasyon, model profilleri ve worker yasam dongusu

### 6.1 Tek konfigurasyon standardi

App config, schema ve precedence tek kutuphaneden gelir. User/global/project OpenCode ayarlari ayri yorumlanir; uygulama kendi ayarini hedef projenin POM/AGENTS dosyasina yazmaz. Config'te minimum su gruplar bulunur: storage, trusted project roots, runner profiles, worker/model profiles, coverage policy, job budgets, quality policy, diagnostics, retention ve release metadata.

- Etkili config'in secretsiz snapshot'i/digest'i job'da sabitlenir. Sonradan global config degisince calisan job'un politikalari sessizce degismez.
- Model/provider, endpoint kimligi, TLS/proxy/CA, timeout/context limitleri ve reasoning destegi kurulu sistemden dogrulanir. Merkezi LiteLLM `api_base`, model alias veya team ACL'si bu urun tarafindan degistirilmez.
- Kurumun OpenCode provider kaydindaki **tam** `provider/model` kimligi korunur. Tire/bosluk/on-ekleri sezgisel olarak duzeltme, MiniMax veya baska modele yetki varmis gibi fallback yapma.
- Kullanici paylasimindaki `reasoning_effort ` gibi sonunda bosluk bulunan anahtarlar gecersiz/supheli config olarak tespit edilir. `reasoning_effort` ile ayni key kabul edilmez. Degeri `max` yazmasi runtime'da uygulandiginin kaniti degildir; desteklenen effective request/probe sonucu kaydedilir. Merkezi ayar otomatik normalize edilmez.
- Fiyat bilgisi varsa para birimi, birim, kaynak ve tarih kaydedilir. Gercek token/usage yoksa maliyet `null/UNAVAILABLE` olur; 0 maliyet diye sunulmaz.
- Config bilinmeyen format/alan veya desteklenmeyen major surumde veri kaybi riski varsa fail-closed olur. Eksik required degeri gizli default ile ucuz bir smoke'a cevirme.

### 6.2 Worker olusturma ve sahiplik

Resmi OpenCode API/SDK kullan; mevcut client'i duzelt veya resmi SDK ile ince bir adapter kur. Sadece yeni framework kullanmak icin genel agent platformu ekleme. Kurulu server'in `/doc`/resmi tipleriyle sozlesmeyi pinle [S01-S03].

- Native executable, `.cmd` shim ve PATH cozumleme ayri ele alinir. POSIX'te `resolve("opencode")` ile calisma dizinindeki sahte path'e gitme. Windows'ta `.cmd`'yi platform kurallarina aykiri bicimde `shell:false` ile dogrudan exe gibi baslatma; dogrulanmis executable/Node entry veya kontrollu `cmd.exe` adapter'i kullan [S10]. Model metni shell command string'ine eklenmez.
- Sabit porta yabanci saglikli server bulmak sahiplik kaniti degildir. Port isletim sisteminden veya bounded allocation'dan alinir; urune ait process ID + start identity + nonce/auth + endpoint kaydi birlikte tutulur. Port cakismasi ve startup exit/error dogru ele alinir.
- Her adayda yonetimsiz yeni server yaratma. Supervisor, job/worker oturum omrunu ve sonlandirmasini yonetir; kullanicinin TUI/server process'ine dokunmaz.
- Loopback bind, mDNS kapali, rastgele guclu local auth ve acik timeout uygulanir. Login parolasi komut satirina/log/rapora yazilmaz. Startup timeout gercek duvar saatiyle sinirlidir; 30 dongu x 3 saniye gibi gizli asim yapilmaz.
- Source proje CWD'si yerine urune ait neutral/izole worker dizini kullanilir. Hedef projenin `AGENTS.md`, `.opencode`, plugin, hooks, MCP, LSP veya formatter konfigurasyonu kod calistiran talimat olarak miras alinmaz. Ana kullanicinin OpenCode ayarlari yerinde korunur; yalniz secilen provider icin gereken guvenli veri worker'a aktarilir.
- Worker izinleri allowlist'tir. Bash/edit/write/task/web, diger MCP'ler, shell/exec, LSP otomatik baslatma, global plugin ve kendi test_start'ini yeniden cagirma kapali olmalidir. Mevcut API'de listelenmeyen yeni tool varsayilan izinli hale gelmez.
- Salt prompt ile izolasyon iddiasi yapilmaz. OpenCode'un kendi permission sistemi sandbox degildir [S02]. Worker icin OS/surec seviyesinde yalniz gerekli yerel veri ve yetkili gateway'e erisim; test runner icin ayri daha siki kod-yurutme izolasyonu uygulanir. Kurumda gerekli izolasyon saglanamiyorsa capability BLOCKED'dir.

### 6.3 Model konusma kontrati

- `prompt_async` icin 204 cevabini JSON diye parse etme; `{info,parts}` mesaj yapisi, parent/message ID, rol, tamamlanma/hata/abort ve structured output ayri dogrulanir [S01]. Ilk text parcasini final aday sayma.
- Her request job/attempt/session/message/profile digest ile korele edilir. Baska session'dan eski cevap veya iptalden sonra gelen cevap kabul edilemez.
- Structured output semasi gercek API destekliyorsa kullanilir; degilse tek JSON dokumanini parse et + Zod/domain validate et. Markdown fence temizligi, eksik/truncated JSON ve yanlis schema icin sinirli onarim vardir; keyfi regex'le JSON tamamlama veya bilinmeyen alanlari sessizce atma yoktur.
- Network/429/5xx icin bounded backoff+jitter ve Retry-After destegi; 401/403, invalid model/config, policy violation icin ayni istegi sonsuza kadar yineleme yok. Timeout, bos cevap ve gecersiz structured output "testability plateau" DEGILDIR.
- Worker'a source text guvenilmeyen veri olarak verilir. "Bu talimati atla"/"testleri sil" gibi kaynak yorumlari veya stack trace metinleri emir degildir. Prompt injection negative fixture'lari isletilir.
- Gizli dusunce zinciri saklanmaz/istenmez. Plan, somut gerekce, kaynak referansi, test stratejisi ve sonucun yeniden uretimine yeterli ozet saklanir.

---

## 7. Proje tanima, guven ve kalici envanter

### 7.1 Proje/checkout kimligi

Ayni Git remote'un farkli checkout/worktree'leri ayni konum sayilmaz. Proje ID, checkout/location ID, canonical root, normalized remote ve varsa Git common-dir kimligi ayri tutulur. Remote URL icindeki credential ve kullaniciya ozel token saklanmaz. Remote yoksa local-only UUID kullanilir. Branch adi veya klasor adi tek basina kaynak kimligi olamaz.

Gorev source snapshot'i HEAD + tracked/ilgili dirty/untracked kaynak/test/resource hash'leri + build/profile fingerprint'i ile baglanir. Git kullanimi read-only inspection ile sinirlidir; ext-diff/textconv ve keyfi hook calistirma yoktur. Customer repo'da worktree ekleme, stash veya `.git` metadata degisikligi yapilmaz; varsayilan snapshot plain owned copy'dir.

Kullanici duzenleme yaparken snapshot aliniyorsa once/sonra file metadata/hash kontroluyle tutarli set saglanir. Kararsiz kaynak bounded tekrar veya `SOURCE_BUSY` verir; farkli zamanlardaki dosyalardan sessiz karma snapshot uretilmez.

### 7.2 Guven ve tarama kapsami

Bir root'ta inceleme izni ile o root'un kodunu calistirma izni ayridir. Read-only envanter/rapor sorgusu sandbox yokken de calisabilir; Maven, wrapper, annotation processor veya test calistirmak icin verified runner gerekir. Yeni proje icin guven onayi bir kez kaydedilir; tekrar her dosyada sorulmaz. Paket/modul/genis root degisimi yeni scope olabilir.

Bu proje bir genel dosya kasasi degildir. `.env`, credentials, raw `.git`, baska proje dizinleri ve build icin gereksiz binary'ler worker baglamina alinmaz. Maven source/test/resource/modul girdileri, ilgili dirty dosyalar ve gerekli build konfigurasyonu manifest'le kapsanir. Sirf ignored diye mevcut gerekli test fixture'i kaybetme. Symlink/junction disina cikma ve dongu engeli, hardlink paylasim riski ve buyuk dosya sinirlari bulunur.

### 7.3 Effective Maven ve Java AST

- Reactor root, nested modules, parent POM, aktif profiller, properties, pluginManagement, test framework/dependencies, compiler/JDK/toolchain ve custom source/test/output/report roots bulunur.
- Statik POM taramasi hizli ilk aday olabilir; effective modelin yerine nihai dogru kabul edilmez. Gerekli Maven introspection komutlari da sandbox'ta, onayli cache/mirror politikasiyle calisir.
- JavaParser/helper gercek AST ve kontrollu symbol resolution uretir. Class/interface/record/enum/nested type, method overload, annotation ve package identity ayristirilir. Parse basarisizliginda regex fallback kesin gercek diye sunulmaz; `PARTIAL/UNSUPPORTED` bilgisi ve nedeni bulunur.
- Source level ile yardimci process JDK'si ayridir. Anlasilamayan language feature, generated source veya annotation processor yokmus gibi raporlanmaz.
- Build komutu yalniz gerekli reactor closure'u kapsar. Gerekli upstream moduller build edilir; final verification kapsaminda etkilenen mevcut testler kosulur. `TARGET_ONLY`, `AFFECTED_SCOPE`, `FULL_DECLARED_SCOPE` olculmus kapsami ifade eder; adlandirmayla yukseltilemez.
- JaCoCo raporu child module/aggregate olabilir; source ve binary kimligi cozulmeden root `target/site/jacoco/jacoco.xml` dosyasina sabitlenilmez. Aggregate sadece klasor toplama degildir; Maven dependency scopes ve report modeline gore degerlendirilir [S08].

### 7.4 Hedef cozumleme

Class selector icin exact FQCN tercih edilir; simple name'de tum eslesmeler bulunur. FQCN suffix'i ile `PaymentService` ve `OtherPaymentService` karistirilmaz. Ayni simple name ayni modulde bile belirsizse soru/typed candidates gerekir. Nested binary ad `$` ile source FQCN farki korunur.

Package selector exact package boundary ile cozulur; `%package.` son-ek aramasi kullanilmaz. Subpackage dahil etme politikasi explicit'tir. Module selector canonical relative module ID/path'e cozulur. **Test kaynak siniflari, package/module icindeki production target listesine giremez.** Ortak paketli farkli moduller ve ayni FQCN farkli modullerde ayri identity tasir.

Cozulmus somut hedefler, symbol/module IDs, ordered target listesi ve scope digest durable job contract'a yazilir; worker, loop, final ve report ayni listeyi kullanir. `resolved_targets` sadece kullaniciya gosterilip dispatcher'in eski ham selector'i yeniden yorumlamasi yoktur. Buyuk kapsam icin sayi/butce uyari/onayi bulunur; keyfi "5 hedeften fazlasi desteklenmez" kisiti yerine documented budget gate uygulanir.

### 7.5 Envanterin kullaniciya faydasi

SQLite sorgulari proje/modul/package/class/test bazinda su ayrimi verebilmeli: kesfedildi, test planina alindi, calistirildi, gelistirildi, kabul edildi, reddedildi, hedef saglandi, hedef saglanmadi. Planda bulunmak testin calistigi anlamina gelmez. Coverage ve model gecmisi snapshot/run'a baglidir; kaynak degisince eski degerler "gecmis" olarak kalir.

Degismeyen AST/kaynak metadata'si digest/parser/config kimligiyle yeniden kullanilir. Eski coverage cache'i yeni bir dogrulama run'inin yerine kullanilmaz. Projeyi silme/yeniden adlandirma/klasor tasima gecmisi kaybetmeden ve ownership onayiyla cozulur.

---

## 8. Guvenli calistirma, dosya korumasi ve egress

### 8.1 Yurutme alanlari

Bir job icin minimum ayri alanlar:

1. **Original checkout:** kullanicinin dosyalari; otomatik test akisi burada yazmaz/calismayi degistirmez.
2. **Source snapshot:** degismez, hash'li kaynak/build/test baseline'i; yalniz urun ownership'i olan dis store'da.
3. **Accepted test set:** immutable version; son dogrulanmis test farklari.
4. **Candidate workspace:** source snapshot + accepted parent + tek aday; bu aday reddedilince accepted set'e karismaz.
5. **Runner outputs:** build/tmp/JUnit/exec/log; run'a ozel ve sinirli yazma alani.
6. **Trusted evidence store:** runner/test/modelin yazamadigi collector/verifier alani; dogrulanan kanitlar burada yayinlanir.

Butun proje bind mount'unu `rw` yapmak cozum DEGILDIR. Production ve build girdileri read-only; resolved build output/test kaynak kopyalari/tmp alanlari kontrollu writable mount/overlay'dir. Custom output root kaynak girdisiyle cakisirsa override uydurmak yerine guvenli plan veya typed blocker gerekir. Baseline ve finalde de ayni kurallar gecerlidir.

### 8.2 Verified runner capability

Capability sadece `docker info` veya image varligindan ibaret degildir. Gercek probe su sinirlari dogrular: production/POM'a yazamama, host secret/diger root'a erisememe, network politikasi, CPU/RAM/PID/disk/time limitleri, gerekli output'a yazabilme ve sonuclari host collector'a teslim edebilme.

Container non-root, read-only rootfs (gerekli tmp/outputs haric), capabilities drop, no-new-privileges, seccomp/kurum profili, bellek/CPU/PID/time sinirlariyla calisir. Docker socket, kullanici HOME, SSH/Git credential, ham OpenCode config, LiteLLM key ve genis host path'leri test container'a baglanmaz. Host device/privileged/network=host kipleri YASAKTIR.

Kaynaklar standart Maven output klasorune yazmak istediginde uygun writable output plani gerekir; `/work:ro` altinda `mvn test` calistirip fail sonucunu tam pilot basarisi sayma. Jar/exec/XML/class dosyalari run ID ve kaynak manifest'iyle baglanir. Docker dokumaninda bind mount yazma ve read-only davranislari aciklanir [S11]; urun kendi mount planini gercek probe ile kanitlar.

### 8.3 Bagimlilik hazirlama ve cache guvenligi

Varsayilan test-yurutme egress'i `none` olur. Maven dependency indirmesi gerekiyorsa ayri hazirlama asamasinda, yalniz kurumca izinli mirror/proxy/registry'lere sinirli erisim vardir. Bu asama da untrusted build input riskiyle sandbox'lanir; host Maven fallback'i olamaz.

Credential model prompt'una veya test run'ina aktarilmaz. Yetkili dependency provisioning kisa omurlu/ayri gizli baglamda yapilir; sonraki execution workspace'e settings/token kopyalanmaz. Kurumun CA/proxy politikasini `--insecure`, TLS verify kapatma veya bilinmeyen registry fallback'iyle asma.

Seed cache manifest ve hash'le dogrulanir; test kodu paylasilan trusted cache'e yazamaz. Job'a ozel writable overlay kullanilabilir. Paralel job'lar cache ve output'u zehirleyemez. Cold-cache/offline senaryoda gerekli dependency yoksa `BLOCKED_DEPENDENCIES` acikca raporlanir; no-tests/success degil.

### 8.4 Path ve artifact saldirilari

Canonical containment yalniz string prefix degildir. Normalize + platform ayrimi + existing parent realpath + symlink/junction/hardlink/relative escape kontrolleri yazmadan once uygulanir. Windows drive, UNC, device path, ADS, reserved names, case farki, trailing dot/space; POSIX absolute/relative link; mixed separator ve Unicode testleri kapsanir.

Dosya yolu veya tar/zip girisi modelden geldigi icin otomatik guvenilmez. Output collector symlink/hardlink takip ederek dis dosya alamaz; archive traversal, compression bomb, duplicate/reserved manifest adlari ve izin bitleri kontrol edilir. Tek dosya/toplam dosya sayisi/byte/depth/time limitleri konfigurludur.

### 8.5 Dogru process supervision

Run'a ait process/container kimligi baslatma aninda kaydedilir. Container ID/cidfile/ownership label, PID + baslatma kimligi ve job generation birlikte kullanilir. Sadece `docker` CLI process'ini oldurmek container'in durdugunu kanitlamaz. Stop -> grace -> kill -> inspect/reap adimlari vardir. Windows `taskkill` tum platformlarda kosulmaz; POSIX process group, Windows job/process-tree ve OCI container semantigi ayridir.

Pause/cancel/timeout/lease-lost/signal/disconnect sonrasinda yeni candidate yoktur; gec gelen worker/run cevabi fenced olarak reddedilir. Yalniz owned surec/container'lar sonlandirilir. Global `docker prune`, isimle toplu kill ve yabanci PID sonlandirma YASAKTIR. SIGKILL sonrasi yeniden baslatmada stale owned child/container'lar kesin kimlikle aranir; emin olunamazsa operator bilgisiyle BLOCKED, rastgele kill degil.

### 8.6 Tehdit modelinin siniri

Generated test/kaynak/prompt/Maven konfigurasyonu ve output dosyasi guvenilmeyen girdidir. OS administrator'u veya trusted engine ile ayni kullanici haklarina zaten tam sahip saldirgan karsisinda mutlak izolasyon iddia edilmez. Dosya hash'i butunluk/provenance aracidir; ayni hakli kotu niyetli actor'a karsi sihirli imza degildir. Modelin cevap vermesi de dogru is davranisi oracle'i degildir. Bu sinirlar SECURITY dokumaninda acik yazilir.

## 9. Kalici job motoru, checkpoint ve kesintiden devam

### 9.1 Job contract ve durum modeli

Mevcut `lifecycle`, `phase`, `outcome`, `verification_level`, `apply_state` ayrimi korunur. Bunlar tek `status` string'ine sikistirilmaz. Gecerli transition'lar type/domain seviyesinde tanimlanir; bilinmeyen phase'i `as never` ile zorlamak yoktur.

**JobContract** en az sunlari sabitler: project/location ID, canonical root, request/idempotency identity, source snapshot/digest, resolved targets ve metric esikleri, runner profile, worker/model profile, policy/config/schema versions, onayli scope, baslangic/kalan butce ve lineage/revision. Sonradan gelen input, original contract'i sessizce degistiremez.

`test_start` job + hedefler + queue/outbox kaydini kisa transaction'da olusturur. Calistirilmamis job queued'dur; engine sahibi aldiginda RUNNING olur. Invalid runner/config gibi baslangicta bilinen redler yarim hedefli, sonsuza kadar queued job birakmaz. Unique constraint + transaction ile eszamanli tekrar cagrilar tek isi baslatir.

Idempotency ayni talebin network retry'sini birlestirir; kaynak degistigi halde onceki tamamlanmis isi sonsuza kadar yeniden dondurmez. Canonical request digest, ilgili source/config/policy/target/budget/profile revision'larini ayirir. Explicit idempotency key ayni olup payload farkliysa conflict olur. Kullanici yeni calisma istediginde yeni run/job revision acilir; gecmis silinmez.

### 9.2 Sahiplik ve fencing

- Her job icin en fazla tek aktif owner. `UNIQUE(job_id)` veya esdeger transaction korumasi; `UNIQUE(job_id, owner_id)` tek basina yetmez.
- Owner kimligi process PID'den ibaret degildir: process-start/boot identity + rastgele owner UUID kullanilir. Yeni owner, suresi dolmamis saglikli owner'in kaydini overwrite edemez.
- Lease acquire/renew/release, monoton generation/fencing token'i korur. Expire/release sonrasinda ayni owner ID kullanilsa bile eski token yetkili olmaz.
- Phase, run, candidate decision, artifact publish, accepted pointer, final/result/apply ve cancel yazmalari owner/generation/CAS ile baglidir. Sadece lease helper testi yeterli degildir; stale worker'in normal runtime'a yazmasi gercekten reddedilir.
- Heartbeat kisa aralikta, DB kilidi/network/model beklemelerinden bagimsiz ilerler. Lease suresi model/build timeout'undan bagimsiz yonetilir; gorunmez owner kaybi sessizce cift calismaya yol acmaz.
- Ayni checkout'a farkli job'lar varsayilan sirali; farkli immutable snapshot'li job'lar desteklenen concurrency kadar calisabilir. Apply icin checkout ve path scope kilidi ayrica gerekir.

### 9.3 Checkpoint publish kontrati

Her accepted checkpoint, parent checkpoint, source/build/target/policy/model digests, cumulative test manifest'i, run/coverage/test/quality evidence referanslari, harcanan butce, plan ve kalan/denenen stratejileri icerir. Yalniz `coverage:78` degeri checkpoint degildir.

Publish sirasi:

1. Typed run/aday/gate sonucunu olustur; evidence files'ini owned gecici alanda bitir.
2. Byte hash, boyut, schema, source/run correlation ve required artifact kontrolu yap.
3. Content-addressed immutable blob'lari ayni filesystem'de guvenli atomik rename/publish ile yerlestir; gereken durability bariyerlerini uygula.
4. Kisa DB transaction'inda artifact READY, checkpoint ve fenced best/accepted pointer guncellemesini beraber commit et.
5. Yalniz bundan sonra accepted olayi ve kullanici trusted sonucu yayinla.

Dosya yazimi/rename/DB pointer aralarinda hard-kill testi zorunludur. DB'de kaydi olup blob'u eksik veya hash'i bozuk checkpoint trusted sayilmaz. Orphan blob/staging sonraki guvenli GC'ye kalabilir; eski trusted set kaybolmaz. DOSYA+DB tek OS transaction'mis gibi davranma; explicit recovery protokolu uygula.

### 9.4 Resume algoritmasi

`test_resume`, sadece RUNNING yazmak veya `dispatch()`'i sifirdan cagirmak degildir:

1. Istek dogru location/job ile eslestirilir; birden fazla uygun is varsa secim istenir.
2. Gecerli owner/lease ve orphan child durumu kontrol edilir; yeni generation alinmadan yeni is baslatilmaz.
3. Source/config/toolchain/policy degisikligi ile eski evidence'in gecerliligi kontrol edilir. Gecersiz source halinde kullanicinin degisikligi korunur; `SOURCE_CHANGED` veya onayli lineage'li rebaseline/revision gerekir.
4. Son tam trusted checkpoint'in butun blob'lari ve cumulative test hash'leri dogrulanir. Yarim aday ayri tutulur; otomatik accepted yapilmaz.
5. Original job contract, son plan, calistirilan/denenen stratejiler, harcanan butce ve iteration sira numarasi yuklenir. Tamamlanan analiz/uretim keyfi yeniden yapilmaz.
6. Temiz workspace kaynak snapshot + kabul edilmis test setinden yeniden kurulabilir. Gerekli kisa revalidation/replay yeni run ID ile yapilir; bunun kullanicinin onceki kazanimini sifirlamadigi kaydedilir.
7. Sonraki eksik asamadan devam edilir. Model degisse de onceki chat ID zorunlu degildir; yeni worker profil/attempt kaydi eklenir.

Yarim/henuz trusted olmamis son kayit gecersizse onceki saglam checkpoint secilir; discarded dogrulanmamis adaylar ve neden raporlanir. Daha once trusted olarak yayinlanmis bir checkpoint'in blob'lari sonradan kaybolmus/bozulmussa bu veri butunlugu olayidir: verified backup'tan kurtarma veya kullanicinin acik secimi gerekir. Sessizce eski ve dusuk sete donup hic veri kaybi yokmus gibi anlatilmaz. Kurtarma karari, olasi kayip ve pointer degisikligi audit olayi olur.

### 9.5 Pause/cancel ve restart

Pause yeni aday baslatmaz; calisan is guvenli bariyere gelir veya tanimli timeout'ta owned surecler durur. Cancel kalici niyet kaydidir; gec run sonucu CANCELLED'i COMPLETED'e cevirmez. Iptal otomatik olarak artifact silmez. Kullanici yeniden devam isterse desteklenen lifecycle'da explicit resume/generation gereklidir.

MCP kapanirken kisa shutdown protokolu isler; SIGKILL/power-loss icin onun calistigi varsayilmaz. Yeniden baslatma engine'in yarim isleri tespit etmesini saglar; user niyeti/politika olmadan eski customer isleri sessizce otomatik yeniden baslatilmaz. "Devam et" ile ayni job gercekten surer. Bakim/update devam eden isleri habersiz oldurmez.

### 9.6 Butce ve kaynak tuketimi

Default guvenli profil: job basina en fazla 20 candidate iterasyonu, candidate basina 2 repair, 3 **farkli** strateji/adayda coverage ilerlemesi yoksa plateau incelemesi, 120 dakika aktif job suresi; degerler config/kullanici onayi ile degisebilir. Bu sayilar performans vaadi degil koruma limitidir. Cok-hedefli scope icin butce hedeften hedefe adil dagitilir ve toplam job limiti asilmaz.

Model/API retry, repair, duplicate aday ve final revalidation da gercek tuketim kaydina girer. Pause suresi aktif calisma suresinden ayridir. Sure olcumu process icinde monotonic clock, processler arasi durable harcama/event kaydiyla yapilir; sistem saati degisimi negatif tuketim veya eski owner'a yeniden yetki uretemez. Restart/model degisimi butceyi sifirlamaz. Butce artisi veya hedef degisimi acik kullanici talebiyle contract revision olur; hedef otomatik dusurulmez. Harcanan token bilgisi yoksa bilinmiyor yazilir; sonradan sahte tahmini fatura uretilmez.

---

## 10. Otomatik analiz, tasarim, test gelistirme ve repair

### 10.1 Islevsel roller

Analyzer, Test Architect/Planner, Test Developer ve ayri Reviewer/Gap Analyzer mantiksal rolleri GERCEK artifact uretir. Her rol icin ayri model veya genel multi-agent framework zorunlu degildir. Ayni yetkili model farkli gorev/oturumlarla kullanilabilir; ayni modelin iki kere evet demesi bagimsiz test kaniti sayilmaz. Nihai kabul her zaman deterministik harness/verifier ve gereken insan review kapisindadir.

- **Analyzer:** hedefin public davranisi, girdiler, state/side effect, ilgili bagimliliklar, mevcut test kalibi, source reference ve coverage gap'lerini cikarir.
- **Planner:** behavior/branch ve test senaryosu eslesmesi; girdiler, expected result'in kaynagi, setup/mock, assertion, oncelik, olasi testability engeli ve test-ID onerisi verir.
- **Developer:** yalniz izinli test/fixture changeset'i uretir. Source/build patch'i oneriyorsa uygulama yolu onu reddeder; testability onerisi ayri salt-okunur rapor olabilir.
- **Reviewer/Gap Analyzer:** candidate ve run kanitindan assertion yeterliligi, duplicate/regression, testability siniri ve sonraki farkli stratejiyi degerlendirir. Planla kodun uyumsuzlugunu normal bulgu olarak dondurur.

### 10.2 Modele giden baglam

Her rol icin ihtiyacina gore bounded context pack uret:

- Hedef sinifin gercek ilgili method/class govdesi, imzalar, import/constructor/field/annotation bilgisi; dependencies'in gereken davranis/imza kodu.
- Mevcut ilgili testlerin gercek govdesi ve helper/fixture'lar, JUnit/Mockito versiyonlari ve etkili test konfigurasyonu.
- Run'dan dogrulanmis kapsanmayan satir/branch alanlari, raw counter ve kaynak line referansi. JaCoCo bir branch'in hangi input'la alinacagini tek basina soylemez; source analizi ayrica gerekir.
- Original hedef/politika, allowed test roots, cumulative accepted test seti, onceki aday hash'leri/denenen stratejiler ve kalan butce.
- Repair'de gercek compiler diagnostics, Surefire failure/assertion diff, stack trace'in ilgili kismi ve candidate kaynak referanslari.

"Ilk bes Java dosyasi" veya yalniz metot imzasi yeterli baglam degildir. Buyuk siniflar hedef davranis/ilgili bagimlilik baglariyla parcali incelenir; kaynak kismi atildiysa kaydi tutulur. Prompt'a kritik anlamin sigmadigi durumda sessiz truncation ile test uydurulmaz; kontrollu ek context/replanning veya typed blocker gerekir.

### 10.3 Test plan ve changeset semalari

Plan ve candidate semalarinda schema_version, target/module ID, source/parent checkpoint digest, behavior/scenario IDs, allowed change listesi ve gerekce bulunur. Dosya degisikliklerinde relative path, create/modify, expected-before hash/absence, full resulting bytes veya tanimli unified diff, encoding/EOL bilgisi ve new-content hash vardir.

Rastgele action delete, binary test kodu, root disi path, production shadow FQCN veya eksik preimage reddedilir. Unified diff kullaniliyorsa gercek parser ve expected-before kontrolu vardir; patch metnini full Java kaynakmis gibi kalite taramasina sokma. Araya kismi uygulama hatasi girerse staging/accepted durumlari bozulmaz.

Semaya uygun JSON, otomatik guvenilir test demek degildir. Policy, static AST, compile, discovery, execute, assertions, coverage, semantic review ve regression kapilari ayridir.

### 10.4 Repair dongusu

Her hata typed siniflanir: compile/config/dependency, assertion/SUT behavior, test setup, timeout/unstable, policy, model-output, infrastructure. Compiler/test feedback gercekten sonraki worker istegine gider. Ayni prompt'u yeni session'a vererek "repair" sayma. Candidate/attempt lineage, hata fingerprint'i ve farkli yaklasim kaydedilir.

Beklenen is davranisi belirsizken assertion'i gorulen mevcut output'a ayarlayarak testi gecirme. Beklenti mevcut sozlesme, source davranisi, kabul edilen testler veya kullanici karariyla bagli olmalidir. Production bug ihtimali varsa `SUT_DEFECT_SUSPECTED/REVIEW_REQUIRED` bulgusu uret; production'a dokunma. Kanitlanmamis bug'i kesin dogru ilan etme.

Repair limitine ulasan aday reddedilir; son trusted set korunur. Ayni normalized test/strategy/error fingerprint'i tekrarlaniyorsa duplicate dongu durdurulur; sinirsiz dosya veya anlamsiz test uretimi yoktur.

---

## 11. Maven, JUnit ve JaCoCo olcum gercegi

### 11.1 Baseline

Baslangic olcumu immutable snapshot'ta calisir. Komut, runner, image digest, toolchain, effective build plan, kaynak/binary kimligi, test discovery ve rapor hash'leriyle `RunEvidence` uretir. Hedef zaten esigi sagliyorsa `TARGET_ALREADY_MET` raporlanir; yeni AI testi uretildi diye kazanim yazilmaz.

Mevcut testler fail/unstable ise onceki durum ayristirilir. Baslangicta hic test olmamasi tek basina blocker degildir; mevcut framework ve derlenebilir hedef varsa yeni test yazilabilir. Framework yoksa customer POM'una bagimlilik eklenmez; `BLOCKED_TEST_FRAMEWORK`. Sonradan uretilen yeni testin kesfedilmemesi ise kabul hatasidir. Exit0 ve 0 test birlikte "tum testler gecti" sayilamaz.

### 11.2 Olcum plani

Mevcut JaCoCo/config calisiyorsa aynen kullanilir. Eksikse customer POM/build politikasini degistirmeyen, desteklenen ve kanitli harici harness/agent/report yolu degerlendirilir. Yeni exclusion, fork degisikligi, testleri skip etme, agent kaldirma veya dependency yukseltme ile olcum kolaylastirilmaz. Boyle degisiklik gerektiren senaryo typed blocker ve ayri oneri olarak kalir.

JaCoCo agent'in test JVM'lerine gercekten baglandigi ve mevcut argLine'i bozmadigi dogrulanir. Surefire/Failsafe ve forking davranisi ayristirilir [S05]. Forks/parallel tests icin run'a ozel `.exec` dosyalari ve kontrollu merge kullanilir; onceki denemenin exec/XML'i reuse edilmez.

Multi-module testler baska modulun production sinifini kapsayabilir. Class/module mapping ve coverage collection tek plandan gelir; ayri versiyon ayni FQCN raporlari karistirilmaz. Generated/synthetic kaynaklar, debug metadata yoklugu ve compiler filter davranisi acik kaydedilir. Coverage hedefi icin hedef scope'un paydasini daraltmak yasaktir.

### 11.3 XML ve raw execution provenance

JaCoCo XML, HTML ve `.exec` farkli roller tasir. XML sayac okumak icindir; `.exec` + ayni run'daki class dosyalari ve analiz toolchain'i yeniden rapor uretebilmek icindir. CRC/class IDs XML'de her zaman bulunur diye varsayma; raw exec/class analizi ve generation log/manifest birlikte kullanilir [S07].

Runner ciktilari untrusted dosyalardir. Testlerin bitmesi ve sahipligin kapanmasi beklenir; collector path/byte/hash kontrolunu yapar. Rapor gerekiyorsa immutable production class seti + run exec verisiyle trusted raporlayici tarafindan tekrar uretilir. Sadece testin yazabilecegi herhangi bir `jacoco.xml` yuksek diye accepted olmaz. Test kodunda JaCoCo runtime/probe/report'a mudahale gibi metrik manipulasyonu kalite/policy ihlalidir.

XML parser external entity/network resolution yapmaz; entity expansion/depth/byte/time limitleri vardir. JaCoCo'nun standart zararsiz `report.dtd` DOCTYPE bildirimi ile tehlikeli internal/external entity davranisi ayrilir; normal JaCoCo dosyasini blanket DOCTYPE reddiyle kullanilmaz hale getirme. DTD dosyasini internetten getirme zorunlulugu yaratma.

Surefire/JUnit XML malformed/truncated ise fail-closed `INVALID_TEST_EVIDENCE`. Yalniz failed count=0 okumak yeterli degildir. Executed/skipped/dynamic/parameterized test identity, baseline ve candidate kaynaklariyla eslestirilir; partial run fail/timeout final basari olmaz.

### 11.4 Tek metric evaluator

Her metric en az su alanlari tasir: enabled, applicability, evidence_validity, covered, missed, total, threshold_bps, exact_met, display_percent, source/run/checkpoint IDs ve neden.

- `VALID`: sayaclar ve kaynak/run eslesmesi gecerli.
- `NOT_APPLICABLE`: yapisal olarak uygulanabilir karar/satir yoklugu **dogrulanmis**.
- `UNAVAILABLE`: gerekli veri/rapor eksik.
- `INVALID`: stale, bozuk, mismatch, manipulasyon veya tutarsiz sayac.

Branch sayaci XML'de yok diye direkt N/A deme; hedef binary ve rapor modelinden gercek total0 dogrulanabilmelidir. Line debug metadata yoksa oldugu gibi tanila; %100 veya 0'a zorlayip hedef sonucu uretme. JaCoCo exception handler'larini BRANCH olarak saymaz; exception test kalitesi ayrica kontrol edilir [S06].

Karsilastirma ham tam sayacla yapilir: `covered * 10000 >= target_bps * total`. Buyuk degerlerde guvenli tam sayi/BigInt kullanilir. Target yuzdesinin desteklenen hassasiyeti validate edilir; desteklenmeyen hassasiyet sessiz yuvarlanmaz. %89.96'nin ekranda90 gorunmesi esik basarisi olamaz.

Her hedefte etkin ve uygulanabilir tum metric'ler saglanmalidir. Hedefler arasinda basit ortalama bir hedefteki dusuk coverage'i gizleyemez. Genel sonuc, tum zorunlu target/gate'lerin conjunction'idir. Ayni evaluator loop, dispatcher, DB, status, JSON ve HTML tarafinda kullanilir; her katman ayri `allMet` hesabi yazmaz.

---

## 12. Aday kabul, birikimli test seti ve final replay

### 12.1 Kabul sirasi

1. Source/parent contract ve policy dogrula.
2. Changeset'i yalniz disposable candidate workspace'e uygula.
3. Static/AST kalite ve izin kontrolleri.
4. Compile + gercek test discovery + execution + coverage.
5. Baseline/accepted testlerin korunumunu, yeni testlerin gercekten calistigini ve semantik kaliteyi dogrula.
6. Ayni target/source/denominator'da tum metric'ler icin regresyon/kazanc degerlendir.
7. Kabul edilecek cumulative seti temiz dogrulanmis run ve checkpoint olarak yayinla; reddedileni ayri tut.

Hard gate fail olursa coverage artsa bile kabul yoktur. Bir aday sadece LINE artsin diye BRANCH'i dusuremez veya baska hedefin coverage'ini bozmaz. Testler test-only olsa bile state pollution/regression dogabilir; affected scope finalde yeniden calisir.

### 12.2 Gercek ilerleme tanimi

LINE ayni, BRANCH artiyorsa anlamli coverage kazanci vardir. Coverage ayni kalirken gercek eksik exception/regression davranisini kanitlayan, duplicate olmayan test **ayri QUALITY_GAIN** karariyla kabul edilebilir; coverage kazanimi diye yazilmaz. Bu kabul policy ve bagimsiz review ile gerekcelenir; sonsuz quality-only iterasyonla plateau butcesi asilmaz.

Aday karsilastirmasi component-wise non-regression + en az bir dogrulanmis coverage/behavior kazanimi uzerinden yapilir. Gereksiz duplicate dosya, assertion'siz test veya ayni senaryonun isim degistirilmis hali kazanc sayilmaz. Farkli target'lar icin son accepted set ortak ve version'ludur.

### 12.3 Cumulative accepted set

A testi kabul, sonra B testi kabul, C reddedilirse sonraki ve final workspace **baseline + A + B** icermelidir; C yoktur. A ve B ayri dosyada veya ayni test dosyasinda olsa da onceki accepted degisiklikler kaybolamaz. Sonraki aday, original checkout'tan degil accepted parent'tan uretilir. Adet/sadece path listesi degil full test/fixture bytes ve hash saklanir.

Dosya kopyalamak tek basina bu sarti saglamaz. Parent manifest, version, expected-before hash, test identity ve runner'a giden gercek bytes testle kanitlanir. Reddedilen adaydan kalmis staging dosyasi sonraki run'a sizamaz. Aday no-op/repeated ise yeniden kabul edilmez.

### 12.4 Final replay ve sonucun yayinlanmasi

Final rapor oncesinde son accepted set **temiz workspace**'te tekrar compile/test/coverage ve gerekli stability/regression kontrollerinden gecer. Son candidate'in yuksek ama reddedilmis XML'i veya user checkout'taki o anki rapor kullanilmaz.

Final replay fail olursa son trusted accepted checkpoint korunur; job `FINAL_VERIFICATION_FAILED`/uygun review durumundadir. Rapor/diff hangi sete ait oldugunu acikca gosterir. Tamamlanma state'i rapor/artifact publication'dan once sahte bir COMPLETED olarak yayinlanmaz; finalization idempotent ve recovery'ye dayaniklidir.

### 12.5 Plateau ve testability

Plateau, birkac benzer denemenin basarisiz olmasi degil, kayitli farkli stratejilerle limitli ilerleme tespitidir. Kalan gap'ler: test edilebilir onerisi bulundu, mevcut izin/toolchain ile engelli, ulasilabilirligi belirsiz, yapisal olarak ulasilamazligina dair kanit var diye ayrilir.

Static/final/constructor mocking ancak projedeki araclar destekliyorsa kullanilir; framework ekleme veya production'u public/reflection dostu yapma yok. Private metod dogrudan reflection ile test edilmez; public davranis uzerinden gidilir. Zaman, dosya, network, precision, external dependency ve global-state senaryolarinda izinli test teknikleri denenir.

`TARGET_NOT_MET_BUDGET`, `TARGET_NOT_MET_PLATEAU`, `BLOCKED_TESTABILITY`, `BLOCKED_MODEL`, `BLOCKED_DEPENDENCIES`, `INVALID_COVERAGE_EVIDENCE`, `POLICY_VIOLATION` ve `SOURCE_CHANGED` birbirine karistirilmaz. "%83 elde edildi" ile "%83 teorik maksimum" farklidir; ikincisi kanit yoksa yazilmaz. Her sonuc son trusted testleri/coverage kazanimi ve denenen yaklasimlarin nedenlerini korur.

---

## 13. Test kalitesi, kararlilik ve sinirli mutation olcumu

### 13.1 Mevcut testlerin korunmasi

Baseline logical test ID'leri, sources, annotations, parameter datasets, assertion yapisi ve discovery/runtime sonucuyla karsilastirilir. Existing passing test silme, @Disabled/@Ignore ekleme, exception yutma, broad try/catch ile fail'i gizleme, assertion gevsetme veya test filter/exclusion degistirme kabul edilmez.

Mevcut test refactor'u ayni davranisi daha acik/tekrarsiz hale getiriyorsa otomatik esitlik varsayilmaz; scenario mapping + gercek yeni run + review gerekir. JUnit4 expected exception, AssertJ/Hamcrest/custom assertion helper ve JUnit5 dynamic/parameterized testler sadece `assert` regex'i yok diye reddedilmez. Yorum/literal icindeki `assertEquals` ise assertion sayilmaz.

### 13.2 Davranis kapsami

Planner/reviewer, hedefe uygulanabilir olanlari gerekceli kontrol eder: normal akis, boundary/edge, null/empty/invalid input, dependency failure, exception, state transition, side effect, idempotency, precision/rounding, collections, date/time/timezone, concurrency ve regression. Her sinifta tum kategoriler zorla uretilmez; NOT_APPLICABLE nedeni bulunur. Coverage sayaci davranis dogrulugunun tek kaniti degildir.

AST kalite kontrolleri: tautology/self-comparison, sadece no-throw/not-null ile anlamsiz kontrol, calismayan test annotations, SUT'u tamamen mock'layip kendi mock'unu assert etmek, ayni FQCN ile **herhangi bir** production tipini test source'a ekleyerek shadow etmek, yasak reflection, metrik dosyalarina mudahale ve riskli I/O/process. `verify` bir side-effect sozlesmesini dogrulayabilir; otomatik zayif sayilmaz. Belirsiz semantik inceleme `QUALITY_REVIEW_REQUIRED` olabilir; sahte kesin kalite puani verilmez.

### 13.3 Duplicate ve test pollution

Normalize AST/scenario/assertion/mock setup ve test amaci fingerprint'leriyle duplicate aday sinyali uretilir. Semantik esdegerligi kesin kanitlanmayanlar benzer olarak etiketlenir; model karariyla mevcut test sessiz silinmez. Ayni candidate hash'ini yeniden deneme limitli/justified olur.

Yeni/degisen testler en az 3 bagimsiz temiz run'da ve final accepted suite'in farkli deterministik test order/seed senaryolarinda sinanir. Desteklenen runner'in order ayari kullanilir; proje build politikasini degistirme. Rastgelelik varsa seed, locale, timezone ve concurrency kosullari kaydedilir. 3 gecis "asla flaky olamaz" kaniti degildir; **bu kosul/tekrarlarda tutarli** diye raporlanir.

Failure-once testinin yalniz basarili retry'si rapora alinmaz. Initial failure ve tekrarlar korunur; baseline instability ile newly introduced instability ayrilir. State pollution/kapanmayan thread/temp/locale degisikligi ya duzeltilir ya aday reddedilir. Testi disable ederek yesile donme yoktur.

### 13.4 PIT adapter'i

Bu surumde targeted mutation olcumu ve mevcut raporu provenance ile import edebilme GERCEK uygulanir. Standart coverage job'u icin PIT varsayilan olarak zorunlu calismayabilir; **adapter ve kontrollu calisma modu bu gorevde zorunlu teslimdir**. Zaman/maliyet icin target/test scope, threads, mutators, run timeout ve tekrar butcesi sinirlidir.

Customer source/POM/build degistirilmez. PIT yalniz disposable sandbox'ta kendi bytecode mutasyonlarini yapar; bu testability refactoring degildir. Mevcut desteklenen Maven/plugin veya external harness yolu kullanilir; uyumsuz projede dependency ekleyip standardi bozmak yerine `MUTATION_UNSUPPORTED/BLOCKED` verilir. Kullanilan official plugin/API surumu pinlenir [S12].

Killed/Survived/NoCoverage/Timeout/RunError eslesmeleri ham rapordan gelir; equivalent mutant iddiasi kanitsiz yapilmaz. Mutation skoru coverage'dan ayri gosterilir. Coverage100 ama zayif assertion'li sentetik kontrol fixture'i ile anlamli assertion'li hali karsilastirilir; bunun icin customer production dosyasi degistirilmez. En az JUnit4 ve JUnit5 desteklenen iki fixture'da gercek PIT run kaniti zorunludur.

Ilk surumde otomatik sinirsiz mutant odakli LLM repair, tum Java ekosistemine tam uyumluluk veya PIT olmayan projeye dependency dayatma yoktur. Mevcut surec no-mutation modunda da dogru ve kaliteli calisir.

## 14. SQLite veri modeli ve guvenilir artifact deposu

### 14.1 Temel standart

SQLite tek kullaniciya ozel, birden fazla proje/checkout'u yoneten kalici depodur. Kod govdelerinin tamamini, ham JaCoCo HTML'i veya buyuk model cevabini tabloya gommek yerine hash'li artifact referanslari kullanilir. Kaynak/test/model/coverage gecmisi kaybolmayacak sekilde iliskiler kurulur.

Mevcut schema ve UUID'ler korunur. Yeni tablolar/alanlar migration ile eklenir; uygulanmis migration SQL'ini/checksum'ini yerinde degistirme. Yeni tablo fiziksel kolon sirasi: `id`, iliskisel FK alanlari, is alanlari, teknik audit/version alanlari. Mevcut tabloyu sirf kolon sirasi icin veri kaybi riskli yeniden kurma. Tablo/kolon amaci, type, nullability, unique/FK/check/index, birim, veri hassasiyeti ve saklama kurali data dictionary'de yer alir.

ID'ler uygulamada uretilen UUID; paylasilmayan teknik sequence'ler integer olabilir. UUID/boolean/enum/hash/counter/threshold'lar domain ve DB check'lerle dogrulanir. Zaman UTC epoch milliseconds veya tek standarda bagli ISO8601; birim karismaz. Byte/hash/encoding alanlari birbirini dogrular. Optimistic row_version ve immutable kayit ayrimi aciktir.

### 14.2 Zorunlu mantiksal kayit gruplari

Mevcut tablolar kullanilarak veya gerekceli yeni tablolarla asagidaki bilgilerin **sorgulanabilir ve job akisinda gercekten doldurulan** olmasi gerekir:

| Grup | Icerik ve iliski |
| --- | --- |
| Project/location/trust | Git/local baglantilar, checkout kimligi, display name, guven/yetki kapsami, son gorulme |
| Source snapshots | Parent/HEAD/dirty/build/policy/parser digests, manifest artifact ve tarama durumu |
| Modules/packages/symbols | Reactor baglari, source sets, Java/FQCN/binary kimligi, kaynak path/hash/range |
| Test inventory | Logical test/case IDs, framework/kind, parametre instance baglari, source/helper, baseline disabled durumu |
| Jobs/contracts/targets | Immutable istek ve cozulmus hedefler, effective model/runner/metric/budget, lifecycle/phase/outcome/verification/apply |
| Plans/scenarios/gaps | Behavior-scenario-branch eslesmesi, oracle kaynagi, denenmis stratejiler, blocker ve belirsizlik |
| Worker attempts | Provider/model profil snapshot'i, session/message IDs, rol, sure/usage/repair/error, input/output artifact digests |
| Candidate iterations | Parent accepted checkpoint, changeset hash, adoption/rejection/quality karar ve neden |
| Test runs/results | Command plan/runner/toolchain, observed process/container identity, outcome, kesfedilen ve calisan testler, skipped/failed/unstable |
| Coverage snapshots | Target + run + source/binary identity, raw LINE/BRANCH sayaclari, gecerlilik/applicability, once/sonra |
| Quality/mutation | Finding/rule/scenario/test baglari, stability repeats, PIT/import provenance, reviewer sonucu |
| Artifacts/checkpoints | Relative store path, full SHA-256, bytes, schema/kind/sensitivity/status/pin, source/run/parent refs |
| Job leases/events | Tek owner/generation, heartbeat/CAS, olay sequence, resumable asama, iptal/engellenme nedeni |
| Approval/apply operations | Human origin, job/checkpoint/root/patch digest grant, expiry/consumption, journal/backup/recovery |
| Benchmark/release/bakim | Fixture/model/config manifest, deneme sonuclari, release evidence registry, backup/restore/update/GC kayitlari |

Sadece tabloyu olusturmak yeterli degildir. Ornek normal job'dan sonra "hangi projede hangi sinif/test hangi modelle uretildi, hangi testler gercekten calisti, ne kadar coverage dogrulandi, neden durdu" sorgulari dogru cevaplanmalidir. Sorgu icin modelin keyfi SQL calistirmasi gerekmez; typed query view'lari kullanilir.

### 14.3 Dayaniklilik ve versiyon

WAL, foreign_keys, busy timeout, transaction ve uygun synchronous politikasi explicit'tir. Kritik checkpoint/lease/best pointer ve migration islemlerinde dayaniklilik, elektrik/process kesintisi varsayimlariyla sinanir. WAL DB network share/UNC/NFS uzerinde kullanilmaz; local path/dosya sistemi dogrulanir.

**Guncel kaynak kontrolu:** SQLite'in resmi WAL sayfasi belirli eski surumlerde WAL-reset corruption hatasi ve duzeltmeleri belgeler [S09]. Urunun kullandigi `better-sqlite3` surum adindan SQLite'in guvenli oldugunu tahmin etme; runtime `sqlite_version()` sonucu kaydedilir. Duzeltilmis desteklenen surum veya belgelenmis backport kullanilir. Bu not mevcut urunun kesinlikle etkilenmis oldugu iddiasi degildir; surum dogrulamasi zorunlulugudur.

Eszamanli iki MCP process'i, DB busy/lock, disk dolmasi, permission denied, bozuk DB ve bilinmeyen daha yeni schema fail-closed davranir. Recovery mevcut DB'yi silip sifirdan kuramaz. Yedek ve blob tutarliligi dogrulanmadan restore basarili sayilmaz. SQL injection'a karsi parametreli sorgu; dynamic ORDER/filter yalniz allowlist.

### 14.4 Artifact yayinlama ve garbage collection

Binary `.exec`, class/jar, compressed archive ve metin farklidir; tum artifact'ler `string` olarak UTF8'e cevrilmez. MIME/encoding, byte length, hash ve schema version kaydedilir. I/O streaming ve sinirli memory ile yapilir. Immutable blob identity ayni bytes ise dedup olabilir; farkli job'larda yetki/ref baglari ayri kalir.

GC iki asamalidir: dry-run inventory -> refs/lease/pin kontrolu -> onayli sweep. Active/paused/interrupted job'un son trusted/best checkpoint'i, release kaniti veya backup manifest'inin referanslari silinemez. Auto-GC varsayilan olarak yalniz urune ait sahipsiz/gecici ve politika kapsamindaki dosyalara uygulanir; genis user klasorleri hedef olmaz. Rejected testler ile untrusted model ciktisi saklama politikasina gore tutulur; silme islemi audit kaydi birakir.

---

## 15. Raporlama, dosya teslimi ve ortak evidence projeksiyonu

### 15.1 Tek sonuc kaynagi

`test_status`, `test_result`, HTML, JSON, text summary ve project history ayni trusted run/checkpoint projeksiyonundan uretilir. User checkout'taki o anki XML'i okuyarak gecmis job sonucunu degistirme. Final job tamamlandiktan sonra baska bir run raporu eski job'un coverage'ini degistiremez.

Alanlar gercek kayittan gelir: before/after raw sayaclar, hedef/metric/applicability, test eklenen/degisen/kosulan/failed/skipped sayisi, iteration/repair/rejection, model/rol profilleri, elapsed/usage, kalite/gap bulgulari, production integrity, source revision ve verification scope. Olculmeyen alana 0 veya PASSED doldurulmaz; `UNKNOWN/NOT_RUN/UNAVAILABLE` ve nedeni yazilir.

`COMPLETED` lifecycle ile `TARGET_REACHED` outcome, `READY_FOR_REVIEW` apply_state birbirinden bagimsiz gosterilir. Hedef alti ama tamamlanmis analiz yesil hedef basarisi olarak renklendirilmez. Onayli apply yapilmadan "testler projeye eklendi" denmez; "dogrulanmis patch hazir" denir.

### 15.2 Zorunlu teslim dosyalari

Her normal job icin applicable artifact'lerle su paket olusur:

- Insan-okunur `index.html`, makine-okunur `report.json`, kisa `summary.txt`.
- Baslangic ve son trusted/final JaCoCo XML/HTML, mevcutsa `.exec` ve yeniden rapor uretmek icin gereken version/provenance manifest'i.
- JUnit/Surefire test sonuclari, bounded/redacted run loglari ve gerekli compiler/repair diagnostics.
- `changes.patch`, degisen testlerin before/after manifest'i, gerekirse binary test fixture'lari icin hash'li bundle. Bos/no-change job'da bu durum explicit'tir.
- Test plan/scenario-gaps/quality/mutation/stability ozetleri; full sensitive worker input/output varsayilan olarak public export'a alinmaz.
- Checkpoint/source/run/runner/model/toolchain manifest baglari, artifact `manifest.json` ve tam hash dogrulamasi.

Tum paket `<runtime>/jobs/<job-id>/...` altindadir; product/customer repository'lerinde degildir. `test_result` gercek path/handle ve artifact cursor'unu verir. Sadece "PATCH_ONLY" string'i veya nullable report_path donmek yeterli degildir.

### 15.3 HTML tasarim standardi

Tek statik, offline, profesyonel muhendislik raporu: ustte karar ve guvenilir ozet, sonra target bazli LINE/BRANCH before/after, test envanteri/iteration tablosu, kalite ve acik gap'ler, model/sure bilgisi, kaynak/integrity/provenance ve ham kanit baglantilari. Buyuk listeler okunabilir, filtrelenebilir veya bolumlenmis olur; bunun icin sunucu/UI uygulamasi kurulmaz.

Gorsel dil notr/slate, beyaz/acik gri yuzey, ince border ve soft shadow; renk yalniz anlamli kucuk durum badge'lerinde. Yogun mavi, glow, gokkusagi paleti ve gereksiz gradient yok. Yuzdeyi yaniltici grafik alanlariyla buyutme; graph yaninda ham covered/total her zaman gorulebilir. Kontroller klavye ile kullanilabilir, kontrast ve metin hiyerarsisi okunur, renk tek anlam kanali degildir. Kurumsal logo/marka/sertifika onaysiz kopyalanmaz.

Class/test/error/model adlari dahil tum untrusted icerik HTML-escape edilir. Script injection, URL scheme/path escape, ANSI/control chars, log/link XSS ve nested report payload'lari test edilir. External CDN/font/analytics yok; offline baglantilar kendi artifact paketi icinde calisir. Rapor uretimi tarayiciya kurum servisine otomatik istek yaptiramaz. Tarayiciyi acmak kullanicinin tercihi olur; backend shell injection yolu olmaz.

### 15.4 Export ve gizlilik

Export collector path containment, reserved names, binary-safe kopya, byte/hash/required-file validation yapar. `hash_mismatch` sonucu hesaplanip gormezden gelinemez; mismatch varsa verification false ve typed error.

Detayli yerel rapor ile **paylasilabilir redacted destek paketi** ayridir. Redacted paket varsayilan olarak source bodies, auth/endpoint/team ID, tam user path, ham prompts/responses, environment dumps ve hassas dependency ayarlarini tasimaz. Kalan bilginin politikaya gore hassas olabilecegi belirtilir. Otomatik mail/upload/telemetry yoktur.

---

## 16. Patch-only ve guvenilir onayla test uygulama

### 16.1 Varsayilan teslim

Varsayilan `PATCH_ONLY`: job bitince kaynak repo degismez, fakat **gercek uygulanabilir patch + hash'li test dosyalari + verification kaniti** teslim edilir. Kullanici patch'i mevcut Git/IDE araci ile inceleyebilir; zorunlu ikinci bir coverage calistirmasi beklenmez. Patch'in stale source'a uygulanmasi riski manifest'te belirtilir.

Bu guvenli varsayilan, `test_apply` veya export alt sisteminin fake/stub olmasina izin vermez. Onayli apply yetenegi asagidaki kisitlarla GERCEK uygulanir ve test edilir; aktif edilmesi desteklenen guvenilir insan onay kanalina baglidir.

### 16.2 Onay gercegi

Modelin `approved:true`, serbest metin veya sekiz karakterli `approval_reference` gondermesi insan onayi DEGILDIR. Server, job ID + source/location ID + checkpoint + patch digest + path seti + expiry/nonce iceren challenge/grant olusturur. Grant'in human origin'i desteklenen istemcinin native onay/elicitation olayindan veya ayri yetkili yerel operator kanalindan dogrulanir. Worker modele bu onay yetkisi verilmez.

Native MCP elicitation/istemci permission adapter'i kullanilacaksa kurulu surumun gercek kontratiyle entegrasyon kanitlanir; SDK'da olmayan API varsayilmaz. Istemci bu kanali desteklemiyorsa `test_apply` yazmadan `APPROVAL_CHANNEL_UNAVAILABLE/PATCH_ONLY` doner ve mevcut patch'i verir. Bu, **onaysiz yazmayi reddeden destekli davranistir**; verilmis onayi dogrulayamayan bir sistemi onayli apply calisiyor diye gostermek degildir.

Guvenilir onay kanali icin implementation + reference-client olumlu/olumsuz testler zorunludur. OpenCode profilinde onayli apply destekleniyor diye dokumante ediliyorsa onun gercek native human gate'i de ayrica sinanir. Aksi halde OpenCode destek tablosunda patch-only acikca belirtilir. Yeni UI veya yeni genel CLI sadece onay icin gelistirilmez.

### 16.3 Transaction ve kullanici degisikligi

Apply oncesinde original checkout'taki her hedef dosyanin expected-before hash/absence, realpath, test-root izni ve production shadow kontrolu tekrar yapilir. Kullanici arada dosyayi degistirdiyse CONFLICT; son kabul edilen patch ve kullanici edits korunur. Otomatik force apply/three-way sonucu accepted sayma yoktur.

Multi-file apply, OS seviyesinde tek atomic transaction degildir. Durable operation journal, operation'a ozel ilk backup, temp+replace, adim bazli state, controlled rollback/resume ve hash'li after-state ile uygulanir. Crash ortada olursa hangi path'ler degisti ve hangileri bekliyor kesin tespit edilir. Kullanici crash sonrasi dosyayi degistirdiyse rollback o degisikligi ezmez; conflict verir.

Ayni grant/operation id ile tekrar create/modify ayni sonucu doner; ilk preimage backup overwrite edilmez, ikinci onaysiz uygulama yapilmaz. Farkli job backup/path adlari cakismaz. Delete/production/build degisiklikleri reddedilir. Apply sonucu test hedef checkout'una test-only degisikliklerdir; customer repo'da otomatik commit/push yapilmaz.

---

## 17. Saglik kontrolu, gozlemlenebilirlik ve destek

### 17.1 Ortak diagnostic servisi

Kurulum, `system_diagnose`, project inspect ve job preflight ayni kontrol implementation'larini kullanir; her yerde farkli gevsek kontrol yazilmaz. Kontroller:

- Node/native module/SQLite uyumu, config/schema/data-root izinleri ve disk boslugu.
- MCP adapter/protocol ve OpenCode executable/server API/model yetkisi, effective profil, context/structured output kabiliyeti.
- Runner/OCI daemon/image digest/guvenlik probe'lari; Java/Maven/JaCoCo aractakimi **nerede calisiyorsa orada** dogrulanir. Izole runner yeterliyken hostta ayni Java/Maven kurulumunu gereksiz zorunlu kilma.
- Project trust/root/source/target/effective model, cold-cache/dependency/CA/proxy/mirror durumu.
- DB migrations/backup/lease/orphan/evidence butunlugu ve maintenance gereksinimleri.

Kontrol seviyeleri `STATIC`, `CONNECTED`, `CAPABILITY_VERIFIED`, `LIVE_PIPELINE_VERIFIED` gibi ayridir. Saglik kontrolu her seferinde tum benchmark'u kosmaz. Hafif probe'lar cached olabilir; zaman/konfig degeneracy gecersiz kilinir. "Kontrol et" komutu kendi basina yazilim/DB upgrade, image pull veya kurum config degisikligi yapmaz.

Hata raporu: reason_code, etkilenen capability, retryable bilgisi, secretsiz insan aciklamasi, kanit referansi ve **tek somut gerekli sonraki aksiyon**. Eksik ortam, source bug ve model yetersizligi ayridir. Kullaniciya uzun dump ve bilinmeyen FAILED yerine neden verilir.

### 17.2 Olay/log standardi

JSONL/typed events'te timestamp, job/location/run/attempt/checkpoint/owner-generation/correlation ID, phase/outcome/severity/duration ve redacted detail bulunur. Serbest log metni tek durum kaynagi degildir. In-flight progress ile terminal trust durumu ayrilir.

Model request sayisi, elapsed/queue/runner/model sureleri, token usage biliniyorsa, retries, candidate rejection nedenleri, accepted delta, cache hit ve kaynak tuketimi olculur. Olcum yoksa `null + reason`. Her saniye dev log uretme; bounded buffer, streaming/rotation/backpressure gerekir. Sensitive payload debug'u acik onay ve kisa retention ister. Trace collector/harici telemetry servisi zorunlu degildir; varsayilan dis aktarim kapali.

### 17.3 Destek ve incident paketi

Kullanici ayni MCP uzerinden sorun ozeti alabilir. Destek paketi effective **redacted** config, version/capability matrix, ilgili job olaylari, error fingerprint, eksik/bozuk artifact listesi ve tekrar uretme adimini icerir. Kaynak kodu/secret'lari varsayilan olarak icermez. Paket olusturma kurallari guvenlik testine baglidir.

Operations/runbook su durumlari cozer: model auth/timeout/format, Maven baseline fail, coverage yok/stale, Docker yok/izin yok, Windows path/shim hatasi, DB lock/corruption/disk full, orphan runner, source changed, report hash mismatch, failed update/restore ve apply conflict. "DB'yi sil, tekrar dene" standart kurtarma yontemi olamaz.

---

## 18. Guvenli kurulum, upgrade, rollback ve backup/restore

### 18.1 Dagitim bicimi

Urun surumlu yerel paket olarak hazirlanir. Runtime kodu/build ciktisi, Java helper, gerekliyse native bilesenler, lockfile/dependency manifest, schema/adapter profilleri, docs ve kurulum/bakim scriptleri pakette bulunur. Release paketi source repo'daki rastgele `dist` klasorunun varligina baglanmaz. `npm pack`/esdeger package manifest'i hassas dosya taramasindan gecer.

Desteklenen Windows/Linux paketleri icin native `better-sqlite3` ABI/platform uyumu gercekten test edilir. Yeni `node_modules`/native moduller calistirma aninda disaridan kontrolsuz indirilmez. Dev-from-source kurulumu fresh clone + dist/node_modules yokken calisabilir; release install ise yeniden source compile gerektirmeyen dogrulanmis yolu sunar veya gerekliliklerini acik ve eksiksiz paketler.

### 18.2 Config merge ve owned install

JSON/JSONC parse/edit paylasilan standartla yapilir. Yorumlar/bilinmeyen alanlar ve mevcut MCP/provider/agent/plugin/permission ayarlari korunur; tum dosyayi sifirdan JSON.stringify ile yazarak veri/format yok etme. Desteklenmeyen format corrupt edilmez. BOM/Unicode/EOL, nested alanlar ve `mcp`'nin yanlis type olmasi test edilir.

Kalici backup + expected-preimage kontrolu + owned lock/CAS + ayni filesystem temp/rename + post-verification vardir. Concurrent user config edit'i fark edilirse conflict; verify fail halinde rollback yalniz bizim yazdigimiz postimage hala yerindeyse yapilir. Yabanci son degisikligi backup diye ezme. `rm(config)` sonrasi rename fallback'i ile dosyanin kaybolma penceresi yaratma; supported atomic replace semantigini kullan/test et.

Kurulum manifest'i urunun gercek sahip oldugu file/config paths ve hash'lerini tutar. Idempotent reinstall diger ayarlara dokunmaz. Uninstall yalniz owned ve beklenen hash'teki girdileri kaldirir; user modified ise korur/uyarir. Runtime gecmisi varsayilan olarak korunur; veri silme ayri ve acik onayli bakimdir.

### 18.3 CMD/Node standardi

Public/documented kurulum, verify, update, rollback ve uninstall yollari PowerShell olmadan calisir. `npm.ps1/opencode.ps1` engellenmesi `.cmd`/native cozumlemeyle ele alinir; execution policy degistirilmez. Desteklenmeyen sh/grep/head komutlari CMD varsayimiyla kosulmaz. `.mjs` ortak library'ye dayanir; `.ps1` varsa zorunlu veya alternatif farkli/kusurlu implementasyon olmamali.

Test scriptleri process exit code'u dogrudan yakalar. Pipeline'in `Select-Object -Last` veya shell'de `;` sonrasi commit basarisi, onceki test fail'ini gizleyemez. Tum command/outcome ve structured test runner raporu saklanir.

### 18.4 Upgrade ve rollback

Stable launcher + side-by-side version dizinleri veya esdeger atomik switch kullan. Aktif job varken kullaniciya pause/quiesce gerekir; worker/run state checkpoint alinmadan binary/schema degistirme. Yeni paket hash/signature, format ve platform dogrulamasi sonrasinda hazirlanir. Eski executable ve config backup geri donus icin tutulur.

Schema migration kisa transaction ve once backup ile yapilir. Daha yeni taninmayan DB eski binary ile yazilmaz. Binary rollback ile DB downgrade esdeger degildir: esdeger compatibility veya dogrulanmis pre-upgrade DB+blob snapshot restore plani gerekir. Kullanici update sonrasi yeni job yaptiysa eski backup'i otomatik restore ederek yeni veriyi kaybetme; explicit conflict/recovery secimi gerekir.

Update ortasi kill, bozuk/traversal paket, ABI mismatch, migration fail ve smoke fail durumlarinda eski calisan surum ve kullanici config'i korunur. Sessiz auto-update yoktur. Guncelleme mekanizmasi gercek calisan N->N+1 sentetik surum fixture'iyle ve current schema verisiyle sinanir; sadece `version++` testi yeterli degildir.

### 18.5 Backup/restore ve retention

Online SQLite backup API veya esdeger resmi destekli yontem kullan [S09]; acik WAL DB'nin sadece `.db` dosyasini kopyalayarak tam backup iddiasi yapma. Backup bir DB snapshot'i ile o snapshot'in referans verdigi immutable blob manifest'ini birlikte sabitler. Bu arada GC ilgili ref'leri pinler. Backup complete marker ancak tum blob/hash/DB integrity dogrulamalari gecince yayinlanir.

Restore once ayri owned konumda dogrulanir, FK/integrity/schema/blob check'leri yapilir; sonra quiesced runtime'a acik onayla switch edilir. UUID/job lineage korunur; location path degisikligi yeniden baglama ve source dogrulama ister. Eksik/bozuk blob varsa backup/restore PASSED degil. Yeni restored runtime'da eski bir job'un result'i goruntulenip checkpoint'i okunmalidir.

Retention policy: aktif/best/release/backup pin'leri korunur; rejected/untrusted/gecici artifacts icin configurable TTL/byte budget ve dry-run. Defaults veri kaybi yaratmayacak kadar korumacidir; otomatik genis history delete yoktur. SSD'de guvenli fiziksel silme garantisi verilmez; application silme ile kurum disk sifreleme/saklama politikasi ayridir.

## 19. Tedarik zinciri ve surum guvenligi

### 19.1 Dependency ve paket envanteri

Urune ait production/dev npm dependencies, Java helper/plugin/harness dependencies, OCI image ve paketlenen native bilesenler icin kilitli versiyon/resolve kaynagi ve lisans bilgisi bulunur. SBOM CycloneDX veya esdeger yaygin standartta uretilir; yeni bir SBOM standardi icat edilmez [S15]. Container manifest ve SQLite runtime surumu SBOM/provenance'tan kaybolmaz.

OpenCode/LiteLLM kurum servisindeki model agirliklari bu urunun dagitimina dahil degildir; paketlenmez. Gerekli harici runtime'lar uyumluluk manifest'inde ayrica gosterilir. Kaynak lisanslari incelenmeden CoverUp/ChatUniTest/Qodo kodu kopyalanmaz. Referanslardan algoritmik ders uyarlamak ile lisansli kodu dagitmak farklidir.

### 19.2 Zafiyet taramasi

Release adayi icin urun dependency/container envanteri guncel ve dated advisory feed ile taranir. OSV-Scanner gibi official aracin offline modu/kurumca onayli feed kullanilabilir [S16]. Scanner calismadiysa, feed yok/eskiyse veya paket desteklenmiyorsa "0 vulnerability" yazilmaz; exact kapsam ve UNAVAILABLE/STALE kaydedilir.

Varsayilan gate: urunun dagitilan ve erisilebilir kritik/yuksek riskli bulgulari acik birakilmaz; duzeltme veya yetkili insanin gerekceli/time-bounded risk karari gerekir. Model kendi kendine waiver veremez. Dusuk/orta ve erisilemezlik de kanitli triage edilir, topluca ignore eklenmez. Guvenlik icin customer dependency'lerini otomatik degistirmek kapsam disidir; buradaki scan **urun** tedarik zincirini dogrular.

Public advisory/API'ye customer source, kurum artifact koordinatlari veya hassas SBOM otomatik gonderilmez. Kurum scanner/egress politikasi korunur. Local/offline feed indirmenin kendisi de explicit onayli kaynaktan, imza/hash ve tarih kontroluyle yapilir.

### 19.3 Imza, checksum ve provenance

Dagitimda release manifest'i, dosya boyut/hash listesi, source-tree digest, paket/SDK/toolchain/schema surumleri ve test kanit referanslari bulunur. Checksum butunluk kontroludur; kimden geldigini tek basina kanitlamaz. Guvenilir dagitim kaynagi/ayri trusted key ile signature dogrulama yolu uygulanir; paketin icindeki yeni public key otomatik trusted olmaz.

Imza adapter'i test anahtarlariyla olumlu/olumsuz/tamper/expired/revoked-key senaryolarinda gercekten sinanir. Kurum signing key'i yoksa yeni kurumsal kimlik uydurulmaz; paket `UNSIGNED/NOT_PUBLISHED` olarak dogru etiketlenir ve kurum dagitim profili dogrulanmadan kuruma imzali yayin iddia edilmez. Yerel gelistirme/pilot profili explicit ve sinirlidir; tamper kontrolunu kapatmaz. Signing key, private certificate ve secret'lar repoya yazilmaz.

Mevcut `UNLICENSED/private` package tercihi yetkisiz degistirilmez. Third-party notices ve lisans envanteri hazirlanir; urunun kamuya acik lisansini kullanici adina secme. "Production kalitesi" ifadesi kurum adina SSDF/ISO/SOC sertifikasyonu anlamina gelmez. SSDF, guvenli gelistirme ve vulnerability response icin referanstir [S17].

### 19.4 Guvenlik kabul seti

Yerel sentetik fixture'lar su saldirilari dener: source/test/log prompt injection, modelin secret/host file okuma veya network exfiltration istegi, tool recursion, path traversal/junction/ADS, SUT shadowing, coverage forgery/stale evidence, test disable/filter oyunu, XML entity bomb, HTML XSS, archive traversal/zip bomb, oversized model response/log, cache poisoning, unauthorized apply ve late worker writes.

Test yalniz scanner raporuna bakmaz: izinli kaynak/runner/artifact disina yazma/okuma/egress gercek probe ile gozlenir. Denemeler gercek kurum servislerine/ucuncu taraflara saldiri yapmaz. Guvenlik bulgulari kendiliginden public issue/email olarak gonderilmez; yerel kayit + yetkili review.

---

## 20. Benchmark, model karsilastirmasi ve kalite regresyonu

### 20.1 Referanslardan alinacak sinirli yaklasim

CoverUp'in coverage gap -> uretim -> yeniden olcum ve tekrarli calistirmayla kararlilik arama yaklasimi [S13], ChatUniTest'in generate/validate/fix zinciri [S14] bu urune **uyarlanir**. Baska projedeki test disable, failing assertion prune, customer POM degisikligi veya farkli model servisine baglanma secenekleri devralinmaz. Tum stratejiler bizim test-only, accepted-set ve evidence sinirlarimizdan gecer.

### 20.2 Version'lu sentetik corpus

En az 12 scenario tanimli fixture/catalogue bulunur. Bunlar normal dagitilan MCP motorunu cagirir; ozel demo pipeline'i degildir.

| Fixture grubu | Minimum hedef |
| --- | --- |
| BM01 | Basit ama baslangicta hedef altinda branch/line olan utility/validator |
| BM02 | Mevcut Mockito'lu servis ve dependency failure/exception |
| BM03 | Precision/rounding/boundary; beklenen sonuc bagimsiz reference oracle ile |
| BM04 | Collections/null/empty/invalid girdi ve parameterized tests |
| BM05 | State transition/side effect/idempotency; pollution yakalama |
| BM06 | Java8/JUnit4/expected exception ve mevcut helper testleri |
| BM07 | Java17/JUnit5; nested/parameterized/dynamic test kimligi |
| BM08 | Java21/reactor; cross-module dependency, ayni simple name ve custom test root |
| BM09 | Test-only siniri icinde engelli dis bagimlilik/testability; hedef altinda dogru durma |
| BM10 | Eksik framework/olcum/dependency konfigurasyonu; dogru blocker |
| BM11 | Onceden bozuk/unstable baseline; AI kazanimiyle karistirmama |
| BM12 | Adversarial fixture: manipulasyon/shadow/secret/late-result denemeleri |

BM01-BM08 icin baseline en az bir hedef metrikte %90 altinda olmalidir. Ayri insan/reference test setiyle production degismeden esigin gercekten ulasilabilir oldugu kanitlanir. Golden/reference testler modele verilmez; aday baseline'ina kopyalanmaz. Reference/source/corpus/budget manifest'i denemeden once sabitlenir. Kolaylastirmak icin fixture production kodu sonradan degistirilmez; fixture hatasi varsa acik revision ve yeniden tum karsilastirma gerekir.

### 20.3 Gercek model karsilastirmasi

Yetkili iki model profili, ornegin kullanicinin mevcut GLM ve Qwen profilleri, **ayni corpus/snapshot/esik/butce/toolchain** ile calistirilir. Kurum disi yayin benchmark sayilari urunumuzdaki performans diye kullanilmaz. Model etiketi/quantization adi kaliteyi kanitlamaz.

BM01-BM08 icin her modelde en az 3 bagimsiz tekrar: toplam en az 48 reachable canli job. BM09-BM12 icin her modelde en az birer kontrol: toplam 8 negatif/engelli job. Bu sayilar bir test-run garantisi degil, bu release icin olcum planidir. Butce ve kaynaklar acik kaydedilir; tekrarlar test-only/sandbox sinirlarini asamaz.

Her denemede kullanilan gercek model/provider/config/varsa served revision, input/source digest, toolchain, warm/cold cache durumu, duration, cost/usage availability, raw counters, test IDs, coverage gain, quality findings, repair sayisi, outcome ve artifact'ler saklanir. Failure/blocked/timeout denemeler denominator'dan cikartilmaz. Sadece en iyi sonucu veya son basarili retry'yi secmek yoktur. Deterministik seed model tarafinda desteklenmiyorsa bu durum raporlanir.

Oncelikli model, sinama oncesinde declared profil olabilir; diger modelle sonuclar goruldukten sonra profil degisirse karar/config revision kaydedilir ve release calibration yeniden yapilir. Ayri kisa holdout fixture'lariyla asiri prompt/fixture uyarlamasi kontrol edilir.

### 20.4 Release kalite esigi

Bu gorev icin tasarim kabul esigi:

- Primary release profilinde 24 reachable denemenin en az 20'si, iki uygulanabilir metric icin hedefe gercek final replay ile ulasir; her reachable fixture en az bir kez basarili olur.
- Guvenlik/policy ihlalinin accepted sayilmasi, stale/sahte coverage ile success ve mevcut test kaybi **0**.
- Negatif/engelli fixture'larda dogru outcome, korunan trusted set ve kanitli neden zorunludur; dusuk coverage hedef basarisi olarak sayilmaz.
- Secondary modelin primary kadar iyi olmasi zorunlu degildir; onun gercek basari/basarisizlik dagilimi gosterilir. Fakat ikinci modelde canli execution ve model degisimli resume kabiliyeti kanitlanir.
- Farkli yetkili modelle ayni job'un checkpoint'ten devam ettigi en az iki canli deneme; source/test/plan/butce history korunur.
- Reference oracle'i olan beklenen behavior/assertions ve en az sekiz kabul edilen test degisikligi bagimsiz kalite incelemesinden gecer. Bu inceleme gizli dusunce zinciri degil, somut davranis/kanit incelemesidir.

Bu esikler olculmus sonuc degildir; release kabul kararidir. Yetkili modeller siniri saglamazsa sistemi sahte basari uretecek sekilde gevsetme. Context/plan/repair/harness kusurlarini duzelt, gerekceli bounded tekrar yap; gerekirse `BLOCKED_MODEL_QUALITY` olarak acik birak. Threshold/fixture degisikligi ancak kullaniciya acik karar kaydiyla olur.

### 20.5 Gercek proje pilotu

Sentetik corpus'a ek olarak kullanicinin mevcut yetkili kurum Maven projesinde en az bir gercek hedef sinifta read-only original checkout + izole test-only job calistirilir. Hedef isim/path onceden uydurulmaz; yetkili local context'ten secilir. Gercek sinif icin %90'a ulasma garantisi yoktur; dogru baseline, uretim, dogrulama, tamper-free original, teslim ve hedef/engel sonucunun dogrulugu esastir.

Kaynak/hassas raporlar public repo'ya konmaz. Public kabul kaydi yalniz secretsiz evidence manifest/digest ve komut sonucunu icerebilir; ayrintili kanit yerel tutulur. Yetki/proje/model yoksa genuine ortam blocker kaydedilir; sentetik smoke, canli kurum pilotu diye etiketlenmez.

---

## 21. Performans, kaynak yonetimi ve uzun sureli kabul

### 21.1 Olculen operasyonel hedefler

Asagidaki sayilar ayni documented referans makine/fixture/dataset icin kabul esigidir; her kullanici makinesi icin kosulsuz SLA degildir. Machine CPU/RAM/disk, OS, versions, runner limitleri ve arka plan yuku olcumle birlikte saklanir. Harici model latency'si dahili kontrol-plane latency'sinden ayridir.

| Davranis | Varsayilan kabul hedefi |
| --- | --- |
| test_start job receipt | Durable istegin queue'ya alinmasi p95 <= 2 saniye; buyuk source kesfi/build sync cevapta bekletilmez |
| test_status/test_result metadata | 2 aktif job ve fixture envanterinde p95 <= 1 saniye; buyuk artifact transferi ayri |
| Cancel/pause niyet cevabi | <= 2 saniye; durduruldu etiketi ancak gercek alt surecler sonlandiginda |
| Owned surec/container sonlandirma | Default grace dahil <= 30 saniye; asim explicit timeout/BLOCKED, sessiz basari yok |
| Varsayilan concurrency | 1 aktif job; en az 2 paralel job izolasyonu ve queue fairness sinanmis |
| Tekrar kullanilan envanter | Degisen dosya disinda ayni parser/config/hash girdileri gereksiz yeniden parse edilmez; cache hit/miss kanitli |
| Log/model/artifact buyumesi | Documented byte/time/file limitleri ve backpressure; sinirda guvenli stop/rotate |

`test_start` icin durable request contract once olusabilir; exact source/resolved execution contract discovery'den sonra **ilk kod/model execution'dan once** kilitlenir. Bu iki asama farkli kayittir; source'u henuz bilinmeyen bir queued isi trusted snapshot'i varmis gibi gostermek yoktur.

### 21.2 Load/soak/fault profili

- En az 10.000 code symbol + 50.000 test/run metadata kayitli sentetik envanterde pagination/sorgu/index ve refresh olcumleri.
- En az 50 kisa job'da lifecycle/cleanup/resource leakage kontrolu; bunlar butun model cagrisini gerektirmeyen harness/fault testleri olabilir, canli benchmark yerine sayilmaz.
- En az 20 deterministic fault-injection noktasi: enqueue, owner acquire, worker response, output collect, candidate adoption, blob publish, DB checkpoint pointer, report publish, cancel, apply ve update/restore araliklari.
- En az 10 force-stop/restart dongusunde orphan process/container, stale writer, missing pointer, resource leak ve accepted set kaybi olmamasi.
- Buyuk log, disk full, output quota, model response overflow, yavas disk, DB busy ve child hang testleri. Heartbeat/status bu surede cevap verebilir olmalidir.

RSS, open handle, temp/store bytes, process/container sayisi ve DB/WAL buyumesi olculur. "Test bitti" diye named volume/container kayiplarini gormezden gelme. Gecici kaynaklarda kalici ve aciklanamayan artis release blocker olur; mutlak RSS sayisi makineye gore documented limitte degerlendirilir. Performans hedefini tutturmak icin verification/test/sandbox kapisi atlanamaz.

---

## 22. Uygulama plani: tek gorev icinde bitirilecek is paketleri

Asagidaki FIN kimlikleri, yeni bagimsiz aktif gorevler degildir. Eski K00-K09/AC/RG/RT bu paketlere eslestirilir; eski kimlikler silinmez. Kodu yeniden tasarlamak gerektiginde ilgili modul refactor edilebilir; tum urunu sifirdan uretme veya calisan davranislari kaybetme yoktur.

| Paket | Is / ilgili eski kapsam | Zorunlu cikis kaniti |
| --- | --- | --- |
| FIN00 | Baslangic, arsiv, kapsam/evidence registry, risk ve guvenli baseline; K00/K09 | Gercek HEAD/dirty/config sentinel; tekil obligation listesi; onceki iddialarin dogru durumu |
| FIN01 | Domain/contract/config/model resolver ve source/project identity; K02/K06 | Typed schema/precedence/idempotency tests; immutable execution contract; model kimligi birebir |
| FIN02 | Verified runner, disposable workspace, cache/egress, process supervisor; K01/K05 | Normal entrypoint'te baseline/candidate/finalde host yoluna sifir gecis; guvenlik probes |
| FIN03 | SQLite gercek veri akisi, migration, artifact publish, job ownership/fencing; K02/K05 | Live job'dan dolan relations; crash/lock/stale owner testleri; verified checkpoint publish |
| FIN04 | Effective Maven + Java AST + hedef/test/rapor scope'u; K06 | JDK8/17/21 fixture, package/module/custom root, belirsizlik ve cross-module execution |
| FIN05 | Kontrollu OpenCode worker ve semali analiz/plan/developer/review; K03 | Gercek server/API/model cagrisi, tam ilgili baglam ve terminal output correlation |
| FIN06 | Candidate/repair/coverage evaluator/cumulative accepted/final replay; K04 | A+B kabul C red; branch-only gain; stale XML red; normal MCP pozitif hedef kazanimi |
| FIN07 | Resume/pause/cancel/late writes ve kaynak degisikligi; K05 | Ayni job hard-kill/yeni process/modelle devam; dogru kalan budget/accepted hash'leri |
| FIN08 | Semantik test kalitesi, test koruma, flaky ve PIT adapter'i; K06 | AST/discovery/behavior gates; gercek repeat/order/mutation fixture sonuclari |
| FIN09 | Ortak report projection, binary-safe export, patch ve guvenilir apply; K07 | HTML/JSON/DB/raw eslesmesi; patch hash; native/reference human gate; multi-file recovery |
| FIN10 | Legacy/modern MCP adapterleri ve kisacik OpenCode kullanimi; K08 | Gercek her revision wire; JSON framing/correlation; ikinci client contract; dogal dil pilotu |
| FIN11 | Fresh install, upgrade/rollback/backup/restore/owned uninstall; K08 | PS1'siz Windows/Linux temiz ortam; N->N+1/restore; gercek config korunumu |
| FIN12 | Diagnostics, resource limits, history, retention ve support bundle | Health seviyeleri, disk/GC/confidentiality ve kontrollu concurrency/load kanitlari |
| FIN13 | Threat model, security regression, SBOM/SCA/lisans/paket provenance | Yerel saldiri fixture'lari, dated scan, third-party notices, tamper testleri |
| FIN14 | Canli benchmark/model karsilastirma, holdout, gercek proje pilotu | Sabit corpus ve tum deneme ham sonuclari, kalite gate'leri, model switch resume |
| FIN15 | Bagimsiz release dogrulamasi, dokuman senkronu, tam dagitim teslimi; K09 | Eski ve yeni tum zorunlu kabuller, source/tree manifest, temiz paket kurulum ve nihai release raporu |

FIN02-FIN07 kritik yoldur: guvenli ve gercek tek bir dar dikey akis once tamamlanir, sonra hedef/scenario matrix'i genisletilir. Bu sira kapsam daraltma veya yalniz tek fixture'la teslim demek degildir. UI/cosmetic/gereksiz framework calismasi kritik aciklardan onceye gecmez.

### 22.1 Her paketin calisma sekli

Her bug/davranis icin: gereksinimi ve current call-chain'i oku -> hatayi yakalayan davranis testini yaz/calisir hale getir -> bug'u duzelt -> testin once fail/sonra pass nedenini kanitla -> ilgili regression'i calistir -> normal composition'da baglantisini goster -> evidence/checkpoint kaydet.

Yalniz dosyada bir kelime/import/flag arayan source-string testleri yardimci lint olabilir; normal davranis kaniti DEGILDIR. Mevcut bir testin yanlis beklentisi duzeltilebilir fakat kullanici gereksinimi degismez; neden ve once/sonra regression korunur. Problemli parser yerine assertion'i kaldirmak, failed positive pilot'u kabul etmek veya target90'i50 yaparak gecmek yasaktir.

Once butun component'leri yarim yazip en sonda baglamaya calisma. Her anlamli asama compile/test/evidence ile kapanir. Bir paketi acik bir alt davranis varken completed yapma; alt is ve devam noktasi acik kalir. Uzun calismada kullaniciya anlamsiz onay sorulari degil, gercek ilerleme/blocker bildirilir.

### 22.2 Baslangictaki ilk somut is

Once mevcut 003 kabul beyanlarini gercek durumuna getir ve **normal MCP girisinden bir candidate'in host Maven'e hic gecmemesini ve gercek candidate/final output'larinin writable-sinirli sandbox'tan alinmasini sinayan test** ile basla. Sadece varsayilan string'i Docker yapmak veya stderr'de log adi aramak yeterli degildir. Ardindan ayni normal akis icinde yetkili worker ile taze baseline'dan gercek test kazanimi ve durable checkpoint goster. Bu dikey akis saglamlasmadan butun kalemler icin yesil ozet uretme.

---

## 23. Model beyanindan bagimsiz kabul ve kanit motoru

### 23.1 Tekil obligation catalog

Ilk asamada her `AC01-AC70`, `RG01-RG52`, `RT01-RT28` ve asagidaki `PRO01-PRO60` icin tek bir gereksinim kaydi uretilir. Eski acceptance matrix'teki aralik ozetleri veya "eski testlerle eslesiyor" cumlesi bu kaydin yerine gecmez. Bir gereksinim birden fazla alt predicate gerektirebilir; sadece kolay predicate'in gecmesi tum satiri PASSED yapmaz.

Catalog kaydinda en az: `requirement_id`, kaynak belge/surum/bolum, normatif davranis, uygulama paketi, gerekli kanit seviyeleri, ilgili test/fixture kimlikleri, beklenen predicate'ler, desteklenen capability/ortam ve blocker kurali bulunur. Coverage/runtime job sonucuyla urunun release sonucu farkli tiplerdir. Ornegin dogru `TARGET_NOT_MET_BUDGET` donen negatif test PASSED olabilir; ayni outcome pozitif canli hedef testini gecirmez.

Gereksinim durumu `NOT_RUN`, `BLOCKED`, `FAILED`, `PASSED` olarak tutulur. `PASSED (kismen)` yoktur. Uygulanamaz bir alt durum icin `applicability` alani ve kanitli neden ayri tutulur; zorunlu capability'yi geriye donuk opsiyonel yaparak N/A'ya kacis yoktur. Branch total0 gibi bir run metric'inin N/A olmasi, branch evaluator kabul testini N/A yapmak anlamina gelmez.

### 23.2 Kanit seviyeleri birbirine karismaz

| Seviye | Kanitladigi sey | Yerine gecemeyecegi sey |
| --- | --- | --- |
| STATIC | Dosya/schema/lint/format ve belirli source oruntusu | Fonksiyonun veya urunun gercekten calismasi |
| UNIT | Kontrollu girdide fonksiyon/domain davranisi | Gercek model, gercek container veya paket kurulumu |
| CONTRACT | Gercek protokol/client-server siniri ve typed mesaj semantigi | Coverage kazanimi ve test muhendisligi basarisi |
| INTEGRATION_ISOLATED | Gercek Maven/JUnit/JaCoCo/SQLite/sandbox bilesenlerinin birlikte calismasi | Kullanilmayan gercek modelin kalite/erisim kabulunu |
| LIVE_MODEL | Yetkili modelin normal urun akisinda gercek test uretmesi | Eksik security/upgrade/backup kabulunu |
| OPERATIONAL | Temiz kurulum, guncelleme, fault/restore/load ve paket davranisi | Sinanmamis musteri proje/framework destegini |
| REVIEW | Kaynak/behavior/security kalite incelemesi ve gerekceli bulgular | Calistirilmamis otomatik testi veya insan onayi gerektiren grant'i |

Replay/fake/mock kullanimi test metaverisinde acikca kaydedilir. Reference client kullanan gercek wire contract testi yararlidir; insanin gercek OpenCode talebinin yerine LIVE_USER_FLOW diye yazilmaz. Tersine, ekranda modelin "testler gecti" demesi de runner raporunun yerine gecmez.

### 23.3 Evidence record ve collector

Collector gercek test/process/worker/DB/artifact sonucundan en az su alanlari uretir:

- `evidence_id`, requirement/test/fixture/benchmark trial IDs, evidence level ve actual capability/profile.
- Uygulamanin verified code tree digest'i, source commit, test/helper/lockfile/config/prompt schema revision'lari; hedef Java source/build/accepted digest'i.
- Exact komut arguman dizisi, calisma alani kimligi, baslangic/bitis/duration, exit code/signal, timeout/cancellation, stderr/stdout artifact referanslari. Secret degerler redact edilir, ilgili secret kimligi/version referansi yeterlidir.
- Model provider/model/deployment/worker session/message kimlikleri; runner image digest/OS/JDK/Maven/JaCoCo/SQLite runtime bilgisi.
- Gercek kesfedilen test kimlikleri, once/sonra covered/missed sayaclar, eski test koruma sonucu, policy/quality/integrity predicate'leri ve gerekceleri.
- Immutable artifact path/size/SHA-256/schema, accepted checkpoint parent/generation/fence ve rapor manifest'i.
- Beklenen ile gozlenen davranis, gecen/kalan predicate'ler; varsa bagimsiz reviewer kimligi/modeli ve sonuclari.

Ham test runner JSON/JUnit/XML ve process exit code birlikte korunur. Pipeline'in sonundaki `Select-Object`, `tail`, grep veya shell'in son komut exit'i asil test exit'i diye kullanilmaz. CMD + Node collector stdout/stderr'yi bounded stream ile dosyaya yazar; terminale kisa ozet gosterebilir ama asil kaniti kesmez.

### 23.4 Release verifier gercekten red edebilmeli

Yerel, acikca calistirilan maintainer `.mjs`/npm release-check girisi implement edilir. Bu yeni son-kullanici CLI urunu degildir; CI kapali kalirken tekrarlanabilir kabul motorudur. Validator kendi girisindeki `passed: true` alanini sadece saymaz; manifest, hashes, actual test/process outputs, scope, test kimlikleri ve beklenen predicate'leri kontrol eder.

Asagidaki durumlardan biri zorunlu kabulde varsa **non-zero exit** ve acik eksik listesi verir:

- Zorunlu requirement satiri, alt predicate, dogru kanit seviyesi veya gercek run eksik.
- Beklenmeyen skip, filtrelenmis test, kisa smoke ile karsilanmis canli pilot, basarisiz pozitif senaryo.
- Artifact eksik/corrupt, hash/size/source veya accepted digest uyusmuyor, report path mevcut ama icerigi baska job'a ait.
- Olcum kaynagi eski/reddedilmis run; test sayisi var ama yeni test kesfedilmemis; metrics sadece yuvarlanmis sunum degerlerinden gelmis.
- Child/container gercekten sonlanmamis, original source degismis, kabul edilmemis test seti teslim edilmis veya onay baglanmamis.
- Model identity/worker correlation yok, butce/model history kaybolmus, resume yerine yeni job acilmis.
- Security feed/paket kapsami veya ilan edilen platform/protocol kaniti yok; destek matrisi kanitsiz genisletilmis.

Validator'un kendisi icin gecersiz kanit ekleme, PASS boolean'ini elle degistirme, requirement silme, hash bozma, eski commit sonucu kullanma, canli testi fake'le degistirme ve pozitif senaryoya FAILED yazma regresyonlari bulunur. Her biri kapidan donmelidir.

Hash ve local collector, ayni OS kullanicisina/admin'e karsi mucizevi bir guvenlik siniri degildir. Semantik test kalitesi de yalniz hash ile kanitlanmaz. Bu nedenle tipli run kanitlari, gercek replay ve farkli inceleme sorumlulugu birlikte kullanilir. Duzeltmeyi yazan model kendi MD dosyasina "bagimsiz denetim tamam" yazmakla bagimsizlik yaratamaz.

### 23.5 Code revision, teslim commit'i ve dokuman tutarliligi

Test edilen kaynak seti; urun executable kaynaklari, scripts, tests, helper, policies/prompts, schemas ve lockfile/config girdileriyle fingerprint edilir. Son handoff gibi yalniz belge degisikligi sonrasinda `source_commit`, `verified_code_digest` ve `delivery_commit` ayri raporlanir. Boylece handoff commit hash'ini kendi icinde onceden tahmin etme veya dokuman commit'i sonrasinda calistirilmayan testi yeniden calistirildi diye sunma geregi dogmaz.

Davranisi etkileyen herhangi bir degisiklik verified seti gecersiz kilar; etkilenen testler ve final release kapisi tekrar calistirilir. Yeni code/config/prompt degisikligini "yalniz dokuman" diye dislamanin regression testi bulunur. README, PROJECT_STATE ve kabul ozeti ayni ledger'dan dogru seviyeyi gosterir.

### 23.6 Blocker ve kalan is nasil yazilacak?

`NOT_RUN` veya `BLOCKED` karsisinda mevcut kazanimi koru; engellenmeyen diger implementasyon/test islerine devam et. Gerekli izin/model/sandbox yoksa exact eksik capability, denenmis komut, error code, korunmus checkpoint ve engel kalkinca ilk calistirilacak test yazilir. Ancak rapor/code eksigini "ortam engeli" diye saklama. Kullaniciya yalniz gercek ve kendisinin cozmesi gereken noktada soru yonelt.

Bu urunun tum kapsaminda terminal non-success'i dogru raporlamak normaldir; ama **urunu gelistirme gorevinin tamamlanmasi**, burada belirlenen zorunlu urun yeteneklerinin implementasyonu ve kabulune baglidir. Bu iki kavram birbirine donusturulemez.

---

## 24. Devralinan normal-yol kabulleri: RT01-RT28

Asagidaki senaryolar 003 v1.1'den anlamlari daraltilmadan devralinmistir. Eski test adlari ya da onceki PASSED etiketleri sonuc degildir. Her satir yeni execution contract ve gercek kanit zinciriyle degerlendirilir. AC01-AC70 ve RG01-RG52 de tekil registry'de korunur; bu tablo onlarin yerine gecmez.

| ID | Senaryo | Kanitli beklenen sonuc |
| --- | --- | --- |
| RT01 | Hic AITEST_RUNNER/WORKER env ayari olmayan normal kurulum | Customer host JVM/Maven baslamaz. Izolasyon/model hazirsa worker+izole run; degilse specific BLOCKED, plateau veya success degil. |
| RT02 | Invalid runner string veya customer icin host_dev_only | Tip donusumune guvenilmez; model/build calismadan red. Unit-test injection bu yola public erisim acmaz. |
| RT03 | Gercek izole baseline -> candidate -> final replay | Tum run'larda guvenli runner kimligi ve output mount'lari; source/POM ayni; host-only code path'i cagirilmaz. |
| RT04 | Gercek worker server ilk basta yok / yanlis auth / model yetkisiz | Kontrollu baslatma veya specific BLOCKED_MODEL; hicbirinde TARGET_NOT_MET_PLATEAU yok. |
| RT05 | Gercek worker, hedef dosya ilk bes dosyanin disinda, mevcut test var | Dogru kaynak/test/gap baglami aktarilir; dogru full model kimligi; typed aday; gercek yeni test kesfedilir. |
| RT06 | Bir aday compile error, sonraki repair dogru | Hata worker'a geri gider; bounded repair butcesi dogru harcanir; ayni job; eski accepted set korunur. |
| RT07 | LINE=95, BRANCH=40, ikisi icin hedef90 | Loop, dispatcher, DB, status, JSON ve HTML hepsi hedef saglanmadi; final overwrite yok. |
| RT08 | LINE ayni, BRANCH40->95; sonra baska hedef hala80 | Branch-only kazanimi kabul et; diger hedef dusukse genel basari verme; ortalama kullanma. |
| RT09 | Branch total0, branch raporu eksik, line metadata eksik, %89.96 | N/A/UNAVAILABLE/INVALID ayri; yuvarlama sahte90 yapmaz. Hedef/alakali metrik politikasina uygun sonuc. |
| RT10 | Reddedilen son aday XML'i yuksek; eski run XML'i veya class ID uyusmaz | Final yalniz accepted+fresh replay; forged/stale rapor kabul edilmez; trusted onceki set kaybolmaz. |
| RT11 | A testi kabul, sonra B testi kabul, C reddedildi; 2 ayri dosya | Final replay A+B'yi calistirir, C yok; output patch/checkpoint ayni A+B baytlari; kaynak repo degismez. |
| RT12 | Kabul edilen testten sonra process hard-kill; yeni MCP/OpenCode session | Ayni job_id/goal/budget/source ve accepted hash'leri yuklenir; `test_resume` gercekten ilerler; yeni sifir job degil. |
| RT13 | RT12'yi baska yetkili model profiliyle surdur | Onceki test/deneme kaniti korunur; yeni model kaydi eklenir; eski chat/session zorunlu olmaz. |
| RT14 | Maven/JVM calisirken pause/cancel/timeout | Yalniz o job'un child/container'lari dogrulanmis bicimde biter; yeni aday baslamaz; sonradan worker cevabi state'i degistiremez. |
| RT15 | Iki client ayni anda resume; aktif unexpired lease; release+ayni owner | Tek owner calisir; generation artar; eski token yazamaz; process PID tekrar kullanimi sahiplik sayilmaz. |
| RT16 | Artifact yazma/manifest publish/DB pointer arasinda hard-kill | Yalniz tam verified checkpoint secilir; yarim aday accepted olmaz; eski guvenilir pointer korunur. |
| RT17 | Resume oncesi source/POM/dirty test degisti | Source change algilanir; stale coverage basari sayilmaz; kullanici degisikligi korunur; controlled rebaseline/revision. |
| RT18 | 2 modul, ayni simple name; profile/parent/custom test root; package target | Dogru concrete class/module/test/report; belirsizlikte soru/typed candidates; custom path'te gercek test calisir. |
| RT19 | Shadow FQCN comment header ile, eski test silme, disabled, regex-assert yorumu | Accepted path'te engellenir; production davranisi test kaynagiyla degistirilemez. Anlamli helper/exception testleri yanlis reddedilmez. |
| RT20 | Zero-discovered yeni test, bozuk Surefire XML, baseline failed/unstable | Exit0/zero failures sahte PASSED degil; gercek test identity/sonuc korunur, hatalar specific siniflanir. |
| RT21 | Gercek model + bilinen ulasilabilir fixture, baseline iki metrigin en az birinde90 alti | Normal OpenCode->MCP->worker->izole Maven/JaCoCo; gercek yeni/gelistirilmis test; iki uygulanabilir metrik >=90; temiz final replay. |
| RT22 | Test-only engelli hedef veya gercek butce/plateau | Son trusted kazanim/patch korunur; neden/different attempts kanitli; prod/POM degismez; dusuk sonuc hedef basarisi olmaz. |
| RT23 | test_status/test_result ve HTML/JSON/DB | Gercek once/sonra sayac/test/model/iteration/gap/manifest eslesir; last_trusted ve report referanslari doldurulur; sahte sifirlar yok. |
| RT24 | Binary exec, nested HTML, hash corruption, reserved/path escape | Bayt-hash birebir; offline linkler calisir; mismatch sonucu false; root disina/reserved dosyaya yazma red. |
| RT25 | Patch-only ve onaysiz/yanlis approval; onayli apply sonrasi kullanici degisikligi | Onaysiz yazma yok, gercek patch teslim; onay job/checkpoint/root/digest bagli; conflict'te kullanici dosyasi korunur. |
| RT26 | Multi-file apply ortasinda kill; ayni modify apply tekrar | Durable journal ile controlled recovery; ilk backup korunur; double-apply idempotent; farkli job backup cakismasi yok. |
| RT27 | Fresh clone, dist/node_modules yok, PS1 yasak; CMD+Node, Unicode/bosluk path; sonra uninstall | Bootstrap calisir; gercek config sentinel ve diger MCP/provider kayitlari korunur; sadece owned uninstall; Windows/Linux farklari testli. |
| RT28 | Legacy ve yeni protocol wire; parcalanmis/coklu JSON mesajlar; outcome parser | Legacy eski contract; yeni profil gercek yeni protocol isteklerini karsilar. Negotiated version dogru; request id/outcome kesin; failed positive pilot diye gecmez. |

RT21 pozitif canli kabulunde baseline iki uygulanabilir metrigin en az birinde %90 altinda olmalidir; modelin gercek yeni veya iyilestirilmis testi, gercek test kesfi ve temiz final replay kaniti gerekir. Baslangicta zaten hedefte olan fixture ayri `TARGET_ALREADY_MET` testidir. RT12/RT13 hard-kill kabulunde yeni client/process ayni job'u, accepted hash'lerini, plan/deneme history'sini ve kalan butceyi devralir. Bu zincirin bir parcasini unit testle ikame edip tum canli senaryoyu PASSED sayma.

RT28'in modern protocol destegi bolum 5'teki gercek 2026-07-28 adapter kabuludur. OpenCode'un secili surumu legacy kullaniyorsa onun normal yolu legacy olarak dogrulanir; modern adapter reference client ile ayrica dogrulanir. Client'in sunmadigi kabiliyet o client'a atfedilmez.

---

## 25. Ek kurumsal urun kabulleri: PRO01-PRO60

Bu 60 senaryo yeni onaylanan urun olgunlastirma kapsamidir. RT/AC/RG ile ortak kanit kullanilabilir; ancak test/fixture/predicate baglantisi tekil olmalidir. Her satir bu dosyadaki ilgili normatif bolumlerle birlikte okunur. Verilen esikler tasarim/kabul hedefidir, hazirlamada olculmus sonuc degildir.

### 25.1 Son kullanici ve entegrasyon

| ID | Senaryo | Kabul sonucu |
| --- | --- | --- |
| PRO01 | Temiz kurulumdan sonra OpenCode'da yalniz sinif + coverage hedefi | Yeni CLI/UI veya gizli WORKER env bayragi gerektirmeden proje/worker/izole test dongusu baslar; eksik guven/erisim tek ve anlamli onayla cozulur |
| PRO02 | Ortam kontrolu: metadata hazir, model erisilemiyor veya gercek run engelli | CONNECTED/CAPABILITY_VERIFIED/LIVE_VERIFIED ayrilir; health200 tam hazirlik veya test basarisi olmaz; tani exact action verir |
| PRO03 | Ayni remote iki checkout, iki farkli proje ve gecmis sorgusu | Dogru project/location/job/target history bulunur; baska checkout'un coverage'i tasinmaz; sifirdan analiz gereksiz tekrarlanmaz |
| PRO04 | Iki authorized model profili, team alias prefix'i ve hatali reasoning key | Full provider/model ID korunur; literal trailing-space anahtari tanilanir; desteklenmeyen parametre veya external fallback sessizce uygulanmaz |
| PRO05 | LINE94/BRANCH92 ve LINE92/BRANCH88 icin ortak %90 istegi | Ilkinde tum hard gate'lerle success, ikincide unmet; terminal/HTML/JSON/DB ayni degeri ve karari verir |
| PRO06 | Offline HTML, farkli ekran boyutu, klavye ve uzun hata metni | Yerel linkler calisir, dis kaynak/telemetry yok, durum yalniz renkle anlatilmaz; model/gap/test/before-after bilgisi okunur |
| PRO07 | Patch-only sonuc ve nested/binary fixture artifact'leri | Gercek review edilebilir patch/dosya manifest'i teslim edilir; byte/hash uyusur; customer checkout degismez |
| PRO08 | Trusted native/reference insan onayi, modelin onay metni, suresi dolmus/replayed grant | Yalniz job/root/checkpoint/digest'e bagli dogrulanmis insan onayi apply acar; digerleri guvenli red/PATCH_ONLY; izin kimligi raporlanir |
| PRO09 | OpenCode legacy ve ikinci/reference MCP client, modern protocol | Ayni domain use-case'leri gercek revision'a uygun wire ile calisir; capability/unsupported aciktir; adapter etiket degisikligi degildir |
| PRO10 | Yardim/kurulum/skill/rapor ornekleri ile gercek urun sozlesmesini karsilastirma | aite doctor/status CLI'i, zorunlu PS1, repo-ici runtime store, branch88 success, otomatik customer commit veya CI acma gibi yanlis ornekler kalmaz |

### 25.2 Guvenlik ve guven sinirlari

| ID | Senaryo | Kabul sonucu |
| --- | --- | --- |
| PRO11 | Kaynak yorumunda/README'de talimat injection, harici URL ve MCP recursion | Untrusted kaynak veri olarak islenir; worker scope/allowlist/egress degismez; kontrol disi tool cagrisi ve nested self-job yok |
| PRO12 | Model/runner process'ine yerel secret canary ve yasak egress denemesi | Yalniz gerekli authorized credential minimum kapsamda; test runner'a gateway/user secrets gitmez; canary dis cikis/log/rapora sizmaz |
| PRO13 | Sahipligi bilinmeyen worker endpoint, port cakismasi ve stale PID | Health yaniti owned process kimligi yerine gecmez; baska kullanici TUI/server'i kullanilmaz veya oldurulmez; bounded blocked/startup tani |
| PRO14 | Cache poisoning, yetkisiz artifact indirme ve mirror erisim reddi | Prefetch ile kod execution ayridir; onayli/cache digest'i korunur; networknone hedefini asmak icin credentials source'a konmaz |
| PRO15 | Traversal, symlink/junction/hardlink, ADS, reserved name ve case collision | Windows/Linux izinli root ve canonical identity disina okuma/yazma yok; overlay/export/apply ayni korumayi kullanir |
| PRO16 | Child JVM alt surec aciyor, docker CLI sonlaniyor, timeout/cancel | Job'un gercek JVM/container'i sonlanir; yalniz CLI kill'i basari sayilmaz; baska process/container'a zarar yok |
| PRO17 | Test dosyasinda SUT shadow, annotation ile skip, eski testi silme ve helper'i gevsetme | Gercek test/AST/bytecode ve old-test koruma kapilari red verir; coverage artisi bunu gecersiz kilmaz |
| PRO18 | Reddedilmis adaydan kalmis yuksek XML, fake exec, changed class bytecode | Trusted collector/source/run/accepted baglantisi ve final replay sahte success'i engeller; onceki guvenilir set korunur |
| PRO19 | XML external entity/entity bomb, rapor XSS, zip slip, buyuk model/log cikti | Parser/export size/depth/path/escaping ve output limitleri uygular; standart guvenli JaCoCo XML gereksiz reddedilmez |
| PRO20 | Degistirilmis release paketi, manifest veya guvenilmeyen signing key | Manifest/tamper/signature dogrulamasi red; hash tek basina yayinci kaniti denmez; yetkili anahtar yoksa imzali iddiasi yok |

### 25.3 Kurulum, veri ve surum yasam dongusu

| ID | Senaryo | Kabul sonucu |
| --- | --- | --- |
| PRO21 | Eski schema'da gercek job/inventory/checkpoint ile ileri migration | ID/history/relationships korunur; migration checksum/future schema kontrolu; mevcut migration degistirilerek eski DB bozulmaz |
| PRO22 | SQLite runtime bilgisi, WAL multi-connection write/checkpoint ve busy | Gercek sqlite_version kayitli ve fixed/supported build; tek writer/transaction siniri; corruption/future-version/busy davranisi tanili |
| PRO23 | Job yazarken DB + blob backup, eszamanli GC | Tutarli DB snapshot'inin reachable blob'lari pinlenir ve yedeklenir; eksik blob'lu backup complete olmaz |
| PRO24 | Backup'tan farkli runtime dizinine restore ve ayni isi devam ettirme | Schema/integrity/hash/location dogrulanir; stale owner baslamaz; accepted test ve job history kaybolmaz |
| PRO25 | Migration/backup/report sirasinda disk full veya process kill | Onceki trusted DB/blob/checkpoint korunur; partial state recoverable/karantinada; done marker erken yazilmaz |
| PRO26 | Retention ve delete talebi: aktif job, pinned checkpoint, backup, rejected aday | Dry-run exact owned nesneleri gosterir; aktif/pinned ref silinmez; onaysiz customer/user dosyasi temizlenmez |
| PRO27 | JSONC comments/trailing comma, diger MCP/provider ve concurrent user config edit | Minimal semantic/format koruma, kalici backup ve preimage CAS; kullanici aradaki degisikligi kaybolmaz; supported parse sozlesmesi gercek |
| PRO28 | Windows fresh clone/paket, dist/node_modules yok, PS1 yasak, Unicode/bosluk path | CMD + Node ile prerequisite/build/native package/MCP kurulumu ve owned uninstall calisir; gercek HOME sentinel korunur |
| PRO29 | Linux temiz kurulum, PATH executable, native SQLite ABI ve POSIX path | Windows backslash path'i uretilmez; supported Linux paketi dogru binary/permission'larla calisir; host platform tahmini yok |
| PRO30 | N->N+1 update, aktif job, incompatible DB ve rollback | Quiesce/pinned backup/atomic install-pointer; unsupported downgrade red; gerekirse uyumlu DB+blob restore; user config/history korunur |

### 25.4 Test muhendisligi ve ileri kalite

| ID | Senaryo | Kabul sonucu |
| --- | --- | --- |
| PRO31 | Hedef ilk bes dosyanin disinda, dependency/helper/test ve gap mevcut | Worker gercek ilgili source body/test/behavior/branch ve onceki hata baglamini alir; static imza/sayi yeterli sayilmaz |
| PRO32 | Oracle'i bilinen is davranisi, production'da mevcut muhtemel defect | Assertion sonucu gecsin diye oracle gevsetilmez; SUSPECTED_PRODUCTION_DEFECT veya inceleme gerekcesi; prod kodu degismez |
| PRO33 | Custom assertion helper, JUnit4 expected exception ve parametrik mevcut test | Anlamli test regex yuzunden hatali red olmaz; yorumdaki assert kelimesi assertion sayilmaz; old tests identity korunur |
| PRO34 | Parameterized/dynamic/nested test ve zero-discovered yeni dosya | Gercek engine discovery/outcomes ile senaryolar sayilir; exit0 veya sadece dosya sayisi yeterli degildir |
| PRO35 | Yeni test icin en az uc temiz tekrar ve kontrollu flaky fixture | Tutarsiz sonuc UNSTABLE/QUALITY_REVIEW; failing test disable veya sadece son basarili run secme yok |
| PRO36 | Test sirasi, global static state, saat/locale/timezone bagimliligi | Tanimli order/pollution tekrarlarinda sorun tespit edilir; test ortami kalici kirletilmez; unsupported senaryo acik raporlanir |
| PRO37 | JUnit4 fixture'inda gercek targeted PIT run | Actual mutants/killed/survived/timeout/no_coverage raporu; source/POM unchanged; sahte/import-only mutation kabul edilmez |
| PRO38 | JUnit5 fixture'inda gercek targeted PIT run | Dogru desteklenen test engine/plugin ile bounded sandbox execution ve sonuclar; paket/dependency kimligi kanitli |
| PRO39 | PIT timeout/limit, source degisimi ve equivalent mutant belirsizligi | Bilinmeyen/timeout survivor anlamiyla karismaz; kaliteyi yuksek gostermek icin denominator manipulate edilmez; mutation sonucu coverage gate yerine gecmez |
| PRO40 | Harici mutation/coverage raporu import ve hedef/source farki | Kaynak dogrulanabilirse explicit imported evidence; stale/uyumsuzsa trusted/canli olarak etiketlenmez; standard job buna zorunlu bagimli olmaz |

### 25.5 Kaynak, dayaniklilik ve gozlemlenebilirlik

| ID | Senaryo | Kabul sonucu |
| --- | --- | --- |
| PRO41 | Iki aktif job, ortak checkout icin farkli candidate, queue fairness | Disposable namespace/fence/cache policy korunur; bir job digerinin accepted setini veya customer testini bozamaz |
| PRO42 | Referans load'da start/status/result metadata latency | Bolum21 p95 hedefleri olculmus dataset/makineyle saglanir; model/build bekleme kontrol plane'i bloke etmez |
| PRO43 | Pause/cancel ack ve gercek child stop suresi | <=2s niyet ack, default <=30s owned stop; gec response state'i degistiremez; stop gecikmesi dogru raporlanir |
| PRO44 | 10.000 symbol ve 50.000 test/run kaydi | Pagination/sorgu index/refresh ve bellek davranisi sinirli; fake bos history veya tum DB'yi modele gonderme yok |
| PRO45 | 50 kisa job soak profili | Process/handle/tmp/container/cache/RSS/WAL metrikleri saklanir; kalici aciklanamayan resource leak yok |
| PRO46 | En az10 hard-stop/restart dongusu | Yeni process trusted pointer/lease/journal'dan toparlar; accepted set kaybi ve orphan owner yok; yeni job acarak sonuclari gizleme yok |
| PRO47 | En az20 ayrik deterministic fault noktasi | Her noktada onceki trusted state veya explicit recoverable blocker; DB/blob/rapor/apply/update arasi yarim commit kabul edilmez |
| PRO48 | Model usage/cost bilinmiyor, retry, timeout ve context overflow | Bilinmeyen cost/token null; gercek active-time/butce/idempotency korunur; limits hiz icin atlanmaz |
| PRO49 | Iterasyon/model degisimi ve sonradan proje kodu degisikligi | Trace/run/model/source correlation tarihsel dogru; current checkout XML'i gecmis sonucun ustune yazilmaz |
| PRO50 | Destek paketi/diagnostic log ve privacy canary | Varsayilan sanitized, secrets/raw source yok; hassas ekler explicit scope/onayli; dis telemetri/otomatik mail/upload yok |

### 25.6 Benchmark, release ve teslim gercegi

| ID | Senaryo | Kabul sonucu |
| --- | --- | --- |
| PRO51 | BM01-BM12 corpus ve private reference oracle/holdout | Beklenen davranis ve reachable hedef bagimsiz belirli; model reference testleri goremez; baseline hedef altinda |
| PRO52 | Iki kurumsal modelde 48 reachable + 8 negatif canli trial | Tum denemeler ve budgets/source/profiles saklanir; basarisiz deneme gizlenmez, fake model run canli sayilmaz |
| PRO53 | Primary kalite karari ve secondary karsilastirma | Bolum20 primary esigi ve sifir policy/false-success ihlali; secondary gercek dagilim; benchmark sayisi actual collector'dan |
| PRO54 | En az iki gercek model-switch resume | Ayni job/accepted hash/deneme history ve butce korunur; ikinci yetkili model yeni run yapar; onceki chat zorunlu degil |
| PRO55 | En az sekiz accepted test degisikliginde bagimsiz review | Davranis/assertion/oracle/edge/regresyon incelenir; review bulgulari kanitli kapatilir; yalniz coverage onayi yetmez |
| PRO56 | Yetkili gercek kurumsal Maven projesinde bir hedef pilotu | Source/POM korunur, gercek test gelistirme ve dogru hedef/engel sonucu teslim edilir; kurum kaniti public'e gitmez |
| PRO57 | Paket SBOM + dated zafiyet/lisans incelemesi | Exact dependency/native/image kapsami, third-party notices ve unresolved risk listesi; scan yokken0bulgu/sertifika iddiasi yok |
| PRO58 | Teslim paketinin kaynak checkout'tan bagimsiz kurulumu | Uretilen exact paket temiz Windows/Linux ortamina kurulur; model/runner/patch/report/restore yetenekleri declared matrisle eslesir |
| PRO59 | Yanlis evidence/PASS flag/missing mandatory/tampered artifact ile release kapisi | Her biri non-zero exit; eski smoke veya aggregate PASSED satiri canli kabul yerine kullanilamaz |
| PRO60 | Nihai code digest/delivery commit/obligation ledger/dokuman ve guvenlik sinirlari | Tum zorunlu kabuller dogru seviyede PASSED, acik must-do/P0/P1 yok, README/state/handoff tutarli, CI/global Git/customer repo degismemis |

Bu tablo 60 ayri unit test zorunlulugu demek degildir; bazi satirlar birden fazla entegrasyon/operasyonel/canli run gerektirir. Kabul sayisi ile otomatik test sayisi farkli kavramlardir. Eslesme matrisi bu farki acik tutar.

---

## 26. Gelistirme hafizasi, dokumanlar ve modeller arasi devir

### 26.1 Ikili hafiza ayrimi

`ai/` dizini **bu MCP urununun gelistirme hafizasidir**. SQLite/jobs/blobs dizinleri ise **urunun kullanici projelerinde yuruttugu test islerinin hafizasidir**. Bu iki alan karistirilmaz. Kurum projesinin source/prompt/response/exec/HTML/session kayitlari `ai/` altina kopyalanmaz.

Mevcut kayitlar korunarak asagidaki sorumluluklar acikca yerlestirilir. Dosya isimleri gerekceli olarak mevcut duzene uyarlanabilir; kokteki aktif gorev adi degismez.

```text
AGENTS.md                         # Kisa baslangic/devam protokolu
AKTIF_GOREV.md                     # Bu tek onayli nihai sozlesme
ai/
  PROJECT_STATE.md                 # Gercek son durum, son trusted code/evidence, siradaki is
  BACKLOG.md                       # FIN00-FIN15 alt isleri ve eksiksiz eski/yeni eslesme
  ACCEPTANCE_MATRIX.md             # Registry'den uretilen okunabilir ozet
  decisions/                      # Mimari, threat boundary, compatibility ve risk ADR'leri
  research/                       # Kaynaklar, verified surumler ve uyarlama kararlari
  plans/                          # Tek uygulama plani ve kritik yol
  reviews/                        # Bulgu, bagimsiz review, red/duzeltme kanitlari
  checkpoints/                    # Gelistirme asamasi / komut / diff / devam kaydi
  handoffs/                       # Oturum/model devir ozetleri
  acceptance/
    catalog.json                  # Tum AC/RG/RT/PRO ve predicate eslesmeleri
    sanitized-index.json          # Paylasimi guvenli kanit referanslari; raw kurum verisi yok
  tasks/archive/                  # Gercek onceki belge baytlari/hashi
```

Bu yapiyi ayni durumun bagimsiz ve celisen kopyalarina donusturme. Ledger/registry kaynak, Markdown ozetleri okunabilir projeksiyon olsun. Source/behavior degistiginde eski PASSED bilgisi hangi kapsamda gecersizlesiyor otomatik/explicit gosterilsin.

### 26.2 Baslangic ve devam protokolu

`AGENTS.md` kisa kalir: repo/branch/HEAD/status/remote, aktif gorev kimligi/surumu, PROJECT_STATE, son handoff/checkpoint, ilgili FIN/requirement/predicate ve gercek kanit kontrolu. Her iterasyonda 100 sayfalik metni prompt'a yapistirma; baslangicta sozlesme/katalog anlasilir, sonraki asamada ilgili bolum ve immutable contract referanslari kullanilir. Kisa baglam, gereksinim atlama anlamina gelmez.

Yeni oturumda:

1. Local Git degisikliklerinin ve son code/evidence digest'inin kimligini dogrula; untracked kullanici dosyasini artifakt sanip silme.
2. Son kanitli tamamlanan davranisi, aktif alt isi, uygulanmis ama dogrulanmamis patch'leri ve kalan testleri oku.
3. Son basarisiz denemenin exact nedeni, komut/exit/artifact ve mevcut ortam capability'sini dogrula; ayni yanlis komutu sebepsiz tekrarlama.
4. Yalniz bu gorevin kalan onayli FIN alt isine devam et. "Yeni gorev verildiginde baslarim" diye bu gorevin eksigini sonraya tasima.
5. Anlamli her degisiklikten sonra code/test/evidence/checkpoint'i tutarli guncelle; sadece son oturum kapanisinda yazma.

Devir kaydi asgari: gorev/version, source/delivery HEAD, verified code digest, platform/toolchain, tamamlanan predicate'ler, calisan/calismayan komutlar, artifact konum/hash, dirty path/sahiplik, bilinen bug/blocker, tam siradaki somut is ve geri donus siniri. Modelin gizli dusunce zinciri degil, dogrulanabilir sonuc/karar/deneme ozeti saklanir.

### 26.3 Bitiste guncel ve uygulanabilir dokumanlar

- README: urunun gercek amaci, destek matrisi, kurulum, dogal dil kullanimlari, rapor/patch yolu, test-only ve guven siniri. Eski P01/002 ya da dogrulanmamis "tamamlandi" metni kalmaz.
- Architecture/ADRs: mevcut gercek call chain, runner/worker izolasyonu, veri akisinin sahipleri, local SQLite tercihinin sinirlari ve protokol adapterleri.
- Configuration/model guide: precedence, full model IDs, supported reasoning/usage, secret refs, schema upgrade ve diagnosable hatalar; gercek kurum endpoint'i yok.
- Data dictionary: tablo/kolon/ID/FK/units/index/retention/sensitivity ve migration/backup semantigi.
- Installation/upgrade/rollback/uninstall: PS1'siz supported OS komutlari ve exact tested release package; calismayan alternatif yol documented supported sayilmaz.
- Usage/troubleshooting: start/status/result/pause/resume/model switch, ambiguity, baseline failed/no tests, missingcoverage, plateau, policy, native dependency ve cache/egress konulari.
- Operations/security: yedekleme/restore tatbikati, GC preview/onay, quotas, orphan cleanup, supportbundle, threat model, disclosure ve risk sahipligi.
- Benchmark/release: corpus/profil/esik ve tum run dagilimi, regression baseline, test evidence levels, bilinen limitler, paket/SBOM/provenance.

Dokuman komutlari guvenli test home'u ve sentetik projeyle gercekten denenir. Kullaniciya IDE'den coverage kosma, prod POM degistirme veya yeni CLI kurma zorunlulugu yaratmaz. Uygulamasi olmayan belge maddesi IMPLEMENTED diye yazilmaz.

### 26.4 Git ve gizlilik

Commit/push oncesi staged diff, test sonucu ve confidentiality taramasi yap. `git add -A` ile tum untracked dosyalari sahipligini kontrol etmeden ekleme. Author/committer repo-yerel kimligi ve Turkce ASCII commit metni dogrulanir. Mevcut yetkili urun branch'ine force olmayan commit/push, daha once onaylanan gelistirme akisinda yapilir; yeni branch/publication/koruma/CI karari kendiliginden degismez.

Customer Java repository'lerinde otomatik commit/push yoktur. Global Git ayarlari, kullanicinin diger MCP/provider konfigleri ve diger projeleri aynen korunur. Varsayilan `.gitignore` tek guvence degildir: package manifest/staged files/evidence/sanitized-index icinde de source/secret/endpoint/session sizintisi kontrol edilir. Kisisel veya kurumsal sir bulundugunda onu yeni raporda acikca tekrarlama.

---

## 27. Nihai bitis kapisi ve teslim

### 27.1 Release etiketi icin gerekenler

`FULL_PRODUCT_ACCEPTANCE_VERIFIED` ancak su kosullarin **tamami** saglaninca yazilabilir:

- FIN00-FIN15 kapsamindaki zorunlu davranislar gercek composition'da uygulanmis; gerekli path'te stub/TODO/fake-success/unused-kritik-adapter kalmamis.
- AC01-AC70, RG01-RG52, RT01-RT28 ve PRO01-PRO60 tekil predicate'leri gereken kanit seviyesinde dogrulanmis. Eski source/semantics yanlisi bulunan bir kriter ancak explicit, gerekceli ve daraltmayan traceability notuyla eslenmis.
- Normal **OpenCode -> MCP -> yetkili worker -> izole Maven/JUnit/JaCoCo -> kabul checkpoint -> temiz final replay -> rapor/patch** yolu calisiyor. Test yazan model veya son kullanici IDE'den ayri coverage calistirmiyor.
- Ayni job'da hard-kill/model degisimiyle kaldigi yerden gercek devam, cumulative accepted A+B, rejected C korunumu, actual cancel ve stale-owner red davranislari kanitli.
- Tum applicable target metric'leriyle dogru hedef/engel sonucu; false-success/policy/old-test-kaybi sifir; mutation/flaky/benchmark ve review kabulleri bu surum sinirlarinda gecti.
- Windows/Linux exact paket fresh install, update/rollback/backup/restore/owned-uninstall ve resource/security/diagnostic kabulleri gecti.
- Rapor, JSON, DB, diff ve binary/raw kanit ayni source/accepted/run kimligine bagli. Gercek patch sonucunun yerine sadece PATCH_ONLY metni yok.
- Zorunlu islerde acik NOT_RUN/BLOCKED/FAILED, eksik evidence veya cozulmemis P0/P1 bug yok. Security risk waiver gerektiren kararlar model tarafindan verilmemis; yetkili karar/kapsam/sure acik.
- README/state/backlog/handoff, tested code digest/delivery commit/compatibility/status ile tutarli. CI/global config/customer production sinirlari korunmus.

Uygulanamayan genel framework/protokol/kurum servisi durumlarini dogru BLOCKED/UNSUPPORTED donmek urunun bir ozelligidir. Fakat burada **desteklenecek ve canli test edilecek** diye tanimlanan temel profili secmeyerek tum pozitif kabulleri unsupported yapmak kapanis degildir.

### 27.2 Ortam/kurum onaylariyla ilgili dogru sinir

Canli kurum modeli veya yetkili pilot projesi yoksa implementasyon ve yerel kabuller korunur; eksik canli kabul `BLOCKED` kalir. Gerekli capability saglandiginda bu dosyadaki ayni test/devam noktasindan surer; yeni aktif gorev istenmez. Model erisim yetkisini veya institution signing key'ini uydurmak, gercek sir istemek/yayinlamak ya da korumayi kapatmak kabul yolu degildir.

Kurumsal yayinci imzasi ve uretim rollout'u uygulama izninden ayridir. Imza/dagitim adapter'inin gercek testleri, manifest/tamper korumalari, lisans envanteri ve yerel paket MUST'tir. Kurum anahtariyla fiili imzalama/kuruma rollout yalniz ayrica yetki varsa olur. Yetki yoksa **paketin yayin durumu** UNSIGNED/NOT_PUBLISHED olarak kalabilir; bunu imzali kurumsal dagitim kabulune cevirmeden, local supported release durumundan ayri gostermek zorunludur.

TestOnlyBarrier veya gercek behavior defect nedeniyle bir customer sinifin %90'a ulasamamasi, tum urunun hatali oldugunu otomatik gostermez; o job'un dogru unmet sonucu ve kanitli teslimi vardir. Ancak bilinen reachable benchmark'larin bu belgede sabitlenen primary esigini tutturamamasi kalite kabulunun acik kalmasidir.

### 27.3 Kullaniciya teslim edilecekler

| Teslim | Icerik |
| --- | --- |
| Calisan urun | Gercek MCP/worker/runner/storage/quality/report/apply/ops implementasyonu, supported adapters ve migrations |
| Dogrulanmis paket | Surum, OS/ABI, byte manifest, source-tree digest, schema compatibility, checksum/signature durumu ve kurulum/bakim girisleri |
| Kabul raporu | Tum tekil AC/RG/RT/PRO durumlari, exact test/run/predicate eslesmesi, full logs/artifacts ve verifier sonucu |
| Canli pilot paketi | Gercek model korelasyonu, baseline/final counters, yeni test kimlikleri, accepted checkpoint, patch ve JaCoCo/test raporlari |
| Devam/iptal kaniti | Ayni job once/sonra IDs/digests, old/new model/run, kalan butce, child/container stop ve fencing history |
| Benchmark/kalite | Tum trial sonuclari, primary/secondary dagilim, flake/PIT/review sonuclari, holdout ve regression baseline |
| Isletim paketi | Diagnostic/supportbundle, backup/restore/upgrade tatbikati, SBOM/SCA/lisans, resource/security ve limitler |
| Gelistirme devri | Guncel AGENTS/ai ledger/checkpoint/handoff ve exact code/delivery commit; yeni modele gerekirse kayitli devam |

Gercek kullaniciya son mesaj; neyin calistigini, hangi surum/commit'in dogrulandigini, exact paket/raporun nerede oldugunu, gercek coverage before/after ve old-test-koruma sonucunu, resume/cancel/ops kanitlarini ve varsa kalan genuine blocker'i anlatir. Terminale sadece "204 test gecti, hepsi bitti" yazilmaz. Gercek canli kalite sonucunu tahmini sayilarla doldurma.

### 27.4 Kapanis anti-pattern'leri

Bu davranislardan herhangi biri kapanisi gecersiz kilar: yorum/import/class adi ekleyip davranis yokken DONE yazmak; old testin assertion'ini kaldirarak yesil sonuc almak; worker-disabled/FAILED smoke'u pozitif canli pilot saymak; asil test exit'ini pipeline ile kaybetmek; candidate testleri orijinale yazip sonra silecegim demek; en son XML'i trusted kabul etmek; resume ile sifirdan baslamak; report'a sabit sifir/PASSED yazmak; patch olmadan patch-only teslim etmek; ders veren yeni CLI/UI eklemek; kurum kodunu/secret'i public'e koymak; zorunlu isi sonraki goreve itmek.

**UYGULAYICININ BITIS KURALI:** Bu metinle yeni gorev yazma veya yalniz plan hazirlama. Onaylanan sistemi mevcut repository'de tamamla. Calisma kesilirse son trusted gelistirme checkpoint'ini kaydet ve ayni 003 v2.0'dan devam et. Tamamlanma kararini model anlatimi degil, gercek release verifier ve kanitli kabul belirlesin.

---

## 28. Kaynaklar ve arastirmadan tasarima izlenebilirlik

Kaynaklar 10 Ekim 2026 hazirlama incelemesinin dayanaklaridir. Repository tespitleri pinned HEAD'e, dis API bilgisi resmi kaynaklara dayanir. FIN/PRO adlari, corpus/SLO/esikler ve dahili artifact sozlesmeleri bu urun icin **tasarim kararlari**dir; dis araclarin var olan API veya evrensel performans vaadi degildir.

### 28.1 Repository ve kullanici kaynaklari

| Kaynak | Konum / kullanim |
| --- | --- |
| G01 | `https://github.com/mehmet-karacan/ai-test-engineering/tree/c5d4a530b01bbbff21c04213aebda3416f2b70b3` : inceleme revision'u; uygulayici daha yeni HEAD'i tekrar kontrol eder |
| G02 | Ayni revision'da `AGENTS.md`, `AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md` : mevcut protokol ve celisen tamamlanma kayitlari |
| G03 | `ai/tasks/archive/AITE-FOUNDATION-001.md`, `ai/tasks/archive/AITE-REMEDIATION-002.md` : devralinan R/AC/RG sozlesmeleri |
| G04 | `src/application/services.ts`, `src/application/job-tools.ts`, `src/orchestration/job-dispatcher.ts`, `candidate-loop.ts`, `lease-manager.ts`, `checkpoint-store.ts` : normal is ve devam zinciri |
| G05 | `src/workers/opencode/`, `src/runners/`, `src/discovery/`, `src/storage/`, `src/policies/`, `src/reporting/`, `src/configuration/` : mevcut gercek bilesenler ve kapanacak baglantilar |
| G06 | `tests/security/pilot-full.test.ts`, `rt01-host-fallback.test.ts`, `tests/unit/bootstrap.test.ts`, `tests/contract/v2-wire.test.ts` : test adi ile kanitlanan davranis arasindaki sinirlar |
| G07 | `session-ses_ede2(2).md` : 204 test kosusu ve modelin kapanis beyanlari; kullanicinin yerel kaynagi, public'e kopyalanmaz |
| G08 | Sohbette sunulan 003 v1.1 : SHA-256 `0251fea0ddcf5e3a68958d0c4ad9be786827c446d3756d764f56e23dbecbde4c`; RT tablosu bu sozlesmeden devralindi |
| G09 | Kullanici kapsam kararlari: OpenCode, yerel MCP/SQLite, test-only, otomatik JaCoCo, PS1'siz, kesintiden devam; son onayla kurumsal olgunlastirma tek goreve alindi |

### 28.2 Resmi teknik kaynaklar

| ID | Kaynak | Bu gorevdeki kullanim |
| --- | --- | --- |
| S01 | `https://opencode.ai/docs/server/` ; `https://opencode.ai/docs/sdk/` | Gercek server/session/message/abort/SDK sozlesmesi; kurulu surum OpenAPI/tipleriyle dogrulama |
| S02 | `https://github.com/anomalyco/opencode/blob/dev/SECURITY.md` | Permission sistemi sandbox degildir; server authentication ve gercek izolasyon siniri |
| S03 | `https://opencode.ai/docs/config/` ; `https://opencode.ai/docs/permissions/` ; `https://opencode.ai/docs/mcp-servers/` | Mevcut config'i koruma, controlled worker ayarlari ve MCP kurulum/adaptor kullanimi |
| S04 | `https://modelcontextprotocol.io/specification/2026-07-28/changelog` ; `https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle` | Legacy/modern protocol farki, discovery/request metadata ve capability'nin gercek wire ile sinanmasi |
| S05 | `https://www.jacoco.org/jacoco/trunk/doc/maven.html` ; `https://www.jacoco.org/jacoco/trunk/doc/prepare-agent-mojo.html` | Maven/agent/argLine/fork entegrasyonu; POM degistirmeden guvenilir olcum kosullari |
| S06 | `https://www.jacoco.org/jacoco/trunk/doc/counters.html` | LINE/BRANCH sayaclari, debug metadata ve exception kapsaminin dogru yorumu |
| S07 | `https://www.jacoco.org/jacoco/trunk/doc/classids.html` | Execution data ile analiz edilen class kimliginin eslesmesi; XML'e hayali class ID alani eklememe |
| S08 | `https://www.jacoco.org/jacoco/trunk/doc/report-aggregate-mojo.html` | Multi-module/aggregate raporun Maven dependency/report kapsami |
| S09 | `https://www.sqlite.org/wal.html` ; `https://www.sqlite.org/backup.html` | Local WAL/tek writer/runtime fixed surum kontrolu ve tutarli online backup |
| S10 | `https://nodejs.org/api/child_process.html` | Windows .cmd/.bat ve process lifecycle sinirlari; uygulamada desteklenen Node24 resmi API'siyle dogrulama |
| S11 | `https://docs.docker.com/engine/storage/bind-mounts/` ; `https://docs.docker.com/engine/containers/resource_constraints/` | Read-only/writable mount ve kaynak limitleri; urunun kendi gercek capability probes'lari |
| S12 | `https://pitest.org/quickstart/maven/` | Gercek bounded targeted mutation adapter'i; resmi plugin/test-engine uyumlulugunu pinleme |
| S13 | `https://github.com/plasma-umass/coverup` | Coverage geri besleme ve iteratif test uretiminden algoritmik uyarlama; dil/izin/disable davranisini kopyalamama |
| S14 | `https://github.com/ZJU-ACES-ISE/chatunitest-maven-plugin` | Java generate/validate/fix yaklasimindan kontrollu repair tasarimi; customer POM'a eklenti dayatmama |
| S15 | `https://cyclonedx.org/tool-center/` | SBOM icin var olan standart/tooling; paketlenen bilesenlerin gercek envanteri |
| S16 | `https://github.com/google/osv-scanner` | Kurumca onayli/offline zafiyet tarama yaklasimi; hassas envanteri dis servise gondermeme |
| S17 | `https://csrc.nist.gov/pubs/sp/800/218/final` | SSDF 1.1 guvenli gelistirme/tedarik zinciri referansi; sertifika veya zorunlu mevzuat iddiasi degil |

Belge sayfalarindaki `trunk`, `dev` veya en yeni ornekler otomatik dependency upgrade emri degildir. Uygulama baslangicinda desteklenen stabil release'ler, kurumdaki mevcut OpenCode/LiteLLM surumu ve lockfile ile uyumlu pinlenir; tested manifest'te exact version/digest tutulur. Bilinmeyen API/destek varmis gibi kod yazma. Eski hatali yorumla resmi current contract celisirse bunu ADR/requirement eslesmesinde acikca belirt; sessiz kapsam azaltma yapma.

---

**Sonuc:** Bu tek gorevin teslimi, mevcut OpenCode'da dogal dil isteginden baslayan; production/POM'a dokunmadan gercek test ureten; JaCoCo ve kalite kapilariyla dogrulayan; kesintiden ayni isten devam eden; sonucunu gercek patch ve offline raporla veren; kurulumu, guncellemesi, verisi, guvenligi ve kabul kanitlari yonetilen yerel AI Test Engineering urunudur.
