# Checkpoint - 006 S00 scope mapping ve Windows baseline

- Tarih: 2026-10-12 (Europe/Istanbul)
- Gorev: `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`; aktif belge SHA-256 `59a08a4a2d626d9aa6cfb55faed82513964aabce45528890e7aa648afe371989`.
- Dal: `codex/windows-native-006` ayri worktree; bu checkpoint yazilmadan onceki HEAD `48da27e`. Ana `main` checkout degismedi; untracked `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` korunuyor.
- G0 acik. G1 gercek GPU Maven/model, G2 original checkout apply ve G3 yayin onayi verilmedi; bu asamada hicbiri baslatilmadi.

## Degisiklik ve review

- Eski 005 sozlesmesi byte/hash korunarak arsivde. `scope-windows-native-v1.json` ve `legacy-to-006.json` 320 tekil AC70/RG52/RT28/PRO60/N64/PP46 ID'yi tek tek tasir: 286 RETAINED, 25 REPLACED, 9 OUT_OF_SCOPE_BY_USER. Kaynak tablo satiri ve SHA-256 her mapping kaydinda.
- Per-ID karar digest'i `a0422803c7c1f772a92d8c7a4c9b139404fac5b816f7d93feefd05cea83cd914` hem scope/mapping'de hem validator kodunda pinli. RT15 gibi gecerli madde sayaçlarla birlikte onaysiz OUT_OF_SCOPE yapildiginda validator exit 1. Yanlis WN hedefi, kaynak satiri, eksik/mukerrer ID, eksik replacement ve yanlis evidence seviyesi de reddedilir.
- GLM mapping commit'i `e19f8eb`, coordinator cherry-pick'i `48da27e`. Qwen bagimsiz review ilk turda yetkisiz scope cikarma acigini ve Docker/Linux ifadeli 10 RETAINED satiri buldu. Duzeltme sonrasi yeniden dogruladi: 320 kaynak satiri arsivde birebir mevcut; karar/sozlesme hash'leri eslesiyor; 10 satir REPLACED ve Windows karsiliklari anlamli; acik high/medium bulgu yok.
- Gercek Docker runtime gerektiren 4 test `tests/retired/` altina tasindi ve aktif Vitest suite disina alindi; tarihsel dosyalar korundu. Genel Maven, browser, pilot ve yapisal testler emekli edilmedi. 005 pause metni bekleyen iki assertion 005 arsivine yoneltildi.
- `release-verify.mjs` unknown/duplicate/degersiz arguman ve unknown scope'u exit 1 reddeder; scope validator'u local/full yolda calisir. Eski 274-ID full verifier 006 kabullerini temsil etmedigi icin S09 yeni gate tamamlanana kadar `WINDOWS_006_FULL_GATE_PENDING` ile NO_GO verir. Local/full ayrimi korunur.

## Gercek Windows sonuc

| Kontrol | Sonuc |
| --- | --- |
| Node / npm | v24.14.1 / 11.11.0; lockfile `npm.cmd ci` exit 0 |
| `node scripts/validate-windows-scope.mjs` | exit 0 |
| Mapping negatif fixture'lari | yetkisiz removal, duplicate, missing, wrong WN/evidence exit 1; odak Vitest 13/13 PASS |
| Tarihsel pause + 274-ID NO_GO odagi | 3/3 PASS |
| `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint` | exit 0; lint 0 error/89 baseline uyari |
| `npm.cmd exec -- vitest run tests/unit tests/contract tests/benchmark --reporter=dot` | son sabit adayda 59 dosya/597 PASS, exit 0 |
| `node scripts/release-verify.mjs --local` | exit 0, LOCAL_PASS; production onayi degil |
| `node scripts/release-verify.mjs --scope windows-native-v1` | exit 1, NO_GO; `WINDOWS_006_FULL_GATE_PENDING` ve evidence eksik |

Ilk genis guvenli suite tekrari 59 dosya/596 PASS/1 FAIL oldu: `p01-release-gate` ilk child verifier sonucunda `mode` yoktu. Ayni test izole 1/1 PASS ve sonraki tam guvenli alt kume 597/597 PASS. Ilk child process'in signal/error/raw sonucunu kaydetmeyen test helper'ina tanilama alani eklendi. Koken kesin kanitlanmadi; bu ilk fail gizlenmez, sonraki tam Windows suite'te ayni failure izlenir. 597/597 sonucu bu ilk failure'i tarihsel kayittan silmez.

Kullanici `AKTIF_GOREV_006_PAKETI.zip` yolunu bildirdi. Paket icindeki yedi dosyanin hash/boyutlari manifestle eslesti. P08 patch'i orijinal kaynak blob'unda `git apply --check` ile uyumlu; bu patch restore atomikligi duzeltmesi degil. Salt okunur OpenCode hazirlik oturumu gecici cikartilmis patch kopyasina not ekledi; kopya orijinal ZIP'ten geri yuklendi ve SHA-256 `7cdf39c38da7046cf51122785b1830ea169e9c57b22f07e1714b15fb3160d68c` yeniden dogrulandi. Paket ham kanitlari public repoya eklenmedi.

## Devam

S01: patch'in 19 senaryosunu gercek Windows/Vitest/better-sqlite3 ile once kirmizi olarak calistir; EEXIST sonrasi eski DB/artifact korunumu kirmizi testi ekle; journal/recovery ve maintenance/GC sinirlarini uygula. Bağımsız reviewer ve native fault/crash kaniti olmadan S01 VERIFIED yazma. S02 native runner, S01 file boundary korunarak daha sonra paralel acilabilir. Full 006 karar NO_GO; G1/G2/G3 bekler.
