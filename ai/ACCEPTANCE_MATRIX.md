# Kabul Matrisi - AC/RG/RT/PRO + N (AITE-PRODUCTION-READINESS-005 v1.0; tarihsel 003/004 kayitlari korunur)

Durum degerleri: NOT_RUN, BLOCKED, FAILED, PASSED, LOCAL_VERIFIED. "PASSED (kismen)" KULLANILMAZ.

## Kabul durumu degisimi (005 v1.0, 2026-10-12)

- P00: aktif sozlesme devri ve baseline kayda alindi.
- P01: release gate local/full ayrimi ve fail-closed evidence dogrulamasi LOCAL_VERIFIED; P01 25/25.
- P02: lease/fencing odak testleri 24/24; production readiness calismasi devam ediyor.
- P03: immutable contract/source/accepted blob, checkpoint CAS ve resume LOCAL_VERIFIED; P03/komsu suite 93/93; gercek hard-kill/Docker/live kaniti NOT_RUN/BLOCKED.
- P04: izolasyon/mirror politikasi LOCAL_VERIFIED; P04 11/11 + security/contract 90 passed/10 skipped; PP16 probe'suz customer job kapatildi, PP18 fail-closed probe, PP19 secret scan + job cache izolasyonu; gercek Docker capability/egress kaniti NOT_RUN/BLOCKED.
- P05-A: frozen concrete resolver, source-set kimligi, package/module expansion limiti, exact model propagation ve total job deadline runtime loop'una baglandi; odak suite 57/57 + typecheck LOCAL_VERIFIED.
- P05-B: compiler/test/coverage failure olgulari bounded repair feedback'ine, repair limiti, shared target maliyet havuzu ve worker timeout deadline'ine baglandi; generation exception bounded feedback/error fingerprint'e gidiyor; resume modeli immutable contract artifact'tan geri yukleniyor, mismatch fail-closed; rejected repair denemeleri attempt ordinal ile kalici; 46/46 resume/storage + 2/2 handler zinciri + typecheck LOCAL_VERIFIED. Desteklenen tek mode TEST_ONLY.
- P06-A: baseline customer checkout'tan frozen workspace'e kopyalanip orada calistiriliyor; stale original target/JaCoCo artefakti korunuyor; dispatcher frozen baseline coverage'i aday dongusune bagliyor. W03 10/10, P05/accepted/Maven 16/16 + typecheck LOCAL_VERIFIED. Effective Maven/per-module JaCoCo/final replay kaniti henuz yok.
- P06-B1: JaCoCo/Surefire/Failsafe rapor yolu module-relative hale getirildi; custom test root discovery/policy ile eslesti; all-skipped ve timeout baseline basari sayilmiyor; final replay exit0 yaninda rapor failure/error/skipped/empty kapisindan geciyor. 64/64 unit + 16/16 Maven/accepted + typecheck LOCAL_VERIFIED. -pl/-am, JaCoCo freshness/provenance/blocker ve baseline inventory henuz yok.
- P06-B2 scope/provenance/inventory/source gate: affected module path'leri normalize/validate edilip multi-module Maven test-compile/test/coverage komutlarina `-pl/-am` olarak tasiniyor; bilinmeyen modul ve JaCoCo olmayan hedef modul typed blocker. Schema v7 baseline/candidate/final test-run inventory/provenance kaydi ve tum module coverage report/digest listesi ekledi; baseline/trusted run id'leri checkpoint manifestine, final replay id'si coverage snapshot'ina baglandi. Baseline test kimligi kaybi ve yeni skip final replay'de reddediliyor. Report/source/class SHA kimlikleri final snapshot'a yaziliyor. Odak suite + typecheck LOCAL_VERIFIED.
- P07-A facts/export cekirdegi: accepted checkpoint ve final replay'den gercek test degisikligi/run summary/model projection'i; DB tabanli status/result coverage; export verification tamamlanmadan COMPLETED yok; binary/bytes/hash/bozuk manifest negative kapilari LOCAL_VERIFIED. Report06 renderer, ham kanit zinciri ve runtime end-to-end kabul henuz NOT_RUN.
- Full product acceptance: **NOT_VERIFIED**; live pilot/platform kaniti uydurulmaz.

## Tarihsel 004 kaydi (2026-10-11)

