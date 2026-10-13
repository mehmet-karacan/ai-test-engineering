# 006 S02 toolchain pin dilimi

- Dal: `codex/windows-native-006-toolchain`; taban: `bcd3d95`.
- Kapsam: `windows-process-helper` dosya pin protokolu ve supervisor tarafinda beklenen SHA-256 aktarimi. Maven runner, dispatcher, registry ve customer gate degismedi.
- Yerel derleme: MSVC x64 `scripts/build-windows-process-helper.cmd native\bin` PASS; manifestte kaynak/binary SHA-256 guncellendi; `node scripts/verify-windows-process-helper.mjs` PASS.
- `npm run typecheck` PASS; `npx vitest run tests/integration/wn-toolchain-pin.test.ts` 2/2 PASS (gercek Windows dosya swap ve calisirken yazma reddi).
- Isleyis: helper, cmd'yi askida acmadan once beklenen dosyalari no-follow acip SHA-256 karsilastiriyor; dosya ve ata dizin handle'larini owned Job Object bosalana dek tutuyor. Dosya acilamazsa veya digest degisirse `pin_mismatch` ile fail-closed.
- Kalan risk: olmayan implicit `.mvn`/`.m2` config dosyasinin sonradan olusturulmasi, Maven/JDK'nin dosya disindaki bagimliliklari ve parent path in-place reparse degisikligi bu dilimle tam kanitlanmadi. WN15/WN18/customer readiness VERIFIED degil; bagimsiz adversarial kabul gerekiyor.

## 2. dilim: verified snapshot protokolu

- `NativeProcessPlan.pinnedInputs` beklenen `{path, sha256 | null}` listesini tasir. Supervisor listeyi yeniden hash'leyip guncellemez; onayli path seti tamligini kontrol edip native helper'a aynen iletir.
- `sha256:null` yokluk kaniti run boyunca garanti edilemedigi icin helper `pin_unavailable` ile CreateProcess oncesi durur. Dizin handle'i FILE_SHARE_READ ile acikken ayni cwd'de yeni ready dosyasi yaratildigi gercek Windows fixture'inda goruldu; yalniz baslangic/son yokluk kontrolu transient config injection'a karsi yeterli degil.
- `pin_mismatch` ve `pin_unavailable`, helper status + exit 102 + kontrol dizini temizligi kanitlandiginda `preSpawnNoChild=true` ve `ownedTreeDrained=true` dondurur. Diger spawn error'lar bu kaniti almaz.
- 5/5 gercek Windows fixture PASS: hash-sonrasi swap, canli executable/settings yazma reddi, eski resolver SHA ile pre-goal swap reddi, absent config fail-closed, parent junction reddi. `npm run typecheck` ve binary provenance PASS.
- Customer lifecycle full pinnedInputs ile calistiginda eksik implicit config bulunan proje `pin_unavailable` nedeniyle NO_GO kalir. S04 frozen config/policy cozumune kadar WN14/WN15/WN18 READY degil.
