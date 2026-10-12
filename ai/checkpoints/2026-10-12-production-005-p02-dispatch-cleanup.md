# Checkpoint - AITE-PRODUCTION-READINESS-005 P02 dispatch cleanup

## Kimlik

- Tarih: 2026-10-12
- Paket: P02 baseline erken donuslerinde lease/heartbeat cleanup
- Baslangic HEAD: `2c514ab0b78d1abd9be5b6355d0cdb3735ca5ccc`
- Baslangic tree digest: `4493e7ac352652e8ff959e173659c14c312ba9fab47eee3031431539bc0e6d09`
- Baslangic worktree dirty: `true`; kullanici dosyasi `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dokunulmadi ve stage edilmeyecek.

## Yeni baseline kaniti

Baseline komutlari 2026-10-12 tarihinde Node.js `v24.14.1`, npm `11.11.0` ile kosuldu. Loglar repo disinda `%TEMP%` altinda tutuldu:

| Komut | Exit | Log SHA-256 |
| --- | ---: | --- |
| `npm.cmd ci` | 0 | `409DEDBCC4944E64B7E3FC5823E8B2D8146D88BA4CC0637353FA81AA209B849F` |
| `npm.cmd run typecheck` | 0 | `67DB91D213AB7BF299FC477825AF54B94DD50C0B85195F6F94E5F080FFDDCBC2` |
| `npm.cmd run build` | 0 | `7EA8664068651BD8CCC9C16D0D700AA6730308044E0CB7BF2E39FBDB2FE4703D` |
| `npm.cmd run lint` | 0; 92 warning, 0 error | `ECFD95780E8BFFCC6A92F8C20823E0AC1E9B43781203BBD86BEC241C5C5E7E88` |
| `npm.cmd test` | 0; 65 dosya, 574 passed, 10 skipped | `51C0217F5B68090B702563A0A26C7C13EB1A596A5A6BF59CEBA12588F497DA61` |
| `node scripts/release-verify.mjs` | 1; `NO_GO`, `EVIDENCE_MANIFEST_EKSIK` | `8FF5D5A832D7280E468E36A48F6237453AD2912BAEDA855EF228DB85F0897D62` |

Docker daemon bu ortamda kullanilamadi; customer Docker runtime kaniti bu checkpoint'in kapsami disinda `BLOCKED/NOT_RUN` kaldi.

## Yapilan duzeltme

- `JobDispatcher.dispatch` icindeki basarili ve catch cikislarinda bulunan heartbeat/lease temizligi ortak `finally` bloguna tasindi.
- Baseline sonucu `BASELINE_FAILED` ile erken donse dahi heartbeat timer'i kapatiliyor ve lease expire edilerek yeni dispatch'e acik birakiliyor.
- `tests/unit/p02-dispatch-cleanup.test.ts`, customer isolation kapisini testte kontrollu stub'layarak gercek host baseline erken donusunu calistiriyor ve lease'in expire oldugunu DB'den dogruluyor.

## Kanit

- `npm.cmd test -- --run tests/unit/p02-dispatch-cleanup.test.ts`: 1/1 PASS.
- `npm.cmd run typecheck`: PASS.

## Kalan sinir

- P02 Docker timeout/owned container stop ve iki process live kaniti Docker daemon saglanana kadar NOT_RUN/BLOCKED.
- P06 frozen candidate/final workspace ve exact counter sonraki pakettir.
