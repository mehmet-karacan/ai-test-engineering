# AITE-PRODUCTION-READINESS-005 P08 cross-drive path fix

Tarih: 2026-10-12
Model: GLM-5.3-Flash-IT, xhigh
Branch: codex/glm-prod005-p08-platform-audit

## Bulgu

Windows'ta node:path `relative()` fonksiyonu farkli surucudeki hedef icin `D:\\...` gibi mutlak bir sonuc dondurebilir. Eski kontrol yalnizca `..` ile baslayan sonucu reddettigi icin backup manifest yolu kok disina kacabiliyordu.

## Duzeltme

`src/storage/lifecycle-ops.ts` icindeki createBackup, verifyBackup ve restoreBackup containment kontrollerine `isAbsolute(relativeResult)` kosulu eklendi. Boylece ust dizin ve cross-drive mutlak sonuc birlikte fail-closed reddediliyor.

## Kanit

- `tests/unit/p08-lifecycle-escape.test.ts`: eski kontrolun cross-drive kacisini ve yeni kontrolun valid=false sonucunu kanitliyor.
- Odak suite: 8 dosya, 47 test PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS; 191 kaynak dosyasi, 2 dist artifact.
- `npm.cmd run lint`: 0 error; mevcut warningler devam ediyor.
- Tam suite bu checkpoint icin kosulmadi; onceki reconciliation kanitindaki bilinen ortam/timeout sonuclari yeniden uretilmedi.

## Kapsam

MacOS bu kullanici oturumunda kapsam disidir. P08 Windows path ve runtime kaniti uzerinden ilerletilir; macOS kaniti uretilemez ve kalan is olarak sayilmaz.

## Git

Kod degisikligi ve bu checkpoint ayni branch'te commit edilip origin'e pushlanacaktir. Korunan kullanici untracked Java dosyasi stage edilmemistir.
