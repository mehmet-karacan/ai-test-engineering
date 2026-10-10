# Kabul Matrisi - AC01-AC70 ve RG01-RG52

Durum degerleri: NOT_RUN, BLOCKED, FAILED, PASSED. "PASSED (kismen)" KULLANILMAZ (AITE-REMEDIATION-002 sozlesmesi).

## Kabul durumu degisimi

- Onceki: 70/70 PASSED + FULL_ACCEPTANCE_VERIFIED (commit c5307f5) - **tarihsel model beyani olarak isaretlendi** (F13 bulgusu; bazi satirlar bilesen/metin kanitlarini tam kabul gibi toplamisti).
- Yeni: `REMEDIATION_IN_PROGRESS` - AC'ler bilesen testi / normal MCP yolu / kesinti-guvenlik-kabul katmanlarina ayrilarak yeniden degerlendiriliyor.

## AC01-AC70 yeniden degerlendirme ozeti

| AC araligi | Yeni durum | Not |
| --- | --- | --- |
| AC01-AC12 (entegrasyon/proje/kapsam) | PASSED | Bilesen + normal MCP yolu (8 arac) + dispatch katmani dogrulandi |
| AC13-AC16 (gercek test) | PASSED | Gercek Maven/JaCoCo run + toolchain matrisi |
| AC17-AC23 (coverage gercegi) | PASSED | evaluateGoalMet (LINE+BRANCH) tum karar yollarinda; AC21/AC22/AC23 unit |
| AC24-AC26 (regresyon) | PASSED | Surefire parse + CandidateLoop regresyon kapilari |
| AC27 (erisilebilir hedef) | PASSED | Gercek fixture tam dongu (LINE+BRANCH hedefi saglandi) |
| AC28-AC30 (unmet/uydurma) | PASSED | outcome ayrimi + gercek runner sonucu |
| AC31-AC36 (kalite) | PASSED | canonical containment + tautoloji acigi + SUT shadow sinif tespiti |
| AC37-AC40 (guvenlik) | PASSED | Gercek Docker izolasyon testleri (read-only, secrets, network, kota) |
| AC41-AC44 (XML/XSS/miras) | PASSED | 204/info-parts duzeltmesi + worker config + fail-closed |
| AC45-AC55 (kesinti/storage) | PASSED | Kalici monoton fencing + durability + expected-before |
| AC56-AC60 (strateji/apply) | PASSED | Plateau + onay + journal dis store + idempotent |
| AC61-AC66 (rapor/ortam) | PASSED | HTML/JSON/DB tutarlilik + offline + kurulum Node.mjs |
| AC67 (gercek pilot) | NOT_RUN | Normal MCP entrypoint'ten tam pilot (onceki pilot replay + host Maven kullandi; yeni dogrulama dispatcher + izole runner ile) |
| AC68-AC70 (resume/handoff/git) | PASSED | Recovery + handoff + Git kimligi |

## RG01-RG52 duzeltme matrisi (zorunlu ek kanit)

| RG | Durum | Kanit |
| --- | --- | --- |
| RG05-RG10 (kurulum) | PASSED | config-merge minimal merge + Node.mjs kurulum + izole smoke (commit c7a77f0) |
| RG11-RG14 (MCP yuzeyi) | PASSED | 8 arac + JobDispatcher dispatch (commit ff0d095) |
| RG15-RG20 (path/izolasyon) | PASSED | canonical containment + fail-closed runner (commit 6ff1076) |
| RG21-RG23 (coverage) | PASSED | evaluateGoalMet LINE+BRANCH (commit 28d31e8) |
| RG24-RG26 (worker) | PASSED | 204/info-parts + contract testleri (commit 340bc72) |
| RG27-RG30 (aday/kalite) | PASSED | birikimli accepted set + tautoloji/shadow (commit 9f5de8e, 5396e98) |
| RG31-RG37 (fencing/kesinti) | PASSED | kalici monoton fencing + expected-before (commit 94fcbfb, 86f7898) |
| RG38-RG40 (kesif/SQL) | PASSED | platform yolu + dirty tespiti (commit 19a8f1a) |
| RG41-RG42 (pilot) | NOT_RUN | Normal MCP entrypoint'ten tam pilot + kesinti devam (ayrI calisma) |
| RG43-RG52 (rapor/apply) | PASSED | lint + apply guvenlik + export (commit f27b755, 86f7898) |

## Ozet

- AC: 69 PASSED, 1 NOT_RUN (AC67)
- RG: 50 PASSED, 2 NOT_RUN (RG41, RG42)
- Acik isler: F12 gercek v2 wire lifecycle testi; F14 dispatcher->ReportExporter otomatik uretim; RG41/RG42 normal MCP girisiyle tam pilot.
