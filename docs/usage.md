# Kullanim

## Kurumsal unit test raporu

Yeni islerin `reports/index.html` ciktisi onayli AI Unit Test Engineering tasarimini kullanir. Proje adi kayitli yolun son dizininden gelir; ornek SKY verisi eklenmez. HTML offline calisir; JSON indirme kayitli report.json ile byte-exact'tir. JavaScript kapaliysa yonetici ozeti ve ilk sayfalar gorunur, tam kayitlar JSON/kanit dosyalarindan alinir.

Sinif3, test4, gecmis3 kayitla sayfalanir. Source/stack trace onizlemeleri sinirlidir; tam icerik dogrulanmis kanit dosyalarindadir. Yazdirma tum kayitlari hazirlar; JavaScript kapali cikti kapsami acikca belirtilir. Gecmis olcum grafikleri yalniz hash/run kimligi dogrulanmis baseline ve final sayaclarini kullanir. Eksik metrik, resume kaniti ve class-test iliskisi tahmin edilmez. Yeni/guncellenen test KPI'i metot degil kabul edilmis test dosyasi sayisidir.

Gelistirme Chromium kabulunu calistirmak icin kurulu Playwright `node_modules` dizinini `AITEST_BROWSER_PACKAGES` ile belirtip build sonrasi `node scripts/report07-browser-smoke.mjs` calistirin. `AITEST_REPORT07_UI_OUTPUT` verilirse screenshot/PDF/result.json o private dizinde saklanir. Bu kontrol sentetik fixture kullanir; musteri Maven/model piloti baslatmaz.

## Genel JaCoCo raporu ve sinif onerileri

"Bu projenin genel JaCoCo raporunu cikar, dusuk coverage'li uygun siniflari oner; ben secince test uret" demek yeterlidir.

`project_coverage({project_root})` tum executable Maven modullerindeki mevcut testleri repository disindaki kopyada calistirir. Varsayilan esik LINE %80, en fazla 5 oneridir (`below_percent`, `recommendation_limit`). Bir ust dizinde tek Maven alt koku varsa o kok secilir; birden fazla aday varsa kullanicidan somut kok istenir. API hemen kalici job_id doner; `test_status` ve `test_result` ile izlenir.

`test_result.coverage_scan` genel sayaclari, fresh JaCoCo XML yollarini/hash'lerini, olculemeyen sinif sayilarini ve secilebilir FQN onerilerini verir. Native JaCoCo HTML raporu XML'in yanindaki `index.html` dosyasidir. Uygunluk deterministik bir heuristiktir; DTO/config/generated/abstract/nested veya moduller arasi ayni FQN onerilmez. Dusuk coverage verisi sadece gercek olcumden gelir. BRANCH sayaci yoksa null doner; %100 veya %0 uydurulmaz.

Oneriler hazirsa job `WAITING_INPUT/COVERAGE_ANALYZED` olur; worker/model veya aday test uretilmez. Kullanici secince mevcut `test_start` cagrisi tek class hedefi ve `coverage_scan_id` ile yapilir. Tarama raporu ve kaynak hash'i dogrulanir; baska proje, bozulmus artifact veya degismis kaynak yeni tarama gerektirir. Sinif secimi olmadan `test_start.targets` bos olamaz.

POM'da JaCoCo bulunmasi gerekmez: acik CLI modu sabit `org.jacoco:jacoco-maven-plugin:0.8.12:prepare-agent`, `test`, `org.jacoco:jacoco-maven-plugin:0.8.12:report` zincirini kullanir. Eksik neutral `.mvn` config dosyalari yalniz private execution kopyasinda olusturulur ve `execution_defaults` ile belirtilir. Musteri POM'u/testleri degistirilmez. Testler kapaliysa, baseline kiriksa, servis/bagimlilik eksikse veya fresh rapor yoksa sonuc typed failure'dir; dusuk coverage listesi verilmez. Basarisiz/kesilen tarama yeni `idempotency_key` ile yeniden baslatilir; completed scan yeniden generation'a resume edilmez.

## Normal test gorevi

