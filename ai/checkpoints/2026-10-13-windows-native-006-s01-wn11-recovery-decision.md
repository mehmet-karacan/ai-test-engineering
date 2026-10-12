# WN11 restore recovery karar tablosu - tasarim, NO_GO

- Tarih: 2026-10-13 (Europe/Istanbul)
- Dal: `codex/windows-native-006-s01`; referans kod: `a0514f7`.
- G1 GPU/model, G2 original checkout apply, G3 yayin kapali; bu probe yalniz owned Windows Temp fixture kullanir.
- Tekrarlanabilir komut: `npm.cmd run build` ardindan `node scripts/probe-restore-hardkill.mjs`. Kabul icin kirmizi mod: `node scripts/probe-restore-hardkill.mjs --expect-recovery`; 10 nonterminal kesilme noktasinda startup hala bloke oldugu icin beklenen exit 1 verdi. Bu kirmizi mod mevcut fail-closed davranisi hata olarak degil, henuz yapilmamis otomatik recovery kabulunun eksikligi olarak olcer.

## Native hard-kill kaniti

Fixture her denemede ayri `os.tmpdir()` altinda backup, eski hedef DB ve yeni blob olusturur. Child restore'un fsync edilmis journal fazinda veya atomik link/rename donusunde bloklanir; parent `taskkill /F /PID` ile process'i sonlandirir. Eski DB hash'i hedefte veya `restore-old-*` kopyasinda byte-ayni kalmali; DB/artifact SQLite owner lock'lari yeniden edinilebilmeli. Bu test process hard-kill icindir, power-loss veya dis surecin eszamanli dosya degistirmesini temsil etmez.

| Kesilme noktasi | Son journal | Eski DB | Startup |
| --- | --- | --- | --- |
| PREPARED fsync | PREPARED | hedefte | RESTORE_RECOVERY_REQUIRED |
| blob `linkSync` donusu | PREPARED | hedefte, yeni blob diskte | RESTORE_RECOVERY_REQUIRED |
| BLOBS_READY fsync | BLOBS_READY | hedefte | RESTORE_RECOVERY_REQUIRED |
| eski DB rename donusu | BLOBS_READY | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| eski WAL rename donusu | BLOBS_READY | korunmus adla; WAL kimligi korunur | RESTORE_RECOVERY_REQUIRED |
| eski SHM rename donusu | BLOBS_READY | korunmus adla; SHM yolu korunur | RESTORE_RECOVERY_REQUIRED |
| OLD_DB_PRESERVED fsync | OLD_DB_PRESERVED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| yeni DB rename donusu | OLD_DB_PRESERVED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| NEW_DB_PUBLISHED fsync | NEW_DB_PUBLISHED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| VERIFIED fsync | VERIFIED | korunmus adla | RESTORE_RECOVERY_REQUIRED |
| COMMITTED fsync | COMMITTED | korunmus adla | acilis serbest |

Raw DB/WAL ek probe: ayri child `better-sqlite3` ile hedef DB'yi WAL modunda acik tutarken `restoreBackup` `EBUSY` verdi; deneme oncesi/sonrasi DB, WAL ve SHM hash'leri esitti, journal `ROLLED_BACK` oldu. Bu tek zamanlama ornegi, raw connection'in restore'un her aninda dislandigini kanitlamaz. Ayrica SQLite readonly preflight SHM icerigini degistirebildi; SHM hash'i kalici eski-generation kimligi olarak kullanilamaz.

## Onerilen journal v2 kaniti

`PREPARED` onceki kayit, mutation baslamadan asagidaki immutable alanlari fsync etmelidir. Her sonraki kayit ayni immutable alan digest'ini ve generation'i tasimalidir; parser degisimi reddetmelidir.

| Alan | Gerekce |
| --- | --- |
| `format_version: 2`, `generation`, canonical hedef DB/artifact root | Eski v1'i otomatik recovery'ye almamak; yalniz ayni kaynaklara karar vermek. |
| `old.db` ve `old.wal`: varlik, byte sayisi, SHA-256; `old.shm`: varlik | Eski generation dosyalarini hedef/korunmus yerde tanimak. SHM ephemeral oldugu icin hash otorite degil. |
| `source_backup_id`, backup `state.db` ve manifest byte/hash kimligi | Backup dizini degisse bile hangi snapshot'in kopyalandigini tanimak. Staged ve yayinlanmis DB hash'i kaynak snapshot ile eslesmeli. |
| Tum beklenen blob path/hash/byte seti ve restore oncesi hedefte varlik | Yeni DB'yi tum referanslariyla dogrulamak; mevcut esit-hash blob ile yeni blobu ayirmak. |
| Her basarili `linkSync` sonrasi ayri fsync'li `BLOB_LINKED` delta kaydi | Gercekte bu generation'in yarattigi bloblari planlananlardan ayirmak. Link ile kayit arasinda hard-kill olursa sahiplik belirsiz kalir. |
| Her DB/WAL/SHM tasima ve yeni DB yayinindan sonra delta kaydi | Journal fazi mutation araligini tek basina anlatmadiginda dosya kimlikleriyle karari desteklemek. |

