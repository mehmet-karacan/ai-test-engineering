# S04 salt okunur veri kontrati hazirligi

- Tarih: 2026-10-13; durum: TASARIM. S01 VERIFIED olmadan migration veya store kodu degistirilmedi.
- Sozlesme: `AKTIF_GOREV.md` bolum 4.2, 6.3, 6.4 ve S04. S03/S05 ayni `AgentTaskContract`, `AgentTaskResult`, `ArtifactRef`, `InventoryScanResult` export'larini kullanmali.

## Mevcut kaynakta gorulenler

- `ProjectRepository.ensureLocation` projeyi `WHERE name = ?` ile buluyor; `normalized_remote` girisle karsilastirilmiyor. Ayni adli farkli root/remote tek proje altinda birlesebilir. `project_locations` sadece `(project_id, canonical_root)` UNIQUE. `services.ts` proje inspect/test start cagrilarinda remote'u `null` veriyor.
- `RecoveryManager.findResumableJob(locationIds)` birden cok uygun is arasindan `created_at DESC` ilk satiri sessiz seciyor. S04 sozlesmesi belirsiz ise otomatik secime izin vermiyor.
- Schema v1-v7 mevcut. `worker_attempts` job/attempt ordinal, role, provider/model, session/message ve usage sakliyor; task FK ve contract/input/output artifact refs yok. `job_leases` job bazli fencing token tasiyor. Yeni task/attempt modeli bu kayitlari iki kez yazmamali.

## Uygulama sirasi ve kabul taslagi

1. S01 restore/backup verified olmadan migration yazma. Once eski v7 DB fixture, farkli ayni-ad/remote/root fixture ve belirsiz tarihsel proje fixture hazirla.
2. Identity kurali `canonical_root`/gercek dosya kimligi ile `normalized_remote`yu ayri olceklerde ele alsin: ayni ada gore eslestirme kaldirilsin; ayni remote farkli checkout farkli location olsun; farkli remote veya remote'suz farkli fiziksel root otomatik birlesmesin. Eski projelerin UUID, location, job ve artifact FK'leri degismeden kalsin. Kayit zaten belirsiz birlesmisse otomatik bolme/onarim yapma, tipli belirsizlik don.
3. Agent kontratlari schema version, tam project/location/job/revision/source identity, role, dependency ve input ref, scoped context, model binding, butce, idempotency key tasisin. Result en cok 6 KiB ozet, tam changeset artifact ref. Unknown usage null; sifir ancak gercek sifir olcumu ise yazilsin.
4. Task claim/attempt/complete kisa transaction ile job lease/fence, row version, source/input digest ve task state CAS dogrulasin. Uzun model/Maven cagrisinda write transaction acik kalmasin. Gec attempt ve yanlis project/location/job ref trusted output olmasin.
5. Iki process claim, owner expiry/fence, session kaybinda ayni task/yeni attempt, acik onayli model degisimi ve korunmus harcanan butceyi real SQLite testle olc. Birden cok resume adayi varsa secim isteyen tipli sonuc don.

## Devam bagimliligi

S01 WN11-13 ve backup/migration entegrasyonu VERIFIED olunca S04 migration yazimi baslayabilir. Bu belge S04 kabulu veya runtime kaniti degildir.
