# S02 WN15 private clone ACL feasibility: NO_GO

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s02`. Bu dilim urun kodu veya native helper degistirmedi; gercek musteri Maven/model calistirmadi.

## Soru ve resmi dayanak

Soru: Ayrilmis kullanici Temp klonunda Maven/JDK dosyalari mevcut helper tarafindan pinlenirken, ayni Windows kullanici token'i yeni dosya ekleyebilir veya klon ACL'sini geri acabilir mi? Sonrasinda sahipli cleanup guvenle tamamlanabilir mi?

- Microsoft [Owner Rights special identity](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-special-identities-groups) belgesi, `S-1-3-4` ACE'si varsa sahibin implicit `READ_CONTROL`/`WRITE_DAC` haklarinin yok sayildigini belirtir. Bu genel OS semantigi, asagidaki tek makine sonucundan ayri tutulur.
- Microsoft [icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls) belgesi `/inheritance:r`, `RX`, `RC`, `DE` ve `DC` haklarini tanimlar. [Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control) alt-integrity token'in medium nesneye yazamayacagini aciklar; bu alternatif bu dilimde uygulanmadi/test edilmedi.

## Gercek Windows fixture gozlemi

- Yalniz benzersiz `Temp/aitest-wn-owner-rights-*` altinda bos `clone` dizini yaratildi. `icacls clone /inheritance:r`, kullanici SID icin `RX` ve `OWNER RIGHTS` icin `RC` ACE'leri status 0 verdi. Ayni token'la `new.jar` yaratma `EPERM`; ayni token'la `icacls /grant SID:F` status 5 / Access denied. Bos klonun sahipli kok temizligi basariliydi.
- Ikinci, ic ice `clone/bin` ve `clone/lib` ile eski `.cmd`/jar iceren gercek helper fixture'inda her dizin alt-alttan ayni sekilde muhurledi. `icacls` salt-okunur kontrolunde `clone`, `bin`, `lib` icin `OWNER RIGHTS:(Rc)` ve kullanici `RX` goruldu; dosyalarin ACL goruntusu bos kaldi. Helper baslatilmadan once dosya okuma/manifest asamasi engellendi. `rmSync` ile bounded recursive cleanup `EPERM` verdi. Bu nedenle helper altinda same-token add, hardkill veya tam Maven/JDK calisma semantigi kanitlanmadi.
- Korunmus ama temizlenemeyen tek fixture: `C:\Users\mkaracan\AppData\Local\Temp\aitest-wn-sealed-clone-4uoD0M`. Salt-okunur incelemede kok altinda yalniz `clone/bin` ve `clone/lib` goruldu; repo veya gercek Maven/JDK kurulum ACL'si degismedi. Kullanici yetkisiyle kanitli rollback bulunmadigindan admin/TakeOwnership/policy bypass veya yeni mutasyon denenmedi. Otomatik test haline getirilmedi.
- Yerel token `Medium Mandatory Level` idi; `whoami /priv` ciktisinda `SeTakeOwnershipPrivilege` veya `SeRestorePrivilege` yoktu. Bu bulgu admin/elevated token icin genellenemez.

## Karar ve devam kosulu

Private clone ACL gorusu bugun NO_GO: dosya/alt dizin ACL mirasi, owner/deletion haklari, helper baslangicinda tam uyelik dogrulamasi ve parent hardkill cleanup icin guvenli tekrarlanabilir protokol yok. Bos dizin deneyi kurulum agaci kabul kaniti degildir. Mevcut WN14/15/18 customer readiness ve G1/G2/G3 kapali kalir. Yeni uygulama dilimi icin once ayrilmis disposable hesap/low-integrity token ve degisken workspace yazma ihtiyaci ile guvenli cleanup tasarimi ayrica kanitlanmalidir.
