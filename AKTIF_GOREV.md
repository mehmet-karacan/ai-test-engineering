# AKTIF_GOREV — Windows Yerel Çalıştırma, Subagent Orkestrasyonu Ve GPU Fusion Pilotu

> Uygulayıcı için: Bu belge tek aktif görev sözleşmesidir. Onaylandıktan sonra mevcut üründe aşağıdaki paketleri uygula; belgeyi yeniden özetleyip başka bir görev üretme. Gerçek subagent olanakları varsa geliştirme, araştırma ve bağımsız incelemeyi ayrı oturumlara dağıt. Her pakette başarısız regresyon → düzeltme → gerçek doğrulama → bağımsız inceleme sırasını izle. Onay ve veri koruma sınırları hiçbir ajan tarafından genişletilemez.

**Amaç:** AI Test Engineering MCP ürününü yalnız Windows üzerinde, kullanıcının yerel JDK/Maven ortamıyla çalışan; context'i sınırlı alt ajanlarla yöneten; proje/iş/checkpoint geçmişini SQLite ve doğrulanabilir artifact'lerde koruyan; küçük ve kullanıcı kontrollü bir gerçek proje pilotuyla sınanan ürüne dönüştürmek.

**Mimari:** OpenCode doğal dil girişidir. MCP'nin deterministik job yöneticisi tek yürütme ve kabul otoritesidir; ayrı OpenCode ajan oturumları sınırlı görevler üretir. Maven/JUnit/JaCoCo, Windows üzerinde repository dışındaki ayrı çalışma kopyalarında çalışır. SQLite durum ve ilişkileri, dosya store'u büyük çıktıları tutar. Report06 yalnız doğrulanmış olguları gösterir.

**Teknoloji:** Mevcut TypeScript/Node.js 24+ MCP, `better-sqlite3`, SQLite, OpenCode, Windows CMD, yerel Java JDK/Maven, projenin JUnit/Mockito düzeni ve JaCoCo. Yeni dağıtık kuyruk, web uygulaması, konteyner altyapısı veya bağımsız son-kullanıcı CLI ürünü eklenmez.

**Sözleşme dayanağı:** Bu sohbetin son kullanıcı kararları; byte-kimliği doğrulanan 005 görevi; 12 Ekim devir kaydı ve P08 düzeltme paketi; aşağıdaki güncel repo incelemesi ve resmî kaynak araştırması. Eski kararlarla farklar Bölüm 1'de açıkça tanımlıdır.

---

## 0. Görev Kimliği, Yetki Ve Başlangıç Durumu

| Alan | Değer |
| --- | --- |
| Görev | `AITE-WINDOWS-SUBAGENT-PILOT-006` |
| Sürüm | `1.0` |
| Hazırlama tarihi | `2026-10-12` |
| Ürün repository'si | `mehmet-karacan/ai-test-engineering` |
| İncelenen branch / commit | `main` / `3b1916ed6f35f0c674cc459b30ca9f5614af9b94` |
| Devralınan görev | `AITE-PRODUCTION-READINESS-005 v1.0` |
| Yeni yayın kapsamı kimliği | `WINDOWS_NATIVE_TEST_ONLY_V1` — yeni sözleşme kimliği, mevcut yazılım özelliği değildir |
| Pilot için kullanıcı tarafından verilen dizin | `C:\innova\projeler\gpu-fusion` |
| Şimdiki teslimat | Araştırma ve uygulanabilir görev dosyası |
| Şimdiki durum | `SPEC_READY_IMPLEMENTATION_NOT_STARTED` |
| Şu anda yapılmayan | Ürün implementasyonu, görev dosyasının GitHub'a yazılması, commit/push/PR, GPU Fusion erişimi, test/pilot/benchmark/CI veya yayın |

**Bu dosyayı hazırlama talebi uygulama başlatma talebi değildir.** Kullanıcı bu belgeyi uygulayıcıya açıkça uygulama talimatıyla verdiğinde S00–S09 teknik kapsamı açılır. Gerçek proje pilotunun G1 kapısı ve müşteri checkout'una uygulamanın G2 kapısı ayrıca korunur. Dosyayı yalnız okuyan ajan kendiliğinden çalıştırma yapmaz.

**Ürün deposu ve test edilen proje ayrı yetki alanlarıdır.** Ürünün kendi kaynakları bu görevde geliştirilebilir. GPU Fusion'ın production kaynakları, POM/build dosyaları, kullanıcı testleri ve dirty/untracked içerikleri otomatik değiştirilmez. Müşteri projesinde otomatik commit, push, branch oluşturma, stage, reset, clean, stash veya checkout yoktur.

### 0.1 Hazırlayan Araştırmanın Sınırı

Bu görüşmede GitHub bağlantısıyla commit'e sabitlenmiş kaynaklar ve resmî belgeler okundu. Önceki eklerin dosya boyutları ve hash'leri kontrol edildi. Tam repo clone denemesi DNS çözümleme hatası verdi. Yerel hazırlama ortamı Linux/Node 22.16.0'dır; kullanıcının Windows makinesi değildir. Tam repository suite'i, Windows Maven, ürünün native SQLite sürücüsü ve GPU Fusion bu hazırlıkta çalıştırılmadı.

Bu araştırmada alt ajanlar fiilen çalıştırılmış değildir. Aşağıdaki subagent düzeni uygulanacak sözleşmedir; ayrı rol adları yazmak veya ana ajanın kendi kendine rol değiştirmesi gerçek ayrı context kanıtı sayılmaz.

Önceki dosyalardaki test sayıları tarihsel kanıttır. Özellikle P08 paketindeki **eski kod 5/19, düzeltme 19/19** sonucu `LOCAL_COMPONENT_ADAPTER_ONLY` seviyesindedir; Linux/Node 22 üzerinde `node:sqlite` ve `node:test` uyarlaması kullanılmıştır. Windows/Node 24+/kilitli `better-sqlite3`/Vitest kabulü yerine geçmez. Bu araştırmada o testler yeniden çalıştırılmadı.

### 0.2 Korunacak Girdi Kimlikleri

| Girdi | Kimlik |
| --- | --- |
| Önceki `AKTIF_GOREV.md` | 42.647 bayt; SHA-256 `cc741769116cee3b2cd921256406a58560b0d65ad0a476c3471bb01ac378336f`; Git blob `8906d07080f8726831dbd8e3ea54fb46c533aae6` |
| `2026-10-12-production-005-chat-export.md` | SHA-256 `5691b2676ccfdd436cd239867ba425fa50624e9cedee0e517b330459c5b6764e` |
| `P08_BACKUP_DUZELTME.patch` | 24.889 bayt; SHA-256 `7cdf39c38da7046cf51122785b1830ea169e9c57b22f07e1714b15fb3160d68c` |
| `P08_BACKUP_DUZELTME_VE_KANITLAR.zip` | SHA-256 `99014ddf80a29d8703caef42a2772e84ae20de84f59d63cdccb8dceaae7f08cd` |
| Onaylı Report06 referansı | `docs/reporting/reference/innova_test_raporu_tasarim_06.html`; 257.845 bayt; SHA-256 `e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80` |

005 görevinin yerel baytlarından hesaplanan Git blob, incelenen commit'teki blob ile eşleşti. Rapor referansının beklenen kimliği önceki sözleşmeden ve mevcut verifier'dan alınmıştır; uygulayıcı referansın gerçek baytlarını tekrar doğrular. Eksik veya farklı dosya sessizce ezilmez.

### 0.3 Coordinator İçin Okuma Penceresi

Bu dosya bütün ekip için tek sözleşmedir; her ajana tamamını yeniden göndermek gerekmez. Coordinator başlangıçta Bölüm 0–1, 3, 9.1, 10 ve son handoff'u okur. Ardından yalnız sıradaki S paketinin metnini, o paketin atıf yaptığı teknik bölümleri ve WN satırlarını içeren küçük bir görev brief'i üretir. Tam doküman ihtiyaç halinde dosyadan erişilebilirdir; ayrı brief aynı yetki ve yasakları taşır, yeni sözleşme değildir. Arşiv incelemesini ilgili reviewer'a delege et; aynı tamamlanmış analizi her context yenilenmesinde tekrarlama. Brief ve sonuçlar görev/sürüm/doküman SHA kimliği taşır.

## 1. Son Kullanıcı Kararları Ve Eski Sözleşmelerin Uzlaştırılması

| Kimlik | Bağlayıcı karar | Eski davranışa etkisi |
| --- | --- | --- |
| K01 | Desteklenen kullanıcı platformu yalnız Windows'tur. | macOS ve Linux son-kullanıcı kurulumu/kabulü hedeflenmez. Windows üzerinde WSL zorunluluğu da yoktur. |
| K02 | Testler yerel JDK/Maven/JUnit/JaCoCo ile otomatik çalışır. | Docker, Docker Desktop, container image, daemon, capability probe, egress proxy ve container provisioning gerekliliği kaldırılır. |
| K03 | Yerel çalışma esas çalışma yoludur; gizli fallback değildir. | `host_dev_only` müşteri yasağını delerek ilerleme yoktur. Açık `windows_native` yürütme profili ve migration yapılır. |
| K04 | Ana context korunur; gerçek alt ajan oturumları kullanılır. | Tüm repo, bütün loglar ve konuşma geçmişi her modele gönderilmez. |
| K05 | Merkezi yerel SQLite korunur; kayıtlar proje/checkout/job bazında ayrılır. | Her proje için ayrı DB veya yalnız model hafızasına dayalı devam tasarlanmaz. |
| K06 | İlk keşifte tüm dosya ve klasörler envantere alınır. | Envanter, içerik okuma ve çalıştırılacak kaynak snapshot'ı farklı kapsamlar olur. |
| K07 | GPU Fusion'da küçük ve kullanıcı kontrollü gerçek pilot yapılması planlanır. | Eski pilotun genel durdurma kaydı bu yeni pilot için G1 onayıyla sınırlı olarak aşılabilir; eski pilot PASSED yapılmaz. |
| K08 | Test-only sınırı ve kullanıcı dosyalarının korunması sürer. | Docker kaldırılması production/POM düzenleme, keyfi komut veya checkout'u geçici değiştirme izni değildir. |
| K09 | Raporu model yazmaz. | Model önerileri iç geliştirme artifact'idir; resmî rapor olgusal kalır. |
| K10 | CI, geniş benchmark, otomatik yayın ve yeni UI yoktur. | CI kapalı kalır. Küçük kabul fixture'ları benchmark kampanyası değildir. |
| K11 | Ürün geliştirmesinde repo-local kimlik ve Türkçe ASCII commit standardı korunur. | Devirde ürün geliştirmesi için verilen commit/push kararı müşteri projesine taşınmaz. Bu hazırlık oturumunda Git yazımı yoktur. |
| K12 | Kullanıcı yeni `AKTIF_GOREV.md` istedi. | 005 devir kaydındaki “yeni görev oluşturma/değiştirme” yasağı bu belgeyi hazırlamak ve onay sonrası aktifleştirmek için kaldırılmıştır; uygulayıcı görevi keyfî yeniden yazamaz. |

**Windows native çalışma OS sandbox değildir.** Ayrı dizin ve test-only patch kontrolü yanlışlıkla kaynak ezilmesini azaltır; JVM, Maven eklentisi veya wrapper çalıştıran Windows hesabının yetkileriyle dosya/ağ işlemi yapabilir. “Commit/push yapmıyor, o halde güvenli” kabulü kullanılmaz. Bu gerçek açıkça belgelenir; Docker benzeri ağ izolasyonu veya bellek sınırı uygulanmış gibi raporlanmaz. Standart kullanıcı hesabı kullanılır; yönetici yükseltme, TLS kapatma veya kurum politikası bypass'ı yoktur. [D04, D10]

**Yeni kapsamın kapanabilir olması gerekir.** Docker/macOS/Linux'a özgü eski kabuller Windows yayınında sonsuza kadar eksik iş bırakmayacak. Her eski madde `RETAINED`, `REPLACED` veya `OUT_OF_SCOPE_BY_USER` olarak eşlenir. Değişen tehdit modeli nedeniyle artık sağlanmayan “host secret okunamaz” gibi vaatler açıkça geri çekilir; secret'ın modele/loga aktarılmaması gibi geçerli korumalar kalır. Kullanıcı kararı nedeniyle kaldırılan bir maddeye PASSED yazılmaz. Kapsamlı benchmark kampanyası da K10 gereği aktif yayın kapsamına taşınmaz; onun içindeki küçük, genel doğruluk/regresyon predicate'leri korunur veya WN karşılığına eşlenir. Eski Linux/container görevinin full sonucu tarihsel olarak NO_GO kalabilir; yeni Windows kapsamının kararı bundan bağımsız, açık scope kimliğiyle üretilir.

## 2. Güncel Repo İncelemesi Ve Araştırma Bulguları

Aşağıdakiler kaynak gözlemidir; aksi ayrıca belirtilmedikçe yeni çalıştırılmış regresyon sonucu değildir. Kaynaklar Bölüm 14'te bulunur.

