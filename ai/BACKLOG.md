# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED, LOCAL_VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-PRODUCTION-READINESS-005 v1.0 (sozlesme: AKTIF_GOREV.md). P00-P06 ve P07-A local olarak dogrulandi; P09 verifier/reconciliation local olarak kapali, P07-B/P08/P10 kapanis paketi suruyor. Ana kalan paket sayisi: 3 (P09 kapanis kaniti korunuyor).
Onceki gorev AITE-RUNTIME-ACCEPTANCE-003 v2.0: FIN00-FIN15 IMPLEMENTATION_VERIFIED (tarihsel kayit asagida).
P02/P03 kalan runtime kanitlari (2026-10-12): PP07/PP08/PP09/PP14 RUNTIME_VERIFIED; checkpoint `ai/checkpoints/2026-10-12-production-005-p02p03-remaining-runtime-kanit.md`.

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
| P07-B | Report06 renderer, final replay raw/binary evidence ve manifest kimlik zinciri | IN_PROGRESS (COMPLETED/export BLOCKED_KAYITLI) | p07b-report06-evidence + p07b-published-reserved + report-path-authority + p07b-report06-surfaces + p07b-browser-e2e + p07b-dispatch-egress + p07b-next2-blocked (YENI); PP37 gercek browser DOM/print/offline/link 4/4 PASS; wire fail-closed typed blocker 1/1 PASS; nonzero facts gercek Maven kosu 2/2 PASS; COMPLETED/export kosusu BLOCKED (egress enforcement altyapisi depoda ve hostta yok) |
| P08 | Kurulum/config/runtime resolver, OpenCode entry, readiness ve upgrade/restore | IN_PROGRESS | p08-install-runtime + p08-lifecycle-restore + p08-runtime-paths + p08-upgrade-restore + w09 PP43 + PP41/PP42/PP44 gercek e2e; final2 store (YENI) verify/chain/uninstall exit 0 + CHAIN_ALL_OK=true (v4->v7 + quiesce + backup/restore/rollback); PP41 install/verify/uninstall exit 0, PP42 gercek Docker-linux path, PP43 gercek Docker probe 4/4, PP44 uninstall e2e + yerel 15/15; gercek eski v4 binary (0822c3d) derlendi + OLD_SCHEMA_VERSION=4 (p08-realbin-v4); gercek binary surum-atlayi upgrade/rollback e2e ve macOS NOT_RUN |
| P09 | Full regression, lint/typecheck/build ve release verifier reconciliation | LOCAL_VERIFIED | production-005-coordinator-next + qwen-next + coordinator-final2; P01 40/40, ana dal odak 8 dosya 71/71 PASS, lint 0 error/89 warning, typecheck/build PASS; local PASS, full NO_GO (`EVIDENCE_MANIFEST_EKSIK`, 274 obligation) |
| P10 | Teknik devir ve yayin karari | IN_PROGRESS | coordinator final checkpoint; evidence manifest, platform/live kanitleri eksik; production GO verilmedi |

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
