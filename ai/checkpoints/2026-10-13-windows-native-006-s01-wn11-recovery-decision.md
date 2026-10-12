# WN11 restore recovery karar tablosu - dar v2 uygulama, tam kabul NO_GO

- Tarih: 2026-10-13 (Europe/Istanbul)
- Dal: `codex/windows-native-006-s01`; referans kod: `a0514f7`.

## 2026-10-13 dar v2 uygulama eki

- Yeni restore generation `formatVersion: 2` ve her asamada degismeyen eski DB/WAL varlik-byte-SHA256, eski SHM varligi, kaynak DB/manifest SHA256 ve tum beklenen blob path/hash/byte/eski-varlik listesini journal'a yazar. v1 kayitlari kendiliginden v2 sayilmaz; ayni generation'da evidence degisimi transition hatasidir.
- Yalniz son kaydi `PREPARED` veya `BLOBS_READY` olan ve restore oncesinde mevcut eski DB kaydi tasiyan v2 generation'da `Storage` acilisindan once DB owner lock alinir. Hedef DB/WAL byte kimligi, SHM varligi, staged snapshot hash'i, eski korunmus adlarin yoklugu ve mevcut yol segmentlerinde reparse bulunmamasi denetlenir. Kanitlar eslesirse `ROLLED_BACK` fsync edilir ve eski DB acilir. Hicbir DB, WAL, SHM veya blob silinmez/tasinmaz; yeni blob orphan kalabilir. Eski DB yoksa bos DB acilmasin diye fail-closed kalir; kimlik farki, v1, bozuk journal veya eski DB/sidecar tasinmaya basladiktan sonrasi da fail-closed kalir.
- Native Windows `taskkill /F` fixture'inda PREPARED, ilk blob link donusu ve BLOBS_READY kesintilerinden sonra gercek `Storage` eski job'u acti; eski DB rename ve sonraki 7 nonterminal kesilme noktasi bloklandi, COMMITTED acildi. `--expect-recovery` tam kabul modu halen 7 engel nedeniyle RED olmalidir. Bu dar recovery WN11/S01 VERIFIED degildir.
- GC bagimsiz P1: SQL binary path eslesmesi NTFS case varyantini gormuyordu. Farkli job'un READY `path.toUpperCase()` referansi kirmizi testte ilk blobu sildirdi. Sweep, BEGIN IMMEDIATE icinde tum silinmemis referanslari guvenli yol preflight'iyla ve mevcut dosyalarda `dev/ino` kimligiyle karsilastirir; case varyanti ve hard-link fixture'lari artik silmeyi bloke eder. Harici raw FS/DB yazari, fiziksel alias ve commit-sonrasi-unlink crash araligi yine NO_GO.
- Onceki dogrulama: ilgili 9 test dosyasi/89 PASS, `npm.cmd run typecheck`, `npm.cmd run build` ve `npm.cmd run lint` exit 0; lintte 89 eski warning. Son native 11 noktali hard-kill probe exit 0, PREPARED/LINK/BLOBS_READY eski job'u gercek Storage acilisinda gordu; `--expect-recovery` tam kabul 7 bloke asama nedeniyle beklenen RED. Stdio entrypoint erken journal kontrolu kaldirildi; tek startup kapisi Storage'in recovery+fail-closed kontroludur.
- DB/WAL/staged kimlik okumasinda buyuk dosyayi RAM'e alan `readFileSync` yerine sabit 1 MiB buffer ile streaming SHA-256 kullanilir; `fstat` boyut/mtime/ctime okumasi sirasinda degisirse fail-closed. Bu, raw dis yazari tum zamanlamalarda dislama kaniti degildir. Linked orphan blob ozellikle silinmez; mevcut eski DB'nin referanslari korunur, orphan temizligi ayri GC kanitina baglidir.
- BLOBS_READY dilimi son dogrulama: ilgili 9 dosya/96 PASS; typecheck/build/lint exit 0, 89 eski lint warning. Native 11 kesitlik hard-kill probe exit 0; 3 erken kesit acildi, 7 tasima/yayin kesiti bloke kaldi, COMMITTED acildi. DB/WAL hash farki, SHM kaybi ve her preserved sidecar varligi negatif fixture'larda recovery'yi reddetti. `--expect-recovery` 7 engel nedeniyle beklenen RED exit 1.
- Son probe guclendirmesi: 3 erken kesitte `test_jobs.old` var ve `artifacts.new` yok; COMMITTED kesitinde `artifacts.new` var ve `test_jobs.old` yok. Yedi aralikta gercek `Storage` acilisi `RESTORE_RECOVERY_REQUIRED` ile bloke. MOVE_DB/MOVE_WAL/MOVE_SHM kesitlerinde preserved DB hash'i eskiyle, staged DB hash'i v2 kaynakla es; WAL'in ve SHM yolunun hangi tarafta oldugu ayrica assert edilir. Bu dosya yerlesimi kaniti otomatik rename yetkisi vermez.
- G1 GPU/model, G2 original checkout apply, G3 yayin kapali; bu probe yalniz owned Windows Temp fixture kullanir.
- Tekrarlanabilir komut: `npm.cmd run build` ardindan `node scripts/probe-restore-hardkill.mjs`. Kabul icin kirmizi mod: `node scripts/probe-restore-hardkill.mjs --expect-recovery`; 11 kesilme noktasinin 3 erken durumunda eski DB acildi, 7 sonraki nonterminal noktada startup bloke kaldi, COMMITTED acildi. Bu nedenle tam recovery kabul modu beklenen exit 1 verdi.

