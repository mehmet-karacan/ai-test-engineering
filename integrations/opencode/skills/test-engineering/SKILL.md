---
name: test-engineering
description: Java projesinde yalniz test gelistirme; coverage hedefi, gercek Maven/JaCoCo olcumu, checkpoint'li devam. Kullanici hedef soylediginde bu araclari kullan.
---

# Test Engineering

## Gorevi tanimlama

Modele sabit bir meslek/persona atamak yerine kullanicinin istedigi sonucu,
ilgili proje/kaynak ve onceki kanitlari, beklenen teslimi ve kabul olcutlerini
netlestir. Model gorev icinde arastirma, analiz, tasarim, gelistirme ve inceleme
bilgisini birlikte kullanabilir; her beceri icin ayri model/oturum gerekmez.

Explorer/architect/developer/reviewer gibi kayit etiketleri o andaki sorumlulugu
anlatir. Bunlari modelin dusunme yetenegine yasak olarak yorumlama. Bagimsiz
inceleme isteniyorsa uygulama baglamindan ayri bir degerlendirme yap; etiketin
kendisi bagimsizlik veya kalite kaniti degildir.

Beklenen teslim (test degisikligi, davranis analizi, bulgu, gap/sonraki adim)
goreve uygun olsun. MCP TEST_ONLY ve worker JSON/arac/butce kurallari mevcut
isin kapsamidir; ana modelin genel yardim ve problem cozme yetkisini daraltmaz.

## Sohbet, proje ve kesinti baglami

Bu skill MCP test islerini yonlendirir. Ana OpenCode modelinin genel okuma,
arastirma, aciklama, soru sorma ve alternatif cozum onerme yeteneklerini
kapatmaz. Sinirli test uretim worker'inin arac izinleri ana sohbetten ayridir.
Kullanici sorusunu yorumla; her mesaji yeni test isi olarak baslatma.

- Her is icin `job_id` ile `job_context.project_root` eslesmesini takip et.
  Mevcut sohbetin/reponun kokunu biliyorsan status/result/resume/cancel
  cagrilarinda `project_root` gonder. MCP sunucusunun CWD'sini kullanma.
- Kullanici repo degistirdiyse eski job_id'yi yeni root ile birlestirme.
  `JOB_PROJECT_MISMATCH` iki root'u verir: hangi isin istendigini niyetten
  belirle, belirsizse bir kez netlestir. Kullanici eski projeyi acikca
  sectiyse eski root/job ile onu yonetmek serbesttir; CWD'ye kilitlenme.
- Yeni sohbette once `test_status(project_root)` / `project_query` job_history
  ile kalici isleri bul. `test_result.job_context` hedefleri, checkpoint'i ve
  tuketilmis denemeleri verir. Birden fazla yarim is varsa secim yapmadan
  rastgele resume etme; job_id/targets ile kisa secenek sun.
- OpenCode yanitini durdurmak MCP isini duraklattigi anlamina gelmez.
  "Duraklat, sonra devam edecegiz" icin `test_cancel(reason:"pause")`,
  "vazgec, iptal et" icin `reason:"cancel"` kullan. Stop tusu veya kopan
  sohbet sonrasinda once `test_status` ile gercek durumu kontrol et.
- `ACTIVE_LEASE` mevcut sahiplik kaydidir; tek basina process'in saglikli
  oldugunu kanitlamaz. Aktif is varken yeni job/ikinci resume baslatma.
  `NO_ACTIVE_LEASE` + RUNNING/INTERRUPTED icin `test_resume` recovery yolunu
  kullan; `CLEANUP_PENDING` / `NATIVE_PROCESS_UNRESOLVED` varsa temizligin
  neden dogrulanamadigini acikla, baska process'leri oldurme veya kilit silme.
- Devam, son dogrulanmis checkpoint ve kalan butcedendir. Yari kalan model
  veya Maven cagrisi yeniden kosabilir. Butceyi/key'i sifirlayarak durmaksizin
  tekrar deneme; tekrar eden ayni start isteginde ayni idempotency_key'i koru.
- Kaynak/branch/POM degismisse eski olcumleri yeni kodla birlestirme.
  SOURCE_CHANGED veya CONTRACT_CONFLICT sonucunu acikla; kullanici niyetine
  gore yeni analiz/yeni job oner. Hedef/model degisikligini test_resume'a
  ekleyip sessizce yok saydirma; yeni test_start kosullarini kullan.
- COMPLETED ise sonucu sun; CANCELLED ise kendiliginden diriltme.
  Genel coverage taramasi kesildiyse yeni `project_coverage` gerekir.
  WAITING_INPUT/COVERAGE_ANALYZED ise kullanicinin sinif secimini bekle.
- `required_action` gercek durum icin yol gosterir; kullaniciya tek kalip
  yanit zorlamaz. Arac kanitlarini kullanarak duruma uygun aciklama ve
  secenekler sun. Kullanici kod/ortam sorunu soruyorsa inceleyip cozum oner;
  production degisikligini MCP'nin TEST_ONLY isine gizlice katma.

## Genel coverage ve sinif secimi

Kullanici belirli bir sinif vermeden genel JaCoCo/coverage raporu veya test onerisi isterse:

1. `project_coverage` cagir; `project_root` mutlak yol olsun. Arac tum mevcut Maven testlerini ayri kopyada calistirir ve job_id doner. Tek Maven alt koku varsa ust klasorden cozer.
2. `test_status` ile izle; `test_result.coverage_scan` genel LINE/BRANCH olcumunu, rapor yollarini ve uygun dusuk coverage onerilerini verir. `coverage_scan_failure` varsa gercek nedeni bildir; basarisiz/atlanmis testlerden coverage uydurma.
3. Onerileri sinif adi, coverage, eksik satir ve uygunluk nedenleriyle kisa goster. "Hangisini calistiralim?" diye sor ve kullanici secimini bekle. Kendiliginden hedef secme/model/test uretimi yapma.
4. Kullanici sectiginde `test_start` icin `coverage_scan_id=<scan job_id>`, arac sonucundaki `project_root`, tek `targets:[{selector:<tam FQN>,kind:"class"}]` ve kullanicinin coverage hedefini kullan. Sayisal hedef belirtilmediyse oneride LINE %80'i oner; BRANCH olculemiyorsa bunu belirt. Kaynak degismisse tekrar tara.
5. Tarama tamamlanmis olmasi test uretiminin tamamlandigi anlamina gelmez. Secilen test job'ini mevcut status/result akisi ile takip et; asıl checkout'a apply icin ayri onay bekle.

Tarama worker/model cagirmaz. Eksik yerel `.mvn` pin dosyalari sadece owned execution kopyasinda bos/neutral dosyalarla tamamlanir; gercek proje dosyalari degismez. Sabit CLI JaCoCo surumu 0.8.12; POM'daki mevcut ayarlar ve JVM argumanlari korunur, uyumsuzlukta typed blocker sunulur.

Bu proje, AI test muhendisligi MCP araciyla baglanti kurar. Kullanici bir Java sinifi veya coverage hedefi soylediginde:

1. **`project_inspect`** cagir: proje kokunu mutlak yol olarak aktar. Proje envanteri ve preflight durumu doner.
2. **`test_start`** cagir: kullanici hedefini typed parametrelere cevir.
   - `project_root`: mutlak yol
   - `targets`: `{"selector": "<SinifAdi>", "kind": "class"}`
   - `coverage`: `{"percent": <hedef>, "metrics": ["LINE", "BRANCH"]}`
   - `mode`: `TEST_ONLY`
3. **`test_status`** ile durumu takip et; `job_id`'yi sakla.
4. `test_result` ile gercek lifecycle/outcome/verification/apply durumunu sun:
   rapor yolu, before/after sayaclari ve kalan gap'ler. Sabit READY_FOR_REVIEW
   veya APPLIED beyan etme; generation tamamlanmasi asil projeye uygulama
   yapildigini gostermez.

## Onayli test uygulamasi

Kullanici kabul edilmis testleri asil projeye uygulamak istediginde:

1. `test_apply({job_id, project_root, mode:"preview"})` ile plani al.
   Proje koku, checkpoint_id, patch_digest ve eklenecek yeni test dosyalarini
   kullaniciya goster. Varsayilan mode preview'dir; kaynak dosyasi yazmaz.
2. `mode:"apply"` cagrisi ayni job_id/project_root ile preview'den gelen
   checkpoint_id ve patch_digest degerlerine sabitlenmelidir. Sunucu OpenCode
   insan onay formunu acar; kullanici formda kabul edip `approved:true`
   secmelidir. Sohbetteki bir metin, modelin yazdigi `approval_reference`
   veya model karari bu formun yerine gecmez. Form destegi yoksa, kullanici
   reddederse veya form iptal edilirse dosya yazilmaz; bunu acikla.
3. Donen operation_id'yi sakla. `test_status` / `test_result` ile ayni job ve
   operation'in application alanini izle; APPLYING yayinlama veya dogrulama
   suruyor demektir. Tekrar apply cagrilariyla yeni is baslatma. Her poll'da
   project_root/job_id eslesmesini koru ve operation degistiyse belirt.
4. Yalniz application.state `APPLIED`, verification.status `PASSED`, exit_code
   0, failures/errors 0, existing_tests_preserved ve all_tests_present true
   oldugunda uygulamayi basarili sun. Atlanan test sayisini ayrica bildir.
   Dogrulama asil dizinde Maven calistirmak degildir: uygulanan asil projenin
   hash-dogrulanmis owned kopyasinda filtresiz tum Maven testleri ve JaCoCo
   calisir; scope `FULL_PROJECT_SNAPSHOT` olarak verilir. Generation'in
   onceki outcome/coverage/verification_scope degerlerini bununla yukseltme.
5. Dogrulama basarisiz veya iptal olursa is kendi ekledigi degismemis
   dosyalari geri alir. ROLLED_BACK, CONFLICT veya RECOVERY_REQUIRED ile
   failure/error/skipped sayilarini, nedeni ve kalan dosya cakismalarini
   durustce sun. Kullanici degisikliklerini ezme, dosya/kilit elle silme.
   Eski operation recovery gerekiyorsa `mode:"recover"` kullan; tekrar
   uygulama icin yeni preview ve yeni insan onayi gerekir.

Mevcut testler, production kaynaklari ve POM degistirilmez; yalniz plandaki
yeni test dosyalari eklenir. Raporun application bolumu uygulama kanitini
generation olcumlerinden ayri gosterir.

## Zorunlu kurallar

- Production kaynaklarini DEGISTIRME; arac yalniz test degisikligi uretir.
- Coverage sonucunu model beyanindan degil `test_status`/`test_result` ciktilarindan al.
- Hedef saglanmadiysa bunu durustce soyle; "ulasilabilir maksimum" kanitsiz iddia etme.
- Kesinti olursa ayni job'dan devam icin `job_id` kullan.
- MCP process'in CWD'sini proje koku sanma; `project_root` parametresini mutlak yol olarak gonder.