| Bulgu | Gözlem / dayanak | Görevde karşılığı |
| --- | --- | --- |
| B01 | `runner-factory.ts` ve dispatcher müşteri işini Docker doğrulamasına bağlar; native yol development-only olarak ayrılmıştır. [R03] | S02: bütün normal MCP yolu `windows_native` kullanacak. |
| B02 | `MavenRunner.run` önce `mvnw.cmd`, sonra Unix `mvnw`/bash seçer; `cmd /c` kurar, env'in tamamını kopyalar; sonucu `exit` olayında toplar. [R04] | S02: Windows çözümleme, güvenli argümanlar, log drain, timeout/cancel ve ortam sözleşmesi. |
| B03 | `SourceSnapshot.walk` `.git`, `node_modules`, `target`, `build`, **`.mvn`** içeriklerini dışlar; 64 MiB üstü dosya scan'i durdurur. [R05] | S03: tam metadata envanteri; `.mvn` dahil doğru build snapshot'ı; büyük dosya metadata kaydı. |
| B04 | `ProjectRepository.ensureLocation` projeyi `name` ile arar. Aynı ada sahip bağımsız klasörlerin tek proje sayılması mümkündür. [R06] | S04: proje kimliğini addan ayır; checkout ve job izolasyonunu test et. |
| B05 | Worker config'te `task`, `read`, `glob`, `grep`, `list`, `bash`, write/edit ve question kapalıdır. Bu, mevcut gövdeyi prompt'tan alan worker tasarımıdır. [R07] | S05: rol/oturum/context kontratı ve kontrollü okuma; bütün araçları topluca açma yok. |
| B06 | P08 kaynak blob'u hâlâ `5f81be7a696516f48d1de0ef8c34c9dc32be1bfc`. Önceki patch'in uygulanmış hali değildir. `restoreBackup` DB'yi blob kopyalarından önce yayımlar. [R08, E03] | S01: patch'i kontrollü uyarlama; başarısız restore'da önceki state'i koruma. |
| B07 | `buildPlan` `-pl/-am` üretir fakat statik POM bulgularından framework/JaCoCo kararı verir; coverage goals `test`, `jacoco:report`tur. [R09] | S06: etkin Maven yapılandırması, agent/run/report zinciri ve gerçek modül fixture'ları. |
| B08 | Release gate artık `--local` ve varsayılan full ayrımını yapar; kimlik ve manifest denetimleri vardır. Devirde full gate manifest yokluğu nedeniyle NO_GO'dur. [R10, R12] | S00/S09: çalışan kapıları koru; yeni kapsamı izlenebilir eşle ve gerçek kanıtları topla. |
| B09 | OpenCode'un resmî agent/task kaynaklarında ayrı child session ve devam için task/session kimliği vardır. İncelenen task uygulaması bulunamayan eski session yerine yeni session açabilir. [D01–D03] | S05: session tek başına kalıcı job değildir; SQLite görev kimliği/attempt lineage zorunlu. |
| B10 | Windows `.cmd` dosyaları normal executable gibi `execFile` ile çalıştırılamaz. Wrapper'ın bazı türleri Windows'ta PowerShell ile indirme yapar. [D04, D05] | S02: installed Maven varsayılanı; wrapper uyumluluk kapısı; shell enjeksiyon testleri. |

### 2.1 Araştırmadan Alınan Tasarım Kararları

**OpenCode:** Yerleşik agent/session altyapısını adapte et; ayrı bir ajan framework'ü veya özel OpenCode fork'u yazma. Public server/SDK sözleşmesini yereldeki kurulu sürümün OpenAPI çıktısıyla doğrula. `agent`, `parentID`, structured output ve permission alanları kurulu sürümde gerçekten desteklenmeden kullanılmaz. Doküman örneği veya açık PR, kurulu binary'nin özelliğine kanıt değildir. [D01–D03]

**Windows process:** `.cmd` çağrısının bir kabuk sınırı olduğunu kabul et. Serbest model metni komuta dönüşmez. Yalnız doğrulanmış program yolu, çalışma dizini ve tipli argv ile çalış. Çocuk stdout/stderr kapanmadan kanıtı tamamlanmış sayma. [D04]

**Maven/JaCoCo:** Projenin JDK, settings, profile, `.mvn` ve modül düzenini koru. `prepare-agent` ile Surefire `argLine` ilişkisini doğrula; ek JVM argümanlarını ezme. JaCoCo dokümanındaki `trunk` örnek sürümleri SNAPSHOT olabilir; bunları kurulu/kabul edilmiş sürüm gibi sabitleme. [D05–D09]

**SQLite:** DB backup'ını SQLite backup API ile al; blob listesini oluşmuş snapshot DB'den çıkar. WAL dosyası ile ürün checkpoint'ini karıştırma. `integrity_check` yanında `foreign_key_check` gerekir. Disk blob'larının tutarlılığı ayrıca doğrulanır. [D11–D13]

**Context:** Alt ajanların ana konuşmayı devralmaması, kısa teslimat ve bağımsız review iyi çalışma desenidir; bu üründe sayısal context/attempt sınırları, artifact kimliği ve deterministik kabul ile uygulanacaktır. Toplam token/maliyet azalması garanti edilmez; ölçülür. [D01–D03]

## 3. Başlangıç Protokolü Ve Geliştirme Düzeni

### 3.1 İlk Okuma Ve Koruma

- [ ] `AGENTS.md`, bu belge, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md`, son handoff ve ilgili kararları oku. Ana coordinator bütün arşivleri context'ine doldurmaz; alt ajanlar ilgili kısımları inceleyip hash'li özet döndürür.
- [ ] Gerçek branch/HEAD/remote/dirty durumunu kaydet. HEAD ilerlediyse farkı incele; `3b1916e` commit'ine reset yapma. Kullanıcının özel yerel dosyalarının bulunmadığını GitHub görünümünden çıkarma.
- [ ] Önceki aktif görevi byte/hash korunarak `ai/tasks/archive/AITE-PRODUCTION-READINESS-005-v1.0.md` altında arşivle. Aynı yol farklı içerikle doluysa ezme. Mevcut teslimatın hash'i ve etkinleştirme kararı kayda geçsin.
- [ ] `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` korunan kullanıcı dosyasıdır. Sahipliği doğrulanmadan değiştirme, silme veya stage etme.
- [ ] Ürün için ayrı çalışma branch/worktree kullan. Worktree zaten varsa yeniden yaratma. Müşteri GPU Fusion dizininde worktree/branch yaratma; git metadata'sız owned snapshot kullan.
- [ ] Repo-local Git kimliği `mehmet-karacan <karacan.mehmet@hotmail.com>` olsun. Global ayarlara dokunma. Ürün commit mesajı/body Türkçe ASCII; her commit/push öncesi staged diff ve gizlilik kontrolü. Yetki engelinde sürekli deneme veya history rewrite yok; patch ve checkpoint bırak.

### 3.2 Context'i Korumak İçin Geliştirme Delegasyonu

Varsayılan **iki eşzamanlı model işi**, en fazla **üç**; üçüncü yalnız bağımsız ve dosya sahipliği çakışmayan işte açılır. Normal ürün pilotunda yine iki model isteği ve tek Maven çalıştırması sınırı geçerlidir. Bu sayılar yeni görev varsayılanlarıdır, mevcut kodda var oldukları iddia edilmez.

Devirde verilen `litellm/GLM-5.3-Flash-IT` ve `litellm/Qwen3.8-27B-IT`, `xhigh` profilleri yalnız yerel erişim doğrulanırsa kullanılabilir. Kimlikler birebir korunur; provider öneki kesilmez, variant/model suffix'i uydurulmaz. Rol ataması yetenek iddiasına değil gözlenen başarı/başarısızlığa dayanır. Onaylı model bulunamazsa başka sağlayıcıya sessiz geçiş yapılmaz.

Her geliştirme subagent'ına yalnız: görev kimliği, bağımlı sözleşme bölümleri, değiştirilebilir dosyalar, taban SHA, input artifact referansları, kabul testleri ve yasaklar verilir. Tüm sohbet gönderilmez. Alt ajan derin incelemeyi kendi context'inde yapar; coordinator'a **en fazla 6 KiB UTF-8 özet**, değişen path'ler, test komutu/exit/sayıları, artifact referansları, açık risk ve tek sonraki adım döner. Ayrıntı ve büyük diff/log dosyada kalır. Büyük çıktı kesilip “tam” denmez; referans verilir.

Aynı dosyayı değiştiren paketler eşzamanlı yürütülmez. Geliştiren ajan kendi değişikliğinin nihai reviewer'ı olamaz. Gerçek alt ajan API'si olmayan bir ortamda paralel çalışma yapıldı denmez; deterministik kontroller ve sınırlı sıralı çalışma açıkça etiketlenir, bağımsız review yapılmamışsa kabul açığı korunur.

### 3.3 Her Paket İçin Ortak Kapanış Döngüsü

1. Adı ve beklenen güvenli davranışı belli başarısız test ekle; mevcut kusurda yanlış nedenle değil o davranış yüzünden başarısız olduğunu gör.
2. En küçük ilgili değişikliği uygula; bütün dosyaları yeniden tasarlama.
3. Paket odak testlerini native ürün bağımlılıklarıyla çalıştır; ardından ilgili çapraz regresyonları çalıştır.
4. Bağımsız reviewer input SHA/diff/test kanıtı üzerinden kapsam ve kaliteyi incelesin.
5. Aşağıdaki kabul kimlikleriyle sonucu, başarısız testi ve artifact hash'ini bağla. “Kod var” ≠ “test edildi”.
6. Repo içindeki geliştirme kayıtlarını güncelle. Gizli runtime loglarını veya GPU kodunu public Git'e koyma. Ortak dosyaları coordinator tek elde uzlaştırsın.

## 4. Hedef Çalışma Akışı Ve Yetki Sınırları

```text
Kullanıcı / OpenCode ana oturumu
    → mevcut MCP araçları
    → kalıcı job coordinator + SQLite
        → envanter/context provider
        → ayrı Explorer / Test Architect / Test Developer / Reviewer oturumları
        → deterministik patch ve kalite kontrolleri
        → Windows Native Maven Runner
        → fresh test + JaCoCo kanıtı
        → accepted checkpoint
        → Report06 + kullanıcı incelemesi
```

**İki coordinator tanımı farklıdır:** Ürünü geliştiren oturum iş paketlerini dağıtır. Ürünün runtime coordinator'ı MCP içindeki deterministik state machine'dir. Runtime kararlarını ikinci bir serbest LLM planlayıcısına devredip iki ayrı kabul otoritesi oluşturma.

### 4.1 Runtime Roller

| Rol | İzinli görev | Çıktı | Karar yetkisi |
| --- | --- | --- | --- |
| Explorer | İlgili kaynak/test/dependency bağlamını sınırlı aralıklarla inceleme | Kaynak referanslı context manifest | Test çalıştırmaz, dosya yazmaz |
| Test Architect | Eksik senaryo ve test stratejisi belirleme | Yapılandırılmış test planı | Build veya başarı sonucu üretmez |
| Test Developer | Plan ve son feedback'e göre test changeset üretme | Ayrı artifact'te tam test kodu/changeset | Müşteri checkout'una yazmaz, Maven/Git çalıştırmaz |
| Reviewer | Farklı oturumda assertion/edge/regresyon/duplicate ve kapsam inceleme | Kanıt referanslı review findings | Kendi başına coverage/GO vermez |
| Verifier | Gerçek build/test/coverage/diff kontrolleri | Run evidence ve kabul/red | Deterministik kod; LLM persona değildir |
| Coordinator | DAG, bütçe, sahiplik, checkpoint ve kullanıcı özetini yönetme | Kalıcı job durumu ve artifact ref'leri | Tek durum/kabul otoritesi |

Runtime alt ajanlar genel terminal, Git yazımı, tarayıcı/web erişimi veya diğer kullanıcı MCP'lerine serbest erişim almaz. Gerekli okuma, job'a/snapshot'a bağlı sınırlı MCP context araçları veya açık manifest üzerinden sağlanır. Maven'i model değil deterministik runner başlatır. Bu sınır Windows'ta çalıştırılan test koduna OS sandbox sağlamaz; uygulamanın ajan yetkilerini sınırlar.

Geliştirme ajanlarının ürün branch'inde kullanacağı shell izinleri runtime model izinlerinden ayrıdır. “Tüm ajanlarda allow” gibi genel bir ayar müşteri runtime'ına miras bırakılamaz.

### 4.2 Runtime Kontratları — Yeni Olarak Uygulanacak

Mevcut iş/worker/coverage şemalarını yeniden yazmadan aşağıdaki sözleşmeleri ekle. İsimler yeni iç arayüz önerileri değil, bu görev için hedef isimlerdir; çatışma varsa eşdeğer mevcut yapı tekrar kullanılabilir ve mapping kaydedilir.

- `AgentTaskContract`: `schema_version`, `task_id`, `job_id`, `project_id`, `location_id`, `job_revision`, `source_snapshot_id`, `source_digest`, `role`, `parent_task_id`, `dependency_task_ids`, `input_artifact_refs`, `allowed_context_scope`, `expected_output_schema`, `budget`, `model_binding`, `idempotency_key`.
- `AgentTaskResult`: aynı task/job/revision kimlikleri, `attempt_id`, `status`, `summary`, `findings_count`, `blocking_findings_count`, `artifact_refs`, `changed_paths`, `run_refs`, `next_action`. `summary` en fazla 6 KiB. Büyük test kodu bu alana konmaz.
- `ArtifactRef`: artifact ID, job ID, kind, SHA-256, byte size ve şema sürümü. Modele verilen ref doğrudan sınırsız dosya sistemi erişimi değildir.
- `NativeRunPlan`: `run_id`, `job_id`, `stage`, `runner_kind=windows_native`, `toolchain_identity`, `cwd`, `executable`, tipli argv, profile/property listesi, test kapsamı, timeout, log budget, `source_digest`, `plan_digest`.
- `InventoryScanResult`: `scan_id`, `project_id`, `location_id`, scan generation, sayılar, complete/partial, hata türleri, metadata artifact ref ve paginated cursor. Bütün file listesi MCP cevabına basılmaz.

Ajan durumları en az `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `INTERRUPTED`, `BLOCKED`, `WAITING_APPROVAL` ayrımını taşısın. `COMPLETED` bir model çağrısının tamamlanmasıdır; testin kabul edildiği anlamına gelmez.

