# Checkpoint - AITE-PRODUCTION-READINESS-005 P10/P09 reconciliation (full suite + manifest eksigi)

## Kimlik

- Tarih: 2026-10-12
- Paket: P10 teknik devir / P09 release reconciliation dar kapanis
- Baslangic HEAD: `675811216128a1ed0e29b8bd18d39e1561b5d2d9` (clean tree, dirty=false)
- Source tree digest: `961654ce71a568426d6ebf5f44c7445e6a2d40c02b81087eace3820762c4251d`
- Build stamp tree digest: ayni (dist bu kaynakla derlenmis; 190 dosya, 2 dist artifact)
- Git kimligi: repo-local `mehmet-karacan <karacan.mehmet@hotmail.com>` (dogrulandi; global config dokunulmadi)
- Korunan Java dosyalari: `java-support/src/main/java/com/aitest/support/JavaMetadataScanner.java` ve `java-support/src/test/java/com/aitest/support/JavaMetadataScannerTest.java` dokunulmedi. Not: onceki kayitlarda adi gecen `JavaMetadataScannerCoverageTest.java` bu checkout'ta yok; varsayilan sahibine tahmin yapilip uretilmedi, stage edilmedi.

## Okunan loglar (repo disi, gecici store; SHA256 + boyut)

| Log | Boyut | SHA256 |
| --- | --- | --- |
| fullsuite-p10.log | 5771 | 24571EC8279ABBEE28BE54D3031B48988EA149FE3AC3F5FDE39CF0E621858922 |
| isolated-p10.log | 2289 | EC85AC453BD2FA9FA6B3A0EE347499A70D7C1E3DBC0FC15E1E691DDAF1E8AC8C |
| p01a.log | 298 | BCC8BF86BDEB10097D314276DF96783D3B1C58E8A51D33983B3A9C7EBD0EB340 |
| p01b.log | 298 | 33A79FC10C03494693FB9C1252A6E27E5E989A783F4E54BB39A7A33C42A5C20B |
| build-p10.log | 286 | A9661D50F6FFABCDC751A8DEBF2EFEA3B6413BB6BC44D77B35E5FDA1A0BB200D |
| typecheck-p10.log | 62 | 83D13B8B92977169FA2C3FAF98BA0B35D51D2C37560AA7C6B5669EF7F3ACFDF5 |
| lint-p10.log | 16984 | F359CFF7BA315254858FD610B122D22C86591A6F36C9055293CFD6E5805CFEFE |
| npm-ci-p10.log | 154 | 6749AA3DAFDEEA8369C1E5A0C84388C20FCE434932B887F2D2B62B62F7ECA8B5 |

## Full suite sonucu (bu P10 reconciliation kosusu)

- `npm.cmd test` (vitest run): **74 test dosyasi, 639 PASS / 5 FAIL (toplam 644)**; 4 dosya failed | 70 dosya passed; sure 466.05s.
- Bu sonuc onceki `640 PASS/4 FAIL` kaydinin ayni daldaki yeniden kosusudur; fark yalniz yuk bagimli bir ek timeout (asagida P01 build_input_digest). Test mantigi degismedi; kod degisikligi YOK.

### 5 FAIL aciklamasi ve gercek niteligi

1. **AC67 (2 test)** `tests/security/pilot.test.ts` - `model'in gercek ciktisi ...` ve `model'in urettigi testlerle gercek Maven/JaCoCo ...`: `ENOENT tmp/pilot-stdout.txt`. Canli pilot cikti dosyasi yok; pilot `PAUSED_BY_USER`, canli model/provider run bu kosuda YOK. Kod kusuru DEGIL; ortam/pilot kaniti eksik. **PASS yapilamaz** (gercek canli kanit yok).
2. **P01 PP03 (1 test)** `tests/unit/p01-release-gate.test.ts` - `yanlis build_input_digest non-zero (PP03)`: full suite paralel yukunde 30000ms default timeout. Tekil kosuda **PASS** (p01a.log / p01b.log). `copyRepoForNegative()` tam repo kopyasi oldugundan yalniz paralel yukte 30s uzerine cikiyor; mantik hatasi DEGIL.
3. **P04 (1 test)** `tests/unit/p04-isolation-policy.test.ts` - `ensureVerified: capability_probe null VerifiedCapability uretilemez (kontrat)`: full suite yukunde 30000ms timeout. 3 dosyalik izole kosuda **PASS** (isolated-p10.log). Ortam/yuk bagimli flake; mantik hatasi DEGIL (onceki 11/11, 13/13 kanitlari korunur).
4. **P07-B (1 test)** `tests/integration/p07b-browser-e2e.test.ts` - `gercek browser print: CLI print-to-pdf gercek PDF uretir (print layout)`: 30000ms timeout; gercek browser print suresi full suite yuku altinda ortam/yuk bagimli akilliyor. Onceki `PP37 browser 4/4 PASS` kaydi korunur; bu satir yalniz bu kosunun yuku kaydedilir.

Sonuc: 5 FAIL'in tamaminda kod mantigi DEGIL; 2'si canli/pilot kaniti eksigi (AC67), 3'u paralel-yuk timeout flake'i (P01/P04/P07-B).

## P01 iki testin tekil kosuda PASS oldugu (acik ayrim)

