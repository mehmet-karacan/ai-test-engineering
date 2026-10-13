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