## 5. Windows Native Çalıştırma Sözleşmesi

### 5.1 Araç Zinciri Ve Konfigürasyon

1. Kullanıcıya ait Windows kurulumundaki Node, OpenCode, Java ve Maven konum/sürümleri okunur; otomatik JDK/Maven/OpenCode yükseltme yapılmaz. Yeni bir global PATH veya JAVA_HOME yazılmaz.
2. `windows_native`, normal ürün girişinin varsayılan ve desteklenen runner'ıdır. Non-Windows süreçte açık `UNSUPPORTED_PLATFORM`; eski `docker`/`host_dev_only` konfigürasyonunda anlaşılır migration/unsupported sonucu. Eski Docker job'u sessizce native devam ettirilmez; aynı job altında açık runner revision, kaynak/build revalidation ve yeni baseline gerekir.
3. Maven seçimi: kullanıcı açıkça bir executable belirlediyse onu kullan; aksi halde Windows PATH'teki gerçek `mvn.cmd` yolunu çöz. Farklı büyük-küçük harfli `Path`/`PATH` ortam anahtarlarını doğru ele al. `where` sonucu veya mevcut dosya tek başına sürüm kanıtı değildir; `-v` çıkışını kaydet.
4. Wrapper kullanımı otomatik öncelik değildir. Açık wrapper tercihi varsa `mvnw.cmd` ve `.mvn/wrapper` birlikte doğrulanır. PowerShell'e, yasak indirmeye veya bilinmeyen binary'ye ihtiyaç varsa çalıştırılmaz; açık blocker ve yerel Maven seçeneği sunulur. Wrapper'ı değiştirme veya projeye yeni wrapper kurma yoktur. [D05]
5. Maven'in çalıştığı JDK ile testlerin toolchain üzerinden kullandığı JDK ayrı olabilir. Gerçek etkin JDK ve Maven toolchains bilgisi onaylı yerel yapılandırmadan çözülür; container'daki eski sabit JDK 21 varsayımı taşınmaz. [D06]
6. Kullanıcının `.m2/settings.xml`, onaylı profile/proxy/mirror ve yerel repository düzeniyle uyum korunur. Native Maven'in onaylı credential'lı settings kullanması Docker'daki secret-mount yasağıyla bloke edilmez. Bu içerikler modele, genel rapora veya public Git'e kopyalanmaz. Mevcut settings dosyası değişmez.
7. `MAVEN_OPTS`, `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS`, `.mvn/jvm.config`, `.mvn/maven.config`, `.mvn/extensions.xml`, relative parent ve custom kaynak kökleri etkin planın parçasıdır. Secret değerlerinin kendisi değil kontrollü kimlikleri ve değişim sinyalleri kaydedilir. [D06]

### 5.2 Komut, Süreç Ve Log Güvenilirliği

- `.cmd` sınırı için merkezi launcher kullan: doğrulanmış mutlak `cmd.exe`, `/d /s /v:off /c`, kurallı quoting ve doğrulanmış tipli argümanlar. `shell:false` tek başına kabuk enjeksiyonu garantisi değildir. Modelin serbest metni `cmd /c`'ye verilmez. [D04]
- Boşluk, Türkçe/Unicode, parantez ve `&` içeren meşru path'ler gerçek Windows testleriyle doğrulanır. `%`, `!`, `^`, `|`, `<`, `>`, çift tırnak, CR/LF ve NUL için güvenli aktarım kanıtı olmayan değerler spawn öncesi tipli hata ile reddedilir; karakterler sessizce silinmez. Sentinel testleri başka komut çalışmadığını doğrular.
- Pilot için planlanan goals `test-compile`, unit `test` ve doğrulanmış JaCoCo ölçüm goals ile sınırlıdır. `install`, `deploy`, release/SCM goal, doğrudan `verify` üzerinden bütün integration suite'ini açma yoktur. Mevcut POM'da bu fazlara bağlı yan etkiler ön kontrolde görünür kılınır.
- `spawn error`, `close`, exit code, timeout ve cancel ayrı olaylardır. Süreç `exit` etti diye stream'ler bitmeden log hash'i/passed yazılmaz. Decoder chunk sınırındaki çok baytlı karakterleri bozmaz. Stdout/stderr için mevcut 8 MiB sınırı korunur veya açıkça yapılandırılır; truncation sayaç ve sebep ile raporlanır.
- Cancel/timeout yalnız job'ın sahip olduğu süreç ağacını hedefler. `taskkill /PID ... /T /F` dönüşü ve çocukların kapanması doğrulanır; `/IM java.exe`, bütün Node süreçlerini kapatma veya başka IDE Maven sürecini öldürme yoktur. [D10]
- PID tek başına kalıcı sahiplik kanıtı değildir. Process registry run/job/attempt, başlatma zamanı, parent/child ilişki ve executable/workspace kimliğini saklar. Restart sonrası sahiplik doğrulanmadan PID öldürülmez. Yetkisiz/kanıtsız orphan için güvenli blocker, yeni workspace ve açık tanı; eski koşunun kanıtı kabul edilmez.
- Normal stop ile coordinator hard-kill farklı kabul senaryolarıdır. Node parent ölünce tüm JVM'lerin bittiğini varsayma. Gerekli owned-process cleanup native Windows'ta kanıtlanmalı; mevcut olanakla mümkün değilse capability eksikliği açık kalır. Windows Job Object bir araştırma seçeneğidir, varsayılan yeni native bağımlılık veya geliştiriciye Visual Studio kurdurma izni değildir. [D14]
- Yeni model/Maven çalıştırması toplam job deadline, kalan attempt ve cancellation durumu doğrulandıktan sonra başlar. Geç gelen sonuç lease/generation/attempt fence dışında ise yalnız tanı olarak saklanır.

### 5.3 Kaynak Koruma

Özgün `C:\innova\projeler\gpu-fusion` üzerinde Maven çalıştırılmaz. Yerel **Windows** Maven, repository dışındaki owned frozen kopyada çalışır; “Windows native” demek “özgün dizine yaz” demek değildir. Baseline, candidate ve final replay aynı doğrulanmış başlangıç snapshot'ından türetilir. Aday test sadece candidate workspace'e uygulanır. Accepted set immutable blob'larla korunur.

Çalışma sırasında kullanıcı özgün dosyada değişiklik yaparsa süreç o değişikliği geri almaz. Kaynak farkı kaydedilir; apply/replay karşılaştırması eski ve yeni kaynağı karıştırmaz. Resume yeni kaynağı sessizce eski accepted sete eklemez.

## 6. Envanter, SQLite, Checkpoint Ve Devam

### 6.1 Üç Ayrı Kapsam

**Metadata envanteri:** Seçilen kökün altındaki bütün dizin ve dosyaları listeler: `.git`, `.mvn`, `node_modules`, `target`, `build`, `.env`, binary, hidden ve büyük dosyalar dahil. Tür desteklenmiyorsa metadata kaydı yine tutulur. Okuma yetkisi olmayan dizin `ACCESS_DENIED` ve scan partial olarak görünür; içindeki bilinmeyen dosyalar varmış gibi sayılmaz. Symlink/junction/reparse point'in kendisi kayıtlıdır, döngü veya izinli kök dışına takip yapılmaz.

**Analiz context'i:** Envanterin tamamı modele gönderilmez. Yalnız görevle ilgili kaynak, test ve dependency kesitleri, satır aralıkları ve hash ile alınır. `.env`, private key, auth dosyası veya token içeriği modele otomatik açılmaz. `.git` ve binary içerik analizi gerekmiyorsa metadata yeterlidir. Bu, envanterden hariç tutmak değildir.

**Yürütme snapshot'ı:** Build için gereken POM, kaynak, test, kaynak dosyaları, `.mvn`, onaylı wrapper ve relative parent yapısı korunur. `.git` çalışma metadata'sı ve eski `target` çıktısı yürütmeye taşınmaz. Test kapsamı dışında veya erişilemeyen gerekli build girdisi varsa açık blocker; sahte sıfır test/baseline yoktur.

Tam envanter hash'i ile test/build source digest'i ayrıdır. `.git` logu veya eski `target` değişti diye her devamda bütün çalışma geçersizleşmez; testin kullandığı gerçek kaynak/config değişikliği de metadata cache yüzünden kaçmaz. Büyük dosya hash'i stream ile hesaplanır veya hash durumu açıkça `NOT_COMPUTED` olur; bu dosya çalıştırma için gerekliyse hash'siz trusted snapshot kabul edilmez.

İlk tarama sayfalı ve kesintiden devam edilebilir olmalı. Sonraki taramalar değişen dosyaları işler; değişmeyen sembol analizi yeniden yapılmaz. Metadata hızlı filtresi, fresh run öncesi source bytes doğrulamasının yerine geçmez. Dosya silme/rename/type change scan generation ve tombstone ile izlenir.

### 6.2 Proje Kimliği

`projects.name` yalnız görünen addır; kimlik veya tenant sınırı değildir. Aynı isimli bağımsız repository'ler tek projeye birleştirilmez.

- Önce canonical checkout/root ve Git common-dir kimliğiyle mevcut konum çözülür; hassas remote kimlik bilgileri ayıklanır.
- Aynı doğrulanmış Git remote'a ait farklı checkout'lar aynı mantıksal projeye bağlanabilir, fakat farklı `location_id` alır. Fork ve farklı remote key'leri ayrı tutulur; path kısmının harflerini körlemesine küçültme.
- Git olmayan proje canonical root identity ile ayrılır; taşıma/yeniden bağlama açık kullanıcı işlemi gerektirir.
- Windows case/drive/UNC/junction alias kuralları tek canonical resolver'da uygulanır. Runtime DB network share üzerinde tutulmaz. Pilot kökü için verilen yerel C: path esas alınır.
- Eski ada göre birleştirilmiş verilerde otomatik ve kanıtsız split/reparent yapılmaz. Location/job lineage korunur; belirsiz ilişki işaretlenir ve cross-project okuma/yazma engellenir.
- Project query, resume ve artifact fetch her zaman project/location/job bileşimini doğrular. Yalnız UUID verilmesi başka projedeki checkpoint'in okunmasını yetkilendirmez.

### 6.3 Kalıcı Veri Modeli

Varsayılan runtime kökü `%LOCALAPPDATA%\ai-test-engineering`, DB `state.db` olarak korunur; mevcut açık path override'ları desteklenir. DB ve blob'lar ürün reposunun veya müşteri checkout'unun altında tutulmaz. [R11]

Mevcut `projects → project_locations → snapshots/modules/packages/symbols → test_jobs → checkpoints/artifacts/worker_attempts` ilişkilerini kullan. Yeni alan ihtiyacını migration'la karşıla; aynı veriyi farklı “yeni hafıza DB”sine kopyalama.

Yeni veya eşdeğer mevcut tablolar:

| Tablo | Amaç / asgari alanlar |
| --- | --- |
| `file_inventory` | location, scan_generation, canonical relative path, type, size, mtime, optional hash/hash_status, sensitivity, read_status, parser_status, tombstone |
| `inventory_scans` | project/location, source/root identity, state, cursor artifact, scanned counts, errors, start/end timestamps |
| `agent_tasks` | job FK, role, parent task, dependency/input contract ref, state, idempotency key, revision, accepted output ref |
| `agent_attempts` veya genişletilmiş `worker_attempts` | task FK, attempt ordinal, provider/model/variant, request/session/message kimlikleri, duration/usage, status/error, input/output refs |
| `job_approvals` veya eşdeğer append-only event | job/project, approval türü, scope/model/budget digest, kullanıcı kararı, geçerlilik ve zaman |
| `owned_processes` veya eşdeğer registry | job/run/attempt, process identity, executable/workspace fingerprint, started/closed ve cleanup durumu |

UUID, FK alanları, iş alanları ve teknik audit alanları sırası korunur; yeni tabloların anlamı, veri tipleri, null semantiği, index/unique/check kısıtları sözlükte belgelenir. Para/token bilinmiyorsa 0 yazılmaz. UTC zaman ve süre ölçümü ayrılır. Monoton generation, row_version/CAS ve lease kuralları mevcut iş çekirdeğiyle uyumlu tutulur.

Alt ajanlar SQLite'a keyfi SQL yazmaz. Kayıtlar coordinator/storage servisinden geçer. Uzun model/Maven işlemi boyunca SQLite write transaction tutulmaz. WAL/foreign_keys/busy_timeout/synchronous ilkeleri korunur; geçerli multi-process writer yarışları kısa transaction ve fencing testleriyle doğrulanır. [D12, D15]

### 6.4 Gerçek Devam

Checkpoint, kaynak/kontrat/config/build/toolchain ve son trusted run kimliğini; accepted içerik hash/size/path setini; target cursor'ı; tamamlanan task'ları; kalan tüm bütçeleri taşır. Eski harcanan rejected/model-error denemeleri unutulmaz.

`kaldığın yerden devam et` akışı:

