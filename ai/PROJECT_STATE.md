# PROJECT_STATE - Gelistirme Durumu

## Aktif gorev

- Gorev: AITE-RUNTIME-ACCEPTANCE-003 surum 2.0 (birlestirilmis nihai kapsam; AKTIF_GOREV.md v2.0)
- Asama: FIN00 - Baslangic, arsiv, kapsam/evidence registry (IN_PROGRESS)
- Baslangic durumu: `FINALIZATION_IN_PROGRESS`; onceki toplu tamamlanma beyanlari kabul edilmis degildir
- Son guncelleme: 2026-10-10

## Onemli durum degisimi

Kullanici AKTIF_GOREV v2.0 birlestirilmis nihai sozlesmeyi verdi. Onceki "AITE-RUNTIME-ACCEPTANCE-003 TAMAMLANDI" beyani (handoff 2026-10-10-runtime-handoff.md) tarihsel uygulayici beyani olarak korunur; guncel kabul gercegi degildir. v2.0, 003 v1.1 aciklari (B01-B12) + kurumsal hazirlik alanlarini ayni gorevde birlestirir (FIN00-FIN15, RT01-RT28, PRO01-PRO60).

## Onemli durum degisimi (tarihsel)

Onceki gorev (AITE-FOUNDATION-001) "FULL_ACCEPTANCE_VERIFIED" olarak kaydedilmisti (son commit c5307f5). Yeni inceleme (AITE-REMEDIATION-002) F01-F14 bulgulari tespit etti; tum bulgular uygulayici ortaminda teyit edildi.

## Asama durumu (v2.0 - FIN paketleri)

| Paket | Is | Durum |
| --- | --- | --- |
| FIN00 | Baslangic, arsiv, kapsam/evidence registry, risk, baseline | IN_PROGRESS |
| FIN01 | Domain/contract/config/model resolver, source/project identity | TODO |
| FIN02 | Verified runner, disposable workspace, cache/egress, supervisor | TODO |
| FIN03 | SQLite gercek veri akisi, migration, artifact publish, fencing | TODO |
| FIN04 | Effective Maven + Java AST + hedef/test/rapor scope'u | TODO |
| FIN05 | Kontrollu OpenCode worker + semali analiz/plan/developer/review | TODO |
| FIN06 | Candidate/repair/coverage evaluator/cumulative accepted/final replay | TODO |
| FIN07 | Resume/pause/cancel/late writes ve kaynak degisikligi | TODO |
| FIN08 | Semantik test kalitesi, test koruma, flaky, PIT adapter | TODO |
| FIN09 | Report projection, binary-safe export, patch, guvenilir apply | TODO |
| FIN10 | Legacy/modern MCP adapterleri + OpenCode kullanimi | TODO |
| FIN11 | Fresh install, upgrade/rollback/backup/restore/uninstall | TODO |
| FIN12 | Diagnostics, resource limits, history, retention, support | TODO |
| FIN13 | Threat model, security regression, SBOM/SCA/lisans | TODO |
| FIN14 | Canli benchmark/model karsilastirma, holdout, proje pilotu | TODO |
| FIN15 | Bagimsiz release dogrulamasi, dokuman senkronu, dagitim | TODO |

FIN02-FIN07 kritik yoldur: once guvenli tek dikey akis, sonra matrix genisletme.

## FIN00 ilerlemesi

- v1.0 aktif gorev `git show c5d4a53:AKTIF_GOREV.md` nesnesinden `ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v1.0.md` olarak arsivlendi; git blob `178a263d88e1be2a7f9102c7c16acb99590a6c90` birebir dogrulandi, SHA-256 `1d3b9bf217d5459618c67fb9235d279730193ebe0f06f66f9e0fc83fa9f52063`.
- v2.0 sozlesme koka koyuldu; SHA-256 `40819cc6f2680bc15e4e9c7c3cdb53a62a16171d998e353bb4a99b5bab4c58a3` (kullanici kaynak dosyasiyla byte-birebir ayni).
- Onceki B01-B12 handoff beyanlari ve 204/204 test kaydi tarihsel olarak korunur; FIN00-FIN15 icin tekil gereksinim-kod-test-kanit eslesmesiyle yeniden degerlendirilecek.

## Ortam (2026-10-10)

- Node.js v24.14.1, Git 2.55.0, JDK 21/25, Maven 3.9.16, Docker 29.8.2 (linux containers)
- PowerShell execution policy engelli (npm.ps1/opencode.ps1); `npm.cmd`/`opencode.cmd` kullaniliyor
- PS1'siz Node.mjs kurulum yolu mevcut (D01)

## Oncesi gorevler (arsiv)

- AITE-FOUNDATION-001: ai/tasks/archive/AITE-FOUNDATION-001.md
- AITE-REMEDIATION-002: ai/tasks/archive/AITE-REMEDIATION-002.md
- AITE-RUNTIME-ACCEPTANCE-003 v1.0: ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v1.0.md (yeni)

## Son commit

- c5d4a53 docs: runtime acceptance handoff kaydedildi

## Acik blocker

- Yok.

## Sonraki somut is

- FIN00: `ai/acceptance/catalog.json` tekil obligation registry'sini uret (AC01-AC70, RG01-RG52, RT01-RT28, PRO01-PRO60 tekil kayitlar).
- Ardindan 22.2'deki ilk somut is: normal MCP girisinden candidate'in host Maven'e gecmedigini sinayan davranis testi.