- Onceki: 003 v2.0 FINALIZATION_IN_PROGRESS -> FIN00-FIN15 IMPLEMENTATION_VERIFIED (375/375).
- Yeni: AITE-REPORT06-INTEGRATION-004 v1.0 coordinator denetimi -> **473/473 test + release-verify exit 0 + lint 0 error**; tam runtime/pilot kabul NOT_VERIFIED.
- Registry kaynagi: `ai/acceptance/catalog.json` (RT01-RT28 tekil; N01-N64 tekil; AC/RG/PRO grup envanteri; 214+ kimlik).
- Tam urun kabul (FULL_PRODUCT_ACCEPTANCE_VERIFIED): **NOT_VERIFIED** - durdurulmus canli pilot + ertelenmis canli kabuller ayri.

## 004 W paketleri kanit matrisi (2026-10-11)

| Paket | Zorunlu cikis kaniti | Durum | Test kaniti |
| --- | --- | --- | --- |
| W00 | Referans/arsiv hash dogrulandi; 375/375 baseline; F01-F18 kod incelemesi | PASSED | report06-w00-baseline checkpoint |
| W01 | Typed worker outcome (N09-N13); durable attempt (N14); context manifest (N15); izole config (N16) | LOCAL_VERIFIED | w01-worker-outcome + w01-attempt + w01-context-isolation |
| W02 | Ayrı candidate workspace (F08/N17); egress typed blocker + NO_CGROUP engeli (F16) | LOCAL_VERIFIED | ac27-loop + accepted-set + izolasyon fixture'lari; tam Docker pilotu yok |
| W03 | Baseline ayrisimlari (F06/N22-N23); boundary resolver + source-set filtresi (F05/N21) | LOCAL_VERIFIED | w03-baseline + maven-jacoco fixture |
| W04 | Tek evaluator (F10/N25-N28); accepted checkpoint publish (F09/N29) | LOCAL_VERIFIED | evaluator + accepted-set + final replay kod denetimi |
| W05 | Checkpoint'ten resume + butce yukleme (F11/N34-N36); cancel owned process (N37) | LOCAL_VERIFIED | w05-recovery + fin07; hard-kill/iki owner kaniti yok |
| W06 | Facts-only kontrat + sanitizer (F13/F14/N02-N04); export hash_mismatch (F15/N45-N46) | LOCAL_VERIFIED | w06-facts-contract + tam suite |
| W07 | Binary/nested export (N44); atomik publish korunumu (N47); patch artifact (N48) | LOCAL_VERIFIED | w07-export + fin09 |
| W08 | 06 referans hash (N01); asama verisi yok (N08); ornek veri yok (N54) | LOCAL_VERIFIED | w08-reference |
| W09 | PS1'siz kurulum (N61); offline assetler (N51 hazirligi) | LOCAL_VERIFIED | w09-install + bootstrap |
| W10 | 214 kimlik tekil ledger (N58); referans hash verifier (N59 hazirligi); pause ayrisimi (N60) | LOCAL_VERIFIED | w10-ledger + release-verify exit 0 |
| W11 | Teslim tutarliligi (N64) | SURUYOR | handoff |

## Devralinan kapsam durumu (003 v2.0; korunur)

- AC01-AC70 / RG01-RG52 / PRO01-PRO60: FIN paket eslesmesi catalog.json'da.
- RT01-RT28: tekil kayit (28); FIN eslesmeli.
- N01-N64: tekil kayit (64); W paket eslesmeli; evidence_levels ile.

## Test kaniti (2026-10-11)

- TypeScript: 56 dosya, **473/473 PASSED**
- lint: **0 errors** (88 warning); typecheck: TEMIZ; build: TEMIZ
- release-verify.mjs: exit 0; source tree digest d09649c8...

## Canli kabul durumu (degismedi)

- Yerel/deterministik kabuller: 004_LOCAL_VERIFIED (473/473 + release verifier)
- Tam urun kabul (FULL_PRODUCT_ACCEPTANCE_VERIFIED): **NOT_VERIFIED**
- Canli kurum modeli benchmark/pilot: PAUSED_BY_USER / NOT_PASSED / root_cause UNRESOLVED
- Paket yayin durumu: UNSIGNED/NOT_PUBLISHED (kurum signing key yok; dogru etiket)

## Ozet

- 004 W00-W10: kod + yerel fixture kapilari gecti; W11 coordinator denetimi suruyor
- Test: 473/473 PASSED (56 dosya; 2026-10-11)
- F01-F18: uygulama mevcut; tam runtime/pilot kaniti NOT_VERIFIED
- Canli kurum kabulleri: kullanici onayi ile ayri kosuda surer; bu gorev baslatmaz