1. Doğru project/location altında aynı job'ı bul; birden fazla uygun iş varsa otomatik yanlış işi seçme.
2. Lease ve owner fence al; aktif ikinci owner'ın işini bozma.
3. SQLite/manifest/accepted blob/test-run/source kimliklerini doğrula; bozuksa fail-closed.
4. Sağlam ve değişmeyen tamamlanmış analiz/plan/verifier adımlarını kullan. Gerekirse yalnız güvenilir son seti yeniden doğrula; tüm işi sıfırlama.
5. Açık attempt'in eski session'ına dönmeden task/parent/job eşleşmesini kontrol et. Session kaybolmuşsa aynı kalıcı task altında **yeni attempt** aç; “aynı OpenCode session'a döndüm” deme. [D03]
6. Kullanıcı model değişimini açıkça onayladıysa yeni model binding event'i/contract revision ekle. Eski contract'ı ve attempt kayıtlarını değiştirme. Aynı job/accepted set/kalan bütçeyle devam; model mismatch'i sessiz global fallback ile aşma.
7. Eski veya iptal edilmiş attempt'ten gelen çıktı generation ve input digest uyuşmuyorsa kabul edilmez.

## 7. Backup Ve Restore İçin Zorunlu Düzeltme

Bu bölüm yeni yetenek değildir; tespit edilmiş veri koruma kusurunun kapanışıdır.

### 7.1 P08 Patch'inin Uyarlanması

Patch varsa hash ve `git apply --check` ile doğrula; HEAD/diff değişmişse körlemesine uygulatma. Üç hedef dosya: `src/storage/lifecycle-ops.ts`, `tests/unit/p08-backup-authority.test.ts`, `tests/unit/p08-lifecycle-escape.test.ts`. Patch yoksa bu bölümdeki davranışları mevcut kodda yeniden üretip uygula; dosya eksikliği işi belirsiz bekleyişe çevirmesin.

Backup DB snapshot'ı alınır; READY artifact seti **snapshot DB** üzerinden okunur. Blob'lar hash'i hesaplanan aynı baytlarla kopyalanır. Snapshot'ın referans verdiği dosyalar backup bitene kadar GC'ye karşı pinlenir. Snapshot, manifest ve complete marker kimlikleri eşleşmeden complete yayımlanmaz. DB ile manifest iki yönlü path/hash/size kontrol edilir; çelişkili tekrar, çıkarılmış READY kaydı, eksik/bozuk blob, yanlış backup ID veya `complete:false` reddedilir. SQLite bütünlüğü yanında FK kontrolü ve desteklenen schema migration geçmişi doğrulanır. [D11–D13]

### 7.2 Açık Restore Kusuru

Önceki paketin kontrollü yeniden üretimi `OPEN_RESTORE_PUBLISH_BEFORE_BLOBS`: hedefteki dosya/dizin çakışması blob kopyasını `EEXIST` ile durdururken hedef DB çoktan değişmiştir. Patch bunu düzeltmez. S01'in kapanışı için bu test güvenli davranışı bekleyecek şekilde gerçek Windows/native sürücüyle tekrar kurulacaktır. [E03, R08]

### 7.3 Yayınlama Ve Geri Dönüş Protokolü

DB ve ayrı blob ağacını tek `rename` ile atomik yaptığını iddia etme. Hedef: uygulama seviyesinde maintenance kilidi, ön doğrulama, dayanıklı restore journal ve DB'nin en son görünür kılınmasıyla başarısız işlemde önceki runtime'ı korumaktır.

- Aktif job/process/DB bağlantısı varken restore başlamaz. Bütün MCP entrypoint'leri maintenance/restore journal kontrolünü DB açmadan önce uygular. Başka kullanıcının sürecini zorla kapatma yoktur.
- Backup/target köklerinin çakışması, path traversal, cross-drive escape, junction/symlink üzerinden dışa çıkış ve dosya-dizin çakışması hedef veri değişmeden reddedilir.
- Stage DB ve blob'ları hedefle aynı volume'daki owned staging alanlarında oluştur; bütünlüğü doğrula. Backup kaynağının kendi baytlarını değiştirme.
- Var olan doğru immutable blob reuse edilir. Aynı path'te farklı içerik veya özel dosya varsa kör overwrite yoktur. Yeni blob'lar önce tamamlanır; eski DB bu sırada korunur.
- Journal en az `PREPARED`, `BLOBS_READY`, `OLD_DB_PRESERVED`, `NEW_DB_PUBLISHED`, `VERIFIED`, `COMMITTED` aşamalarını ve owned path/hash'lerini taşır. Journal state geçişleri durable yazılır; dosya yazımı başarı döndü diye disk dayanıklılığı kanıtlanmış sayılmaz.
- Hedef DB/WAL/SHM, quiesce sonrası tutarlı biçimde korunur. Çalışan veya durumu bilinmeyen DB'nin WAL'ı silinmez. Stale WAL eski veriyi yeni DB'ye oynatmamalı; bunun çözümü güvenli yayın sırasını bozmamalıdır.
- Önceki DB kopyası korunmadan silme yoktur. DB en son değiştirilir, tekrar açılıp FK/integrity/blob zinciri doğrulanır. Hata olursa eski DB/konum geri gelir; yeni eklenmiş owned blob'lar journal'a göre temizlenir veya karantinada kalır.
- Crash sonrası entrypoint journal'ı okuyup son sağlam generation'a döner ya da tamamlanmış yeni generation'ı doğrular. Yarım restore ile müşteri işi başlatılmaz. Recovery de başarısızsa durum `RESTORE_RECOVERY_REQUIRED`; eski veri silinmez.
- Eski backup ve rollback verileri otomatik geniş temizlikle silinmez; retention yalnız sahipliği ve referanssızlığı kanıtlanan owned veriler için işler.

EACCES/EPERM, disk dolu, EEXIST, rename başarısızlığı, her journal sınırında hard-kill, stale WAL/SHM, açık bağlantı, malformed manifest ve GC yarışları gerçek/native testlerle kapanır. Ürün backup/restore'unu sınamak için kullanıcının asıl GPU veya asıl runtime DB'si üzerinde hata enjeksiyonu yapılmaz. Disk-full senaryosu kontrollü fixture/fault injection ile sınanır; kullanıcının diski gerçekten doldurulmaz veya genel izinleri değiştirilmez.

## 8. Maven Ölçümü, Test Kalitesi Ve Report06

### 8.1 Etkin Build Planı

Statik POM taraması hızlı ön bilgidir. Parent/pluginManagement/profile/toolchain ve custom source/test root gerçeği mümkünse güvenilen frozen kopyada Maven'in etkin modelinden alınır; executable ve profile kimliği kayda geçer. `help:effective-pom` çıktısı varsayılan modele taşınmaz ve secret redaksiyonundan geçer. Model/config çözümleme Maven eklentisi çalıştırabileceğinden G1'den önce gerçek müşteri Maven'i başlatma. [D06, D07]

Reactor root, concrete target (module + source set + FQCN + path) ve test kapsamı bütün aşamalarda aynı sözleşmeden gelir. `-pl/-am` yalnız doğru upstream closure'ı ekler; küçük pilot tüm GPU testlerini sessizce açmaz. Upstream modülde hedef testin olmaması ile hedef modülde sıfır test ayrılır. `failIfNoTests=false` gibi global gevşetmeyle hedefte hiç test çalışmaması gizlenmez.

Sadece kaynakta JUnit dependency adı bulunmadı diye başarılı/başarısız run uydurulmaz. Framework bilinmiyor, test yok, mevcut tüm testler skip, malformed XML, baseline failure ve timeout ayrı kayıtlanır. Baseline'ın gerçekten testsiz olması, test framework'ü mevcutsa ilk yeni testin üretilmesini engellememeli; mevcut test sayısı 0 açıkça korunmalı, yeni adayda discovery/run kanıtı zorunlu olmalıdır.

### 8.2 JaCoCo Ve Coverage

Mevcut uygun JaCoCo setup kullanılır. JaCoCo yoksa projenin POM'una dokunmadan, kurulu/kilitli uyumlu released plugin koordinatlarıyla `prepare-agent → unit test → report` invocation'ı desteklenen fixture'da doğrulanır. `argLine`, başka agent'lar, JVM flag'leri, forkCount, custom property ve modül raporları korunamıyorsa `BLOCKED_COVERAGE_CONFIGURATION` verilir; POM düzenleme veya coverage exclusion ile aşılmaz. [D08, D09]

Yalnız XML varlığı yeterli değildir: run ID, fresh execution output, module, source/class identity, agent data ve report hash'leri ilişkilendirilir. Eski target'tan XML veya başka sınıf/iş raporu kabul edilmez. Oranlar ham covered/missed sayaçlarından değerlendirilir; yuvarlama hedef kararını değiştirmez. Branch 0/0 gerçekten uygulanamaz ise N/A; veri yoksa UNAVAILABLE; ikisi farklıdır. Hedefin LINE/BRANCH gereksinimleri tek evaluator ile loop/DB/raporda tutarlıdır.

### 8.3 Test Kalitesi Ve Kabul

Model changeset'inde production/POM/exclusion, test silme/disable, aynı FQCN ile SUT shadowing, private reflection, gereksiz public API, assertion'sız/anlamsız assert ve duplicate davranış denemeleri reddedilir. Her üretilen testin derlendiği, keşfedildiği ve çalıştığı gerçek test kimlikleriyle doğrulanır.

Reviewer, davranışa bağlı boundary/exception/invalid input/dependency failure/state transition/side effect/idempotency/precision/date/collection senaryolarını inceler; yalnız regex ile assertion kelimesi saymak semantik kalite garantisi değildir. LLM review sonucu tek kabul otoritesi olmaz. PIT/mutation testing ileride değerlendirilebilir; bu göreve zorunlu yeni pipeline olarak eklenmez.

Adaylar aynı baseline kapsamına karşı ölçülür; mevcut geçen testin kaybı, yeni skip veya regresyon reddedilir. LINE artışı applicable BRANCH düşüşünü gizlemez. Accepted set checkpoint yayımlama başarıyla tamamlanmadan accepted kararının kalıcı pointer'ı ilerlemez. Final replay yalnız accepted setten temiz alanda yapılır.

Hedefe ulaşılamazsa son sağlam kazanım korunur; `TARGET_NOT_MET_PLATEAU`, `TARGET_NOT_MET_BUDGET` veya belirli blocker açıkça verilir. Gerçek bir testability engeli, modelin birkaç başarısız denemesinden kesin kanıtlanmış sayılmaz. Erişilemeyen satır/dal ve denenmiş yollar kanıt düzeyiyle ayrılır. Production refactoring bu işte açılmaz.

### 8.4 Rapor

Onaylı Report06 referansının tasarımı ve logo korunur; yeni HTML tasarımı üretilmez. Baseline/progress/final raporları aynı data contract'tan ve gerçekten mevcut olgulardan oluşur. Stage çalışmadıysa boş/sahte baseline üretilmez.

Rapor test sayıları, changed/added testler, LINE/BRANCH önce/sonra, run/test kimlikleri, command/toolchain, kapsam, kabul/red neden kodları, model/provider/variant kullanım metadata'sı, elapsed ve bilinmeyen usage ayrımını gösterir. Test-only gate ölçülmeden PASSED; unknown değer 0; boş model dizisi “model kullanılmadı” diye yorumlanmaz.

Rapor JSON/HTML/print/summary içinde modelin serbest risk, tavsiye, kalite veya kabul anlatısı bulunmaz. Dahili test planı/review artifact'leri aynı store'da ayrı kind/sensitivity taşır ve resmî export'a otomatik eklenmez. Ham düşünme metni saklanmaz.

Report06 offline, print, DOM, link, Unicode, binary asset ve relative path kontrollerinden geçer. Export hash/size/job/run/checkpoint/source eşleşmesi ve atomik publish marker doğrulanmadan iş COMPLETED/report-ready olamaz. Customer kaynak kodu içeren JaCoCo HTML ve raw loglar yalnız özel store/export'ta kalır.

## 9. Uygulama Paketleri, Dosya Sahipliği Ve Test Döngüsü

Yeni paket kimlikleri S00–S09'dur; eski P00–P10 kayıtları tarihsel olarak korunur. “Yeni dosya” path'leri bu görevde oluşturulacak hedeflerdir. Mevcut eşdeğer dosya bulunursa duplikasyon yerine onun kullanımı ve mapping kaydı tercih edilir.

### S00 — Sözleşme, Legacy Mapping Ve Tekrarlanabilir Başlangıç

