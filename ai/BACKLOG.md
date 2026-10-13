# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED, LOCAL_VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

## 006 Windows native paketleri

Aktif gorev: AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0 (`AKTIF_GOREV.md`); G0 acik, G1/G2/G3 ayri karar. Asagidaki durumlar eski P paketlerini PASSED'a ceviremez.

| Paket | Is | Durum | Sonraki kanit |
| --- | --- | --- | --- |
| S00 | 005 arsiv, 320 legacy ID mapping, yeni scope, Windows baseline | LOCAL_VERIFIED | WN01-WN04 mapping/baseline; WN67-WN69 full evidence kapisi S09'da tamamlanir; S00 review checkpoint |
| S01 | Backup otoritesi ve hata atomik restore | IN_PROGRESS | WN05-WN13; Win32 public restore varsayilan hook-free native helper; terminal COMMIT/ACK, stage DELETE_ON_CLOSE receipt, sentetik partial-write ve PREPARED tek blob icin bos ad/stage-only/destination-only native recovery hardkill kanitli; iki blob/yedi kesit RED, N=2 pinned GUARD-only ve test-only partial ARM kill kaniti var; 8192 valid boundary, N=2 uretim ARM/terminal/ACK uzlasma, fresh hedef, gercek OS ENOSPC/Flush, ara parent alias, orphan/GC acik |
| S02 | Windows native runner ve Docker'in kaldirilmasi | IN_PROGRESS | WN14-WN24; WN20 ENOENT/spawn fault, WN21 PENDING final/temp receipt hardkill; WN19 normal MCP sentetik settings negatif gizlilik kaniti var ama tam zincir NOT_RUN; low-integrity child Temp clone'a yeni JAR yazamadi fakat medium peer ekle-sil yapti; WN23 parent/torun RED ust Job tanisi kayitli; immutable install, ust Job disi owner_lost, fiziksel GC/customer gate acik |
| S03 | Tam metadata envanteri ve source snapshot | IN_PROGRESS | WN25-WN31; required build input hash/cursor v2, snapshot FileId receipt, forged marker/restart read-only karantina; WN28 mutable tree cursor drift RED kanitli, it.fails kabul kapisi degil; S04 trusted dis ownership/generation, partial cleanup ve sayfali scan persistence acik |
| S04 | SQLite proje kimligi, agent task ve resume | TODO | WN32-WN42; S01 VERIFIED oncesi yalniz salt okunur tasarim/fixture checkpoint'i hazir |
| S05 | Gercek subagent oturumlari ve context butcesi | TODO | WN43-WN52 |
| S06 | Native Maven/coverage/iteration | TODO | WN53-WN60 |
| S07 | Report06, kurulum, readiness | TODO | WN61-WN66 |
| S08 | GPU Fusion kontrollu pilot | G1_BEKLIYOR | WN70-WN75; ilk Maven/model G1 onayi ister |
| S09 | Yeni scope release gate ve final review | TODO | WN67-WN69/WN76-WN80 |

## Tarihsel 005 kaydi (korunur)

Aktif gorev: AITE-PRODUCTION-READINESS-005 v1.0 (sozlesme: AKTIF_GOREV.md). P00-P08 Windows kapsaminda dogrulandi; P09 verifier/reconciliation local olarak kapali. Docker/Docker execution/Docker egress/PP17 bu gorevde acikca kapsam disidir ve sonraki aktif goreve devredilmistir. Ana kalan formal paket sayisi: 1 (P10; macOS da kapsam disi).
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
| P07-B | Report06 renderer, final replay raw/binary evidence ve manifest kimlik zinciri | IN_PROGRESS (Docker/PP17 bu gorevde kapsam disi) | Docker customer dispatcher + egress runtime kaniti bu gorevde calistirilmayacak; mevcut fail-closed blocker kaydi korunarak sonraki aktif goreve devredildi |
| P08 | Kurulum/config/runtime resolver, OpenCode entry, readiness ve upgrade/restore | RUNTIME_VERIFIED (Windows kapsaminda) | PP41/PP42/PP43/PP44 kanitlari PASS; cross-drive path escape `p08-cross-drive-path-fix`, stale SQLite WAL/SHM restore fix `p08-restore-stale-wal-fix`; takip Windows suite 8 dosya/36 test PASS; macOS kullanici karariyla kapsam disi |
| P09 | Full regression, lint/typecheck/build ve release verifier reconciliation | LOCAL_VERIFIED | production-005-coordinator-next + qwen-next + coordinator-final2; P01 40/40, ana dal odak 8 dosya 71/71 PASS, lint 0 error/89 warning, typecheck/build PASS; local PASS, full NO_GO (`EVIDENCE_MANIFEST_EKSIK`, 274 obligation) |
| P10 | Teknik devir ve yayin karari | IN_PROGRESS | Qwen sema auditi: partial NOT_RUN/BLOCKED manifest desteklenmiyor; gercek PASS kaniti olmadan manifest uydurulmadi; full NO_GO, 274/274 missing; P01/P09/P10 verifier/ledger auditi (production-005-p10-followup-verifier-audit): bug yok, local exit 0 / full exit 1 NO_GO, P01 40/40 PASS |

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
