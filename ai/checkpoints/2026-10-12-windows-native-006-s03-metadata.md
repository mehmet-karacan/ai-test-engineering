# Checkpoint - 006 S03 metadata envanteri (partial)

- Tarih: 2026-10-12 (Europe/Istanbul)
- Dal: `codex/windows-native-006-s03`; baslangic S00 coordinator `4c8419d`. G0 disina cikilmadi; GPU projesi ve ana checkout degismedi.

## Degisiklik ve kanit

- Yeni `file-inventory.ts` gizli/build/binary/buyuk girdileri metadata olarak listeler; junction/symlink kendisini kaydeder, hedefe girmez. Gerekli dosya hash'i stream ile hesaplanir; metadata dosyalari hash edilmeden de envanterde kalir.
- Sayfali cursor generation ve kok yoluna baglidir. Dizin okunamazsa ACCESS_DENIED/partial kaydi vardir; bilinmeyen alt dosyalar tahmin edilmez. Taramada kaynak dosya degisirse hash trusted sayilmaz.
- Gercek Windows fixture'i `.git`, `.mvn`, `.env`, `node_modules`, `target`, `build`, Unicode ad, binary, 65 MiB sparse dosya ve dis kok junction'ini kapsar. ACL degistirmeden hata enjeksiyonuyla okunamayan dizin davranisi sinandi.
- `npm.cmd exec -- vitest run tests/integration/wn-inventory.test.ts`: 1 dosya/2 PASS. `npm.cmd run typecheck`: exit 0.

## Acik is

- Cursor sayfalari yeniden kokten yurur; kalici generation/cursor store ve incremental scan yok. Metadata/context/build snapshot digest'leri ayrilmadi, source snapshot ve application query baglanmadi. WN25-WN31 ve S03 VERIFIED degildir.
- OpenCode Qwen kesif oturumu izin-deneme fixture'lari icin Temp altinda dort `wnprobe*` klasoru birakti; oturum durduruldu. Explicit deny ACL'leri kaldirildi, dordu okunabilir. Otomatik onay denetimi klasorleri silme komutlarini reddetti; klasorler Temp'te kaldi. Bu fixture'lar repoya alinmadi.

## Phase B - bagimsiz build snapshot girdileri

- S04 veri kontrati henüz dogrulanmadigi icin kalici generation/cursor state, schema, services ve query entegrasyonu bu dalda uygulanmadi. Ilk prototip commit edilmeden geri alindi.
- `SourceSnapshot` artik `.mvn` agacini ve kokteki `mvnw`/`mvnw.cmd` girdilerini build snapshot'a alir; bunlari `build_config` siniflandirir. Eski `.git`, `target`, `build` ve `node_modules` dislama kurali korunur. `.mvn/maven.config` degisimi build digest'i degistirir.
- Gercek Windows fixture'i `.mvn` wrapper config, `mvnw.cmd`, Java kaynak, eski `target` ve `.git` ile manifest/copy/digest sonucunu sinar. Ilk test `.mvn` eksikligiyle RED, duzeltme sonrasi ilgili 3 dosya/55 test PASS.
- `npm.cmd run typecheck` ve `npm.cmd run build` exit 0. `npm.cmd run lint` exit 0; 89 mevcut warning, 0 error. `git diff --check` exit 0.
- Kalan: S04 kontratina bagli kalici generation/cursor, incremental parser reuse, application query, bounded model context ve tam WN25-WN31. S03 halen PARTIAL/NO_GO; G1-G3 izni yok.
