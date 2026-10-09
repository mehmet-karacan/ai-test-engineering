# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

| ID | Is | Ilgili R/AC | Durum | Bagimlilik | Kanit |
| --- | --- | --- | --- | --- | --- |
| W01 | Kok dosyalari + ai/ hafiza kurulumu (P00) | AC01, AC69, AC70 | VERIFIED | - | ai/checkpoints/2026-10-09-p00-baslangic.md |
| W02 | TS proje iskeleti: package.json, tsconfig, lockfile (P01) | - | VERIFIED | W01 | ai/checkpoints/2026-10-09-p01-cekirdek.md |
| W03 | Schema/domain: Zod semalari, hata siniflari (P01) | R06, R07 | VERIFIED | W02 | ai/checkpoints/2026-10-09-p01-cekirdek.md |
| W04 | MCP tool registry + v1 adapter (P01) | AC02, AC03 | IN_PROGRESS | W02 | AC02 stdio testi gecti; AC03 v2 profili P04+ |
| W05 | SQLite storage + migration + artifact store (P01) | R10, AC52, AC53 | IN_PROGRESS | W02 | kalicilik testi gecti; AC52/AC53 fault testleri P06 |
| W06 | Config katmani: configuration schema + yukleme (P01) | R15 | VERIFIED | W02 | ai/checkpoints/2026-10-09-p01-cekirdek.md |
| W07 | P01 testleri: stdio client tool list/call, DB kalicilik (P01) | AC02 | VERIFIED | W03-W06 | tests/integration/stdio-client.test.ts 4/4 |
| W08 | Guvenli kesif: snapshot/allowlist + JavaParser helper (P02) | AC07, AC10, AC11 | VERIFIED | W07 | ai/checkpoints/2026-10-09-p02-kesif.md |
| W09 | POM/module/target discovery + envanter sorgulari (P02) | AC05, AC06, AC12 | IN_PROGRESS | W08 | kesfi unit test gecti; tam kanit P03+ |
| W10 | MavenRunner + process supervisor + effective Maven plan (P03) | AC13-AC15 | IN_PROGRESS | W09 | runner testi gecti; AC13/AC15 tam fixture kaniti devam |
| W11 | JaCoCo XML parser + class provenance + coverage hesap (P03) | R06, AC19-AC22 | IN_PROGRESS | W10 | parser + math testleri gecti; provenance derinlesme P06 |
| W12 | Baseline akisi + regresyon (P03) | AC17, AC26 | IN_PROGRESS | W11 | baseline PASSED gecti; AC17 fault testi P06 |
| W13 | OpenCode worker adapter + guvenli config (P04) | AC42, R15 | IN_PROGRESS | W12 | worker-client + config testleri gecti; AC42 fault testleri P06 |
| W14 | Role prompts + CandidateChangeSet semasi (P04) | R03 | VERIFIED | W13 | ai/checkpoints/2026-10-09-p04-worker.md |
| W15 | Aday kabul dongusu + PatchApplier + checkpoint (P05) | AC27, AC28, AC32 | IN_PROGRESS | W13 | PatchApplier + loop testleri gecti; tam fixture dongusu P06 |
| W16 | Kalite kapilari + gap stratejileri + per-target esikler (P05) | AC33-AC36, AC56 | VERIFIED | W15 | ai/checkpoints/2026-10-09-p05-dongu.md |
| W17 | Checkpoint atomic publish + lease/fence (P06) | AC47-AC49 | VERIFIED | W15 | ai/checkpoints/2026-10-09-p06-dayaniklilik.md |
| W18 | Recovery: kill/restart, disk/DB fault, duplicate resume (P06) | AC45, AC46, AC48, AC52 | IN_PROGRESS | W17 | recovery resume/SOURCE_CHANGED gecti; tam fault injection devam |
| W19 | Offline Report Generator + export verification (P07) | AC61-AC63 | VERIFIED | W18 | ai/checkpoints/2026-10-09-p07-cikti.md |
| W20 | test_apply akisi: onay + preimage + journal (P07) | AC57-AC60 | VERIFIED | W19 | ai/checkpoints/2026-10-09-p07-cikti.md |
| W21 | Kurulum scriptleri + config merge/uninstall (P08) | AC65 | IN_PROGRESS | W20 | install/verify/uninstall yazildi + smoke; temiz makine P09 |
| W22 | docs/ + CI workflow + secret scan (P08) | AC70 | VERIFIED | W21 | ai/checkpoints/2026-10-09-p08-kurulum.md |
| W23 | AC matrisi guncelleme + bagimsiz son inceleme (P09) | AC01-AC70 | VERIFIED | W21 | ai/handoffs/2026-10-09-son-inceleme.md |
| W24 | Nihai gelistirme ozeti + Git teslimati (P09) | AC70 | IN_PROGRESS | W23 | - |
| W25 | AC03: MCP v2 stdio profili + contract testleri | AC03 | TODO | W24 | - |
| W26 | AC13/AC15: Java8/Java21 fixture kanitlari | AC13, AC15 | TODO | W24 | - |
| W27 | AC27: gercek fixture tam dongu testi | AC27 | TODO | W24 | - |
| W28 | AC39/AC40: izole container + preflight + fault testleri | AC39, AC40 | TODO | W24 | - |
| W29 | AC67: gercek model pilotu (operator izni bekliyor) | AC67 | BLOCKED | W28 | Kurum ici model erisimi gerekli |