## Native hard-kill kaniti

Fixture her denemede ayri `os.tmpdir()` altinda backup, eski hedef DB ve yeni blob olusturur. Child restore'un fsync edilmis journal fazinda veya atomik link/rename donusunde bloklanir; parent `taskkill /F /PID` ile process'i sonlandirir. Eski DB hash'i hedefte veya `restore-old-*` kopyasinda byte-ayni kalmali; DB/artifact SQLite owner lock'lari yeniden edinilebilmeli. Bu test process hard-kill icindir, power-loss veya dis surecin eszamanli dosya degistirmesini temsil etmez.

| Kesilme noktasi | Son journal | Eski DB | Startup |
| --- | --- | --- | --- |
| PREPARED fsync | PREPARED -> ROLLED_BACK | hedefte | eski DB kimligiyle acilis serbest |
| blob `linkSync` donusu | PREPARED -> ROLLED_BACK | hedefte, yeni blob diskte orphan kalir | eski DB kimligiyle acilis serbest |
| BLOBS_READY fsync | BLOBS_READY -> ROLLED_BACK | hedefte, DB/WAL/SHM henuz tasinmadi | eski DB kimligiyle acilis serbest |
| eski DB rename donusu | BLOBS_READY | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| eski WAL rename donusu | BLOBS_READY | korunmus adla; WAL kimligi korunur | RESTORE_RECOVERY_REQUIRED |
| eski SHM rename donusu | BLOBS_READY | korunmus adla; SHM yolu korunur | RESTORE_RECOVERY_REQUIRED |
| OLD_DB_PRESERVED fsync | OLD_DB_PRESERVED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| yeni DB rename donusu | OLD_DB_PRESERVED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| NEW_DB_PUBLISHED fsync | NEW_DB_PUBLISHED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| VERIFIED fsync | VERIFIED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| COMMITTED fsync | COMMITTED | korunmus adla | yeni `artifacts.new` acilir, eski `test_jobs.old` yok |

Raw DB/WAL ek probe: ayri child `better-sqlite3` ile hedef DB'yi WAL modunda acik tutarken `restoreBackup` `EBUSY` verdi; deneme oncesi/sonrasi DB, WAL ve SHM hash'leri esitti, journal `ROLLED_BACK` oldu. Bu tek zamanlama ornegi, raw connection'in restore'un her aninda dislandigini kanitlamaz. Ayrica SQLite readonly preflight SHM icerigini degistirebildi; SHM hash'i kalici eski-generation kimligi olarak kullanilamaz.

