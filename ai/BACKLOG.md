# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED, LOCAL_VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-PRODUCTION-READINESS-005 v1.0 (sozlesme: AKTIF_GOREV.md). P00-P05-B, P06-A, P06-B1, P06-B2 ve P07-A facts/export cekirdegi local olarak dogrulandi; Report06/ham kanit renderer'i ve P07-P10 suruyor.
Onceki gorev AITE-RUNTIME-ACCEPTANCE-003 v2.0: FIN00-FIN15 IMPLEMENTATION_VERIFIED (tarihsel kayit asagida).

## 004 uygulama paketleri (W00-W11)

| Paket | Is | Durum | Kanit |
| --- | --- | --- | --- |
| W00 | Devir, kaynak/hash, ledger ve test baseline'i | VERIFIED | ai/checkpoints/2026-10-11-report06-w00-baseline.md; 375/375; typecheck 0 |
| W01 | Typed worker state, context/profil, attempt/cleanup | LOCAL_VERIFIED | w01 worker fixture'lari + tam suite |
| W02 | Guvenli runner/workspace/provisioning | LOCAL_VERIFIED | ac27/accepted-set/izolasyon fixture'lari; tam Docker pilotu yok |
| W03 | Baseline-only ve Maven/JUnit/JaCoCo collector | LOCAL_VERIFIED | w03-baseline + fixture run |
| W04 | Cumulative adaylar, repair, exact coverage, final replay | LOCAL_VERIFIED | evaluator/accepted-set + kod denetimi |
| W05 | Kalici contract, checkpoint, resume/cancel | LOCAL_VERIFIED | w05-recovery + fin07; hard-kill kaniti yok |
| W06 | Facts-only data contract + sanitizer/export | LOCAL_VERIFIED | w06-facts-contract + tam suite |
| W07 | Artifact/patch/guvenli export ve uygulama siniri | LOCAL_VERIFIED | w07-export + fin09 |
| W08 | 06 referans + renderer (N01/N08/N54) | LOCAL_VERIFIED | w08-reference |
| W09 | Yerel paket/kurulum/ops kalanlari | LOCAL_VERIFIED | w09-install + bootstrap |
| W10 | Tum obligation'lar ve release verifier | LOCAL_VERIFIED | w10-ledger + release-verify exit 0 |
| W11 | Nihai teslim ve model devri | IN_PROGRESS | handoff |

## 005 uygulama paketleri (P00-P10)

| Paket | Is | Durum | Kanit |
| --- | --- | --- | --- |
| P00 | Sozlesme devri, arsiv/hash ve baseline | VERIFIED | production-005-p00-baseline |
| P01 | Fail-closed release gate ve evidence manifest dogrulamasi | LOCAL_VERIFIED | production-005-p01-gate; 25/25 |
| P02 | Lease sahipligi, TTL/fencing, heartbeat, erken donus cleanup, owned process ve checkpoint CAS | LOCAL_VERIFIED | production-005-p02-dispatch-cleanup; cleanup 1/1 + onceki 37/37; Docker runtime BLOCKED |
| P03 | Immutable contract/source/accepted blob, checkpoint CAS ve resume | LOCAL_VERIFIED | production-005-p03-checkpoint; P03/komsu suite 93/93 |
| P04 | Zorunlu izolasyon, controlled provisioning, cache/secret/process siniri ve egress fail-closed | LOCAL_VERIFIED | production-005-p04-isolation + p04-egress-blocker; odak 24/24 + typecheck/lint PASS; Docker runtime NOT_RUN |
| P05-A | Frozen concrete resolver, source-set, exact model ve deadline baglantisi | LOCAL_VERIFIED | production-005-p05a-target-resolver; 57/57 + typecheck |
| P05-B | Repair feedback/bounded repair, shared target budget ve resume model provenance cekirdegi | LOCAL_VERIFIED | production-005-p05b-resume; 46/46 resume/storage + 2/2 handler zinciri + typecheck |
| P06-A | Frozen baseline workspace ve customer checkout korumasi | LOCAL_VERIFIED | production-005-p06a-frozen-baseline; 10/10 W03 + 16/16 P05/accepted/Maven + typecheck |
| P06-B1 | Module-aware coverage/report, custom test root ve final test raporu kapisi | LOCAL_VERIFIED | production-005-p06b-module-final-gates; 64/64 unit + 16/16 Maven/accepted + typecheck |
| P06-B2 | Effective Maven affected-module scope, typed coverage blocker, run provenance, inventory regression, source identity ve module report listesi | LOCAL_VERIFIED | production-005-p06b-effective-scope + p06b-provenance-core + p06b-run-links + p06b-inventory-gate + p06b-source-identity + p06b-module-reports + p06-frozen-counter; odak suite + typecheck |
| P07-A | Gercek facts projection, DB status projection ve fail-closed export cekirdegi | LOCAL_VERIFIED | production-005-p07a-facts-export; 81/81 odak suite + typecheck |
| P07-B | Report06 renderer, final replay raw/binary evidence ve manifest kimlik zinciri | IN_PROGRESS | ai/checkpoints/2026-10-12-production-005-p07b-report06-evidence.md; 60/60 odak + 1/1 gercek MavenRunner evidence + typecheck/build; Docker customer dispatcher BLOCKED |
| P08 | Kurulum/config/runtime resolver, OpenCode entry ve readiness ayrimi | IN_PROGRESS | ai/checkpoints/2026-10-12-production-005-p08-install-runtime.md + p08-lifecycle-restore; 24/24 install + 6/6 lifecycle; install-manifest/upgrade/uninstall e2e eksik |
| P09 | Full regression, lint/typecheck/build ve release verifier reconciliation | LOCAL_VERIFIED | ai/checkpoints/2026-10-12-production-005-p09-regression.md + P08 sonrasi tam kosu; 66 dosya, 588/588 PASS, lint 0 error, typecheck/build PASS; full gate NO_GO evidence manifest eksik |
| P07-P10 | Report06 runtime kabul, kurulum, regression ve handoff | TODO | AKTIF_GOREV.md; P08 lifecycle sonrasi devam ediyor |

## F bulgu kapanis durumu (004 Bolum 2; F01-F18)

| ID | Durum | Kanit |
| --- | --- | --- |
| F01-F18 | LOCAL_VERIFIED; tam runtime/pilot NOT_VERIFIED | ai/checkpoints/2026-10-11-report06-coordinator-audit.md |

## Canli kabul (engel kalkinca ayri kosuda surer)

| Is | Durum | Engel |
| --- | --- | --- |
| Canli kurum modeli benchmark (FIN14 plani) | BLOCKED_KAYITLI | kullanici acik onayi gerekir; bu gorev baslatmaz |
| Gercek proje pilotu (RT21) | PAUSED_BY_USER / NOT_PASSED | provider istikrari + kullanici karari |
| Kurum signing key ile imzali yayin | UNSIGNED/NOT_PUBLISHED (dogru) | kurum anahtari yok; uydurulmaz |

## Tarihsel kayitlar (silinmez)

- AITE-FOUNDATION-001 (W01-W30): ai/tasks/archive/AITE-FOUNDATION-001.md
- AITE-REMEDIATION-002 (D00-D10): ai/tasks/archive/AITE-REMEDIATION-002.md
- AITE-RUNTIME-ACCEPTANCE-003 v1.0/v2.0: ai/tasks/archive/
