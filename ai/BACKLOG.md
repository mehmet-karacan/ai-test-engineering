# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-RUNTIME-ACCEPTANCE-003 v2.0. FIN00-FIN15 IMPLEMENTATION_VERIFIED.

## FIN paketleri (v2.0)

| ID | Is | Kritik yol | Durum | Kanit |
| --- | --- | --- | --- | --- |
| FIN00 | Baslangic, arsiv, kapsam/evidence registry, ilk davranis testi | - | VERIFIED | 60c0cda + d4fe86c; fin00-isolated-loop.test.ts 6/6 |
| FIN01 | Domain/contract/config resolver ve source/project identity | - | VERIFIED | ab04f89 + a6f8dfb; fin01-contract.test.ts 16/16 |
| FIN02 | Verified runner, disposable workspace, capability probe | X | VERIFIED | 7ec86d0; fin02-capability.test.ts 4/4 (gercek Docker) |
| FIN03 | SQLite gercek veri akisi, migration v2, artifact publish, fencing | X | VERIFIED | 7b58248; fin03-relations.test.ts 9/9 |
| FIN04 | Effective Maven + hedef/test/rapor scope'u | X | VERIFIED | 6602de2; fin04-target-resolution.test.ts 14/14 |
| FIN05 | Kontrollu OpenCode worker + semali roller | X | VERIFIED | 96c6cac; fin05-worker-chain.test.ts 16/16 |
| FIN06 | Candidate/repair/evaluator/cumulative accepted/final replay | X | VERIFIED | 046dad9; fin06-evaluator.test.ts 9/9 |
| FIN07 | Resume/pause/cancel/late writes ve kaynak degisikligi | X | VERIFIED | 15436e5; fin07-lifecycle.test.ts 5/5 |
| FIN08 | Semantik test kalitesi, PIT adapter | - | VERIFIED | db352d8; fin08-quality-pit.test.ts 17/17 |
| FIN09 | Report projection, binary-safe export, patch, apply | - | VERIFIED | 73f0fd9; fin09-patch-export.test.ts 9/9 |
| FIN10 | Legacy/modern MCP adapterleri | - | VERIFIED | c84d78d; fin10-protocol.test.ts 12/12 + v2-wire.test.ts |
| FIN11 | Fresh install, upgrade/rollback/backup/restore/uninstall | - | VERIFIED | 6cda896; fin11-lifecycle-ops.test.ts 6/6 |
| FIN12 | Diagnostics, retention/GC, support | - | VERIFIED | e2b3a19; fin12-diagnostics-gc.test.ts 10/10 |
| FIN13 | Threat model, SBOM/SCA | - | VERIFIED | f275068; fin13-sbom.test.ts 6/6 + docs/SECURITY.md |
| FIN14 | Benchmark corpus + trial kaydi | - | VERIFIED | 2925252; fin14-corpus.test.ts 6/6 + corpus.json |
| FIN15 | Bagimsiz release verifier, dagitim teslimi | - | VERIFIED | 7532a5a; fin15-release-verifier.test.ts 7/7 + release-verify.mjs exit 0 |

## Canli kabul (engel kalkinca ayni gorevden surer)

| Is | Durum | Engel |
| --- | --- | --- |
| Canli kurum modeli benchmark (48 reachable + 8 negatif trial, FIN14 plani) | BLOCKED_KAYITLI | kaynak/butce acik kaydi gerekiyor; altyapi hazir |
| Gercek proje pilotu (yetkili kurum Maven projesinde hedef sinif) | BLOCKED_KAYITLI | hedef isim kullaniciyla secilmeli; onceden uydurulmadi |
| Kurum signing key ile imzali yayin | UNSIGNED/NOT_PUBLISHED (dogru) | kurum anahtari yok; uydurulmaz |

## Tarihsel kayitlar (silinmez)

- AITE-FOUNDATION-001 (W01-W30): ai/tasks/archive/AITE-FOUNDATION-001.md
- AITE-REMEDIATION-002 (D00-D10): ai/tasks/archive/AITE-REMEDIATION-002.md
- AITE-RUNTIME-ACCEPTANCE-003 v1.0: ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v1.0.md
