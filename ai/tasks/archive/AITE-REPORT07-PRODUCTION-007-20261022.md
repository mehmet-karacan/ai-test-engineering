# AKTIF_GOREV: AI Unit Test Engineering Kurumsal Rapor Entegrasyonu

## 1. Görev sözleşmesi

| Alan | Değer |
| --- | --- |
| Görev kimliği | `AITE-REPORT07-PRODUCTION-007` |
| Hedef repository | `https://github.com/mehmet-karacan/ai-test-engineering` |
| Kullanıcı tarafından onaylanan arayüz | `innova_ai_unit_test_raporu_sky.html` |
| Referans dosyası SHA-256 | `02486f47a9ba845b0d486cfdf558f63bc57aec27f821897d668d4786069c810c` |
| Referans boyutu | `55362` bayt, UTF-8 |
| Mevcut üretim raporlama bileşenleri | `src/reporting/report-generator.ts`, `src/reporting/report06-renderer.ts`, `src/reporting/report-data-contract.ts`, `src/reporting/report-projection.ts` |
| Onaylanan kapsam | Mevcut unit test mühendisliği MCP'sinin HTML raporunun yeni kurumsal görsel tasarıma taşınması, gerçek kanıtla beslenmesi ve testlerle doğrulanması |
| Kapsam dışında | Yeni bağımsız web uygulaması, canlı pilot, AI model değişikliği, customer production/POM değişikliği, CI etkinleştirme, diğer ürün özelliklerini yeniden tasarlama |

**Talimat:** Bu görev kullanıcı tarafından özel olarak onaylanmış yeni rapor entegrasyonudur. Ekli HTML görsel ve etkileşimli kabul referansıdır, üretim veri modeli veya gerçek test sonucu değildir. Bu görevin yerine başka bir plan yazmakla yetinme; repository içinde uygulamayı tamamla ve doğrula.

## 2. Başlangıç ve mevcut işin korunması

1. `AGENTS.md` başlangıç protokolünü uygula. `AKTIF_GOREV.md` (repository kökündeki mevcut sürüm), `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md`, en son `ai/checkpoints/` ve `ai/handoffs/` kayıtlarını oku. Branch, HEAD, remote, `git status` ve dirty/untracked dosyaları denetle.
2. 20 Ekim 2026 öncesinde `AGENTS.md`, kökteki aktif görevi `AITE-WINDOWS-SUBAGENT-PILOT-006` olarak tarif ediyordu; bu görevin gerçekten kapandığını varsayma. Bu yeni kullanıcı talimatını önceki kabul kanıtlarının üstüne yazma. Eski aktif görev içeriğini byte-korunmuş, hash'i belgelenmiş ayrı bir arşive al; `ai/PROJECT_STATE.md` içinde kapsam değişimini kaydet. Mevcut onay, eksik Windows kabullerini PASSED yapmaz. Çakışan sahipli değişiklik/iş varsa kayıpsız çalışılamadığı noktada dur ve bildir.
3. Görevin tesliminde repository kökündeki tek aktif görev adı `AKTIF_GOREV.md` olarak kalır. Eski görevin geçmişini veya Windows kapsamındaki release kanıtlarını silme. Gerekiyorsa `AGENTS.md` içindeki aktif görev referansını bu görevle tutarlı biçimde güncelle; tarihsel kayıtları bozma.
4. Önceki HTML referansını `docs/reporting/reference/innova_test_raporu_tasarim_06.html` yolunda **değiştirme**. Üretimdeki `report06-renderer.ts` eski HTML'den stil ve logo alıyor, bunun için tam dosya boyutu ve SHA-256 kontrolü yapıyor. Eski tasarıma sessizce müdahale etmek mevcut sözleşmeyi ve testleri kırar.
5. Bu paketteki `innova_ai_unit_test_raporu_sky.html` dosyasını ayrı, değişmez bir görsel kabul referansı olarak `docs/reporting/reference/innova_ai_unit_test_raporu_sky.html` yoluna ekle. Byte ve SHA-256 doğrulaması yap; sapma varsa kaynağı yeniden iste, referansı tahmini düzenleme. Dosyanın tek başına açılması, tasarım görsel incelemesi içindir.

