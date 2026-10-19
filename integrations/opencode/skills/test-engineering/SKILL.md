---
name: test-engineering
description: Java projesinde yalniz test gelistirme; coverage hedefi, gercek Maven/JaCoCo olcumu, checkpoint'li devam. Kullanici hedef soylediginde bu araclari kullan.
---

# Test Engineering

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
4. Sonucu `READY_FOR_REVIEW` olarak sun: rapor yolu, before/after sayaclari, kalan gap'ler.

## Zorunlu kurallar

- Production kaynaklarini DEGISTIRME; arac yalniz test degisikligi uretir.
- Coverage sonucunu model beyanindan degil `test_status`/`test_result` ciktilarindan al.
- Hedef saglanmadiysa bunu durustce soyle; "ulasilabilir maksimum" kanitsiz iddia etme.
- Kesinti olursa ayni job'dan devam icin `job_id` kullan.
- MCP process'in CWD'sini proje koku sanma; `project_root` parametresini mutlak yol olarak gonder.
