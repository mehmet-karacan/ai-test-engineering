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