## Journal v2 kaniti ve kalan oneriler

`PREPARED` kaydi mutation baslamadan once asagidaki immutable kimlikleri fsync eder. Sonraki kayitlarin ayni evidence alanini tasimasi denetlenir. Delta kayitlari ve tam recovery ise halen oneridir.

| Alan | Gerekce |
| --- | --- |
| `formatVersion: 2`, `generation`, canonical hedef DB/artifact root | Uygulandi; eski v1 otomatik recovery'ye alinmaz. |
| `old.db` ve `old.wal`: varlik, byte sayisi, SHA-256; `old.shm`: varlik | Eski generation dosyalarini hedef/korunmus yerde tanimak. SHM ephemeral oldugu icin hash otorite degil. |
| Kaynak `state.db` ve manifest SHA-256 | Uygulandi; PREPARED recovery staged DB hash'ini kaynakla karsilastirir. Backup ID/byte kimligi ve sonraki faz kararlari henuz tamamlanmadi. |
| Tum beklenen blob path/hash/byte seti ve restore oncesi hedefte varlik | Yeni DB'yi tum referanslariyla dogrulamak; mevcut esit-hash blob ile yeni blobu ayirmak. |
| Her basarili `linkSync` sonrasi ayri fsync'li `BLOB_LINKED` delta kaydi | Gercekte bu generation'in yarattigi bloblari planlananlardan ayirmak. Link ile kayit arasinda hard-kill olursa sahiplik belirsiz kalir. |
| Her DB/WAL/SHM tasima ve yeni DB yayinindan sonra delta kaydi | Journal fazi mutation araligini tek basina anlatmadiginda dosya kimlikleriyle karari desteklemek. |

Journal'in kendi checksum'i kazara bozulma saptar; kaynak veya hedef dosyanin immutable oldugunu tek basina ispatlamaz. v1 `publishedBlobs` listesinin ayni generation icinde degisebilmesi 1 RED ile gorulup path/hash/sira immutable kontrolu eklendi; eski v1 yine recovery icin yeterli degildir. v2 beklenen blob setini her kayitta tekrar eder; bu O(n^2) buyuyebilir. Ileride immutable/fsync'li sidecar manifest + hash-referansli delta journal degerlendirilebilir; sidecar eksik/bozuksa fail-closed gerekir.

## Recovery karar tablosu (v2 PREPARED ve intact BLOBS_READY kodlandi)

| Gozlenen durum | Izin verilebilecek karar | Zorunlu kanit |
| --- | --- | --- |
| Journal yok, eski hedef tam; PREPARED yok | Eskiyi ac | Korunmus eski kopya yok; staged dosya yalniz yetim kabul edilir. |
| v2 PREPARED / ilk blob link araligi, eski hedef yerinde | Uygulandi: eskiyi ac ve generation'i terminal rollback yap | Restore oncesi eski DB mevcut, DB/WAL kimlikleri ve SHM varligi birebir, staged hash es, korunmus eski dosya yok; bloblar **silinmez**. |
| v2 BLOBS_READY, eski DB/WAL/SHM henuz tasinmadi | Uygulandi: eskiyi ac ve generation'i terminal rollback yap | PREPARED ile ayni kimlikler; preserved DB/WAL/SHM dosyalarinin hicbiri yok; bloblar **silinmez**. |
| DB/WAL/SHM tasima araligi | Henuz NO_GO; eskiyi geri koyma aday karar | Her eski dosya tam bir yerde (hedef veya korunmus), DB/WAL hash'i es; hedefteki rakip dosya yok veya kanitli yeni snapshot; raw DB connection yok; alias/handle kimligi ve her rename adimi journal'da kanitli olmali. |
| Yeni DB hedefte, eski korunmus | Dogrulanmis yeniyi commit et veya kanitli eskiye don | Yeni DB kaynak snapshot hash'i, SQLite integrity/FK ve tum blob hash/byte seti gecer; aksi durumda eski DB/WAL kimligi eksiksiz ve hedef rakipsiz. |
| Iki generation da kanitlanamiyor, journal torn/bozuk, yol kimligi degismis, raw writer var | Fail-closed | `RESTORE_RECOVERY_REQUIRED`; otomatik unlink/rename yok. |
| COMMITTED / ROLLED_BACK | Terminal yolu ac | Terminal kaydin checksum ve transition'i gecer; sonraki calismada DB/blob integrity ayri dogrulanir. |