## 3. Yeni raporun kesin kurumsal görünümü

- Üstte gerçek İnnova logosu, ürün başlığı birebir `AI Unit Test Engineering`, altında birebir `UNIT TEST & COVERAGE REPORTING` bulunmalı. `AI Test Engineering` veya genel `Test Report` bu alanların yerini almamalı.
- **Sistem/proje adı** ana başlıkta büyük ve açık görünmeli: örnekte `SKY`. Gerçek raporda bu değer doğrulanmış proje/job metadata'sından gelmeli. Tüm müşterileri `SKY` olarak sabitleme. Proje adı verisi yoksa sahte ad uydurma; kanıtlanmış proje yolu/basename veya `Veri yok` ve açık kaynak tanımını kullan.
- Sağ üstte `Revizyon`, `06`, `07`, `Tasarım`, `Prototype`, model sürümü veya test ortamına ait yanıltıcı bir etiket OLMAYACAK. İş kimliği, zaman ve commit gibi geçerli çalışma bilgileri rapor kimlik alanında ve yalnızca kayıtlıysa gösterilebilir.
- Nötr slate/gri tonlar, beyaz yüzey, ince bordürler, küçük anlamlı durum vurguları, kırmızı yalnız İnnova marka vurgusu. Aşırı gradient, glow, geniş sarı/yeşil yüzeyler, dekoratif rozetler ve çok katmanlı kart yığınları kullanılmasın.
- Bütün kullanıcıya görünen etiketler akıcı ve düzgün Türkçe olsun. Uzun tire, özellikle `U+2014` (em dash) ve `U+2013` (en dash), kullanıcıya görünen metinlerde ve rapor açıklamalarında kullanılmayacak. Cümleler doğrudan ve doğal yazılsın.
- Düzen, referans HTML ile aynı sırayı takip etmeli: `01. Genel Durum`, `02. Sınıf ve Test İncelemesi`, `03. Kalite ve Güvence Kontrolleri`, `04. Çalışma Geçmişi`, `05. Kanıt ve Teknik Kayıtlar`.
- `Genel Durum` bölümünde ilk ekranda yönetici, **işin gerçek çalışma durumu**, **en son doğrulanmış iterasyon**, **durma/engellenme nedeni**, **coverage hedef sonucu**, **test sonuçları** ve **devam edilebilirlik durumu** bilgilerini görebilmeli.
- Dört KPI: satır kapsamı, dal kapsamı, geçen/toplam test, yeni/güncellenen test. Her ölçümde geçerli pay ve payda; başlangıç varsa gerçek yüzde puan farkı. Kapsam özeti ve ilerleme grafiği yalnız ölçülmüş ara değerlerle çizilir; eksik iterasyona sahte nokta eklenmez.
- Geliştirici bölümü referanstaki iki sütunlu master-detail düzenini korumalı: solda sınıf arama/liste; sağda seçilen sınıfın satır, dal, eksik dal ve `Unit test kayıtları / Metot kapsamı / Kontroller / Kaynak ve kanıt` sekmeleri. Test adı tıklanınca kaynak, sonuç, hata/stack trace ve kanıt detayları modal içinde gösterilmeli. Gerçek veri yoksa anlamlı boş durum göster; test kodu, senaryo veya açıklama uydurma.
- **Sonsuza uzayan tablolar yasak:** sınıf, test, metot, kalite, iterasyon, model kayıtları, hata listeleri ve kanıtlar büyüdüğünde server/static-payload uygun pagination veya boyutu sınırlı scroll kullan. Örnek referanstaki sınıf sayfa boyutu 3, unit test sayfa boyutu 4, geçmiş sayfa boyutu 3; bunlar kabul edilen varsayılan görünümü oluşturur. Üretim büyük veride performans ve erişilebilirlik ile tutarlı sayfalama uygula. Kod ve stack trace bölgeleri kendi içinde kaydırılır. Tek testte binlerce satır raporun tüm sayfasını uzatmamalı.
- Responsive masaüstü/tablet/mobil, erişilebilir focus, tablo başlıkları, dialog klavye davranışı, boş ekran, filtre sıfır-sonuç, uzun sınıf/test adları ve yatay taşma senaryoları doğrulansın.
- PDF/yazdırma kullanıldığında ekran pagination'ı nedeniyle kayıtlar sessizce kaybolmasın: tam veri çıktısı hazırlansın veya açıkça kapsam beyanı yapılsın. Onaylı referansın yazdırma görünümü bütün örnek kayıtları gösterir. JSON dışa aktarımları HTML örnek verisini değil, gerçek job verisini referanslayan doğrulanmış export olmalı.

