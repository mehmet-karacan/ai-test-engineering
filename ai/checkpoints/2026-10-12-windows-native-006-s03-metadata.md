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

## Phase C - snapshot junction denetimi

- Kod incelemesinde `SourceSnapshot.walk` icindeki `resolve()` cagrisinin junction hedefini izlemedigi goruldu. Dahil edilmesi gereken `.mvn` junction girdisi manifestten sessizce dusuyordu. `copyTo` da hedef altindaki junction'a yazabiliyordu.
- Yeni fixture'lar bu iki durumu RED olarak dogruladi. Snapshot'a dahil edilen symlink/junction girdileri ve kopya oncesinde kaynak/hedef yol segmentlerindeki baglantilar simdi `POLICY_VIOLATION` ile reddedilir; eski cikti dizinleri halen atlanir.
- `npm.cmd exec -- vitest run tests/integration/wn-inventory.test.ts tests/unit/discovery.test.ts tests/unit/p03-checkpoint-identity.test.ts`: 3 dosya/57 PASS. `typecheck`, `build`, `lint`, `git diff --check`: exit 0. Lint 89 mevcut warning, 0 error.
- Sinir: check ile `copyFileSync` arasindaki eszamanli reparse degisimi icin OS duzeyinde no-follow/open handle garantisi henuz yok. Tam S03 ve WN25-WN31 dogrulanmis sayilmaz; S04 bagimliligi suruyor.

## Phase D - Windows no-follow API incelemesi (kod degisikligi yok)

