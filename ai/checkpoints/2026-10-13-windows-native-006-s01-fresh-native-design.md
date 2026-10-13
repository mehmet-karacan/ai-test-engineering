# S01 fresh hedef native restore - RED ve karar siniri

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`.
- Mevcut `RestoreResult` API ve S01 korunan testleri bos hedefe basarili restore bekliyor. `fin11-lifecycle-ops`, `p08-restore-stale-wal`, `p08-upgrade-restore` bu yolu kullaniyor. Native helper opsiyonunu tum Windows cagrisina dogrudan default yapmak bu sozlesmeyi bozar.
- `node scripts/probe-restore-fresh-native.mjs --expect-blocked`: exit 0; `WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED`, hedef DB ve journal yaratilmadi. `node scripts/probe-restore-fresh-native.mjs`: beklenen RED exit 1, ayni reason. Yalniz `os.tmpdir()` sahipli fixture kullanildi.
- Mevcut C++ `session` READY icin oldDb dosyasini zorunlu acar. MOVE ilk adimi oldDb->preserved kabul eder; VERIFY ve CLOSE eski DB'nin preserved adina tasinmasini sart kosar. `recover-session` de hedef veya preserved adinda oldDb arar. TS journal `nativeInitial.oldDb` null kabul etmez. Yalniz TS opsiyonunu gevsetmek, kurtarma kanitini olusturmaz.

## Gerekli ayri native sozlesme

1. Fresh oturum, DB/WAL/SHM hedef adlarinin yoklugunu parent handle altinda dogrulamali; staged DB'yi FileId/byte/SHA ile pinlemeli. Beklenmedik rakip create olursa NO_REPLACE yayin reddedilmeli.
2. `stagedDb -> targetDb` ve ters MOVE icin ayni FileId receipt'leri gunluge fsync edilmeli. Read verify sirasinda raw writer guard ve COMMITTED terminal fsync sirasina devam edilmeli.
3. Fresh recovery, oldDb yoklugunu ve staged DB'nin yalniz staged veya target adinda oldugunu handle-relative READY ile ayirmali. Yayin sonrasi hard-kill halinde guvenli karar ya tam dogrulanmis yeni generation ya da kanitli onceki bos layout'tur; bos DB acilisi politikasinin journal'da acik olmasi gerekir.
4. Her kritik kesit icin gercek taskkill, rakip create, WAL/SHM ve blob kimligi negatif testleri olmadan native fresh yol production default olamaz.

WN11/12/13 ve S01 VERIFIED halen NO_GO. Bu belge/native RED, helper implementasyonu veya kabul iddiasi degildir. G1/G2/G3 kapali.