## 4. Veriye bağlama ve kurallar

### 4.1 Mevcut veri sözleşmesini incele

`ReportData`, `ReportTarget`, `ReportIteration`, `ReportStage` ve `ReportEvidence` alanlarını, bunları üreten artifact/evidence collector ve repo testleriyle birlikte izle. Raporda gösterilecek yeni bilgiler mevcut doğrulanmış kayıtlardan türetiliyor mu somut kaynakla tespit et.

- Proje/sistem adı ve modül, head/commit/snapshot, hedef sınıf, rapor üretim zamanı, job ID, koşu kimliği, son kabul edilen iterasyon, durma nedeni, gerçek durum, checkpoint kimliği ve geçerlilik durumu.
- Coverage sayaçları: JaCoCo XML'inden sınıf ve metot bazında ham `covered`, `missed`, `total` değerleri. Her hedef sınıfta ayrı `line`, `branch` eşik kontrolü; sıfır branch paydası yüzde 100 değil `Uygulanamaz`. Genel kapsamı sınıf yüzdelerinin aritmetik ortalamasından üretme. Eşik için yuvarlanmamış tam sayaç kullan.
- Test koşuları: Surefire/Failsafe veya kayıtlı doğrulanmış test kaynakları. `passed`, `failed`, `errors`, `skipped` ayrımı; `total` ile tutarlılık. Mevcut `ReportData.run_summary` alanında `failed` errors ile birleştiriliyorsa gerçeği varsaymadan gerekli typed/verified genişletmeyi yap; mevcut tüketicilere uyumluluğu koru.
- Test ekleme/güncelleme ve ilişki: kaydedilmiş patch/accepted set ve doğru test sınıfı ilişkisi. Test adı, `@DisplayName`, kaynak kodu ve assertion metni sadece doğrulanmış kaynak kaydından. İsimden ya da modelden senaryo açıklaması yaratma. Test başına coverage kanıtı yoksa gösterme.
- Devam durumu: job/checkpoint store gerçek snapshot bütünlüğü, dosya hash'leri ve desteklenen resume prosedürüyle doğrulanmışsa `Devam edilebilir`; kanıt eksikse `Doğrulanmadı`. `Tamamlandı`, `Hedefe ulaşıldı`, `Engellendi`, `Kesildi`, `İterasyon sınırı`, `Plateau` gibi durumları yalnızca gerçek olay kodlarından deterministik durum eşlemesiyle oluştur. Bir ölçümün eksik olması asla başarı anlamına gelmesin.
- Production/POM koruması: sadece gerçek karşılaştırma/gate kanıtı varsa `Korundu`; aksi halde `Doğrulanmadı` veya uygun durum. Model yorumundan güvenlik, kalite, risk puanı veya öneri üretme.
- Kanıtlar: kayıtlı ve dosyası doğrulanmış JaCoCo XML/HTML, Surefire XML, run log, checkpoint, patch ve hash bilgileri. Kaynak tipine göre görünür hata/ulaşılamazlık durumları. Artifact linkleri rapora göre güvenli ve taşınabilir olmalı; path traversal veya kullanıcının yetkisiz dizinlerine işaret eden link oluşturma.

### 4.2 Sözleşme sınırları

Mevcut facts-only `report-data-contract.ts` yasaklı narrative alanları korunacak. Eksik veri için `Veri yok`, yapılmayan kontrol için `Çalıştırılmadı`, uygulanamaz sayaç için `Uygulanamaz`, hatalı veri için `Geçersiz` ayrımı yapılacak. Sıfır bir değerdir, bilinmeyen verinin yerine kullanılmayacak. Test üretiminde kullanılan model metadata'sı kayıt olarak gösterilebilir, değerlendirme otoritesi veya rapor anlatısı olamaz.