**Değiştir:** `AGENTS.md`, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md`, `ai/acceptance/catalog.json`.
**Oluştur:** `ai/decisions/ADR-006-windows-native-and-agent-context.md`, `ai/acceptance/scope-windows-native-v1.json`, `ai/acceptance/legacy-to-006.json`.
**Girdi:** Bölüm 1 kararları, eski AC/RG/RT/PRO/N/PP yükümlülükleri. **Çıktı:** Kapsam hash'i, mapping ve Windows baseline kayıtları.

- [ ] Eski her obligation'ı sayıya güvenmeden tekil çıkar; PP01–PP46 dahil kapsanmış mı kontrol et. 274 sayısını doğrulanmış toplam veya 274 başarısız test gibi kullanma.
- [ ] Docker/macOS/Linux özgül maddeleri yukarıdaki kararlarla açıkça eşle; genel süreç/veri koruma karşılıklarını Windows kabullerine taşı. Kanıt eksiği olan geçerli maddeyi OUT_OF_SCOPE yapma.
- [ ] Suite manifestini çalıştırmadan incele. GPU pilot veya dış bağımlılıklı benchmark otomatik açılmasın. Kullanıcı kararıyla artık geçersiz Docker testlerini sessiz skip etmek yerine kaldırılan kontrat mapping'iyle aktif suite'ten emekliye ayır; tarihsel kayıtları koru.
- [ ] Gerçek Node 24+ ve lockfile ile Windows local baseline al; fixture/ortam eksikliği dahil her failure adı ayrı kayıtlı olsun. Başarısız testleri tekrar tekrar yalnız geçene kadar koşturup “temiz” deme.
- [ ] Mapping/schema için duplicate ID, yetkisiz scope kaldırma ve eksik replacement testlerini ekle. Yeni kapsam yok/bozuk iken gate varsayılan NO_GO kalsın.
- [ ] Geliştirme artifact özeti, bağımsız scope review ve başlangıç checkpoint'i oluştur.

**Kabul:** WN01–WN04, WN67–WN69. **Bağımlılık:** Yok. Ortak kayıtlar yalnız coordinator'a aittir.

### S01 — Backup Otoritesi Ve Hata Atomik Restore

**Değiştir:** `src/storage/lifecycle-ops.ts`, `src/storage/retention-gc.ts`, `src/mcp/stdio-entry.ts`, gerekirse `src/storage/storage.ts`.
**Oluştur:** `src/storage/restore-journal.ts`, `tests/unit/p08-backup-authority.test.ts`, `tests/integration/wn-restore-atomicity.test.ts`.
**Koruyarak genişlet:** `tests/unit/fin11-lifecycle-ops.test.ts`, `p08-lifecycle-escape.test.ts`, `p08-restore-stale-wal.test.ts`, `p08-upgrade-restore.test.ts`.
**Girdi:** Mevcut BackupResult/RestoreResult API ve E03 patch. **Çıktı:** Doğrulanmış snapshot otoritesi ve recovery-aware restore.

- [ ] Patch'in orijinal 19 senaryosunu native Vitest/better-sqlite3 ile önce mevcut kodda çalıştır; önceki adapter sayısını kopyalama.
- [ ] Hedef blob path'inde dosya/dizin çakışması oluştur; restore hatası sonrası hedef DB içeriği ve önceki artifact'lerin değişmediğini bekleyen kırmızı test ekle.
- [ ] Bölüm 7 backup düzeltmesini ve journal/maintenance yayın protokolünü uygula. Restore recovery kontrolünü entrypoint'te DB açılışından önce bağla.
- [ ] Journal aşamalarının her birinde gerçek child-process hard-kill uygula; açılışta yalnız eski veya tamamen doğrulanmış yeni generation görüldüğünü doğrula.
- [ ] Blob pinning/GC, stale WAL, açık bağlantı, EEXIST/EPERM/disk-full, path escape ve hash/size karşılaştırmalarını doğrula.
- [ ] Odak: `npm.cmd exec -- vitest run tests/unit/p08-backup-authority.test.ts tests/unit/p08-lifecycle-escape.test.ts tests/unit/p08-restore-stale-wal.test.ts tests/unit/p08-upgrade-restore.test.ts tests/unit/fin11-lifecycle-ops.test.ts tests/integration/wn-restore-atomicity.test.ts`.
- [ ] Bağımsız reviewer sonrası gerçek Windows sonuçlarıyla checkpoint oluştur; sıfır zorunlu fail/skip olmadan S01 VERIFIED değildir.

**Kabul:** WN05–WN13. **Bağımlılık:** S00. S02 ile yalnız ortak entrypoint değişikliği sıralanarak paralel olabilir.

### S02 — Windows Native Runner Ve Docker'ın Kaldırılması

**Değiştir:** `src/runners/maven-runner.ts`, `src/runners/runner-factory.ts`, `src/orchestration/job-dispatcher.ts`, `src/application/services.ts`, `src/configuration/config-schema.ts`, `config-loader.ts`, `runtime-paths.ts`, `src/domain/errors.ts`.
**Oluştur:** `src/runners/windows-process-supervisor.ts`, `src/runners/native-toolchain.ts`, `tests/integration/wn-native-runner.test.ts`, `tests/unit/wn-command-contract.test.ts`.
**Aktif ürün/suite'ten kaldır veya emekliye ayır:** `src/runners/docker-runner.ts` ve onun test/kurulum bağımlılıkları; eski Markdown kanıtları silinmez.
**Girdi:** NativeRunPlan. **Çıktı:** `NativeToolchainResolver.resolve(...)` ve `WindowsProcessSupervisor.run(plan, signal)` üzerinden normal MCP run.

- [ ] Docker yüklü olmayan, PATH'te bash/PowerShell olmayan Windows fixture'ında normal başlangıcı doğrulayan kırmızı test ekle. Docker komutunu çağıran sentinel test mutlaka başarısız saysın.
- [ ] Bölüm 5'in executable/JDK/settings çözümlemesini uygula; model ve Maven env allowlist'leri ayrı olsun. Yerel onaylı Maven settings'i credential içeriyor diye eski Docker blocker'ını verme.
- [ ] `cmd` quoting ve malicious property/path sentinel regresyonlarını gerçek Windows'ta çalıştır; desteklenmeyen girdide spawn yapılmadığını doğrula.
- [ ] Runner'ı baseline/candidate/final ve readiness araçlarının **tamamına** bağla. Yalnız `MavenRunner` sınıfı yazıp dispatcher'ı Docker'da bırakma.
- [ ] Timeout/cancel/process loss, bounded log ve `close` drain testlerini geç; unrelated Node/Java süreçlerinin hayatta kaldığını doğrula.
- [ ] Eski runner config/job migration davranışını test et; bozuk/unsupported config sessiz varsayılanla devam etmesin.
- [ ] Odak: `npm.cmd exec -- vitest run tests/unit/wn-command-contract.test.ts tests/integration/wn-native-runner.test.ts`; typecheck/build ve bağımsız review ile kapat.

**Kabul:** WN14–WN24. **Bağımlılık:** S00. Docker/WSL/PS veya admin yükleme yan işi yoktur.

### S03 — Tam Envanter Ve Güvenilir Source Snapshot

**Değiştir:** `src/discovery/source-snapshot.ts`, `src/discovery/java-inventory.ts`, `src/application/inventory-query.ts`, `src/application/services.ts`, `src/domain/tool-schemas.ts`.
**Oluştur:** `src/discovery/file-inventory.ts`, `tests/integration/wn-inventory.test.ts`.
**Girdi:** Proje kökü, scan generation/cursor. **Çıktı:** InventoryScanResult, file metadata ve ayrı build snapshot manifest.

- [ ] `.git/.mvn/.env/node_modules/target/build`, 64 MiB üstü binary, hidden dosya, Unicode, symlink/junction loop ve erişilemeyen dizin fixture'larını ekle. Hiçbiri sessiz kaybolmasın.
- [ ] Metadata walk ile source/copy filtresini ayır. `.mvn` ve relative parent build girdilerini koru; yeni Maven target'ı eski output'tan temiz olsun.
- [ ] Streaming hash, resumable scan cursor, partial/hata durumları ve paginated `files` query ekle. Boyut nedeniyle bütün scan'i gerçek dışı “tam” gösterme.
- [ ] Input dosyası copy sırasında değişirse snapshot reddedilsin. Özgün klasörde hiçbir cleanup/write yapılmasın.
- [ ] Incremental refresh'te değişmeyen parser çıktısının yeniden kullanılmasını ve silme/rename değişikliğinin görünmesini doğrula.
- [ ] Odak: `npm.cmd exec -- vitest run tests/integration/wn-inventory.test.ts`; reviewer metadata/context/snapshot kapsamlarının ayrılığını doğrulasın.

**Kabul:** WN25–WN31. **Bağımlılık:** S00, S04 veri kontratı. Schema ve services ortak dosyaları iki ajan aynı anda değiştirmez.

### S04 — SQLite Proje Kimliği, Agent Task Kayıtları Ve Resume

**Değiştir:** `src/storage/project-repository.ts`, `migrations.ts`, `inventory-repository.ts`, `job-repository.ts`, `src/orchestration/checkpoint-store.ts`, `lease-manager.ts`, `recovery-manager.ts`, `src/domain/job-contract.ts`.
**Oluştur:** `src/domain/agent-contracts.ts`, `src/storage/agent-task-repository.ts`, `tests/integration/wn-project-identity.test.ts`, `tests/integration/wn-agent-recovery.test.ts`.
**Girdi:** Bölüm 6'daki kimlik ve AgentTaskContract. **Çıktı:** Schema migration, atomik task/attempt claim/complete ve kalıcı recovery.

- [ ] Bölüm 4.2 tiplerini ve runtime doğrulama şemalarını `src/domain/agent-contracts.ts` içinde önce tanımla; S03/S05 aynı export'ları kullanır, kendi kopyasını yaratmaz. Aynı ada sahip farklı root/remote projelerin karışmaması, aynı remote farklı checkout ve case/alias fixture'larını ekle.
- [ ] Ada göre lookup'u kaldır; geriye uyumlu migration ile eski UUID/job ilişkilerini koru. Belirsiz tarihsel proje birleşmesini otomatik onarma.
- [ ] File scan ve task/attempt ilişkilerini migration'a ekle; mevcut worker_attempts verisiyle gereksiz duplikasyon yaratma.
- [ ] `claimTask`, `recordAttempt`, `completeTask` işlemlerini kısa transaction + lease/fence/revision doğrulamasıyla uygula. Görev/attempt input digest'i stale iken tamamlanma reddedilsin.
- [ ] İki gerçek process'te aynı job/task claim, expired owner, checkpoint CAS ve accepted blob corruption testleri ekle.
- [ ] Farklı modelle açık onaylı resume, session kaybında aynı task/yeni attempt ve bütçenin sıfırlanmaması testlerini gerçek DB/disk ile doğrula.
- [ ] Odak: `npm.cmd exec -- vitest run tests/integration/wn-project-identity.test.ts tests/integration/wn-agent-recovery.test.ts tests/unit/p03-checkpoint-identity.test.ts`; schema upgrade/backup entegrasyonu S01 ile birlikte geçsin.

**Kabul:** WN32–WN42. **Bağımlılık:** S00/S01. S01 sürerken yalnız salt okunur tasarım/fixture hazırlığı paralel yapılabilir; gerçek store migration ve paket entegrasyonu S01 doğrulanınca başlar.

### S05 — Gerçek Subagent Orkestrasyonu Ve Context Bütçesi

**Değiştir:** `src/workers/opencode/worker-client.ts`, `worker-server-manager.ts`, `worker-config.ts`, `role-prompts.ts`, `model-schemas.ts`, `profile-reader.ts`, `src/orchestration/job-dispatcher.ts`.
**Oluştur:** `src/orchestration/agent-scheduler.ts`, `src/workers/opencode/context-provider.ts`, `agents/aitest-explorer.md`, `agents/aitest-architect.md`, `agents/aitest-developer.md`, `agents/aitest-reviewer.md`, `tests/integration/wn-agent-orchestration.test.ts`.
**Girdi:** S04'ün `src/domain/agent-contracts.ts` export'ları üzerinden AgentTaskContract + scoped artifact/context refs. **Çıktı:** Ayrı session/attempt kimlikli AgentTaskResult. JSON agent/permission tanımları yalnız kurulu sürümle doğrulanarak owned runtime config'e yüklenir.

- [ ] Ayrı parent/child session, role/model propagation, yanlış task/session ref, empty final, intermediate tool event, truncated/invalid JSON ve cancellation için deterministik protocol testleri ekle.
- [ ] Kurulu OpenCode sürümünü/OpenAPI şemasını kaydet. Mevcut HTTP adapter'ını uyumlu biçimde genişlet; SDK veya deneysel task alanı sırf örnekte var diye eklenmesin. Structured output alan adı ve sonucun yeri contract testle doğrulansın.
- [ ] Native OpenCode agent/session modelini kullan. MCP scheduler görev DAG/bütçe/iş otoritesidir; her subagent'ın yeniden bütün işi planlaması veya recursive task açması engellensin. İlk sürüm delegation depth 1.
- [ ] İlk geliştirme/pilot için max 2 eşzamanlı model isteği, max 1 aktif Maven run uygula. Nested hidden retry'lar bütçeyi atlamasın.
- [ ] Context provider kaynak/ref/path/job/hash sınırlarını doğrulasın. Büyük class gövdesini 12k karakterde sessiz kesme; ilgili metot/test/dependency aralıklarını manifestle paketle, daha fazla bağlam gerekiyorsa sınırlı okuma iste.
- [ ] Nihai response'un gerekli çıktı alanları ve tam changeset server tarafında private artifact'e alınsın; reasoning/thinking metni ve credential içerikleri saklanmasın. Coordinator'a dönen bütün teslimat zarfı max 6 KiB özet+ref olsun; uzun path/bulgu listeleri de artifact ref ile gösterilsin. Kod artifact'i summary sınırına uydurmak için kısaltılmasın. Tokenizer yoksa bytes gerçek ölçüm, token sayısı yalnız etiketlenmiş tahmin veya null olarak kaydedilsin.
- [ ] Developer ve Reviewer farklı gerçek oturum olsun. Model istatistiği input/output/cached usage geldiği ölçüde kaydedilsin; gelen değeri uydurma. Eksik context/bütçede incomplete sonucu başarıya çevrilmesin.
- [ ] Odak: `npm.cmd exec -- vitest run tests/integration/wn-agent-orchestration.test.ts`; gerçek onaylı model session kanıtı S08'de ayrıca alınır.

**Kabul:** WN43–WN52. **Bağımlılık:** S03/S04 kontratları. Runtime agent definitions GPU Fusion checkout'una izinsiz yazılmaz.

### S06 — Native Maven Baseline, Coverage Ve Iteration Doğrulaması

**Değiştir:** `src/orchestration/build-plan.ts`, `candidate-loop.ts`, `job-dispatcher.ts`, `src/discovery/pom-discovery.ts`, `target-resolver.ts`, `src/coverage/jacoco-parser.ts`, `coverage-math.ts`.
**Oluştur:** `tests/integration/wn-maven-coverage.test.ts` ve gerekli küçük sentetik Maven fixture'ları.
**Girdi:** NativeRunPlan, frozen concrete targets, baseline inventory. **Çıktı:** Fresh baseline/candidate/final evidence ve accepted checkpoint.

- [ ] Gerçek tek modül ve çok modül, custom root, parent/profile'dan gelen JUnit/JaCoCo, aynı FQCN farklı modül fixture'larını ekle.
- [ ] Etkin Maven planı ve onaylı settings/toolchain ile çözülen source/test/report yollarını tek kontrata bağla.
- [ ] `.mvn` dahil korunan build kimliğini baseline/candidate/final karşılaştırmasına bağla. Orijinal checkout target'ını kullanma.
- [ ] Mevcut JaCoCo ve desteklenen POM-değiştirmeyen CLI instrumentation yolunu test et. Sıfır testli baseline ile framework eksikliği ayrı kalsın; ilk üretilen test gerçekten keşfedilsin.
- [ ] Exit0+XML failure/error, all-skipped, malformed/stale XML, hedef test yokluğu, argLine/forkCount uyumsuzluğu, lost baseline test ve wrong-module evidence negatiflerini kapat.
- [ ] Shared iteration/repair/deadline ve accepted cumulative set'i yeni agent scheduler ile birleştir; retry/reset bütçe çoğaltamasın.
- [ ] Odak: `npm.cmd exec -- vitest run tests/integration/wn-maven-coverage.test.ts tests/unit/w03-baseline.test.ts tests/unit/p06-effective-scope.test.ts tests/unit/w04-evaluator.test.ts`; gerçek mvn/JUnit/JaCoCo kanıtı zorunlu.

**Kabul:** WN53–WN60. **Bağımlılık:** S02–S05. Dispatcher/candidate-loop değişimleri tek entegrasyon sahibi tarafından sıralanır.

### S07 — Report06, Kurulum Ve Gerçek Hazır Olma

**Değiştir:** `src/reporting/report-generator.ts`, `report-projection.ts`, `evidence-collector.ts`, `report-data-contract.ts`, `src/mcp/stdio-entry.ts`, `scripts/install.mjs`, `verify-install.mjs`, `uninstall.mjs`, `mcp-handshake-smoke.mjs`, ilgili Windows belgeleri.
**Oluştur:** `tests/integration/wn-report-install.test.ts`, gerekirse owned agent config installer.
**Girdi:** Native run/agent metadata ve trusted final evidence. **Çıktı:** Aynı Report06 tasarımında gerçek rapor; Docker'sız temiz Windows install/upgrade/uninstall.

- [ ] Native command, non-zero test sayısı, missing usage, N/A branch, multi-target ve failed/blocked durumlarını gerçek report data fixture'larına ekle.
- [ ] Normal MCP sonucu ile DB/JSON/HTML/summary/print tutarlılığını doğrula; AI anlatısı hiçbir resmî yüzeye sızmasın.
- [ ] Gerçek browser ile offline/print/link ve logo/reference hash kontrolü. Browser bulunamıyorsa gerçek browser kanıtı NOT_RUN, string testini browser testi diye adlandırma.
- [ ] Temiz Windows'ta `npm.cmd ci`/build/native driver, gerçek OpenCode kayıtlı entry, correct config/DB ve scoped role yüklemesini doğrula. Kurulu opencode config'i wholesale ezilmesin.
- [ ] MCP handshake, model readiness ve Maven readiness ayrı statüler olsun. Docker yokluğu artık hata değildir; missing JDK/Maven/model gerçek blocker'dır.
- [ ] Upgrade ve uninstall kullanıcı config/store/blob'larını korusun; yalnız ürün sahipliği/hash'i kanıtlı install öğeleri silinsin. Rollback yeniden kaynak sürüme dönmekle DB'yi kör downgrade etmek değildir.
- [ ] Odak: `npm.cmd exec -- vitest run tests/integration/wn-report-install.test.ts`; gerçek browser ve Windows install kanıtları bağımsız review ile bağlansın.

**Kabul:** WN61–WN66. **Bağımlılık:** S01/S02/S05/S06.

### S08 — GPU Fusion İçin Kontrollü Pilot Ve Kullanıcı Doğrulaması

**Ürün tarafında oluştur:** `docs/pilot/windows-native-pilot.md`, `scripts/pilot-windows-native.mjs` yalnız maintainer harness gerekiyorsa. Script public varsayılanında customer path/endpoint/model secret içermez; bunları özel onay kaydından alır.
**Müşteri tarafında değişiklik:** Yok; output repository dışındaki owned alandadır.
**Girdi:** G1 onay kaydı ve seçilmiş gerçek target. **Çıktı:** Aynı job'a bağlı gerçek OpenCode/model/Maven/JaCoCo/Report06 pilot paketi.

- [ ] Önce yalnız metadata/kaynak incelemesiyle ilk tam envanteri oluştur; model/Java/Maven çalıştırma ve GPU'nun tüm dosyalarını prompt'a yükleme yoktur.
- [ ] Küçük, dış DB/servis gerektirmeyen bir sınıf öner. Gerçek FQCN/modül dosya okunarak çıkarılır; `PaymentService` gibi örnek isim uydurulmaz.
- [ ] G1 için kullanıcıya target, baseline test kapsamı, JDK/Maven/profile/model binding, budget ve workspace özetini göster. Kullanıcının seçimini bekle.
- [ ] G1 sonrası aşağıdaki pilot limitleri içinde **normal MCP** yolunu kullan: project_inspect/query → test_start → status → pause/resume → result. İç helper'ı çağırarak handler/dispatcher eksikliği örtülmez.
- [ ] Baseline, sınırlı üretim ve accepted checkpoint'ten sonra kontrollü kesinti/resume yap. Hard-kill hata enjeksiyonu müşteri asıl çalışma alanında değil owned pilot süreç/store alanında olsun.
- [ ] Model değişimi testi istenirse onaylı ikinci role/model binding ile aynı job'dan sürdür; yeni job açıp resume olmuş sayma.
- [ ] Rapor ve patch kullanıcıya sunulur; G2 onayı olmadan özgün checkout'a testler dahi yazılmaz. Sonrasında yeni sınıflara veya paket geneline otomatik yayılma yoktur.

**Kabul:** WN70–WN75. **Bağımlılık:** S01–S07 ve G1. S08 başarılı olsa da production GO otomatik değildir.

### S09 — Kapanabilir Kabul Manifesti, Tam Regresyon Ve Yayın Kararı

**Değiştir:** `scripts/release-verify.mjs`, `release-digest.mjs`, `write-build-stamp.mjs`, `ai/acceptance/catalog.json`, durum/handoff kayıtları.
**Oluştur:** `tests/integration/wn-release-gate.test.ts`, `ai/handoffs/2026-10-12-windows-native-006-handoff.md`. Gerçek private evidence manifesti runtime store'dadır; public repo yalnız redakte, hash'li ref taşır.
**Girdi:** Scope mapping, WN ve retained/replaced legacy kabul sonuçları, gerçek Windows/pilot kanıtları. **Çıktı:** İmzalanmamış/yayınlanmamış durumu da açık olan yerel/full kabul kararı.

- [ ] Yeni scope'u `--scope windows-native-v1` parametresiyle destekle. Bu parametre bu görevde uygulanacaktır; bugün varmış gibi kullanılmaz. Varsayılan full gate onaylı current scope'u çözer, yoksa NO_GO. Bilinmeyen flag/scope, değersiz `--manifest` veya çelişen modlar non-zero hata verir; argümanlar sessiz yok sayılmaz. `--local` yalnız local kalır; `--manifest` ve `--print-identity` davranışı korunur.
- [ ] Partial manifest `NOT_RUN`, `BLOCKED`, `FAILED`, `PASSED` kayıtlarını saklayabilsin. Geçerli partial manifest ≠ full PASS. Eksik kanıt nedeniyle manifest hiç üretmeyip bütün işleri baştan kaybetme. Ham kanıtlar immutable kalır; birikimli manifestin her sürümü önceki manifest hash'ine bağlı yeni bir revision'dır.
- [ ] Her PASSED kaydını gerçek test ID/predicate, exit, artifact hash/bytes, run/job/commit/tree/build/toolchain/scope identity ile doğrula. Tek bir genel logu ilgisiz maddelere kopyalamak veya salt passed:true kabulü yoktur.
- [ ] Scope removal/replacement onay hash'i yoksa reddet. Docker/macOS özgül OUT_OF_SCOPE artık Windows GO'yu bloke etmez; kritik restore/resume/coverage kanıtı eksikse kapsam dışı gösterilemez.
- [ ] Evidence manifest ve hash listesi kendi input digest'ine girerek döngü yaratmasın. Aynı release candidate source/build sabitlemesinden sonra evidence al; sonradan kod değişirse etkilenen kanıtı invalid yap ve tekrarla. Kaynak diff'ini yalnız mtime ile değerlendirme.
- [ ] Bütün aktif Windows suite'i, typecheck/build/lint, fixture/native/browser/install ve onaylı pilot kanıtı son aday build'e bağlansın. Önceden geçen odak suite'i tam suite yerine koyma.
- [ ] Bağımsız final reviewer scope/diff/reproducible evidence incelesin. Release gate teknik GO verse bile publish/tag/registry/signing ayrı kullanıcı işlemidir.

**Kabul:** WN67–WN69, WN76–WN80 ve bütün retained/replaced legacy yükümlülükleri. **Bağımlılık:** S00–S08.

### 9.1 Paket Bağımlılıkları Ve Paralellik

```text
S00
 ├─ S01 backup/restore → S04 kimlik/task şeması → S03 envanter
 └─ S02 native runner
                      S03 + S04 → S05 subagent
          S02 + S03 + S04 + S05 → S06 ölçüm
                   S01 + S02 + S05 + S06 → S07
                            S01..S07 + G1 → S08
                                      S00..S08 → S09
