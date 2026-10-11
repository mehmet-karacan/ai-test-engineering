# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED, LOCAL_VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-PRODUCTION-READINESS-005 v1.0 (sozlesme: AKTIF_GOREV.md). P00-P04 local olarak dogrulandi; P05-P10 suruyor.
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
| P02 | Lease sahipligi, TTL/fencing, heartbeat, owned process ve checkpoint CAS | LOCAL_VERIFIED | production-005-p02-lease; 37/37 odak suite; Docker runtime BLOCKED |
| P03 | Immutable contract/source/accepted blob, checkpoint CAS ve resume | LOCAL_VERIFIED | production-005-p03-checkpoint; P03/komsu suite 93/93 |
| P04 | Zorunlu izolasyon, controlled provisioning, cache/secret/process siniri | LOCAL_VERIFIED | production-005-p04-isolation; P04 11/11 + security/contract 90 passed/10 skipped (Docker NOT_RUN) |
| P05-P10 | Kalan readiness, rapor, kurulum, regression ve handoff | TODO | AKTIF_GOREV.md |

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
