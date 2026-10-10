# Kabul Matrisi - AC/RG/RT/PRO (AITE-RUNTIME-ACCEPTANCE-003 v2.0)

Durum degerleri: NOT_RUN, BLOCKED, FAILED, PASSED. "PASSED (kismen)" KULLANILMAZ.

## Kabul durumu degisimi (v2.0)

- Onceki: 70/70 + 52/52 + "003 TAMAMLANDI" beyanlari (c5307f5, 7eef466, c5d4a53) - **tarihsel uygulayici beyani olarak korundu**; v2.0 birlestirilmis nihai kapsam tekil eslesmeyle yeniden degerlendirildi.
- Yeni: `FINALIZATION_IN_PROGRESS` -> FIN00-FIN15 paketleri IMPLEMENTATION_VERIFIED (yerel kabul motoru: 356/356 test + release verifier exit 0).
- Registry kaynagi: `ai/acceptance/catalog.json` (RT01-RT28 tekil; AC/RG/PRO grup envanteri).

## FIN paketleri kanit matrisi (v2.0, 2026-10-10)

| Paket | Zorunlu cikis kaniti | Durum | Test kaniti |
| --- | --- | --- | --- |
| FIN00 | v1.0 arsiv blob birebir (178a263); obligation registry; normal giris -> host Maven'e sifir gecis | PASSED | fin00-isolated-loop.test.ts 6/6 |
| FIN01 | Typed immutable contract; model kimligi birebir; trailing-space supheli anahtar tespiti | PASSED | fin01-contract.test.ts 16/16 |
| FIN02 | Gercek capability probe (source yazma reddi + secret + network + limit; 4 gercek run) | PASSED | fin02-capability.test.ts 4/4 |
| FIN03 | Live job'dan dolan relations; crash/future-schema fail-closed; WAL kalicilik | PASSED | fin03-relations.test.ts 9/9 |
| FIN04 | FQCN suffix oyunu reddi; package boundary; test siniflari production hedef listesine giremez | PASSED | fin04-target-resolution.test.ts 14/14 |
| FIN05 | Worker attempt DB kaydi; stale session red; injection negative fixture'lar | PASSED | fin05-worker-chain.test.ts 16/16 |
| FIN06 | Branch-only kazanc (RT08); iki-metrik karar (RT07/PRO05); N/A kurallari; decision DB akisi | PASSED | fin06-evaluator.test.ts 9/9 |
| FIN07 | Cancel kalici; gec run CANCELLED'i cevirmez; lease-lost fence red | PASSED | fin07-lifecycle.test.ts 5/5 |
| FIN08 | JUnit4 expected exception tanisi (PRO33); PIT targeted scope + import provenance (PRO37-40) | PASSED | fin08-quality-pit.test.ts 17/17 |
| FIN09 | PATCH_ONLY gercek patch artifact + hash zinciri (B11); redacted export (15.4); XSS korunumu | PASSED | fin09-patch-export.test.ts 9/9 |
| FIN10 | Legacy/modern revision dogrulugu; negotiated version; fragmented JSON framing (RT28) | PASSED | fin10-protocol.test.ts 12/12 |
| FIN11 | Online backup + blob manifest; restore ayri konumda dogrulanir; owned uninstall; upgrade quiesce | PASSED | fin11-lifecycle-ops.test.ts 6/6 |
| FIN12 | Tek ortak diagnostic servisi (PRO02); GC iki asamali; checkpoint manifest pin (PRO26) | PASSED | fin12-diagnostics-gc.test.ts 10/10 |
| FIN13 | Threat model dokumani; SBOM CycloneDX 1.5; scanner yokken 0 vulnerability YAZILMAZ | PASSED | fin13-sbom.test.ts 6/6 |
| FIN14 | Corpus BM01-BM12; olcum plani 48+8; trial kaydi failure dahil | PASSED | fin14-corpus.test.ts 6/6 |
| FIN15 | Release verifier non-zero exit yetenegi; catalog/corpus butunlugu; UNSIGNED dogru etiket | PASSED | fin15-release-verifier.test.ts 7/7 |

## Devralinan kapsam durumu

- AC01-AC70: FIN00-FIN15 paket kanitlarina eslestirildi (tarihsel 70/70 beyani gecersiz; tekil eslesme catalog.json'da).
- RG01-RG52: ayni sekilde paket kanitlarina devredildi.
- RT01-RT28: catalog.json'da tekil kayit (hepsi FIN paket eslesmeli); RT01/RT02/RT03/RT27 ozel testleri + fin00/fin07/fin10 davranis testleri kanitli.
- PRO01-PRO60: bolum 25 tablolari FIN paketlerine eslestirildi; PRO02 (fin12), PRO05 (fin06), PRO26 (fin12), PRO33 (fin08), PRO37-40 (fin08), PRO59 (fin15) ozel unit kanitli.

## Test kaniti (2026-10-10)

- TypeScript: 42 dosya, **356/356 PASSED**
- lint: 0 errors; typecheck: TEMIZ; build: TEMIZ
- release-verify.mjs: exit 0; source tree digest 44940ab3...

## Canli kabul durumu (27.2 dogru sinir)

- Sentetik/yerel kabuller: IMPLEMENTATION_VERIFIED
- Canli kurum modeli benchmark trials (20.3): BLOCKED_KAYITLI (kaynak/butce kaydi gerekiyor; altyapi hazir)
- Gercek proje pilotu (20.5): BLOCKED_KAYITLI (hedef sinif kullaniciyla secilmeli)
- Paket yayin durumu: UNSIGNED/NOT_PUBLISHED (kurum signing key yok; dogru etiket)

## Ozet

- FIN00-FIN15: 16/16 TAMAMLANDI
- Test: 356/356 PASSED (42 dosya)
- Canli kurum kabulleri: engel kalkinca ayni gorev (003 v2.0) surer; yeni gorev acilmaz
