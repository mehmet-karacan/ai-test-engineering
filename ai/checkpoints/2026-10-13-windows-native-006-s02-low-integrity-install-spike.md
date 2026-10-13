# S02 WN15/18 dusuk integrity install denemesi

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s02`. Bu arastirma urun native helper/runner koduna baglanmadi. Gercek musteri Maven/model, GPU, G1/G2/G3, global PATH/JAVA_HOME, kurum policy ve admin yetkisi kullanilmadi.

## Soru ve host siniri

Maven/JDK'nin sahipli Temp klonunu medium integrity'de tutup Maven child'i low integrity'de calistirmak, en azindan child'in clone `lib` dizinine yeni JAR eklemesini engeller mi? Bu islem kurulum uyeligini tum surec boyunca immutable yapar mi?

`whoami /groups` ana host token'ini `Medium Mandatory Level` gosterdi; `whoami /priv` listesinde `SeTakeOwnershipPrivilege` ve `SeRestorePrivilege` yoktu. [Microsoft Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control), low integrity surecin medium integrity nesneye DACL yazma izni olsa bile yazamayacagini; [Microsoft icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls) `/setintegritylevel` islevini belgeler. Bu belgeler asagidaki host gozlemlerinin yerine gecmez.

## Sahipli Temp fixture ve sonuc

`scripts/wn-low-integrity-probe.mjs` her kosuda `Temp/aitest-wn-low-integrity-*` benzersiz kokunu yaratir. Sistem `cmd.exe` dosyasini yalniz bu Temp kopyaya okur, kopyaya `L` mandatory label, ayrica bos workspace'e `(OI)(CI)L` uygular. Clone ve `lib/old.jar` medium olarak kalir; gercek install, kaynak checkout, onceki iki Temp probe artifakti ve sistem ACL'si degismez. Silme, mutlak Temp/prefix/realpath guard ile yalniz kendi kokune uygulanir.

Son gercek Windows kosusu `node scripts/wn-low-integrity-probe.mjs`: exit 0, `LIMITED_POSITIVE`, `cleanup=REMOVED`. `icacls` iki label icin exit 0; child'in kendi `whoami /groups /fo csv` ciktisinda `S-1-16-4096` low token SID'i goruldu. Low child medium clone'daki `old.jar` baytlarini okudu; `lib/new.jar` yazimi `Access is denied`/exit 1 ve dosya yok; low workspace'e yazma exit 0; eski JAR baytlari ayni. Clone'da low label yok, workspace'te var.

Negatif oracle: low child canliyken ana medium surec ayni clone `lib/new.jar` dosyasini yaratip okudu ve sildi; son uye listesi tekrar eski hale geldi. Dolayisiyla yalniz low child self-mutation engellendi, medium same-user peer mutasyonu engellenmedi. Mevcut helper'in `FILE_SHARE_READ` ancestor handle'lari da yeni dosya eklemeyi engellemiyor (`s02-membership-generation-gap` fixture'i). Baslangic/bitis envanteri bu ara olayi kacirir.

## Tasarim ve kabul siniri

Bu hostta standard user ile Temp copy + low child + low writable workspace mekanizmasi sentetik komut icin calisiyor. Tam Maven/JDK byte setinin Temp'e guvenilir clone edilmesi, `cmd.exe`/Java alt sureclerinin low token olarak Job Object altinda baslatilip tutulmasi, settings/local repository/target izinleri, helper provenance, medium peer mutasyonuna karsi gapless koruma, hard-kill/cleanup ve rapor kabul fence'i test edilmedi. `CreateProcessAsUser`/restricted token kullanilmadi; [Microsoft CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken) standard caller icin bir istisna belgelese de bu hostta onun yetki sonucu kanitlanmadi.

Sonuc: cocuk self-write icin dar olumlu kanit var; "immutable install" veya WN15/18/customer readiness VERIFIED degil. Medium peer add/delete negatif kaniti ve tam lifecycle eksigi nedeniyle S02/customer/G1/G2/G3 NO_GO kalir. Bu dilimde urun kaynak kodu degismedi; yalniz yeniden kosulabilir sentetik fixture ve checkpoint eklendi.
