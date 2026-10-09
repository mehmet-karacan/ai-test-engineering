# PROJECT_STATE - Gelistirme Durumu

## Aktif gorev

- Gorev: AITE-REMEDIATION-002 (AKTIF_GOREV.md v1.1)
- Asama: P00 kurulum TAMAMLANDI -> D00 baslangici
- Durum etiketi: `REMEDIATION_IN_PROGRESS`
- Son guncelleme: 2026-10-10

## Onemli durum degisimi

Onceki gorev (AITE-FOUNDATION-001) "FULL_ACCEPTANCE_VERIFIED" olarak kaydedilmisti (son commit c5307f5). Yeni inceleme (AITE-REMEDIATION-002, ai/reviews/2026-10-10-foundation-review.md) F01-F14 bulgulari tespit etti:

- Onceki 70/70 PASSED kaydi tarihsel model beyanidir; yeni kabulun gercegi degildir.
- Bilesen varligi ile normal MCP yolundan calisma farkli katmanlardir; yeni denetim "kod var" -> "bilesen testi geciyor" -> "normal MCP yolundan calisiyor" -> "kesinti/guvenlik/kabul testleri geciyor" basamaklarini ayri kanitliyor.
- Tum F01-F14 bulgulari uygulayici ortaminda teyit edildi (ai/reviews/ icinde kanit satirlari).

## Asama durumu

| Asama | Durum | Kanit |
| --- | --- | --- |
| P00 - Gorev kurulumu | TAMAMLANDI | ai/reviews/2026-10-10-foundation-review.md; ai/tasks/archive/ |
| D00 - Kabul gercegini yeniden kur | IN_PROGRESS | - |
| D01 - Installer konfigurasyon koruma + PS1'siz kurulum | TODO | - |
| D02 - Gercek kalici orkestrasyonu MCP yuzeyine bagla | TODO | - |
| D03 - Test-only siniri, izolasyon, process supervision | TODO | - |
| D04 - OpenCode worker gercek sozlesme | TODO | - |
| D05 - Coverage gercegi, birikimli adaylar, final replay | TODO | - |
| D06 - Kalici lease/fencing, checkpoint, resume | TODO | - |
| D07 - Mevcut testleri koru, gercek kalite | TODO | - |
| D08 - Effective Maven, Java AST, proje kimligi | TODO | - |
| D09 - Guvenli apply, kanitli rapor, binary-safe export | TODO | - |
| D10 - Tekrar uretilebilir kabul, son denetim | TODO | - |

## Oncesi gorev (arsiv)

- AITE-FOUNDATION-001: ai/tasks/archive/AITE-FOUNDATION-001.md (git show c5307f5:AKTIF_GOREV.md, 108282 byte, birebir)
- Kabul durumu: tarihsel kayit; F01-F14 ile yeniden degerlendirildi

## Ortam (2026-10-10)

- Node.js v24.14.1, Git 2.55.0, JDK 21/25, Maven 3.9.16, Docker 29.8.2 (linux containers)
- PowerShell execution policy engelli (npm.ps1/opencode.ps1); `npm.cmd`/`opencode.cmd` kullaniliyor
- D01 kapsaminda PS1'siz Node.mjs kurulum yolu zorunlu

## Son commit

- P00: AITE-REMEDIATION-002 kuruldu, F01-F14 teyit edildi (commit 2f7d595).

## Acik blocker

- Yok.

## Sonraki somut is

- D00: PROJECT_STATE/BACKLOG kabul gercegini yeniden kur (bu dosya guncelleniyor), guvenli test baseline'i al (unit/contract izole), sonra D01: install.ps1'deki mcp=null silici islemi kaldiran regression testi + Node.mjs kurulum girisleri.
