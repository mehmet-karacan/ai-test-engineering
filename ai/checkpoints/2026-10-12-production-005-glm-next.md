# Checkpoint - AITE-PRODUCTION-READINESS-005 GLM-next: P07-B non-zero facts + P08 surum-atlayi upgrade kanitlari

## Kimlik

- Tarih: 2026-10-12 (UTC)
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / P07-B (PR07) + P08 (PR08) kalan kapanis isleri
- Branch: `codex/glm-prod005-next` (HEAD `ed52a76` tabanindan olusturuldu)
- Baslangic HEAD: `ed52a76` (gorev: coordinator final durum ve kapanis kanitlari)
- Ortam: Windows 11 host, Node v24.14.1, npm 11.11.0, vitest 4.1.11, Git 2.55.0, Maven 3.9.16 (JDK 25), Docker 29.8.2 (linux/amd64), Microsoft Edge 155 (CDP)
- Kullanici sinirlari: canli pilot `PAUSED_BY_USER` (baslatilmadi); CI acilmadi; kurum ic adres/secret repoya yazilmadi; `JavaMetadataScannerCoverageTest.java` dokunulmadi (bu worktree'de mevcut degil, stage edilmedi); kullanici OpenCode config'ine dokunulmadi; global git config degistirilmedi; repo-local kimlik `mehmet-karacan <karacan.mehmet@hotmail.com>`.
- Paralel oturum notu: Qwen P09/P10 baska worktree'de; `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md`, `ai/handoffs/` bu oturumda DEGISTIRILMEDI; yalniz bu checkpoint eklendi.

## Denetim sonucu (kod acigi)

P07-B ve P08 kaynak kodu yeniden denetlendi; uygulanabilir yeni urun kodu duzeltmesi BULUNMADI. Urun kodu degisikligi YAPILMADI; yalniz iki yeni test dosyasi eklendi (asagida). Egress enforcement ve macOS gibi dis ortam/onay gerektiren kabuller uydurulmadi; fail-closed typed blocker + NOT_RUN/BLOCKED olarak ayri tutuldu.

## Yeni dosyalar (yalniz test kapsam genisletme; kaynak kod degismedi)

- `tests/unit/p08-skip-upgrade.test.ts` (YENI, 3 test): P08/PP44 gercek surum-atlayi upgrade/rollback yerel kaniti.
  1. Upgrade: v1 schema DB (yalniz migration 1 fiziksel uygulanmis; eski binary'nin urettigi tablolar + trusted job satiri) guncel binary `Storage.migrate` ile tek transaction'da v1->v7'ye cikarildi; `schemaVersion()=7`, integrity=ok, migration kayitlari `[1..7]`, trusted `COMPLETED` job satiri korunur, v4 `job_target_concretes` tablosu eski veriyle ayni DB'de olusur (eski job'a dokunulmaz).
  2. Rollback yazim korumasi: v7 DB'nin migration checksum'u bozuldugunda (eski binary downgrade benzeri durum) migrate fail-closed `checksum uyusmazligi` hatasi verir; yazma durdurulur.
  3. Rollback restore: upgrade sonrasi online backup (DB + blob manifest + READY blob pin) dogrulanir (`verifyBackup valid=true`), `restoreBackup` ile trusted job=COMPLETED ve binary blob byte-exact geri gelir.
- `tests/integration/p07b-nonzero-facts.test.ts` (YENI, 1 test): P07-B/PP34 gercek Maven/JaCoCo final replay'den non-zero coverage facts kaniti.
  - Gercek Maven coverage kosusu (`test` + `jacoco:report`, strict property'ler yok - dogrudan buildPlan goals) fixture'ta exit 0; non-zero eklenen test (`PaymentServiceBranchTest`, 2 yeni test) workspace'e yazilir.
  - GERCEK `parseJacocoXml`/`findClassInReport`: PaymentService LINE 10/11 (bps 9090), BRANCH 9/10 (bps 9000) - 0/0 sahtesi yok.
  - GERCEK `collectFinalReplayEvidence`: jacoco.xml + jacoco assets + surefire XML + run log eksiksiz (missing=[]).
  - GERCEK `ReportExporter.export` + verifyExport: PUBLISHED yazildi; report.json/HTML/status projection ayni non-zero facts (tests_added=1, run summary, JaCoCo counter degerleri); manifest job/run identity zinciri + jacoco.xml diskte byte-exact (PP39).

## P07-B durum ozeti (bu oturum)

- Wire blocker (mevcut, yeniden dogrulandi): `tests/integration/p07b-dispatch-egress.test.ts` gercek stdio-entry + Docker; provisioning ACIK + izinli mirror DOLU, egress enforcement mekanizmasi (network policy/proxy) bagli DEGIL iken fail-closed typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` + FAILED lifecycle (sahte COMPLETED/PASS yok) - 1/1 PASS (27.9 sn; Docker preflight GECTI, skip YOK).
- Non-zero facts (YENI): `tests/integration/p07b-nonzero-facts.test.ts` 1/1 PASS - normal dispatcher eksik bıraktigi non-zero gercek veri akisi, production siniflari uzerinde gercek Maven ciktilariyla kanitlandi.
- PP37 browser e2e (mevcut, yeniden dogrulandi): `tests/integration/p07b-browser-e2e.test.ts` 4/4 PASS (38.6 sn; gercek Edge 155, gercek Maven final replay, gercek Report06).
- Tam customer dispatcher COMPLETED + Report06 export gercek Docker akisi: BLOCKED (egress enforcement mekanizmasi yok -> typed blocker fail-closed; uydurulmadi).

## P08 durum ozeti (bu oturum)

- Surum-atlayi upgrade/rollback (YENI): `tests/unit/p08-skip-upgrade.test.ts` 3/3 PASS - v1->v7 gercek migration zinciri + downgrade benzeri checksum fail-closed + backup restore rollback veri korunumu.
- Mevcut yerel kanitlar yeniden dogrulandi: `p08-upgrade-restore` 3/3, `fin11-lifecycle-ops` 7/7, `p08-runtime-paths` 7/7, `w09-install` 10/10 (odak suite ciktilari asagida).
- Gercek binary surum-atlayi install->upgrade->rollback e2e (ayri OS process + gercek kurulum store): NOT_RUN (ayri runtime kabul; bu host'ta simule edilmedi).
- macOS makine kaniti: NOT_RUN (macOS host yok; darwin yolu unit test kapsaminda).

## Odak suite (gercek kosu, bu oturum)

- Komut: `npm.cmd test -- --run` + 15 dosya (p08-skip-upgrade, p07b-nonzero-facts, p07b-dispatch-egress, p07b-report06-surfaces, p07-report-projection, w07-export, p07b-report06-evidence, p08-upgrade-restore, fin11-lifecycle-ops, p08-runtime-paths, w09-install, fin02-capability, p04-isolation-policy, p03-checkpoint-identity, p05-target-resolver)
- Sonuc: **15 dosya, 121 test, 121 PASS, 0 FAIL, 0 SKIP, exit 0**, 38.16 sn.
- Log (repo disinda): `C:\Users\mkaracan\AppData\Local\Temp\opencode\p005-glm-next\focus-suite.log`, sha256 `43bef4815e32261edb06e74473b7ee6fd86c38d066683e0969493eac1bcc9a0a`, 1385 bayt.
- Ek dogrulama: `fin02-capability` gercek Docker capability probe 4/4 PASS (13.7 sn); `p07b-browser-e2e` 4/4 PASS (38.6 sn); `p07b-dispatch-egress` tek basina 1/1 PASS verbose (27.9 sn, Docker preflight gecti).

## typecheck / build / lint (gercek kosu, bu oturum)

- `npm.cmd run typecheck`: exit 0. Log sha256 `83d13b8b92977169fa2c3faf98ba0b35d51d2c37560aa7c6b5669ef7f3acfdf5`.
- `npm.cmd run build`: exit 0. Log sha256 `be14c6fae0c626b25edf2fb7202a34bd9363c628be6716df6e1ad0ceebbeb42d`.
- `npm.cmd run lint`: exit 0, **0 error / 90 warning** (hepsi mevcut; yeni iki test dosyasi yeni lint hatasi/uyarisi eklemedi). Log sha256 `bfed65c586e9271e97c6178517e53da743cbd031d83a5c4006e54c6572e7915d`.
- Tum loglar repo disinda: `C:\Users\mkaracan\AppData\Local\Temp\opencode\p005-glm-next\`.

## PP kimlik durumu (bu oturumdan etkilenenler)

- PP34: LOCAL_VERIFIED + gercek Maven facts e2e eklendi (p07b-nonzero-facts 1/1).
- PP39/PP40: mevcut kapilar + yeni gercek jacoco byte-exact kaniti.
- PP44: surum-atlayi upgrade/rollback yerel gercek better-sqlite3 kaniti eklendi (3/3); gercek binary install e2e NOT_RUN.
- PP28/PP32: gercek JaCoCo counter degerlendirmesi e2e seviyede yeniden dogrulandi.
- PP37: yeniden kosuldu 4/4 PASS.
- PP17 (egress enforcement): BLOCKED - typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` fail-closed wire kaniti yeniden dogrulandi; tam enforcement runtime kaniti mekanizma yok.
- PP42 macOS: NOT_RUN.

## Kalan NOT_RUN/BLOCKED (acik)

- P07-B tam customer dispatcher COMPLETED + gercek Docker akisinda Report06 export: BLOCKED (egress enforcement mekanizmasi yok; fail-closed typed blocker kanitli).
- PP17 tam allowlist egress enforcement runtime kaniti: BLOCKED (mekanizma yok).
- PP44 gercek binary surum-atlayi install->upgrade->rollback e2e (ayri process/store): NOT_RUN.
- PP42 macOS makine kaniti: NOT_RUN.
- Canli pilot: `PAUSED_BY_USER`; full gate: `NO_GO` (evidence manifest eksik); production GO verilmedi.

## Sonraki tek somut is

- Docker egress enforcement (network policy/proxy) saglanirsa P07-B tam customer dispatcher COMPLETED + Report06 export gercek Docker akisi; P08 gercek binary surum-atlayi install e2e; P10 evidence manifest + handoff/release karari.
