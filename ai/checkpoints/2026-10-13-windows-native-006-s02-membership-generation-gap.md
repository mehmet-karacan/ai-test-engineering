# S02 kurulum dizini uyeligi nesil kaniti

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s02`.

## Gercek Windows gozlemi

- `tests/integration/wn-install-manifest-helper.test.ts` gercek `windows-process-helper.exe` surecini, pinli `mvn.cmd` ve `lib/old.jar` ile baslatir. Yardimci calisirken `lib/new.jar` yazimi ve okunmasi basarilidir. Yeni JAR silindikten sonra yardimci hala canlidir, baslangic/bitis uye listesi ve `old.jar` SHA-256 aynidir. Ardindan cancel sonucu `cancelled`, exit 101'dir.
- Boylece mevcut handle pinleri eski dosya baytlarini korusa da yeni bir `lib` uyesinin ara surecte olusmasini dislamaz. Baslangic/bitis yeniden tarama bu ara olayi kaybeder. Maven/JDK kurulumunun tum uye kumesi goal suresince frozen iddiasi yoktur. Sentetik batch fixture yeni JAR'i yuklemez; kanit, yeni uye olusturma ve gozlenebilirlik bosluguyla sinirlidir.
- `npx vitest run tests/integration/wn-install-manifest-helper.test.ts --maxWorkers=1`: 1 dosya, 3 PASS.

## Nesil metadata ve alternatiflerin siniri

- Mevcut helper dosya ve ancestor handle'larini tutar; `ReadDirectoryChangesW` aboneligi veya kesintisiz dizin nesli kaydi yoktur. [Microsoft ReadDirectoryChangesW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw), bildirim tamponu tasmalarinda ayrinti kaybi ve yeniden sayim gerektirebilen durumlari belgeliyor. Bir watcher tek basina resolver taramasi ile abonelik arasindaki boslugu kapatmaz; tasma ve hard-kill icin fail-closed teslim protokolu gerekir. Bu protokol uygulanip dogrulanmadi.
- Dizin mtime/ChangeTime monotonic, degistirilemez bir nesil sayaci olarak kullanilmadi. [Microsoft File Times](https://learn.microsoft.com/en-us/windows/win32/sysinfo/file-times) yazma zamaninin dogrulugu icin degisikligi yapan handle kapanisini sart kosar; [SetFileTime](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfiletime) yazma zamaninin uygulama tarafindan ayarlanabildigini belgeler. Bir timestamp karsilastirmasi ara yarat-sil olayini guvenilir bicimde dislayamaz.
- [Microsoft change journal identifier](https://learn.microsoft.com/en-us/windows/win32/fileio/using-the-change-journal-identifier) journal isleminde yonetici ayricaligi istiyor. Admin gerektiren volume-USN yolu, ADR-007'nin admin olmayan siniri icinde kullanilmadi; hostta denenmedi.

## Kabul siniri

- Bu dilimde GREEN urun duzeltmesi yoktur; guvenilir kurulum-dizini nesli kaniti hostta kurulamadigi icin typed customer blocker ve NO_GO korunur. `distributionManifestComplete` yalniz taranan mevcut dosyalarin tamligini ifade eder, zaman icinde uye eklenmedigini kanitlamaz. WN14/15/18 ve musteri Maven/model hazirligi NO_GO; G1/G2/G3 kapali.
- Gorev mesajinda WN22 diye anilan kurulum uyeligi riski sozlesmede WN15/18 altindadir. WN22 owned child cancel/timeout kabuludur ve ayri NO_GO kalir.
- Sonraki uygulanabilir tasarim: watcher aboneligiyle tarama arasinda gapless handoff veya izin sinirlari icinde dogrulanmis immutable install kaynagi; overflow, restart, hard-kill ve yabanci mutasyon adversarial Windows fixture'lari olmadan kabul acilmaz.