- `p01a.log`: **1 passed | 39 skipped (40)**, sure 12.65s (tests 11.79s) -> PASS.
- `p01b.log`: **1 passed | 39 skipped (40)**, sure 10.96s (tests 10.24s) -> PASS.
- P01'in iki PP03 testi (`yanlis lockfile_sha256 non-zero`, `yanlis build_input_digest non-zero`) tekil (1 test/dosya) kosuda ~11sn'de tamamlandigi icin 30sn altinda -> **PASS**.
- Not: `isolated-p10.log` (3 dosyalik kosu) bu iki testi henuz 36-46sn'de calistirdigi icin timeout verdi; bu, tekil kosunun gercek surenin 30sn default'ten dusuk oldugunu gosterir. Temiz PASS kaniti tekil (p01a/p01b) kosusudur.

## Kalan pilot/browser/P04 ortam durumu (kod disinda, ayri tutulur)

- **Pilot (AC67 / RT21)**: `PAUSED_BY_USER`, gozlenen kabul `NOT_PASSED`, root_cause `UNRESOLVED`. Canli model/provider denemesi YAPILMADI. Kullanici acik onayi + gercek normal MCP canli kaniti olmadan PASS olamaz.
- **P07-B browser print**: gercek browser (Edge) DOM/print/offline/link e2e once 4/4 PASS kayitli; bu kosuda print adimi yalniz full-suite yuku altinda timeout. Ortam/yuk bagimli.
- **P04 capability_probe**: 3 dosyalik izole kosuda PASS; full yuku altinda timeout. Izolasyon/capability mantigi onceki 11/11 + 13/13 ile dogrulanmis; bu satir yalniz bu kosunun yuku kaydedilir.

## 274 obligation manifest eksigi (full gate; test sonucundan ACIKCA AYRI)

- `node scripts/release-verify.mjs --local`: **exit 0** (yapisal/fixture kontrolleri PASS; build stamp tree digest uyumlu).
- `node scripts/release-verify.mjs` (full, fail-closed): **exit 1, decision=NO_GO**, tek neden **`EVIDENCE_MANIFEST_EKSIK`** (`ai/acceptance/evidence-manifest.json` bulunamadi).
- Zorunlu obligation kumesi: **274** = AC70 + RG52 + RT28 + PRO60 + N64. Kayit: mandatory 274, verified **0**, missing **274**, invalid 0, duplicate 0.
- `live_pilot`: null (PAUSED_BY_USER; PASS yapilamaz).
- `platform_evidence`: null (Linux/macOS/Docker egress enforcement NOT_RUN/BLOCKED; PASS yapilamaz).
- **Karar:** Evidence manifest GERCEK kanitla doldurulamaz. Doldurmak icin canli pilot, platform ve egress kanitlari `PASSED` etiketli olarak uydurulmali idi; bu yasak. Dolayisiyla manifest **URETILMEDI** (fail-closed). Full gate **NO_GO** kalir.
- Bu 274 obligation manifest eksigi, test suite sonucundan (639 PASS/5 FAIL) tamamen ayri bir release bloklayicisidir; P10/P09 release reconciliation'unun tek asil kalanci budur.

## Build/typecheck/lint kaniti (bu kosu)

- `npm.cmd ci`: 236 paket, 0 vulnerability (npm-ci-p10.log).
- `npm.cmd run typecheck` (`tsc --noEmit`): PASS, cikti bos (temiz).
- `npm.cmd run build` (`tsc && write-build-stamp`): PASS; build-stamp.json yazildi, tree_digest `961654ce71a56842...`, 190 dosya, 2 dist artifact.
- `npm.cmd run lint`: **0 error / 89 warning** (mevcut kullanilmayan import/deger uyarilari; hata yok).
- Build stamp tree digest, source tree digest ile birebir uyumlu (dist stale DEGIL).

## Sinerler (korunan sinirlar)

- Urun kodu degistirilmedi; bu checkpoint yalniz `ai/checkpoints/` altina yazildi.
- Korunan Java dosyalari dokunulmedi; kullaniciya ait dirty/untracked dosya stage edilmedi (working tree clean).
- live/secret/CI/macOS'e dokunulmedi; CI kullanici karariyla kapali kalir.
- Canli pilot/benchmark/model denemesi baslatilmadi.
- Evidence manifest uydurulmadi; PASS etiketi gercek kanit olmadan verilmedi.

## Git kimlik + staged diff + gizlilik kontrolu

- Git kimligi repo-local `mehmet-karacan <karacan.mehmet@hotmail.com>` (ayni son commit kimligiyle tutarli).
- Staged diff: yalniz bu yeni checkpoint dosyasi; iceriginde secret, ic altyapi adresi, ham oturum veya customer verisi YOK (gizlilik kontrolu yapildi).
- Commit mesajlari Turkce ASCII.

## Sonraki somut is

- P07-B COMPLETED + Report06 export runtime kosusu: Docker egress enforcement altyapisi (network policy/proxy) kullanici onayiyla saglaninca.
- P08: gercek binary surum-atlayi upgrade/rollback e2e + macOS.
- Canli pilot/benchmark: yalniz kullanici acik onayiyla, ayri kosuda.
- Bu dis kanitlar (canli + platform + egress + macOS) gerceklesince `ai/acceptance/evidence-manifest.json` GERCEK kanitla doldurulur ve full gate yeniden degerlendirilir; 274 obligation eksigi o zaman kapanir.