- Yerel Node `v24.14.1` / libuv `1.51.0` uzerinde `fs.constants.O_NOFOLLOW`, `O_SYMLINK` ve `O_EXLOCK` tanimli degil. Node 24 [fs flags belgesi](https://nodejs.org/docs/latest-v24.x/api/fs.html) Windows'ta kullanilabilir open flag listesini veriyor; listede `O_NOFOLLOW`/`O_SYMLINK` yok. [libuv fs belgesi](https://docs.libuv.org/en/v1.x/fs.html) `UV_FS_O_NOFOLLOW` icin Windows destegi olmadigini acikca belirtiyor.
- Win32 [CreateFileW belgesi](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) `FILE_FLAG_OPEN_REPARSE_POINT` ile mevcut symlink'in hedefi yerine link handle'inin acilabildigini belirtiyor. Node `fs.open`/`copyFile` bunu desteklenen bir secenek olarak sunmuyor; path segmentlerini bagli dizin handle'lari uzerinden atomik olarak acan bir Node fs API'si de tespit edilmedi.
- `lstat` sonra `copyFileSync` kontrolu, source dosyasini `openSync` ile acip fd'den okumak ve target icin `wx` kullanmak yalniz son dosya/overwrite riskini azaltir; parent junction degisimi ile check-open araligi acik kalir. Bu kombinasyon WN25-WN30 icin tam no-follow sahiplik kaniti sayilmaz.
- Varsayilan yeni native bagimlilik/admin/PowerShell olmadan garanti veren bir tasarim bulunmadi. Ileride desteklenen Win32 handle koprusu veya kaynak/hedef dizin sahipligini dis sureclerden de koruyan acik bir ownership protokolu gerekir. Bu karar ve fault fixture'lari dogrulanana kadar S03 PARTIAL/NO_GO.

## Phase E - ADR-007 ilk native dosya koprusu (2026-10-13, partial)

- Kullanici ADR-007 ile dar Windows native bridge'i onayladi. S02 surec koprusunden bagimsiz `native/windows-file-helper.cpp` ve `scripts/build-windows-file-helper.cmd` eklendi; `package.json` S02 sahipliginde oldugundan degistirilmedi. MSVC BuildTools 17.14.37710.0 / cl 14.44.35207, SDK 10.0.26100.0 ile ek kurulum olmadan derlendi. Yerel cl.exe SHA256 `FE251EF50A1545B1B0835EE17B1E785459712B38D79E45B5C1D3D28970A36619` (Microsoft imzasi valid); bu kaynak SHA256 `088CEE9726173CCD1EA0890706361E81CC0F9B767304F98A519BFF8DF085848C`, Temp'te derlenen EXE SHA256 `8F44CFECFF32F5C6863A9DC497DE59A247496A36B6055EFA1A3DEC6F0219774A`. EXE/OBJ repoya alinmadi.
- `NtCreateFile` RootDirectory ile her cocuk handle-held parent'a gore ve reparse takip etmeden acilir. `inspect` volume serial + 128-bit file ID + link count + bytes verir. `copy` kaynak son handle'inda write sharing'i, hedef CREATE_NEW handle'inda tum sharing'i kapatir; kaynak hardlink count 1 gerekir, farkli volume typed reject edilir, hedef dosya kimligi/byte/hash ve kaynagin copy sonrasi kimligi/size/mtime tekrar dogrulanir. Hata halinde hedef handle'ina disposition istenir. TS adaptorunde helper absolute path, realpath ve SHA256 beklenen manifest hash'iyle kontrol edilir.
- RED: ilk test eksik modul; sonra helper spec gecisi; sonra dizin identity icin file-only open. GREEN: `npm.cmd exec -- vitest run tests/integration/wn-file-bridge.test.ts` 1 dosya/4 PASS. Fixture hardlink/case alias kimligi, dizin kimligi, ara junction, mevcut hardlink hedefte no-overwrite, Unicode `.mvn` copy, concurrent junction swap ve farkli drive typed reject'i kapsar. `npm.cmd run typecheck`, `build`, `lint`, `git diff --check` exit 0; lint 89 mevcut warning, 0 error.
- Sinir: bu helper yalniz inspect/copy dilimidir; mevcut `SourceSnapshot.copyTo` henuz buraya bagli degil. 8.3 kisa ad alias'i ve iki gercek volume arasi fixture yok; farkli drive root istemi mutasyondan once reddedilir. Hata disposition sonucunun basarisi ayrica kanitlanmadi; yarim hedef kalirsa fail-closed yeniden kullanilmaz. Yardimci EXE hash kontrolu ile spawn arasinda paketleme sahipligi yarisi ve build-manifest release provenance aciktir. Kalici S04 cursor/incremental state yok. S01 icin gereken session boyunca raw SQLite handle exclusion, pinned rename/delete/publish ve durable journal receipt bu dilimde yok; WN11/12/13 ve S03 NO_GO surer.

## Phase F - SQLite read-share guard prototipi (2026-10-13, partial)

- `hold-read` komutu DB dosyasini canli handle uzerinde `GENERIC_READ` + `FILE_SHARE_READ` ile tutar, stdin EOF'ta birakir. Gercek Windows Temp better-sqlite3 WAL fixture'inda bu sirada read-only `SELECT` basarili, ayni surec writer `INSERT` hata veriyor, ayri raw Node/better-sqlite3 writer child exit nonzero. `npm.cmd exec -- vitest run tests/integration/wn-file-bridge.test.ts`: 1 dosya/5 PASS.
- Bu yalniz guard paylasim modu kanitidir. Mevcut hedef DB'den staged DB'ye guard'in kesintisiz aktarimi, WAL/SHM sidecar'lari, rename/delete receipt dayanimi ve hard-kill recovery henüz yok. `verifyPublishedRestore` ile birlikte WN12 PASSED sayilmaz.

## Phase G - rename handle ve bosluksuz guard devri (2026-10-13, partial)

- `hold-rename`: `GENERIC_READ|DELETE`, share READ ile acik handle ayni WAL fixture'inda SQLite read-only acilisini bloke etti. Bu RED sonuc, Phase F read-only handle kanitinin rename-capable handle'a dogrudan genellenemeyecegini gosterir.
- `hold-transition`: rename-capable handle canliyken ayni DB'ye ikinci `GENERIC_READ`, share READ|DELETE handle acildi; volume/file ID, link count, byte ve mtime esligi dogrulandi. Ilk DELETE handle'i ikinci handle kapanmadan birakildi. Yeni guard boyunca better-sqlite3 read-only `SELECT` basarili, ayri raw writer child basarisiz. Bu yalniz tek DB dosyasinda, restore move/yayin olmadan guard paylasim modu kanitidir.
- `npm.cmd exec -- vitest run tests/integration/wn-file-bridge.test.ts`: 1 dosya/5 PASS. WAL/SHM guard'i, gercek rename/no-replace, receipt+journal kill araligi ve baslangicta acik raw reader/writer durumlari ayri kanit ister. WN12 halen NO_GO.

## Phase H - pinned same-directory rename probe (2026-10-13, partial)

- Fixture once eksik `rename-probe` komutuyla RED idi. `SetFileInformationByHandle(FileRenameInfo)` non-null RootDirectory ile Windows'ta ERROR_INVALID_PARAMETER 87 verdi. Native `NtSetInformationFile(FileRenameInformation=10)` ve tutulan hedef dizin handle'i ile `ReplaceIfExists=FALSE` kullanildi; bu hostta mevcut hedef ezilmeden reddedildi, bos hedefe move basardi. Move oncesi/sonrasi volume/file ID/link count/byte/mtime esligi korundu.
- `rename-probe` tek cagrili kanittir; session boyunca kaynak/yeni DB korumasi veya journal receipt saglamaz. S01 restore entegrasyonu ve WN12 NO_GO degismedi.

## Phase I - persistent restore file session ve paketleme (2026-10-13, partial)

- Helper `session` modu READY oncesinde old DB, varsa old WAL/SHM ve staged DB'yi handle-relative no-follow, READ|DELETE/share READ ile pinler. `MOVE` yalniz `dbName.restore-UUID` staging ve tek `.restore-old-UUID` preservation ad duzeninde, oldDb->oldWal->oldShm->stagedDb sirasiyla veya ters rollback sirasiyla kabul edilir. Her move expected volume/FileId/bytes/SHA256'yi dosya handle'inda dogrular; `NtSetInformationFile` RootDirectory ile NO_REPLACE move yapar; ayni kimlikte before/after receipt yazip flush eder. Receipt stdout'tur, kendi basina kalici journal degildir.
- `VERIFY` yalniz tum eski girdiler korunup yeni DB yayinlandiginda, yeni DB icin DELETE handle canliyken ayni FileId read/share READ|DELETE guard'i acarak bosluksuz devir yapar. Verifier kapaninca ters `MOVE` read guard'dan rename handle'a bosluksuz geri donebilir. `CLOSE` READY ve ara durumlarda exit2; ancak VERIFY_READY sonrasi yayin veya acik rollback tamamlaninca exit0.
- Her komuttan once absent WAL/SHM hala absent, mevcut yan dosyalar ise pinned FileId/bytes/mtime/SHA256 ile ayni mi kontrol edilir. READY'den sonra unowned WAL olusturma fixture'i exit2, dosyayi korur. Acik raw better-sqlite3 DB handle ile session READY vermez. MOVE receipt sonrasinda helper kill fixture'i eski DB'yi preserved ve yeni staged DB'yi degismemis buldu; journal'in nonterminal kalmasi S01 caller sorumlulugudur.
- `src/discovery/windows-file-bridge.ts` `assertTrustedWindowsFileHelper` ve `packagedWindowsFileHelper` export eder. Paket `native/bin/windows-file-helper.exe`, `native/windows-file-helper.manifest.json` ve `scripts/verify-windows-file-helper.mjs` ile source/binary SHA dogrular. Son source SHA256 `ced576a8760e178995ff781a5178a96a834b550d2faebc15874e076628b7e2fe`, binary SHA256 `1c1f7981d8563cfe20660354e547037e62b191d6207d0cfa92a492501a819e09`; binary Authenticode `NotSigned`, cl.exe Microsoft imzasi onceki kayitta. Tamper fixture ayni manifestle degistirilmis EXE'yi reddetti. `package.json` S02/coordinator sahipliginde oldugu icin bu dalda build verify baglantisi eklenmedi; coordinator merge sonrasi ekleyecek.
- `npm.cmd exec -- vitest run tests/integration/wn-file-bridge.test.ts`: 1 dosya/13 PASS; `npm.cmd run typecheck`: exit0; `node scripts/verify-windows-file-helper.mjs`: exit0. Derleyici/SDK Temp build'i disinda musteri checkout/GPU kullanilmadi.
- Sinir: S01 journal receipt fsync ile helper MOVE arasindaki hard-kill recovery ve raw cross-process zamanlamasi tam kapanmadi. Absent sidecar, kontrol ile MOVE arasinda dogrudan dis surec tarafindan yaratilabilir; main DB guard raw SQLite acilisini bloke etse de tum dosya sistemi aktorleri icin atomik dislama kaniti yok. Yan dosyalar verifier tarafindan olusturulursa sahiplik/cleanup entegrasyonu gerekir. Native `deleteOwned`/`publishOwned`, S03 SourceSnapshot kullanimi, S04 kalici state ve 8.3/ikinci gercek volume fixture'i acik. WN11-13, S03 VERIFIED ve G1/G2/G3 NO_GO.
