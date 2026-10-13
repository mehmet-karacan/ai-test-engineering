# S03 WN27/WN30: hedef disi sahiplik makbuzu karari

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s03-copy`.

## Gercek Windows kaniti

- `wn-copy-snapshot.test.ts` yeni fixture: native session `READY` sonrasi hard kill, sonra ayni hesap hedefte dosya, public manifest ve fiziksel FileId'leri dogru olan tam gorunumlu `.aitest-snapshot-session` uretir. Yeniden `copyTo` cagrisi `SNAPSHOT_OWNERSHIP_UNVERIFIED` verir; hedefteki uc dosyanin baytlari degismez. Komut: `npx vitest run tests/integration/wn-copy-snapshot.test.ts -t "forged complete receipt after READY"`; 1/1 PASS.
- `npx vitest run tests/integration/wn-copy-snapshot.test.ts`: 21/21 PASS (30.57 s). `npm run build`: PASS; TypeScript ve packaged process/file helper provenance denetimleri gecti.
- Onceki `2026-10-13-windows-native-006-s03-untrusted-marker.md` RED kanitinda eski `ALREADY_COMPLETE` yolu hedefteki forge edilebilir marker'i sahiplik sayabiliyordu. Bu fixture ayni guven sinirini hard-kill ve yeniden baslatma ile sabitler.

## Dar tasarim karari

Hedefin yanina veya ayni hesabin yazabildigi storage root'a bir sidecar koymak tek basina guvenilir sahiplik kurmaz. Ayni hesap hem hedefi hem sidecar'i taklit edebilir. Sidecar ve hedef yayini ayri dosya islemleri oldugundan hard kill, yalniz birinin kalmasina yol acar. Bu nedenle bu dilimde hedef disi owner journal uygulanmadi ve otomatik cleanup acilmadi.

Gelecek kalici claim icin otorite, S04'teki durable project/snapshot generation ve islemi kilitleyen transaction/fence ile tanimlanmali. Claim en azindan canonical hedef root volume+FileId, source snapshot digest, generation, native session kimligi, olusturulan her dosyanin volume+FileId/hash/byte receipt'i ve publish fazini baglamali. Claim'in yazari ve degistirme yetkisi tanimli olmali; ayni hesap tarafindan forge edilebilen serbest dosya kanit sayilmamali. Retry, journal checksum/sequence ile tum fiziksel receipt'leri eslestirmeden hicbir dosyayi silmemeli veya `ALREADY_COMPLETE` dememeli.

## Crash ve cakisma siniri

| Kesit / cakisma | Guvenli karar |
| --- | --- |
| Claim var, hedef yok | Claim tek basina yeni islem veya cleanup yetkisi vermez; generation/fence dogrulanana kadar karantina. |
| Hedef var, claim yok | Mevcut fail-closed karantina. |
| Claim ve hedef var, FileId/hash/generation farkli | Karantina; baskasinin ayni adli dosyasina dokunma. |
| Native publish sonrasi, durable commit oncesi kill | Startup, S04 journal ve fiziksel receipt'leri tekrar dogrulamali; aradaki bosluktan terminal sahiplik cikarilamaz. |
| Ayni hedefte iki oturum | Tek durable owner/fence olmadan ikisi de cleanup/publish yetkisi alamaz. |

WN27/WN30 tam VERIFIED degil. WN28/29 kalici scan generation ve tombstone S04 migration bagimliliginda; WN31 de bu sozlesme ve recovery kanitini bekliyor. G1/G2/G3 kapali.
