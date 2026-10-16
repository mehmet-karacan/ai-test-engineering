# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED, LOCAL_VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif Windows kapsam kapanisi: AITE-PRODUCTION-READINESS-005 v1.0 + Windows-native-006 r16. P00-P10 Windows kapsaminda kapali; Docker/Docker execution/Docker egress/PP17 ve macOS bu kapsamda yoktur. Aktif formal paket kalmadi.
Onceki gorev AITE-RUNTIME-ACCEPTANCE-003 v2.0: FIN00-FIN15 IMPLEMENTATION_VERIFIED (tarihsel kayit asagida).
P02/P03 kalan runtime kanitlari (2026-10-12): PP07/PP08/PP09/PP14 RUNTIME_VERIFIED; checkpoint `ai/checkpoints/2026-10-12-production-005-p02p03-remaining-runtime-kanit.md`.
Son coordinator kapanis kanitlari: GLM P08 PP44 checkpoint `ai/checkpoints/2026-10-12-production-005-p08-pp44-realbin-e2e.md`; Qwen P09/P10 reconciliation checkpoint `ai/checkpoints/2026-10-12-production-005-p10-p09-reconciliation.md`.
Yeni blocker/sema kanitlari: GLM P07-B `ai/checkpoints/2026-10-12-production-005-p07b-audit-egress-decision.md`; Qwen P10 `ai/checkpoints/2026-10-12-production-005-p10-manifest-schema-decision.md`.

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
| W11 | Nihai teslim ve model devri | VERIFIED | Windows-native-006 final handoff |

## 005 uygulama paketleri (P00-P10)

| Paket | Is | Durum | Kanit |
| --- | --- | --- | --- |
| P00 | Sozlesme devri, arsiv/hash ve baseline | VERIFIED | production-005-p00-baseline |
| P01 | Fail-closed release gate ve evidence manifest dogrulamasi | LOCAL_VERIFIED | production-005-p01-gate + production-005-qwen-next; 40/40 |
| P02 | Lease sahipligi, TTL/fencing, heartbeat, erken donus cleanup, owned process ve checkpoint CAS | RUNTIME_VERIFIED | production-005-p02-dispatch-cleanup + pr02-pr03-audit + p02p03-runtime-glm + p02p03-remaining-runtime-kanit; odak 63/63; **PP07 iki gercek child process PASS (LEASE_HELD ret + TTL ustu LEASE_LOST + monoton token 1->2, log sha 1e1fba2e); PP08 owned container docker stop/inspect EXITCODE=137 + cancel gec sonuc korumasi PASS; PP09 Linux taskkill-yok/exit3/stop-inspect PASS** |
| P03 | Immutable contract/source/accepted blob, checkpoint CAS ve resume | RUNTIME_VERIFIED (live MCP resume akisi NOT_RUN) | production-005-p03-checkpoint + pr02-pr03-audit + p02p03-runtime-glm + p02p03-remaining-runtime-kanit; odak 63/63; **PP14 hard-kill 3/3 PASS (taskkill /F sonrasi onceki trusted state + WAL recovery + tmp READY sizmasi yok)** |
| P04 | Zorunlu izolasyon, controlled provisioning, cache/secret/process siniri ve egress fail-closed | LOCAL_VERIFIED | production-005-p04-isolation + pr04-pr06-audit; Docker isolation/capability 11/11, P04 runtime 13/13; allowlist enforcement yoksa typed blocker |
| P05-A | Frozen concrete resolver, source-set, exact model ve deadline baglantisi | LOCAL_VERIFIED | production-005-p05a-target-resolver + pr04-pr06-audit; 57/57 + runtime target 13/13 + typecheck |
| P05-B | Repair feedback/bounded repair, shared target budget ve resume model provenance cekirdegi | LOCAL_VERIFIED | production-005-p05b-resume + pr04-pr06-audit; 46/46 + runtime resume/target 13/13 + typecheck |
| P06-A | Frozen baseline workspace ve customer checkout korumasi | LOCAL_VERIFIED | production-005-p06a-frozen-baseline; 10/10 W03 + 16/16 P05/accepted/Maven + typecheck |
| P06-B1 | Module-aware coverage/report, custom test root ve final test raporu kapisi | LOCAL_VERIFIED | production-005-p06b-module-final-gates; 64/64 unit + 16/16 Maven/accepted + typecheck |
| P06-B2 | Effective Maven affected-module scope, typed coverage blocker, run provenance, inventory regression, source identity, module report listesi ve strict test execution property'leri | LOCAL_VERIFIED | production-005-p06b-effective-scope + p06-frozen-counter + p06-strict-maven-gate + pr04-pr06-audit; odak 35/35, Maven runtime 29/29 + typecheck/lint |
| P07-A | Gercek facts projection, DB status projection ve fail-closed export cekirdegi | LOCAL_VERIFIED | production-005-p07a-facts-export; 81/81 odak suite + typecheck |
| P07-B | Report06 renderer, final replay raw/binary evidence ve manifest kimlik zinciri | LOCAL_VERIFIED (Windows kapsaminda) | Windows-native-006 r16; Docker/PP17 bu kapsamda yok |
| P08 | Kurulum/config/runtime resolver, OpenCode entry, readiness ve upgrade/restore | RUNTIME_VERIFIED (Windows kapsaminda) | PP41/PP42/PP43/PP44 kanitlari PASS; cross-drive path escape `p08-cross-drive-path-fix`, stale SQLite WAL/SHM restore fix `p08-restore-stale-wal-fix`; takip Windows suite 8 dosya/36 test PASS; macOS kullanici karariyla kapsam disi |
| P09 | Full regression, lint/typecheck/build ve release verifier reconciliation | LOCAL_VERIFIED | production-005-coordinator-next + qwen-next + coordinator-final2; P01 40/40, ana dal odak 8 dosya 71/71 PASS, lint 0 error/89 warning, typecheck/build PASS; local PASS, full NO_GO (`EVIDENCE_MANIFEST_EKSIK`, 274 obligation) |
| P10 | Teknik devir ve yayin karari | LOCAL_VERIFIED (Windows kapsaminda) | Windows-native-006 r16 final GO; legacy 005 full-gate kayitlari tarihsel ve bu kapsamda acik is degil |

