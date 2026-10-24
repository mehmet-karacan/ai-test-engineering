---
name: test-engineering
description: Java projesinde yalniz test gelistirme; coverage hedefi, gercek Maven/JaCoCo olcumu, checkpoint'li devam. Kullanici hedef soylediginde bu araclari kullan.
---

# Test Engineering

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
   veya APPLIED beyan etme; mevcut MCP apply varsayilani PATCH_ONLY'dir.

## Zorunlu kurallar

- Production kaynaklarini DEGISTIRME; arac yalniz test degisikligi uretir.
- Coverage sonucunu model beyanindan degil `test_status`/`test_result` ciktilarindan al.
- Hedef saglanmadiysa bunu durustce soyle; "ulasilabilir maksimum" kanitsiz iddia etme.
- Kesinti olursa ayni job'dan devam icin `job_id` kullan.
- MCP process'in CWD'sini proje koku sanma; `project_root` parametresini mutlak yol olarak gonder.
