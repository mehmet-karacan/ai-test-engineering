# S04 salt okunur hazirlik

- Gorev: AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0; sozlesme SHA-256 `59a08a4a2d626d9aa6cfb55faed82513964aabce45528890e7aa648afe371989`.
- Sinir: AKTIF_GOREV.md S04, S01 VERIFIED olmadan yalniz tasarim/fixture hazirligina izin verir. Bu kayitta schema, runtime veya musteri projesi degistirilmedi. WN32-WN42 NO_GO.

## Mevcut koddan gozlem

- `ProjectRepository.ensureLocation` ilk projeyi yalniz `projects.name` ile seciyor; ayni adli bagimsiz kokler ayni project_id'yi alabilir. `project_locations` unique anahtari `(project_id, canonical_root)`; bu yanlis birlesmeyi engellemiyor.
- `canonicalProjectRoot` yalniz `resolve` + dizin kontrolu yapiyor. Windows case, junction, Git common-dir ve remote credential kimligi icin tek bir resolver yok.
- `test_jobs.location_id`, `project_snapshots.location_id` ve mevcut checkpoint/job FK'leri UUID iliskilerine dayaniyor. Migration eski UUID/job/accepted set iliskilerini yeniden ebeveynlememeli.
- `worker_attempts` zaten var; yeni agent attempt semasi bununla gereksiz cift kayit olusturmamali. `CheckpointManifest` project_id/location_id ve kalan butceyi iceriyor; resume dogrulamasi bunlari DB job/location bagiyla karsilastirmali.

## S01 sonrasina hazir fixture sirasi

1. Ayni gorunen adli iki bagimsiz root/remote: farkli project_id ve location_id. Ayni dogrulanmis remote'un iki checkout'u: ayni project_id, farkli location_id. Remote credential URL icinde saklanmaz.
2. Windows case/junction/drive/UNC alias: dogrulanmis ayni fiziksel kok idempotent; farkli fiziksel kok yanlislikla birlesmez. Belirsiz alias fail-closed olur.
3. Eski ada gore birlesmis DB migration: var olan project/location/job/checkpoint UUID'leri ve accepted blob hash'leri byte duzeyinde korunur; belirsiz tarihsel kayit otomatik split/reparent edilmez.
4. Yanlis project/location/job ile query, resume ve artifact fetch reddedilir. Iki ayri process tek task claim icin yaristirilir; stale lease/attempt/publish best pointer'i degistiremez.
5. Restart'ta job, target cursor, accepted set, harcanmis butce ve task/attempt lineage korunur. Model revision yalniz acik onayla yeni lineage olusturur.

## Devam noktasi

S01 WN05-WN13 gercek Windows kanitiyla VERIFIED olunca once `agent-contracts.ts` runtime semasi ve kimlik fixture'lari, sonra migration ve repository islemleri uygulanir. S03 file inventory semasi ile ayni migration dosyasinda cakisma yaratilmamasi gerekir. G1/G2/G3 kapali.
