# Checkpoint - Arastirma 2026-10-19 F02/F03 kalite kapisi duzeltmeleri

- Tarih: 2026-10-19
- Dal: `codex/glm-quality-gate-fix` (taban: `bd3db1820339d543c8d3c9f4931846def17c3ea0` = windows-native-006 r16 kaynak commit'i; dagitilan worktree kimligiyle ayni)
- Calisma kopyasi: `C:\Users\mkaracan\AppData\Local\Temp\opencode\qfix` (owned; dagitilan r16 worktree'si ve kullanici checkout'u dokunulmadi)
- Model: `litellm/GLM-5.3-Flash-IT` (sabit; fallback yok)

## Kaynak arastirma paketi

- ZIP: `C:\Users\mkaracan\Downloads\AI_Test_Engineering_Arastirma_2026-10-19.zip` (383030 bayt)
- MANIFEST.json: 22 dosya SHA-256 + byte dogrulandi (22/22 OK)
- Arastirma ortami: Linux/Node 22.16.0, LOCAL_COMPONENT_ADAPTER_ONLY; tam urun suite'i koşulmadi (raporun kendi beyani)
- Probe kaynak blob'lari yerel git'te dogrulandi: quality-gate.ts `772d407457205485d8bfedacf12d76922e81fff5`, pit-adapter.ts `af318d0bf90c5a2a83bf914f5710e5fb97ce7a8a` (windows dalindaki blob'larla birebir ayni)

## F01 - Dagitim kimligi dogrulamasi (duzeltme gerektirmedi; kanit kaydi)

- main `3e1f63a1...` ile `codex/windows-native-006` `bd3db182...` karsilastirildi: diverged, windows 348 ahead/1 behind (arastirma R17 ile ayni).
- Dallar tek ortak atadan (`3b1916ed`) ayrismis; windows dali r15 GO'dan sonra yalniz kanit/ledger commitleri iceriyor (`62ea5f7` -> `bd3db18`); main ise kapsam/macOS test temizligi (`3e1f63a`) ve 004 devir kaydi (`3b1916e`).
- Dagitilan MCP sunucusu kullanici `opencode.json`'da `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering\dist\mcp\stdio-entry.js` olarak kayitli; bu worktree HEAD'i `bd3db182` ve `git status` temiz.
- r16 ozel manifesti (`%LOCALAPPDATA%\ai-test-engineering\pilot\windows-native-006-evidence-manifest-r16.json`, SHA-256 `015e09091a877fa5fedf2bc6abedb203810df686ac04636204ffe034797890c2`) source/build kimlikleri verifier'in kendi `computeSourceIdentity` ciktisiyla birebir dogrulandi:
  - commit `bd3db182...`, dirty=false, tree_digest `18e880a5...`, file_count 317
  - lockfile_sha256 `dfccaf02...`, build_input_digest `746a53c0...`
  - dist artifact SHA'lari (stdio-entry `e3381715...`, index `d7f54b18...`) birebir uyusuyor
- Karar: kanit uyusuyor; tam suite sira tekrari icin yeniden koşulmadi (kullanici talimati: "Kanit uyusuyorsa tam suite'i sira tekrari icin kosma"). Dagitim referansi icin dogru Windows commit'i `bd3db182` (windows-native-006); main'in kapsam temizligi bilincli tutulmali, merge karari kullaniciya ait.

## F02/F03 - Kalite kapisi duzeltmeleri (bu teslimatta uygulandi)

Degisen dosyalar:

1. `src/policies/quality-gate.ts`
   - Yeni `stripLiteralsAndComments`: Java kaynak metni string/char literal ve yorumlardan maskeleyerek arindirir (satir yapisi korunur). Tarama, tautoloji, onlyNotNull, expected-exception ve shadow taramalari artik maskeli metin uzerinde yapilir. Yorum/string icindeki assertion benzeri metin artik assertion sayilmaz (Q03/Q04 kapanir).
   - `TEST_METHOD_RE` tam nitelikli JUnit5 anotasyonlarini tanir: `@(?:[\w.]*\.)?(?:Test|...)` (Q07 kapanir; `@org.junit.jupiter.api.Test` artik test metodu sayilir).
   - `hasMeaningfulAssertion` yeni: dogrudan `assertXxx(` (assertThat haric), Mockito `verify(`, `fail(`; fluent zincirlerde terminal dogrulama zorunlu (F02/Q06: terminal'siz `assertThat(...)` artik assertion sayilmaz ve RED edilir; `isEqualTo/hasSize/contains...` gibi terminal ile KABUL).
   - Tautoloji kurali `assertFalse(false)` tespitini de icerir (Q05 kapanir).
   - `isSutShadowing`: class ve package taramasi maskeli metinde, package bildirimi sabit-baslangic regex'iyle degil genis aramayla yapilir (F03/S02 kapanir: baslik yorumu sonrasi shadow artik yakalanir).
   - JUnit4 expected-exception ve Mockito verify oracle'lari KORUNDU (yanlis ret yok); @Disabled/@Ignore, EMPTY_TEST_CLASS, WEAK_ONLY_NOTNULL, detectProductionPathWrite korundu (diger korumalar gevşetilmedi).
2. `src/policies/pit-adapter.ts`
   - F07/P01: `PitReportImport.overall_mutation_score_bps` eklendi (tum mutantlar paydali genel mutation score); `mutation_score_bps` artik test strength (killed/(killed+survived)) olarak belgelendi. `assertMutationScoreSeparate` iki skoru ayri dondurur. 10 killed/0 survived/90 no_coverage artik test strength %100 + genel skor %10 verir (karistirma kapanir).
   - F07/P02: negatif/finite olmayan sayaclar `MutationReportError` (MUTATION_REPORT_INVALID) ile fail-closed reddedilir.
   - F08/P03: `buildPitMavenCommand` yapilandirilan `pit_version`'u goal koordinatina gomuler (`org.pitest:pitest-maven:<version>:mutationCoverage`); semversiz surum `MutationUnsupportedError`.
   - F08/P04: yeni `timeout_const_ms` alani PIT test-basina ek sure parametresi (varsayilan 8000 ms); `run_timeout_ms` is duvar saati butcesi olarak ayrildi. `run_timeout_ms/1000` bolumlemesi kaldirildi (`-DtimeoutConst=300` karistirma kapanir).
3. `tests/unit/fin08-quality-pit.test.ts`
   - Komut testi pinli koordinat beklentisine guncellendi; yeni timeoutConst testi eklendi (mevcut diger testler korundu).
4. `tests/integration/research-quality-gate.test.ts` (yeni)
   - F02'nin 8 probe girdisi duzeltme sonrasi ters beklentiyle (Q03/Q04/Q05/Q06 RED; Q07 KABUL) birim seviyede dogrulanir.
   - Fluent terminal KABUL, JUnit4 expected-exception ve @ParameterizedTest yanlis-ret regresyonlari.
   - F03 S01/S02/S03 shadow probe'lari dogrulanir.
   - Normal MCP aday kabul akisi (CandidateLoop.iterate + gercek Maven/JaCoCo ac27 fixture): gecerli aday KABUL (quality_findings bos), yorum/string assertion'li aday RED + NO_ASSERTION bulgusu on_decision/iterations'a tasinir, baslik yorumlu shadow adayi RED + SUT_SHADOWING bulgusu.

## Test kanitlari (bu checkout'ta gercek koşu)

| Komut | Sonuc |
| --- | --- |
| `npm.cmd ci` | exit 0, 0 vulnerabilities |
| `npm.cmd run typecheck` | exit 0 |
| `npm.cmd run build` | exit 0 (tree_digest `e40276f7...`, 318 dosya) |
| `npm.cmd run lint` | exit 0 (0 errors, 89 warnings) |
| `npm.cmd test -- --run tests/integration/research-quality-gate.test.ts` | 16/16 PASS (49.95s; gercek Maven) |
| `npm.cmd test -- --run tests/unit/quality-strict.test.ts tests/unit/fin08-quality-pit.test.ts tests/unit/candidate-acceptance.test.ts` | 47/47 PASS |
| `npm.cmd test` (tam suite) | 121 dosya: 919/923 PASS; 4 FAIL |

Tam suite'teki 4 basarisizlik bu degisikliklerden once var olan ortamsal/flake durumlaridir (dokunulmamis r16 worktree'sinde de ayni):

- `tests/security/pilot.test.ts` 2 FAIL: AC67 ozel model artifact env'i `AITEST_AC67_MODEL_OUTPUT` yok (beklenen hata yolu; PROJECT_STATE'te kayitli bilinen durum)
- `tests/integration/p07b-browser-e2e.test.ts` print-to-pdf: paralel koşu flake'i (tekil kosuda 4/4 PASS)
- `tests/integration/wn-file-bridge.test.ts` WN27: paralel dosya kilidi flake'i (tekil kosuda 25/25 PASS)

## PIT notu (F07/F08 kapsam durumu)

Arastirma F07/F08 "kullanilmadan once" etiketlidir. Bu teslimatta adaptor duzeltildi (skor ayrimi, negatif sayaç reddi, surum pinleme, timeout sozlesmesi). Normal MCP'de mutation olcum akisi bu gorev kapsaminda kullanilmadi; mutation sonucu **NOT_RUN** olarak birakildi (kullanici talimati madde 7). Yayinlanmis mutation puanı yok.

## Sinirlar

- Dagitilan r16 worktree'si (`C:\Users\mkaracan\.codex\worktrees\windows-native-006\...`) ve kullanici main checkout'u degismedi.
- Kullaniciya ait untracked dosyalar (`ai/handoffs/2026-10-14-*.md`, `java-support/.../JavaMetadataScannerCoverageTest.java`) dokunulmadi.
- Aday kabul entegrasyon testleri sentetik ac27 fixture ile gercek Maven/JaCoCo uzerinden; kurum kodu kullanilmadi.
- Mutation (PIT) calistirilmadi: NOT_RUN.

## Sonraki somut is

- Zor Java siniflari pilotu (kullanici talimati madde 4): yetkili proje envanterinden 4 sinif secimi, beklenti/kimlik on-kaydi, preflight + 3 bagimsiz is.
