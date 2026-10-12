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
| P02 | Lease sahipligi, TTL/fencing, heartbeat, erken donus cleanup, owned process ve checkpoint CAS | LOCAL_VERIFIED | production-005-p02-dispatch-cleanup + pr02-pr03-audit; odak 63/63; iki owner/hard-kill runtime NOT_RUN |
| P03 | Immutable contract/source/accepted blob, checkpoint CAS ve resume | LOCAL_VERIFIED | production-005-p03-checkpoint + pr02-pr03-audit; odak 63/63 |
| P04 | Zorunlu izolasyon, controlled provisioning, cache/secret/process siniri ve egress fail-closed | LOCAL_VERIFIED | production-005-p04-isolation + pr04-pr06-audit; Docker isolation/capability 11/11, P04 runtime 13/13; allowlist enforcement yoksa typed blocker |
| P05-A | Frozen concrete resolver, source-set, exact model ve deadline baglantisi | LOCAL_VERIFIED | production-005-p05a-target-resolver + pr04-pr06-audit; 57/57 + runtime target 13/13 + typecheck |
| P05-B | Repair feedback/bounded repair, shared target budget ve resume model provenance cekirdegi | LOCAL_VERIFIED | production-005-p05b-resume + pr04-pr06-audit; 46/46 + runtime resume/target 13/13 + typecheck |
| P06-A | Frozen baseline workspace ve customer checkout korumasi | LOCAL_VERIFIED | production-005-p06a-frozen-baseline; 10/10 W03 + 16/16 P05/accepted/Maven + typecheck |
| P06-B1 | Module-aware coverage/report, custom test root ve final test raporu kapisi | LOCAL_VERIFIED | production-005-p06b-module-final-gates; 64/64 unit + 16/16 Maven/accepted + typecheck |
| P06-B2 | Effective Maven affected-module scope, typed coverage blocker, run provenance, inventory regression, source identity, module report listesi ve strict test execution property'leri | LOCAL_VERIFIED | production-005-p06b-effective-scope + p06-frozen-counter + p06-strict-maven-gate + pr04-pr06-audit; odak 35/35, Maven runtime 29/29 + typecheck/lint |
| P07-A | Gercek facts projection, DB status projection ve fail-closed export cekirdegi | LOCAL_VERIFIED | production-005-p07a-facts-export; 81/81 odak suite + typecheck |
| P07-B | Report06 renderer, final replay raw/binary evidence ve manifest kimlik zinciri | IN_PROGRESS | p07b-report06-evidence + p07b-published-reserved + report-path-authority + p07b-report06-surfaces (PP34/35/37/38/40); surfaces 9/9, P07+P08 odak 101/101, referans hash byte-exact; tam print/offline/DOM/link ve egress allowlist kaniti eksik |
| P08 | Kurulum/config/runtime resolver, OpenCode entry, readiness ve upgrade/restore | IN_PROGRESS | p08-install-runtime + p08-lifecycle-restore + p08-runtime-paths (PP42) + p08-upgrade-restore (PP44) + w09 (PP43); P07+P08 odak 101/101, typecheck/lint 0 error; gercek Windows/Linux e2e install/upgrade rollback eksik |
| P09 | Full regression, lint/typecheck/build ve release verifier reconciliation | LOCAL_VERIFIED | p09-regression + P08/P04/P06/P07B sonrasi tam kosu; 67 dosya, 598/598 PASS, lint 0 error, typecheck/build PASS; full gate NO_GO evidence manifest eksik |
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