1. Yetkilendirilmis Java projesinde OpenCode'u acin.
2. Hedefinizi dogal dille soyleyin: "PaymentService icin coverage %90 olsun".
3. OpenCode, `test-engineering` skill yardimiyla typed tool'lari cagirir:
   - `project_inspect`: proje envanteri
   - `test_start`: kalici job baslatir, `job_id` doner
   - `test_status`: durumu sorgular
4. Sonuc `READY_FOR_REVIEW` olarak sunulur: rapor yolu, before/after sayaclari, kalan gap'ler.

## Devam ve inceleme

| Talep | Davranis |
| --- | --- |
| "Kaldigin yerden devam et" | Ayni `job_id` ile kesilen yerden devam |
| "Durdur" | Yeni aday baslatmaz; durumu kaydeder |
| "Sonucu goster" | Son dogrulanmis ozeti getirir |
| "Bu projede ne yaptik" | Envanter ve run gecmisini sorgular |

## Arac ozeti

| Arac | Yazi | Idempotent | Aciklama |
| --- | --- | --- | --- |
| `project_inspect` | yok | evet | Envanter + preflight |
| `project_query` | yok | evet | Sinirli sorgu (view + cursor) |
| `test_start` | job kaydi | evet | Kalici job; idempotency key destekli |
| `test_status` | yok | evet | Durum + event'ler |
| `test_apply` | kullanici projesi | evet | Onayli degisiklik aktarimi (varsayilan kapali) |

## Ciktilar

- Rapor: `<runtime>/jobs/<job-id>/reports/` (index.html, report.json, summary.txt, manifest.json)
- Blob'lar: `<runtime>/blobs/sha256/...`
- DB: `<runtime>/state.db`

Rapor dosyalari hedef kaynak reposuna yazilmaz.
# Yerel kullanim ekrani

Depo klasorunde `npm run ui` calistirin ve tarayicida `http://127.0.0.1:4317` acin. Mevcut Node/JDK/Maven/OpenCode ve private config kurulumunu kullanir; ek web sunucusu gerekmez. Bu komut build alir ve ekrani baslatir. Sadece ekranin acilmasi analiz/model kosusu baslatmaz.

1. `pom.xml` iceren proje yolunu yazin veya kayitli projelerden secin.
2. **Genel kapsami analiz et** ile mevcut testleri ayri kopyada JaCoCo ile calistirin. Oneri esigi altindaki uygun siniflar listelenir.
3. Bir sinifi acikca secin. Satir/dal hedeflerini (varsayilan80/70) ve gerekirse `provider/model` kimligini girin. Dal hedefi kutusunu kaldirarak yalniz satir hedefi kullanabilirsiniz.
4. **Secili sinif icin test uret** ile isi baslatin. Gercek asama/olaylar otomatik yenilenir. Yuzde egri, dogrulanmis rapor hazir oldugunda gercek baslangic/son sayaçlarini gosterir; motorun kaydetmedigi ara yuzdeler uydurulmaz.
5. **Raporu ac** ve varsa **Test degisikliklerini ac** baglantilarini kullanin. Ozgun checkout'a otomatik uygulama yapilmaz. Sayfa yenilense de son is ve DB'deki gecmis bulunur; duraklamis/kesilmis is otomatik devam ettirilmez.

Calisma surerken terminali acik tutun; sunucuyu kapatmak calisan isi kesebilir. Sayfa kapatilsa da sunucu aciksa is surer. Port icin `AITEST_UI_PORT` kullanilabilir; dis ag adresine bind secenegi yoktur. Test uretimini ekranda da kapatmak icin `AITEST_WORKER_ENABLED=0` ayarlayin. Hedef yuzdesi iki ondaliga kadar kabul edilir; MCP'nin eski ortak `coverage.percent` girdisi aynen desteklenir, istege bagli `coverage.branch_percent` ayri dal hedefidir. Genel analizde gorulen skipTests/test bulunamadi veya ortam engelleri ekranda aciklanir; proje POM'u otomatik duzeltilmez.

Arayuz kabul testi: build sonrasi `AITEST_BROWSER_PACKAGES` Playwright iceren mutlak node_modules dizinini gosterecek sekilde `node scripts/local-ui-browser-smoke.mjs` calistirilir. Bu test sentetik HTTP backend'idir; customer/model piloti degildir.
