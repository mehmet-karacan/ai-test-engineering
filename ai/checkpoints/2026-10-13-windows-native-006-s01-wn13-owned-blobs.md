# S01 WN13 pinli blob islemleri - dar kanit

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`; Windows Temp fixture'lari. S01 VERIFIED/fresh production/GC genel silme NO_GO.
- Onceki `probe-restore-root-alias.mjs --transient-swap` RED: FileId preflight once/sonra dogru olsa bile JS mutlak `copyFileSync` replacement artifact kokune yazdi.
- Native helper `copy-owned`: source ve target root volume/FileId esligi, no-follow handle-relative source okuma ve stage CREATE_NEW; COPY_READY sonrasi elde tutulan root handle'lariyla kopya. `rename-owned`: root ve stage FileId/byte/SHA esligi, ayni pinned parent altinda NO_REPLACE rename; RENAME_READY sonrasi mutasyon. `delete-owned-session` ve `rename-owned` dosya handle'larinda FILE_SHARE_WRITE kaldirildi.
- `restoreBackup` nativeHelper verildiginde yeni blob stage/publish ve normal rollback/stage cleanup native owned islemlerini kullanir. Stage/copy digest ve publish FileId receipt'i calisma boyunca tasinir; native belirsiz rename cevabinda path tabanli rollback yapilmaz, journal nonterminal kalir. Eski helper'siz yol degismedi; uretim helper'i halen opsiyoneldir.
- `probe-restore-blob-owned-swap.mjs`: PASS. COPY_READY sirasinda artifactRoot rename+replacement basardi; kopya eski pinned kokte, replacement'ta dosya yok. RENAME_READY sirasindaki root rename bu Windows schedule'inda EPERM ile reddedildi; yayin eski FileId'de kaldi. Bu iki farkli schedule'i kanitlar, evrensel root kilidi iddiasi degildir. Tek blob'lu gercek native restore testi COMMITTED ve dogru byte PASS. Bridge+restore odak testleri 28/28 PASS; build/typecheck/odak eslint exit0.

## Bagimsiz inceleme ve silme kesitleri

- Koordinatorun OpenCode GLM salt-okunur incelemesi `9a93e69` icin disposition->receipt kill belirsizligi, acik handle ile ertelenmis silme, snapshot->disposition hardlink/yazar yarisi ve caller-supplied root otoritesi bulgularini bildirdi. CLI `batch file cannot be found` exit1 ile bitmis; bulgular otomatik PASS sayilmadi.
- `probe-gc-pinned-delete.mjs`: native DELETE_READY sirasinda ayri raw writer yazmayi basaramadi; aday ada replacement kondugunda eski FileId silindi, replacement byte'lari korundu. Hardlinkli dosya native READY oncesi reddedildi (`wn-file-bridge.test.ts`). Bu snapshot->disposition arasinda eszamanli hardlink olusturma icin evrensel atomiklik kaniti degildir.
- `probe-gc-delete-hardkill.mjs`: gercek `taskkill /F`; DELETE oncesi kill eski byte'lari korudu; disposition sonrasi receipt oncesi kill eski FileId'yi sildi. Bu aralikta TS sonucu belirsizdir ve path'e bakarak baska bir dosyayi silme retry'i yapilamaz. DB row once DELETED ise dosyanin kalmasi orphan cleanup sorunu, yanlis dosya silme yetkisi degildir.
- `probe-gc-delete-open-reader.mjs`: bir raw okuyucu acikken bu fixture'da native delete exit0 ve path hem okuyucu kapanmadan once hem sonra yoktu. Bu tek schedule; diger Windows share/open kombinasyonlarinda ertelenmis silme olasiligi aciktir.
- GC uretimine native delete BAGLANMADI. `gcDryRun`/DB row fiziksel FileId sahiplik receipt'i tasimiyor; S02 WN21 blob->DB hard-kill orphan'i DB satiri olmadan kalabiliyor. Genel orphan tarama ve delete yetkisi icin publish receipt'inin journal/DB generation/ref ile kalici baglanmasi, raw alias ve butun canli referanslarin yeniden dogrulanmasi gerekir.

## Acik sinir

- Native blob stage/publish receipt'leri henuz fsync journal semasinda degil; hard-kill sonrasi fiziksel blob sahipligiyle otomatik temizleme kanitlanmadi. `verifyPublishedRestore` ve mevcut hedefteki skip/reuse okumasi path tabanli; transient swap-back ile yanlis generation dogrulama riski ayrica incelenmeli.
- S01 nativeHelper secimi opsiyonel; helper'siz path hala JS copy/link/rmSync kullanir. Bu nedenle WN13/S01 VERIFIED ve S04 migration gate'i kapali.