Gereken alanların bugünkü `ReportData` içinde olmadığını doğrularsan: typed, geriye uyumlu, kaynağı belli bir veri sözleşmesi ekle. Bunlar elde edilemeyecekse UI üzerinde `Veri yok` göster, yeni veri varmış gibi davranma. Bazı arayüz sekmeleri beklenen veri henüz toplanmadığı için boş olabilir; bu bir demo fixture ekleme gerekçesi değildir.

## 5. Teknik entegrasyon yolu

1. `src/reporting/report-generator.ts` içindeki rapor üretim yolunun `buildReport06` çağrı noktalarını, mevcut `ReportData` üretim ve doğrulama akışını çıkar. Eski raporu kaldırmadan yeni, ayrı üretim renderer'ı ekle. Dosya adını repo konvansiyonuna uygun seç (`report07-renderer.ts` makul), fakat uygulama dosyası/iş mantığında `revizyon` ibaresi UI'a çıkmamalı.
2. Yeni renderer, tasarım HTML'indeki statik örnek kayıtları veya gömülü `preview-data` JSON'unu **üretime taşımayacak**. Referans yalnız CSS, marka, yerleşim ve etkileşim davranışını göstermek içindir. Tercihen üretim HTML'i server-side render edilen doğrulanmış job verisi ile oluştur, gerektiğinde inline, sınırlı client-side JS yalnız sunum/pagination etkileşimine hizmet etsin. No-JS durumda yönetici özeti kaybolmamalı.
3. Eski `Report06` referansının byte/hash sabitini, geçmiş arşivini ve önceki rapor kanıt zincirini bozma. Yeni referansın hash doğrulamasını eklersen aynı yanlış dosyaya veya istemsiz fallback'e sessiz geçişe izin verme. `npm run build`, `npm test`, mevcut rapor entegrasyon testleri ve release kontrollerinde regresyon yaratma.
4. Referansta örnek sınıf `HakedisHesaplamaService` ve proje `SKY` olması sadece temsili görünümdür. Unit test mühendisliği ürününün raporu herhangi Java/Maven projesinde gerçek ad, modül ve class FQN ile çalışmalı. UI'da örnek `22 test`, `%94` vb. hiçbir sayı hardcoded kalmamalı.
5. Çıktı offline HTML olmalı. CDN, dış font, çalışma anında internet, harici analitik veya özel API bağlantısı gerektirmemeli. İnnova logosu referanstaki özgün logo üzerinden korunmalı. Rapora bağlanan metin, yol, test adı, kod ve log dahil her alan için güvenli HTML escaping ve CSP/XSS önlemleri uygulanmalı.
6. HTML önizlemesinde var olan JSON export ve yazdırma kontrollerinin üretim karşılıkları gerçek veriyle çalışmalı. Uygun test çıktıları paket/manifest bağlantılarına bağlanabilir. Sessiz başarısız indirme veya uydurma artifact adresi yasak.
7. Eski 06 içindeki baseline/progress/final rapor mantığının gerçek kayıtlı aşamaları kaybolmayacak. Yeni ana sayfada ayrı segment zorunlu değil; proje özetiyle aşama detayları çatışmadan sunulsun. Kaydedilmeyen ara ölçüm/koşu oluşturulmasın.
8. Windows ortamında CMD + Node.js standart yolunu koru. CI/GitHub Actions otomatik etkinleştirilmesin; kurum içi pilot veya model çağrısı otomatik tetiklenmesin. Ürün deposundaki TypeScript/test kodu bu görev için değiştirilebilir, fakat müşteri production Java kaynakları, POM, coverage exclusion ve orijinal checkout değiştirilemez.

## 6. Doğrulama ve kabul kriterleri

**R07-01 Marka ve kimlik:** `AI Unit Test Engineering` ve `UNIT TEST & COVERAGE REPORTING` tam; İnnova logosu doğru; gerçek proje adı görünür; prototip/revizyon metni üretim görünümünde yok.

**R07-02 Durum doğruluğu:** Ulaşılan hedef, hedef altında sonlanma, iteration budget, plateau, kesinti, başarısız koşu, checkpoint bulunamaması ve data-unavailable ayrık test senaryolarına sahip.

