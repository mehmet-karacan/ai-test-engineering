# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-RUNTIME-ACCEPTANCE-003 v2.0 (birlestirilmis nihai kapsam). Paketler FIN00-FIN15; devralinan kabuller AC01-AC70, RG01-RG52, RT01-RT28, PRO01-PRO60.

## FIN paketleri (v2.0)

| ID | Is | Kritik yol | Durum | Kanit |
| --- | --- | --- | --- | --- |
| FIN00 | Baslangic, arsiv, kapsam/evidence registry, risk, guvenli baseline | - | IN_PROGRESS | bu commit: arsiv + PROJECT_STATE + catalog |
| FIN01 | Domain/contract/config/model resolver ve source/project identity | - | TODO | - |
| FIN02 | Verified runner, disposable workspace, cache/egress, process supervisor | X | TODO | - |
| FIN03 | SQLite gercek veri akisi, migration, artifact publish, ownership/fencing | X | TODO | - |
| FIN04 | Effective Maven + Java AST + hedef/test/rapor scope'u | X | TODO | - |
| FIN05 | Kontrollu OpenCode worker + semali analiz/plan/developer/review | X | TODO | - |
| FIN06 | Candidate/repair/coverage evaluator/cumulative accepted/final replay | X | TODO | - |
| FIN07 | Resume/pause/cancel/late writes ve kaynak degisikligi | X | TODO | - |
| FIN08 | Semantik test kalitesi, test koruma, flaky ve PIT adapter | - | TODO | - |
| FIN09 | Report projection, binary-safe export, patch ve guvenilir apply | - | TODO | - |
| FIN10 | Legacy/modern MCP adapterleri ve kisacik OpenCode kullanimi | - | TODO | - |
| FIN11 | Fresh install, upgrade/rollback/backup/restore/owned uninstall | - | TODO | - |
| FIN12 | Diagnostics, resource limits, history, retention ve support bundle | - | TODO | - |
| FIN13 | Threat model, security regression, SBOM/SCA/lisans/paket provenance | - | TODO | - |
| FIN14 | Canli benchmark/model karsilastirma, holdout, gercek proje pilotu | - | TODO | - |
| FIN15 | Bagimsiz release dogrulamasi, dokuman senkronu, tam dagitim teslimi | - | TODO | - |

## FIN00 alt isleri

| ID | Is | Durum | Kanit |
| --- | --- | --- | --- |
| FIN00.a | v1.0 aktif gorevi git nesnesinden arsivle, bayt dogrula | VERIFIED | archive blob 178a263 birebir; SHA-256 1d3b9bf2... |
| FIN00.b | v2.0 sozlesmeyi koka koy | VERIFIED | SHA-256 40819cc6... (kaynakla ayni) |
| FIN00.c | Tekil obligation catalog uret (AC/RG/RT/PRO) | IN_PROGRESS | ai/acceptance/catalog.json |
| FIN00.d | Onceki beyanlari gercek duruma getir (PROJECT_STATE/BACKLOG) | VERIFIED | bu dosya |
| FIN00.e | Ilk somut davranis testi: normal giris -> host Maven'e sifir gecis | TODO | - |

## Tarihsel kayitlar (silinmez)

- AITE-FOUNDATION-001 (W01-W30): ai/tasks/archive/AITE-FOUNDATION-001.md; "70/70" tarihsel beyan, F01-F14 ile yeniden degerlendirildi.
- AITE-REMEDIATION-002 (D00-D10): ai/tasks/archive/AITE-REMEDIATION-002.md; "52/52" tarihsel beyan.
- AITE-RUNTIME-ACCEPTANCE-003 v1.0: ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v1.0.md; B01-B12 handoff beyanlari + 204/204 test kaydi tarihsel; v2.0 tekil eslesmeyle yeniden degerlendirilecek.
