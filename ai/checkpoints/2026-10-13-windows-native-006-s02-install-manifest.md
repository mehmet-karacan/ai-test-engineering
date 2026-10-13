# S02 WN15 kurulu Maven/JDK girdi manifesti

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s02`.

## Kanitli dilim

- Resolver, standart kurulu Maven'in `bin`, `boot`, `lib`, `conf` ve secili JAVA_HOME altindaki JDK'nin `bin`, `lib`, `conf`, `release` dosyalarini sinirli, sirali ve akiskan SHA-256 ile kimlige ekler. Semantik olmayan wrapper/standart disi kurulum `distributionManifestComplete=false` olarak gorunur.
- Goal ve `-v` probe, resolver'in ayni beklenen digest listesini supervisor'a tasir. Supervisor listeyi yeniden hash'leyip yeni otorite yapmaz.
- Gercek kurulumda 259 dosya, 314,059,592 bayt; resolver toplam 282 pinin 260'ini mevcut, 22'sini eksik config olarak kaydetti. Tam pin argumanlari 44,829 karakter olacagindan eski argv protokolu Windows 32,767 sinirini asiyordu. Resolverin 282 pinlik manifesti 45,181 UTF-8 bayt ve salt-okunur tarama suresi 1,782 ms idi.
- Supervisor sinirli `pinned-inputs.txt` dosyasini helper'a ait Temp kontrol kokunde `wx` ile yaratir, beklenen SHA-256'yi argv'de verir. Native helper manifesti no-follow/FILE_SHARE_READ handle ile SHA-256 dogrulayip tutar; en cok 1 MiB/4,096 satir UTF-8 pin okur ve her dosyayi mevcut no-follow handle mekanizmasiyla Maven agaci bosalana dek tutar. Manifest veya hedef bayt degisirse `pin_mismatch`; eksik config icin `pin_unavailable`, her ikisi de CreateProcess oncesi 102 ve `preSpawnNoChild` sonucudur.
- Native helper kaynak SHA-256: `cdfc129a91ed2f39d22b63f96db06db956e7bd1fe6f577b9051633a31feaa893`; derlenmis x64 SHA-256: `8d797a731df6bc48db5509097d2f382e60b10817ff0761817f046fca03f437f2`. Manifest kaynak/binary hash eslesmesini `npm run build` dogruladi. Derleyici/SDK provenansi helper manifestinde korunuyor.

## RED/GREEN ve regresyon

- `wn-install-manifest`: Maven jar degisiminde eski resolver kimligi ayni kaliyordu (RED); yeni resolver Maven jar ve JDK `lib/modules` byte swap'inda identity degistiriyor (GREEN).
- `wn-install-manifest-helper`: eski native helper manifest protokolunde exit 90 verdi (RED). Yeni helper 260 ayri library pini + `.cmd` ile dogrulanmis manifesti calistirdi; manifest byte swap'inda goal sentinel olusmadan `pin_mismatch`/102 verdi. Supervisor uzerinden Windows argv limitini asan ek pin ve eksik config `pin_unavailable`, `preSpawnNoChild`, `ownedTreeDrained` verdi.
- Seri odak: `wn-install-manifest`, `wn-install-manifest-helper`, `wn-native-runner` 3 dosya/17 PASS. Typecheck, build, hedef lint exit 0. `wn-job-object` tek basina 7/7 PASS. Birlesik kosuda mevcut AbortSignal owned PID oracle'i 1 kez FAIL (owned PID 1 saniyede kapanmadi); ayni dosyanin seri tekrarinda 7/7 PASS. WN22/23 bagimsiz kanit bu dilimde yeniden VERIFIED sayilmadi.

## Acik NO_GO

- 22 eksik implicit config girdisi mevcut tam kurulumda `pin_unavailable` sonucunu koruyor. Windows dizin `FILE_SHARE_READ` handle'i yeni dosya yaratimini engellemiyor; bugunku snapshot, kurulum dizinine yeni dosya eklenmesini de surekli engellemez. Bu nedenle WN14/15/18 customer readiness halen NO_GO.
- Bu manifest JDK'nin calisma girdileri (`bin/lib/conf/release`) ve Maven `bin/boot/lib/conf` icindir; JDK `jmods` gibi diger agaclarin Maven goal semantigini degistirip degistirmedigi ayrica degerlendirilmeli. `distributionManifestComplete` tek basina musteri kabul bayragi degildir.
- S01/storage blob publish -> SQLite hata yolundaki orphan fiziksel blob GC riski ayri acik. G1 musteri Maven/model, G2 apply, G3 publish kapali.
