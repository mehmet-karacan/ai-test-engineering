# S02 WN15 kurulum preflight ve dizin uyeligi siniri

Tarih: 2026-10-13. Onceki dilim: `5c6d24f`.

## Kapali preflight aciklari

- Lifecycle'li `verifyNativeToolchain`, `distributionManifestComplete=false` planini `-v` veya goal helper'ina gitmeden `TOOLCHAIN_DISTRIBUTION_UNVERIFIED` ile reddeder. Eski davranis RED fixture'da `NATIVE_INPUT_PIN_UNAVAILABLE` icin gercek helper'a gidiyordu.
- `CustomerRunnerFactory.prepareNativeCustomerToolchain` readiness ileride acilsa bile owner lifecycle olmadan `NATIVE_PROCESS_OWNERSHIP_UNVERIFIED` ile reddeder. Ilk RED testinde test-only readiness stub sonrasi lifecycle olmadan yerel `-v` basarili olmustu; bu yol artik kapali.
- Eski sentetik lifecycle pin-propagation testi standart fake Maven/JDK agaci kullanarak beklenen verified digest listesinin goal'a aynen tasindigini korur. Normal dispatcher fake proje testinde yeni erken typed blocker beklenir, `baseline_ok` veya Surefire raporu uretilmez.

## Dizin uyeligi RED kaniti ve NO_GO

- Gercek Windows helper manifesti `.cmd` ve mevcut `lib/old.jar` dosyasini no-follow handle ile tutarken ayni `lib` dizinine `new.jar` yazimi basarili oldu. "Yeni dosya yaratilamaz" oracle'i RED verdi; kalici fixture gozlenen acikligi ve cancelled/101 cleanup'i dogrular.
- Manifest SHA-256 ve dosya handle'lari mevcut baytlari sabitler; ayni kullaniciya yazilabilir kurulum dizininin uyeligini sabitlemez. Start/end yeniden tarama veya directory share modu, ara surecte yeni dosya calistirilmasini dislayan guvenilir kanit degildir. Bu riski kapatan kaynak/dizin nesli protokolu henuz yok; WN14/15/18 musteri hazirligi NO_GO kalir.
- Lifecycle'siz `MavenRunner()` yalniz standalone gelistirme/fixture yolu olarak yeni snapshot alir. Bu P2 ayrimi urun public customer yolunda acilmamalidir; customer factory lifecycle zorunlulugu simdilik korur. G1 musteri Maven/model, G2 apply, G3 publish kapali.

## Dogrulama

- RED: `tests/unit/wn-install-preflight.test.ts` iki hata; helper altindaki dizine yeni dosya ekleme deny-oracle'i bir hata.
- GREEN: ilgili 4 dosya / 26 test PASS (`--maxWorkers=1`); `npm run typecheck` ve `npm run build` exit 0. Hedef ESLint 0 error, 2 eski `runner-factory.ts` unused-import warning.
