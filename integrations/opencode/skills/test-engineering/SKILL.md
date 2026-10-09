---
name: test-engineering
description: Java projesinde yalniz test gelistirme; coverage hedefi, gercek Maven/JaCoCo olcumu, checkpoint'li devam. Kullanici hedef soylediginde bu araclari kullan.
---

# Test Engineering

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
