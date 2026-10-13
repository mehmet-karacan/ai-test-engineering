# S01 WN13 artifact root kimligi ve GC siniri

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`; yalniz sahipli Windows Temp fixture'lari.
- `node scripts/probe-restore-root-alias.mjs`: RED_CONFIRMED exit 0. Fresh native DB session READY iken `targetArtifactRoot` adi `artifacts-moved` yapilip ayni ada yeni dizin kuruldu. Native staged DB MOVE eski pinned DB dizininde basardi; TS mutlak `copyFileSync` blob stage'i yeni artifact dizinine yazdi. DB journal kendi DB dizininde kaldi. Bu, DB oturumunun artifact kokunu korumadigini gosterir.
- Ayrica ayni fixture'da staged DB handle acikken DB dizininin kendi adini rename denemesi EPERM verdi. Bu tek schedule kanitidir; S03 copy fixture'inda ordinary root rename basarmistir. DB root genellemesi yapilmaz.
- Dar fail-closed guard: native helper `inspect` ile artifact root volume/FileId baseline alinir. Restore'un blob mkdir/copy/link ve DB publish oncesi kritik adimlarinda kok kimligi yeniden okunur; kalici rename/replacement gorulurse `RESTORE_ARTIFACT_ROOT_CHANGED` ve sonraki path cleanup kapatilir. `node scripts/probe-restore-root-alias.mjs --expect-guard`: PASS_GUARD exit 0, replacement dizine blob veya DB yayinlanmadi. Build ve ilgili 29 Windows test PASS, odak lint exit 0.
- Bu guard fiziksel kilit degildir. Kontrol ile path mutation arasindaki swap-back/TOCTOU, native session olmadan JS blob unlink/link/copy, nested junction ve terminalden sonraki root degisimi aciktir. Orijinal nesil belirsizse cleanup yapilmaz; orphan stage/blob kalabilir. WN13/S01 VERIFIED NO_GO.

## GC crash ve fiziksel silme siniri

- `gcSweep` once DB `DELETED` durumunu ayri `BEGIN IMMEDIATE` transaction ile commit eder; sonraki unlink hatasi veya kill `DELETED` + orphan dosya birakir, READY + eksik blob'a rollback etmez. Ikinci transaction unlink oncesinde canli referanslari tekrar okur ve ayni path/FileId alias'larini korur.
- `safeBlobPath`, `existsSync/statSync` ve `rmSync` hâlâ mutlak path tabanlidir. Root veya alt segment rename/replacement ya da swap-back bu kontroller arasinda gerceklesirse baska fiziksel dosya silinebilir. Native pinned handle-relative delete + surekli root/target FileId fence ve kill fixture olmadan GC'nin WN13 fiziksel sahiplik iddiasi verilmez. Bu dilimde GC mutation kodu degismedi.