**R07-03 Coverage:** Hem ham sayaçlar hem bps ölçümleri doğrulanır. Branch 0/0, eksik XML, aralıktaki artış ve hedef per-class geçişleri doğru. Yüzdeler yanlış yuvarlama/ortalama veya sentetik veriyle oluşmaz.

**R07-04 Test sonuçları:** Passed, failed, errors, skipped tutarlı; kısmi Surefire raporu durumda `UNAVAILABLE/INVALID` gibi açık gösterilir; yeni ve değişen test sayıları kabul edilmiş patch'ten hesaplanır.

**R07-05 Geliştirici akışı:** Sınıf arama, filtre, seçme, test/metot/quality/source sekmeleri, test detay penceresi gerçek verilerle çalışır. Uzun Java metot/test isimleri kırılmadan veya taşmadan görünür.

**R07-06 Pagination:** Örneğin 500 sınıf, 10.000 test ve yüzlerce iterasyon simülasyonunda ilk HTML yükü kontrol edilebilir; sınıf, test, metot, geçmiş ve log alanları sayfayı aşırı uzatmaz. Sayfalama sırasında filtre/sınıf değişiminde geçersiz sayfa index'i sıfırlanır. Mobilde tablo içerikleri kaybolmaz.

**R07-07 Kanıt ve güvenlik:** Doğrulanmış artifact linkleri açılır; kötü niyetli HTML/script/test adı ve `../` kaçış denemeleri çalışmaz; hatalı veya kayıp artifact doğrulanmış gibi sunulmaz.

**R07-08 Yazdırma/export:** Ekran pagination'ından bağımsız bütün doğrulanmış veri export edilebilir; çıktı eksikse kapsam açıkça beyan edilir. Printer-friendly mod içerik kaybı veya binlerce sayfalık boş alan oluşturmaz.

**R07-09 Geriye uyumluluk:** Eski rapor regresyon testleri PASS, 06 referansının SHA-256 değeri değişmemiş. Eski veri sözleşmesi okuyan akışlar kırılmamış.

**R07-10 Teslim:** İlgili unit/integration/UI smoke testleri ve mümkünse Chromium headless ekran görüntüleri ile görünüm doğrulanmış. `npm run build`, `npm test` ve repo'daki gerekli kontrollerin gerçek sonuçları kaydedilmiş. Doğrulama yürütülmediyse PASS yazma.

## 7. Tamamlama kayıtları

- Değişen kod ve dokümanlar, yeni rapor renderer'ı, yeni tasarım referansı, testler ve doğrulama çıktıları izlenebilir commit/diff ile sunulsun.
- `ai/checkpoints/`, `ai/handoffs/`, `ai/PROJECT_STATE.md` ve kabul matrisi gerekiyorsa güncellensin. Testlerin tamamı geçmeden `completed/production-ready` beyanı verme; kalan kanıtlar `NOT_RUN/NO_GO` olarak ayrı listelensin.
- Lokal Git kullanıcı adı `mehmet-karacan`, e-posta `karacan.mehmet@hotmail.com` olacak; global Git ayarına dokunulmayacak. Commit mesajları Türkçe ASCII olacak. Gizli kurumsal dosyalar, kullanıcı oturum kayıtları, veri tabanları ve runtime store public repo'ya eklenmeyecek.
- Rapor entegrasyonu bittiğinde kullanıcıya kısa, ölçülebilir kapanış ver: hangi dosyalar değişti, gerçek screenshot/smoke kontrolleri ne oldu, mevcut raporla uyum durumu, hangi kontroller çalıştı, nerede eksik var.

## 8. Başlama komutu

`AGENTS.md dosyasını oku ve içindeki başlangıç protokolünü uygula. Bu mesajla verilen yeni AKTIF_GOREV.md dosyasını tek onaylı görev olarak ele al. Önceki aktif görevi kayıpsız arşivleyip 06 referansını değiştirmeden AI Unit Test Engineering yeni rapor tasarımını gerçek raporlama akışına entegre et. Yalnız bu görevin sınırlarında çalış, deterministik gerçek veriye bağla, testlerini çalıştır ve sonuçlarını kanıtlarıyla raporla.`