`BLOB_LINKED` kaydi, link sonrasi ama kayit oncesi kesintide sahipligi ispatlayamaz. Recovery bu blobu silmemelidir. Kayitli yeni blob da baska bir normal is tarafindan referanslanmis olabilir; recovery sirf journal'a bakarak blob silmemelidir. Yetim temizligi ancak sonradan, guncel DB ref/pin dogrulamasi ve kendi GC kabuluyla yapilabilir.

### MOVE_DB / MOVE_WAL / MOVE_SHM salt-okunur karar siniri

| Hard-kill kesiti | Fixture'da kanitlanan layout | Tek basina kanitlanmayan karar |
| --- | --- | --- |
| MOVE_DB | Hedef DB yok; preserved DB eski SHA-256 ile es; staged DB yeni kaynak SHA-256 ile es. | Eski DB'yi hedefe rename ederken baska raw connection/alias sahibinin araya giremeyecegi ve ikinci kesintide ayni karar kaydinin tekrar guvenle uygulanabilecegi. |
| MOVE_WAL | DB ve WAL preserved adlarda eski hash'lerle es; hedef DB/WAL yok; eski SHM hedefte. | DB+WAL+SHM'nin birden fazla rename ile atomik eski generation'a donecegi; SHM icerigi kalici identity degil. |
| MOVE_SHM | DB/WAL preserved hash'lerle es, SHM preserved adinda; hedef DB/WAL/SHM yok; staged yeni snapshot hash'i es. | Tum sidecar'lar geri tasinirken raw SQLite handle ve fiziksel alias yarisi dislanamaz. |

Bu uc kesitte yeni DB henuz hedefte yayinlanmadi; staged snapshot hash'i tek basina yeni generation'in DB/blob referanslarini, butun blob sahipligini veya WAL izolasyonunu dogrulamaz. Eski nesle donus icin once OS duzeyinde acik handle/paylasim modu ve Windows final-path/file-ID alias karari, sonra per-move fsync'li journal ve ikinci hard-kill matrisi gerekir. Mevcut Node/better-sqlite3 kontrol kilidi dis raw SQLite handle'larini dislamaz; native bagimlilik/derleme veya API mimarisi karari gerekebilir. Bu karar verilmeden otomatik rename eklenmedi; 5 raw-process `EBUSY` ornek zamanlamasi evrensel kanit sayilmadi.

## NO_GO gerekcesi

Yeni v2 journal eski DB/WAL ve snapshot kimliklerini saklar; ancak gercekten yaratilan blob sahipliginin per-link kaydi ve DB/WAL/SHM tasima deltalari yoktur. Bu nedenle `BLOBS_READY` kaydi sonrasi eski DB tasinmaya basladiginda veya `OLD_DB_PRESERVED` sirasinda yeni DB yayinlandiginda otomatik rollback/commit acilmadi. v1 journal da fail-closed kalir. SQLite owner control DB yalniz bizim restore/publish/GC/backup akisimizi seri hale getirir; harici raw SQLite DB/WAL acilisini engellemez. Raw-open probe'daki `EBUSY` tum zamanlamalarin kaniti degildir; ayri WN12 bes durumlu raw process probe da yalniz ornek schedule kanitidir. Windows dizin fsync bulunmadigindan power-loss dayanikliligi ayrica kanitsizdir. Eski DB tasima sinirindan sonraki nonterminal fazlarda `RESTORE_RECOVERY_REQUIRED` korundu; WN11, WN12, WN13 ve S01 VERIFIED degildir.
