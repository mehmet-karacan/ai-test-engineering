# 006 S02 toolchain pin dilimi

- Dal: `codex/windows-native-006-toolchain`; taban: `bcd3d95`.
- Kapsam: `windows-process-helper` dosya pin protokolu ve supervisor tarafinda beklenen SHA-256 aktarimi. Maven runner, dispatcher, registry ve customer gate degismedi.
- Yerel derleme: MSVC x64 `scripts/build-windows-process-helper.cmd native\bin` PASS; manifestte kaynak/binary SHA-256 guncellendi; `node scripts/verify-windows-process-helper.mjs` PASS.
- `npm run typecheck` PASS; `npx vitest run tests/integration/wn-toolchain-pin.test.ts` 2/2 PASS (gercek Windows dosya swap ve calisirken yazma reddi).
- Isleyis: helper, cmd'yi askida acmadan once beklenen dosyalari no-follow acip SHA-256 karsilastiriyor; dosya ve ata dizin handle'larini owned Job Object bosalana dek tutuyor. Dosya acilamazsa veya digest degisirse `pin_mismatch` ile fail-closed.
- Kalan risk: olmayan implicit `.mvn`/`.m2` config dosyasinin sonradan olusturulmasi, Maven/JDK'nin dosya disindaki bagimliliklari ve parent path in-place reparse degisikligi bu dilimle tam kanitlanmadi. WN15/WN18/customer readiness VERIFIED degil; bagimsiz adversarial kabul gerekiyor.