```

`migrations.ts`, `services.ts`, `job-dispatcher.ts`, `stdio-entry.ts`, `config-schema.ts` ve kabul kayıtlarının her an tek yazarı vardır. Paralellik bu dosyalarda merge çatışmasını kullanıcıya bırakmak değildir. Bağımsız agent kendi küçük branch/worktree'sinde değiştirir; coordinator taban SHA'yı kontrol edip sıralı entegre eder. Runtime GPU test üretiminde Git commit kullanmadan ayrı owned candidate dizinleri kullanılır.

## 10. Pilot Kapıları Ve Varsayılan Bütçeler

### G0 — Ürün Görevinin Uygulanması

Kullanıcının bu dosyayı uygulama talimatı ürün kodu ve sentetik Windows kabul testlerini açar. Bu görüşmedeki araştırma talebi G0 değildir. G0 verilince her küçük ürün paketi için tekrar “devam edeyim mi” sorulmaz; yalnız yetki/scope/donanım veya geri alınamaz işlem sınırında durulur.

### G1 — Gerçek Projede İlk Maven/Model Çalıştırması

İlk read-only GPU Fusion envanterinden sonra kayıtlı onay gerekir. Onay şunları sabitler:

| Alan | Pilot varsayılanı |
| --- | --- |
| Proje | Kullanıcının verdiği `C:\innova\projeler\gpu-fusion`; varlığı ve gerçek kimliği yerelde doğrulanır |
| Üretim kapsamı | Tek Java sınıfı; tek hedef modül, yalnız gereken upstream build closure |
| Hedef | Kullanıcının onayladığı LINE/BRANCH yüzdesi; seçilmemiş hedefi %90 gibi uydurma |
| Aday limiti | 3 logical candidate |
| Repair limiti | Aday başına en fazla 1; shared attempt bütçesinden düşer |
| Model istek limiti | Roller ve protocol/JSON repair dahil toplam 10; gizli provider retry ayrıca sayılır veya gözlemlenemiyorsa bu sınırın kanıtlanamadığı belirtilir |
| Eşzamanlılık | En fazla 2 model isteği; 1 Maven run |
| Wall-clock limiti | Toplam 30 dakika; bu süre bir teslimat tahmini değil yürütme bütçesidir |
| Tek Maven koşusu | En fazla 10 dakika; toplam deadline daha erkense o uygulanır |
| Model | Mevcut onaylı yerel profil; başka sağlayıcıya otomatik geçiş yok |
| Kaynak politikası | Original read-only uygulama politikası; owned snapshot'ta test-only |
| Dış sistem | Canlı DB/servis/üretim credential'ı gerektirmeyen unit test; ihtiyaç çıkarsa pilot durur |
| Çıktı | Report06, JSON, ham kanıtlar, patch ve checkpoint; otomatik apply/commit/push yok |

Bütçe küçük projeye uymuyorsa genişletme kullanıcı kararıdır; “hedefe mutlaka ulaş” gerekçesiyle limitsiz devam yoktur. Baseline build plugin/profile'ı dış sistem işi yapıyorsa sırf goal `test` diye risksiz kabul edilmez. Ajan önerisi, kullanıcı onayı yerine kullanılamaz.

### G2 — Testleri Özgün Checkout'a Uygulama

Ayrı kullanıcı onayı; job/checkpoint/patch/source digest ve izinli test path'lerine bağlıdır. Pilotun sonucu yalnız patch olarak bırakılabilir. Kullanıcı müdahaleleri değişmişse yeni diff kontrolü yapılır. Git yazımı bu onaydan da otomatik çıkmaz. G2 bu görevin teknik kapanışı için zorunlu değildir; kullanıcının testleri incelemesi ve onay/ret kaydı zorunludur.

### G3 — Production Yayın

Windows full gate ve kullanıcı pilot değerlendirmesi başarılı olduktan sonra bile yayın ayrı karardır. Tag/publish/deploy/imza anahtarı üretme veya registry hedefi tahmin etme yoktur. Bu belge production GO değildir.

## 11. Zorunlu Kabul Matrisi — WN01–WN80

Bu tablo sonuç değil beklentidir. Her satırın ayrı predicate'i, test adı/path'i, komut/run ref'i ve kanıt seviyesi kaydedilir. `UNIT`, `INTEGRATION_LOCAL`, `WINDOWS_RUNTIME`, `LIVE_PILOT`, `USER_REVIEW` ayrı tutulur. Stub/fake model yalnız protocol testini kanıtlar.

| ID | Sorumlu | Beklenen güvenli davranış / test |
| --- | --- | --- |
| WN01 | S00 | 005 görevi hash korunarak arşivlenir; kullanıcı dosyası ve mevcut branch değişiklikleri korunur. |
| WN02 | S00 | Docker/macOS/Linux özgül her legacy ID onaylı mapping taşır; geçerli genel korumalar replacement alır. |
| WN03 | S00 | PP01–PP46 dahil legacy ID envanteri tekildir; eksik/mükerrer/kanıtsız kapatma reddedilir. |
| WN04 | S00 | G0 olmadan uygulama, G1 olmadan müşteri Maven/model ve G2 olmadan apply başlatılmaz. |
| WN05 | S01 | Backup artifact listesi canlı DB değişse bile oluşmuş snapshot DB'nin READY setiyle eşleşir. |
| WN06 | S01 | Manifestten çıkarılan READY blob, yanlış hash/size ve çelişkili tekrar valid backup olamaz. |
| WN07 | S01 | complete:false/bozuk JSON/wrong backup ID/unsupported schema, complete marker varlığıyla geçmez. |
| WN08 | S01 | DB integrity ve FK hataları ayrı yakalanır; sorgu/okuma hatası başarılı sonuç üretmez. |
| WN09 | S01 | Restore EEXIST blob çakışmasında önceki hedef DB içerik ve artifact'leri korunur. |
| WN10 | S01 | EPERM/disk-full/rename hata noktalarında eski generation korunur; yarım yeni state görünmez. |
| WN11 | S01 | Restore journal'ın her kritik aşamasındaki hard-kill sonrası eski veya tümü doğrulanmış yeni generation açılır. |
| WN12 | S01 | Açık DB/aktif job restore'u bloke eder; stale WAL/SHM yeni DB'ye veri oynatamaz, canlı WAL silinmez. |
| WN13 | S01 | Backup/restore path escape/junction/cross-drive/GC race, kullanıcı veya başka job verisini silemez/ezemez. |
| WN14 | S02 | Docker/WSL/PowerShell/bir Unix shell olmadan normal Windows MCP fixture'ı native Maven başlatır. |
| WN15 | S02 | Açık executable veya installed mvn.cmd seçimi doğru; wrapper tercihi ve JDK/Maven sürümleri kanıtlıdır. |
| WN16 | S02 | PowerShell gerektiren wrapper sessiz açılmaz; alternatif araç zinciri açık kullanıcı tercihiyle seçilir. |
| WN17 | S02 | Boşluk/Unicode/parantez/& path'leri bozulmaz; property/path injection sentinel'i çalışamaz. |
| WN18 | S02 | PATH/Path, JAVA_HOME/toolchains/settings/profile farkı etkin run kimliğinde görünür; global env değişmez. |
| WN19 | S02 | Native Maven onaylı yerel settings'i kullanabilir; secret model/rapor/public artifact'e taşınmaz. |
| WN20 | S02 | ENOENT/spawn error/nonzero exit/timeout/cancel ayrı sınıflanır; stdout/stderr close öncesi kabul yazılmaz. |
| WN21 | S02 | 8 MiB üstü log bounded kalır; UTF-8 chunk sınırları korunur ve truncation açık kayıtlıdır. |
| WN22 | S02 | Cancel/timeout owned Maven/JVM çocuklarını kapatır, bağımsız IDE/Node/Java süreçlerine dokunmaz. |
| WN23 | S02 | Hard-kill/orphan/PID reuse'da yabancı süreç öldürülmez; geç gelen eski run sonucu trusted yapılmaz. |
| WN24 | S02 | Eski docker/host_dev_only config ve job, sessiz native fallback yapmaz; explicit migration/revision gerekir. |
| WN25 | S03 | .git/.mvn/node_modules/target/build/.env/hidden/binary dahil tam metadata envanteri vardır. |
| WN26 | S03 | Büyük veya desteklenmeyen dosya envanterde kalır; required build input hash'siz kabul edilmez. |
| WN27 | S03 | Permission denied, junction loop ve dış kök reparse point partial/error olarak görünür; sahte tam scan yoktur. |
| WN28 | S03 | İlk scan yarıda kesilince cursor/generation üzerinden devam eder; duplicate kayıt üretmez. |
| WN29 | S03 | Incremental scan rename/delete/content değişimini bulur; değişmeyen parser işi gereksiz tekrarlanmaz. |
| WN30 | S03 | Inventory digest ile source/build digest ayrıdır; gerekli .mvn girdisi snapshot'ta, eski target/.git yürütme dışında kalır. |
| WN31 | S03 | Model context'i ilgili bounded kesitlerle sınırlıdır; secret/binary/full inventory prompt'a taşınmaz. |
| WN32 | S04 | Aynı adlı farklı projeler ayrıdır; aynı remote farklı checkout'lar location bazında ayrılır. |
| WN33 | S04 | Windows path case/junction alias ve remote credentials normalize edilirken yanlış proje birleştirme yapılmaz. |
| WN34 | S04 | Eski DB migration'ı UUID/job/accepted geçmişini korur; belirsiz tarihsel identity reparent edilmez. |
| WN35 | S04 | Project query/resume/artifact fetch wrong-project/location/job kimliklerini reddeder. |
| WN36 | S04 | İki gerçek process aynı job/task için tek owner olur; kaybeden yaşayan owner'ı bozmaz. |
| WN37 | S04 | Expired lease renew/publish yapamaz; geç/iptal/stale generation sonucu best pointer'ı değiştiremez. |
| WN38 | S04 | Source/POM/profile/config/toolchain değişikliği resume'da yakalanır; old/new kanıt karışmaz. |
| WN39 | S04 | Accepted blob/hash/run/parent bozuksa trusted resume reddedilir; sağlam son set korunur. |
| WN40 | S04 | Kapanıp açılınca aynı job/target cursor/accepted set/kalan bütçe/task durumundan sürer; tamamlanmış iş tekrarlanmaz. |
| WN41 | S04 | Session kaybında aynı task altında yeni attempt izlenir; yeni job veya sahte aynı session id üretilmez. |
| WN42 | S04 | Açık onaylı model değişimi aynı job'da revision/attempt lineage taşır; eski provenance değişmez. |
| WN43 | S05 | Explorer/Architect/Developer/Reviewer ayrı gerçek session kimlikleri ve role binding ile yürür. |
| WN44 | S05 | Kurulu OpenCode API/permission/structured-output alanları contract testle doğrulanır; bilinmeyen alan fallback gizlemez. |
| WN45 | S05 | Nested delegation, üçüncü izinsiz model isteği ve ikinci Maven run bütçe/scheduler tarafından engellenir. |
| WN46 | S05 | Input manifest task/job/source/role/model hash bağını taşır; başka session/task çıktısı reddedilir. |
| WN47 | S05 | Coordinator teslimatı max 6 KiB summary+ref'tir; tam test kodu artifact'te ve hash'i doğrulanabilir kalır. |
| WN48 | S05 | Tüm sohbet/context aktarılmaz; omitted/chunked bağlam açık görünür ve gerekli ek aralık kontrollü alınır. |
| WN49 | S05 | Empty final/intermediate tool/truncated JSON/provider error/real timeout/cancel farklı sonuçlardır. |
| WN50 | S05 | Retry/repair/model error istekleri durable attempt ve global bütçede sayılır; yeniden başlatma bütçeyi sıfırlamaz. |
| WN51 | S05 | Runtime ajan genel shell/Git yazımı/diğer MCP'lere erişemez; only-scoped context ve changeset üretir. |
| WN52 | S05 | Reviewer developer'dan bağımsızdır; usage bilinmiyorsa null, fabricated cost/token yoktur. |
| WN53 | S06 | Single/multi-module, same FQCN, custom root ve inherited profile/JUnit/JaCoCo doğru concrete scope ile çalışır. |
| WN54 | S06 | Target-only test seçimi upstream build ile uyumludur; hedefte no-test global failIfNoTests gevşetmeyle saklanmaz. |
| WN55 | S06 | Framework yok/no-tests/all-skipped/baseline failed/unstable farklıdır; testsiz ama desteklenen projede ilk yeni test gerçekten çalışır. |
| WN56 | S06 | JaCoCo agent+run+report POM değişmeden çalışır veya açık blocker verir; argLine/başka agent/fork ayarı ezilmez. |
| WN57 | S06 | Stale/wrong-module/source/class/run XML'i, malformed veya inconsistent sayaç geçersizdir. |
| WN58 | S06 | Anlamlı assertion/edge/exception/regresyon/duplicate ve SUT-shadow/private-reflection kapıları gerçek test koduna uygulanır. |
| WN59 | S06 | Ham counter threshold, branch-only gain, branch 0/0 ve missing metrik kararı loop/DB/raporda aynıdır. |
| WN60 | S06 | Final replay yalnız accepted setten gelir; hedef altında sonuç success değildir ve son sağlam kazanım korunur. |
| WN61 | S07 | Test/run/change sayıları non-zero gerçek fixture'da DB/JSON/HTML/status/summary'de eşleşir. |
| WN62 | S07 | Report06 reference/logo korunur; gerçek offline/print/DOM/link ve binary evidence testleri geçer. |
| WN63 | S07 | Model narrative veya doğrulanmamış PASSED gate resmî rapor/JSON/print/summary'ye giremez. |
| WN64 | S07 | Export missing/hash/size/path/job/run/checkpoint/source uyuşmazlığı READY/COMPLETED'ı engeller. |
| WN65 | S07 | Temiz Windows registered OpenCode entry doğru config/DB/role/native readiness ile çalışır; handshake tek başına hazır demek değildir. |
| WN66 | S07 | Upgrade/restore/uninstall kullanıcı config/store/blob'larını korur; ownership/hash dışı dosya silinmez. |
| WN67 | S00/S09 | Yeni scope default full/local gate ayrımı açık; eski Docker/macOS maddeleri blocker değildir; bilinmeyen/değersiz CLI argümanı sessiz geçmez. |
| WN68 | S00/S09 | Yetkisiz scope kaldırma, eksik replacement, duplicate/missing ID ve wrong evidence level reddedilir. |
| WN69 | S00/S09 | Partial manifest saklanır ama NOT_RUN/BLOCKED/FAILED required predicate varken full NO_GO'dur. |
| WN70 | S08 | GPU Fusion ilk scan sonucu gerçek root/modül/dosya sayısı ve error/partial bilgisiyle kullanıcıya sunulur. |
| WN71 | S08 | G1 onayındaki tek gerçek sınıf/model/bütçe dışına çıkılmaz; canlı DB/servis gerektiren iş açılmaz. |
| WN72 | S08 | Gerçek OpenCode → normal MCP → Windows Maven → JaCoCo → Report06 zinciri aynı job/run kimliğinde kanıtlanır. |
| WN73 | S08 | Pilot pause/oturum kesintisi sonrası aynı job'dan devam eder; model değişimi yalnız onaylı revision'dır. |
| WN74 | S08 | GPU original production/POM/mevcut test/dirty/untracked bytes ve Git durumu ürün tarafından değiştirilmez; commit/push yoktur. |
| WN75 | S08 | Kullanıcı gerçek test/coverage/rapor çıktısını inceler; onay/ret kayıtlıdır, otomatik kapsam büyütme/apply yoktur. |
| WN76 | S09 | Son adayın full Windows suite/typecheck/build/lint ve bağımsız final review kanıtları günceldir. |
| WN77 | S09 | Wrong commit/tree/build/lockfile/toolchain/scope, sahte passed:true ve değişmiş hash/bytes kanıtı geçmez. |
| WN78 | S09 | Test/log/identity içindeki secret ve customer code public Git'e taşınmaz; private raw evidence erişilebilir kalır. |
| WN79 | S09 | Fixture smoke, pilot kazanımı, kullanıcı incelemesi ve full release sonucu ayrı statülerdir. |
| WN80 | S09 | GO yalnız bütün geçerli required predicate'ler kanıtlı ve P0/P1 release kusuru kapalıysa verilir; otomatik yayın yapılmaz. |

## 12. Doğrulama Komutları Ve Kanıt Kontratı

### 12.1 Windows Ürün Doğrulaması

Aşağıdaki mevcut scriptler ürün repository'sinde çalıştırılır; GPU Fusion kökünde değil. S00 aktif suite kapsamını uzlaştırmadan dış bağımlılıklı/pilot testleri topluca başlatma.

```text
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run lint
npm.cmd test
node scripts/release-verify.mjs --local
node scripts/release-verify.mjs --print-identity
```

S09 uygulanınca yeni scope için hedef komut biçimi:

```text
node scripts/release-verify.mjs --scope windows-native-v1 --manifest <ozel-store-icindeki-gercek-manifest-yolu>
```

`<...>` gerçek yerel path ile çözülmesi gereken yer tutucudur, çalıştırılmış komut değildir. GPU pilot komutu burada uydurulmaz; concrete target ve plan G1'de belirlenir.

Tam suite sonucu “640 geçti ama 4 ortam hatası var” ise full suite başarılı değildir. Ortam gereksinimi düzeltilebilir veya gerçekten kullanıcı kararıyla kapsam dışıysa mapping yapılır. Zaman aşımı/flaky testte kök neden ve ayrı tekrar kaydı gerekir; test silme/assert kaldırma veya sadece test timeout'unu artırarak yeşile zorlama yoktur.

### 12.2 Her Run İçin Asgari Kanıt

`task_id/job_id/run_id/attempt_id`, ürün source SHA ve dirty tree digest, scope/contract/config/toolchain digest, fixture veya private müşteri snapshot kimliği, komutun redakte argv listesi, Windows/JDK/Maven/Node/OpenCode/driver sürümleri, UTC başlangıç/bitiş, monoton süre, exit/cancel/timeout, tekil test kimliği ve sayaçlar, stdout/stderr artifact path/hash/bytes, JaCoCo raw counters ve freshness/provenance, accepted checkpoint ve export manifest referansı.

Secret-aware digest kullanılmalı; düşük entropili secret'ları public hash listesi üzerinden ifşa etme. Ham env/config/log modele veya public'e topluca taşınmaz. Hash doğrulaması içerik bütünlüğüdür; çalıştırılmamış testin yürütme kanıtı değildir.

### 12.3 Başarı Seviyeleri

| Etiket | Anlam |
| --- | --- |
| `IMPLEMENTED` | Kod/değişiklik var; yürütme kanıtı tek başına yok |
| `LOCAL_VERIFIED` | Gerçek ürün bağımlılıklarıyla ilgili deterministik test geçti |
| `WINDOWS_RUNTIME_VERIFIED` | Gerçek Windows process/DB/Maven/browser/install kanıtı ilgili kapsamda geçti |
| `PILOT_EXECUTED_TARGET_NOT_MET` | Gerçek pilot çalıştı fakat hedef sağlanmadı; otomatik ürün veya hedef başarısı değildir |
| `PILOT_TARGET_MET` | Onaylanan tek hedef ve kalite kapıları fresh final replay'de geçti |
| `USER_REVIEW_ACCEPTED` | Kullanıcı gerçek pilot çıktısını kabul etti |
| `WINDOWS_RELEASE_GO` | Yeni scope ve bütün retained/replaced kabul gereksinimleri kanıtlı; yayın yetkisi ayrıca gerekir |
| `NO_GO` | Geçerli required kanıt/bütünlük/kalite/pilot gereksinimi eksik veya başarısız |

## 13. Devam Kaydı, Bitiş Ve Kapsam Dışı İşler

### 13.1 Kalıcı Handoff

Her anlamlı değişiklik sonunda `ai/checkpoints/` ve tek güncel handoff özetinde şunlar bulunur: görev/sürüm/hash; gerçek branch/HEAD/dirty digest; tamamlanan paket ve WN/legacy kanıt ref'leri; değişen dosyalar; başarısız test ve kök neden; bekleyen onaylar; korunmuş kullanıcı dosyaları; Git yetkisi/sonuçları; tek sonraki somut iş; local/pilot/full kararı.

Geliştirme hafızası repo içindeki `ai/` altında küçük/redakte kayıtlarla tutulur. Müşteri runtime job/checkpoint/agent task/ham kanıtlar merkezi SQLite + repo dışı store'dadır. Bunlar ayrı yaşam döngüleridir; birini diğerinin yerine kullanma. Ana context kapanınca `ai` handoff ve runtime task kimlikleri birbirine referansla aynı işi yeniden buldurur.

### 13.2 Görevin Teknik Bitişi

S00–S09'un geçerli kabulleri ve mapped legacy gerekleri tamamlanmış; Docker'sız Windows normal yolu gerçek kanıtlı; subagent oturumları/context sınırları gerçek; SQLite proje/iş ayrımı ve aynı job resume doğrulanmış; başarısız restore önceki veriyi koruyor; Report06 fresh factual veriyi gösteriyor; G1 pilotu ve kullanıcı incelemesi kayıtlı olmalıdır.

Zorunlu platform veya pilot onayı/kanıtı yoksa uygulanabilir ürün işleri tamamlanır ve kalan durum açık bırakılır; “tam ürün hazır” denmez. Hedefe ulaşamayan pilotun dürüst rapor vermesi olumlu bir davranış kanıtıdır, ancak kullanıcı başarısız pilotu kabul etmeden üretim güveni veya target success'e çevrilemez.

### 13.3 Kapsam Dışı

Docker/container/proxy ağı yeniden yazımı; macOS/Linux son-kullanıcı desteği; WSL zorunluluğu; CI/Jenkins açma; kapsamlı model benchmark kampanyası; üretim kaynak/POM refactoring; müşteri Git yazımı; yeni UI/HTML tasarımı; Zekam'ı veya başka repository'leri bu görevde yeniden inşa; vektör veritabanı/embedding sistemi; otomatik update, signing, tag/publish/deploy.

Bağımsız reviewer'ın bulduğu bu kapsam içindeki yeni kritik kusur gizlenmez; ilgili pakete ve kanıt zincirine bağlanır. İlgisiz yeni özellik “hazır olalım” gerekçesiyle eklenmez. Görev metni uygulayıcı tarafından scope genişletmek için değiştirilmez.

## 14. Araştırma Kaynakları Ve Kanıt Referansları

Erişim/inceleme tarihi: **12 Ekim 2026**. Kaynaklar implementasyon yönünü destekler; kullanıcının kurulu binary'si veya GPU Fusion davranışı için test kanıtı değildir. Repo path'leri belirtilen commit'e aittir. Dokümanların canlı sürümü değişebilir; uygulama sırasında sürüm ve şema kaydedilir.

### 14.1 Kullanıcı Girdileri

- **E01:** `2026-10-12-production-005-chat-export.md`, özellikle kullanıcı kararları ve kalan kabul maddeleri. Sonraki sohbet kararları Docker/native/pilot/yeni görev açısından bu eski kaydın önündedir.
- **E02:** Önceki `AKTIF_GOREV.md`, Bölüm 0–9; bütün PR/PP ve arşiv kapsamı korunup mapping yapılır. Hash tablosu Bölüm 0.2'dedir.
- **E03:** `P08_BACKUP_DUZELTME_VE_KANITLAR.zip`: README, `evidence/results.json`, `evidence/open-restore.log`, patch ve test dosyaları. Adapter kanıtı ile native acceptance ayrımı korunur.

### 14.2 İncelenen Ürün Kaynakları

Bütün R kaynakları şu tabana bağlıdır:
`https://github.com/mehmet-karacan/ai-test-engineering/blob/3b1916ed6f35f0c674cc459b30ca9f5614af9b94/`

