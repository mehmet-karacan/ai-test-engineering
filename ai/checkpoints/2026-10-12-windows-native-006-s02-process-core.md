# Checkpoint - 006 S02 Windows process core (partial)

- Tarih: 2026-10-12 (Europe/Istanbul)
- Dal: `codex/windows-native-006-s02`; baslangic `93b1290` S00. Ana checkout ve musteri GPU projesi degismedi.
- Kapsam: `native-toolchain.ts` ve `windows-process-supervisor.ts` icin ilk bagimsiz cekirdek. Normal MCP/dispatcher entegrasyonu henuz yapilmadi; S02 kabul edilmis sayilmaz.

## Uygulama ve kanit

- Installed `mvn.cmd` varsayilan secilir; `Path`/`PATH` cakismasi reddedilir; wrapper yalniz acik tercihle ve mevcut yerel jar ile secilir. PowerShell/download gerektiren wrapper reddedilir.
- Tipli Maven goal/profile/property kontrolleri, Windows `cmd` tarafinda kaniti olmayan karakterleri spawn oncesi reddeder. Bosluk, Unicode, parantez ve `&` verisi korunur.
- Merkezi `cmd.exe /d /s /v:off /c` baslatici mutlak `cmd.exe` kullanir. `close` beklenmeden sonuc yazilmaz. Nonzero, spawn error, timeout ve cancel durumlari ayri; stdout/stderr her biri 8 MiB ile sinirli ve truncation byte sayisi kayitlidir.
- Gercek Windows `.cmd` fixture'inda `&` sentinel'i komut olarak calismadi. Nonzero exit ve timeout ayri goruldu.
- `npm.cmd exec -- vitest run tests/unit/wn-command-contract.test.ts tests/unit/wn-process-supervisor.test.ts`: 2 dosya, 9 PASS; byte limitinde yarim UTF-8 karakteri basilmaz. `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint`: exit 0; lint 89 mevcut uyari.
- Qwen salt okunur incelemesi (commit `9a4059a`) komut enjeksiyonu ve UTF-8 icin bulgu bulmadi; surec agaci kapatmasinin kanitlanmamasi, PID reuse riski ve eksik etkin arac zinciri kimligini orta oncelikli buldu. Settings/toolchains/profile ve executable byte hash'leri kimlige eklendi; surec sahipligi ve kapanis kaniti acik.
- `MavenRunner` dogrudan native resolver/supervisor kullanir; varsayilan installed Maven, acik executable ve yalniz acik wrapper tercihi desteklenir. `-pl ... -am` modul kapsami ve onayli settings/toolchains yollarini tipli argv ile aktarir. Gercek Windows fixture'inda PATH Maven, mevcut wrapper'a tercih edildi. Yeni entegrasyon testi once RED (wrapper/exit 1), sonra 2/2 PASS; 4 ilgili eski test dosyasi 59/59 PASS. Bu yalniz runner katmanidir; normal dispatcher henuz Docker'dan cevrilmedi.
- Genis unit/contract/benchmark tekrarinda 61 dosyanin 60'i gecti, 605/606 test PASS; ilk `p01-release-gate` child full verifier sonucunda `mode` undefined oldu. Ayni dosya izole tekrar 40/40 PASS. Bu aralikli cocuk surec sorunu S00'da da gorulmustu; kok neden kanitlanmadi ve basarili tekrar ilk hatayi silmez. Sonraki tekrarda stderr/stdout/status gorunsun diye assertion tanisi genisletildi.
- Qwen ikinci salt okunur review, timeout/cancel/spawn error sonucunun normal run olarak donmesini ve explicit bos settings yolunun sessizce varsayilana kaymasini buldu. Her ikisi gercek Windows fixture'inda once RED goruldu; artik `MavenRunner.run` bu durumlarda `AppError` firlatir, bos yol reddedilir. Odak 3 dosya/13 PASS, typecheck exit 0. Qwen'in inherited JVM env'in identity'de yok iddiasi dogrulanmadi: `effectiveEnvironment()` birlestirilmis env'i hem resolver'a hem spawn'a verir; gercek version kaniti ise halen eksik.

## Acik is

- Maven `-v` ve etkin Java surum kanitini okuyup gizli degerleri acmadan plan digest'ine bagla. Varsayilan/ozel settings, toolchains, profile ve `.mvn` konfigurasyon byte hash'leri simdiden kimliktedir.
- Process kill sonrasi tree kapanisini/PID sahipligini kanitla; hard-kill/restart orphan ve late-result fence testleri ekle.
- Factory, dispatcher, services/config/entrypoint normal yola baglanacak. Eski runner config/job acik migration gerektirmeli.
- Native fixture entegrasyonu ve WN14-WN24 tamamlanmadan S02 LOCAL_VERIFIED/VERIFIED degildir. G1 GPU Maven/model, G2 apply, G3 yayin icin ayri onay gerekir.