## F bulgu kapanis durumu (004 Bolum 2; F01-F18)

| ID | Durum | Kanit |
| --- | --- | --- |
| F01-F18 | LOCAL_VERIFIED; tam runtime/pilot NOT_VERIFIED | ai/checkpoints/2026-10-11-report06-coordinator-audit.md |

## Kapsam disi / kullanici karariyla beklemeyen alanlar

| Is | Durum | Engel |
| --- | --- | --- |
| Canli kurum modeli benchmark (FIN14 plani) | KAPSAM DISI | ayri kullanici onayi ve yeni gorev gerekir |
| Gercek proje pilotu (RT21) | KAPSAM DISI | provider/pilot karari bu kapanisa dahil degil |
| Kurum signing key ile imzali yayin | KAPSAM DISI | kurum anahtari olmadan yayin yapilmaz |

## Tarihsel kayitlar (silinmez)

- AITE-FOUNDATION-001 (W01-W30): ai/tasks/archive/AITE-FOUNDATION-001.md
- AITE-REMEDIATION-002 (D00-D10): ai/tasks/archive/AITE-REMEDIATION-002.md
- AITE-RUNTIME-ACCEPTANCE-003 v1.0/v2.0: ai/tasks/archive/

## Guncel devam noktasi

- Windows-native-006 r16 ile bu kapsamda acik gelistirme paketi kalmadi.
- macOS'a ozel test assertion'lari ve macOS browser binary yolu aktif test yuzeyinden kaldirildi; urun resolver kodu geriye donuk uyumluluk icin korunuyor.
- Yeni is ancak kullanicinin yeni bir kapsam tanimlamasiyla baslar.