Journal'in kendi checksum'i kazara bozulma saptar; kaynak veya hedef dosyanin immutable oldugunu ispatlamaz. v1 `publishedBlobs` listesinin ayni generation icinde degisebilmesi ayrica 1 RED ile goruldu ve `transitionValid` bu listenin path/hash/sira kimligini artik denetliyor; ilgili 2 dosya/26 PASS. Bu dar dogrulama eski v1'i recovery icin yeterli yapmaz. Beklenen blob setini her kayitta tekrar etmek O(n^2) buyur; v2 icin immutable/fsync'li sidecar manifest + hash-referansli delta journal daha uygun olabilir. Sidecar eksik/bozuksa fail-closed gerekir. Eski v1 kayitlari v2 kabulune otomatik cevrilmemelidir.

## Recovery karar tablosu (tasarim; kodlanmadi)

| Gozlenen durum | Izin verilebilecek karar | Zorunlu kanit |
| --- | --- | --- |
| Journal yok, eski hedef tam; PREPARED yok | Eskiyi ac | Korunmus eski kopya yok; staged dosya yalniz yetim kabul edilir. |
| PREPARED / blob yayin araligi, eski hedef yerinde | Eskiyi ac ve generation'i terminal rollback yap | DB/WAL eski kimlikleri birebir, yeni DB hedefte yok; bloblar **silinmez**. |
| DB/WAL/SHM tasima araligi | Eskiyi geri koy | Her eski dosya tam bir yerde (hedef veya korunmus), DB/WAL hash'i es; hedefteki rakip dosya yok veya kanitli yeni snapshot; raw DB connection yok. |
| Yeni DB hedefte, eski korunmus | Dogrulanmis yeniyi commit et veya kanitli eskiye don | Yeni DB kaynak snapshot hash'i, SQLite integrity/FK ve tum blob hash/byte seti gecer; aksi durumda eski DB/WAL kimligi eksiksiz ve hedef rakipsiz. |
| Iki generation da kanitlanamiyor, journal torn/bozuk, yol kimligi degismis, raw writer var | Fail-closed | `RESTORE_RECOVERY_REQUIRED`; otomatik unlink/rename yok. |
| COMMITTED / ROLLED_BACK | Terminal yolu ac | Terminal kaydin checksum ve transition'i gecer; sonraki calismada DB/blob integrity ayri dogrulanir. |

`BLOB_LINKED` kaydi, link sonrasi ama kayit oncesi kesintide sahipligi ispatlayamaz. Recovery bu blobu silmemelidir. Kayitli yeni blob da baska bir normal is tarafindan referanslanmis olabilir; recovery sirf journal'a bakarak blob silmemelidir. Yetim temizligi ancak sonradan, guncel DB ref/pin dogrulamasi ve kendi GC kabuluyla yapilabilir.

## NO_GO gerekcesi

Mevcut v1 journal yalniz planlanan `publishedBlobs` listesini saklar; eski DB/WAL varligi ve hash'i, yeni snapshot/manifest kimligi ve her gercek link olayi yoktur. Bu durumda `BLOBS_READY` sirasindaki old-DB move, `OLD_DB_PRESERVED` sirasindaki new-DB publish ve link-kayit araligi guvenli otomatik rollback/commit icin ayirt edilemez. SQLite owner control DB yalniz bizim restore/publish/GC/backup akisimizi seri hale getirir; harici raw SQLite DB/WAL acilisini engellemez. Raw-open probe'daki `EBUSY` tum zamanlamalarin kaniti degildir. Windows dizin fsync bulunmadigindan power-loss dayanikliligi de ayrica kanitsizdir. Bu nedenle v2 schema ve tam kill matrisi bitmeden recovery kodu eklenmedi; `RESTORE_RECOVERY_REQUIRED` korundu. WN11, WN12, WN13 ve S01 VERIFIED degildir.