| Ref | Path / ilgili yer | Bu görevde kullanım |
| --- | --- | --- |
| R01 | `AGENTS.md` | Başlangıç, kullanıcı dosyaları ve Git standardı |
| R02 | `AKTIF_GOREV.md` — 005 sözleşmesi | Eski yasaklar/PR/PP ve scope mapping |
| R03 | `src/runners/runner-factory.ts`, `src/orchestration/job-dispatcher.ts` | Mevcut Docker/default/host_dev_only bağları; native dönüşüm |
| R04 | `src/runners/maven-runner.ts` — `run`, `killTree`, `resolveMavenExecutable` | Windows launcher, env, process/log sonucu |
| R05 | `src/discovery/source-snapshot.ts` — `walk`, `buildManifest`, `copyTo` | Envanter dışlamaları, hash ve snapshot kapsamı |
| R06 | `src/storage/project-repository.ts` — `ensureLocation` | Ada göre proje lookup'u ve location ilişkisi |
| R07 | `src/workers/opencode/worker-config.ts` | Kapalı runtime araçlar ve rol politikası |
| R08 | `src/storage/lifecycle-ops.ts` — `createBackup`, `verifyBackup`, `restoreBackup` | Mevcut backup/restore ve P08 patch farkı |
| R09 | `src/orchestration/build-plan.ts` — `buildPlan`, `assertCoverageConfigured`, `createFrozenWorkspace` | Modül seçimi, coverage ve frozen workspace |
| R10 | `scripts/release-verify.mjs` — mod seçimi, mandatory files, build identity | Local/full ve yeni scope/manifest uzlaştırması |
| R11 | `src/configuration/runtime-paths.ts`, `src/storage/storage.ts`, `src/mcp/stdio-entry.ts` | Merkezi state.db/store ve native driver temeli |
| R12 | `ai/PROJECT_STATE.md`, son 005 handoff ve acceptance kayıtları | Tarihsel test/pilot/release durumu; yeni kanıt sayılmaz |
| R13 | `src/domain/tool-schemas.ts` | Mevcut inspect/query/start/status/resume/result/apply sözleşmeleri |

