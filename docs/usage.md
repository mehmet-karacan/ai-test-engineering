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

Once [Windows kurulumu ve readiness dogrulamasi](installation.md) tamamlanmalidir. `test-engineering` skill'i installer tarafindan kullanici OpenCode dizinine kurulur; mevcut ozel dosya korunursa paket skill'iyle elle birlestirilir. Degisiklikten sonra OpenCode'u yeniden acin. Generation icin worker profili ve explicit `AITEST_WORKER_ENABLED=1` ayari gerekir; genel coverage taramasi model cagirmaz.

1. Yetkilendirilmis Java projesinde OpenCode'u acin.
2. Hedefinizi dogal dille soyleyin: "PaymentService icin coverage %90 olsun".
3. OpenCode, `test-engineering` skill yardimiyla typed tool'lari cagirir:
   - `project_inspect`: proje envanteri
   - `test_start`: kalici job baslatir, `job_id` doner
   - `test_status`: durumu sorgular
4. `test_result` gercek lifecycle/outcome/verification/apply durumunu, rapor yolunu, before/after sayaclarini ve kalan gap'leri verir.

## Kabul edilmis testleri asil projeye uygulama

`test_apply({job_id, project_root, mode:"preview"})` yazmadan plan hazirlar.
Plan proje kokunu, checkpoint_id/patch_digest kimligini ve yeni test
dosyalarini gosterir. `mode:"apply"` ayni checkpoint_id ve patch_digest ile
cagrilir; OpenCode insan onay formunda kabul ve `approved:true` gerekir.
Modelin yazdigi approval_reference onay degildir. Form destegi yoksa,
red veya iptal halinde kaynak dosyalarina yazilmaz.

Uygulama arka planda surer. Ayni job_id ve donen operation_id'yi
`test_status` / `test_result` application alanindan takip edin. APPLYING
tamamlandi demek degildir; APPLIED ancak tam test dogrulamasi PASS ise verilir.
Mevcut testler/POM/production dosyalari korunur, yalniz plandaki yeni testler
eklenir; var olan dosya ezilmez. Dogrulama uygulanan asil projenin
hash-dogrulanmis owned kopyasinda filtresiz tum Maven testleri ve JaCoCo
ile yapilir (`FULL_PROJECT_SNAPSHOT`); asil dizinde dogrudan Maven kosusu
iddiasi yoktur.

Rapor application bolumunde operation, asama, test toplam/PASS/failure/error/
skip sayilari, mevcut testlerin korunmasi, tum testlerin varligi ve hata/geri
alma nedeni ayrica verilir. Onceki generation sonucu ve hedef coverage
olcumleri korunur. Basarisiz/iptal dogrulama yalniz operation'in kendi
ekledigi ve degistirilmemis dosyalarini geri alir. CONFLICT veya
RECOVERY_REQUIRED kullanici degisikligi ya da tamamlanamayan cleanup'i
aciklar; eski operation icin `mode:"recover"` kullanilir. Retry yeni preview
ve yeni insan onayi ister. Onceki application alani olmayan raporlar gecerlidir.

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
| `test_apply` | apply onayi sonrasi yeni testler | evet | preview (varsayilan), insan formuyla apply, recover |

## Ciktilar

- Rapor: `<runtime>/jobs/<job-id>/reports/` (index.html, report.json, summary.txt, manifest.json)
- Blob'lar: `<runtime>/blobs/sha256/...`
- DB: `<runtime>/state.db`

Rapor dosyalari hedef kaynak reposuna yazilmaz.

## GPU Fusion ile OpenCode

OpenCode sohbetini C:/innova/projeler/gpu-fusion dizininden acin. Su istek yeterlidir:

> GPU Fusion genel coverage raporunu cikar, test yazmaya uygun dusuk coverage siniflarini oner. Ben secince test uret.

GPU kokunde birden fazla Maven projesi vardir; bu akis icin project_root C:/innova/projeler/gpu-fusion/gpu-backend olarak verilir. Arac birden fazla kok arasindan kendiliginden secmez. Onerilerden sinif secince test_start, coverage_scan_id ve tam FQN ile baslatilir. Secimden once model calismaz. Ayrik hedef gerekiyorsa coverage.percent satir, coverage.branch_percent dal hedefidir.

Yerel yonetim ekrani kullanici karariyla kaldirildi; npm run ui artik yoktur. Kurumsal HTML sonuc raporu korunur.