R01/R02/R04–R10/R12'nin ilgili güncel bölümleri ve R13 bu hazırlıkta tekrar okundu. R03/R11 için bu sohbette aynı main durumu üzerinde alınmış kaynak okumaları da kullanıldı; bütün repo dosyalarının satır satır yeniden denetlendiği iddia edilmez.

### 14.3 Resmî Dış Kaynaklar

- **D01 — OpenCode Agents:** https://opencode.ai/docs/agents/ — primary/subagent, role model seçimi, permission ve child session kullanımı.
- **D02 — OpenCode Server / SDK:** https://opencode.ai/docs/server/ ve https://opencode.ai/docs/sdk/ — public session API, OpenAPI, health/auth, structured output. Kurulu sürümün gerçek request/response şeması ayrıca test edilir.
- **D03 — Gerçek OpenCode Task Uygulaması:** https://github.com/anomalyco/opencode/blob/ec3ae17e/packages/opencode/src/tool/task.ts — `parentID`, role/model, abort ve session devam davranışı; Git blob `af130a70d919336bc6666b0c7d0ccbb1c9192d49`. Bu ref örnek incelenen commit'tir, kullanıcının kurulu sürümü veya latest diye sunulmaz.
- **D04 — Node.js 24 Child Process:** https://nodejs.org/download/release/latest-v24.x/docs/api/child_process.html — Windows `.cmd`, kabuk sınırı, `spawn`/`close` ve process olayları.
- **D05 — Apache Maven Wrapper:** https://maven.apache.org/tools/wrapper/ — wrapper sürüm/indirimi ve Windows only-script türünün PowerShell kullanımı.
- **D06 — Maven Configuration / Toolchains:** https://maven.apache.org/configure.html ve https://maven.apache.org/guides/mini/guide-configuring-maven.html — `.mvn`, settings, kullanıcı repository/proxy ve JDK toolchain bağlamı.
- **D07 — Maven Multi-Module / Surefire:** https://maven.apache.org/guides/mini/guide-multiple-modules.html ve https://maven.apache.org/surefire/maven-surefire-plugin/examples/single-test.html — reactor kapsamı ve hedefli test çalıştırma.
- **D08 — JaCoCo prepare-agent:** https://www.jacoco.org/jacoco/trunk/doc/prepare-agent-mojo.html — agent property/argLine ve JVM argümanlarının birlikte korunması.
- **D09 — JaCoCo Maven Plugin:** https://www.jacoco.org/jacoco/trunk/doc/maven.html — agent gerekliliği, test forking ve rapor zinciri. Trunk sürümünü otomatik bağımlılık olarak alma.
- **D10 — Microsoft taskkill:** https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill — PID bazlı süreç ağacı sonlandırma; OS sandbox vaadi değildir.
- **D11 — SQLite Online Backup:** https://sqlite.org/backup.html — tutarlı backup snapshot'ı; ayrı dosya blob seti uygulamanın sorumluluğudur.
- **D12 — SQLite WAL:** https://sqlite.org/wal.html — WAL/bağlantı ve aynı host'ta çalışma koşulları; job checkpoint'inden farklıdır.
- **D13 — SQLite Integrity / FK:** https://sqlite.org/pragma.html — `integrity_check`, `foreign_key_check` ve ayrı bütünlük yükümlülükleri.
- **D14 — Microsoft Job Objects:** https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects — owned-process toplu yaşam döngüsü için olası Windows mekanizması; bu görevin varsayılan bağımlılığı değildir.
- **D15 — SQLite Transactions:** https://sqlite.org/lang_transaction.html — kısa transaction ve writer yarışları için temel semantik.

### 14.4 Belge Hazırlama Kontrolleri

Aşağıdaki işaretler yalnız bu dokümanın tutarlılık incelemesini gösterir. Ürün paketleri ve WN testleri çalıştırılmış veya kabul edilmiş değildir.

- [x] Windows/native kararı ile eski host yasağı arasında çelişki kalmadı.
- [x] Docker/macOS dışlaması gerçek veri/ölçüm doğruluğu kabullerini kaldırmadı.
- [x] Tam metadata envanteri, modele tüm dosyaları yüklemek veya hepsini execute etmekle karıştırılmadı.
- [x] Geliştirme subagent'ları ile ürün runtime subagent'ları ve Verifier ayrıldı.
- [x] Backup patch'i uygulanmış/native test edilmiş gibi sunulmadı; restore kusuru açıkça göreve bağlandı.
- [x] Her paket dosya/sözleşme, bağımlılık, test ve kapanış kanıtı taşıyor.
- [x] G0/G1/G2/G3, ürün/müşteri repo ve public/private artifact sınırları açık.
- [x] Partial evidence, missing evidence ve full başarı ayrı; yeni scope gerçekten kapanabilir.
- [x] Kullanıcının gerçek pilot doğrulaması olmadan production onayı yok; otomatik yayın yok.

**Sonraki adım:** Kullanıcı bu dosyayı uygulama için onayladığında S00'dan başla; geçmişte düzeltilmiş işi doğrula ve koru. Bu dosyanın üretilmiş olması herhangi bir paketin, pilotun veya yayının yapıldığı anlamına gelmez.
