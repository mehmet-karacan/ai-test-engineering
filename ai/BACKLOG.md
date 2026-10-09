# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-REMEDIATION-002. Duzeltme asamalari D00-D10; bulgular F01-F14 (ai/reviews/2026-10-10-foundation-review.md).

## Duzeltme asamalari

| ID | Is | Ilgili F/RG | Durum | Bagimlilik | Kanit |
| --- | --- | --- | --- | --- | --- |
| P00 | Gorev kurulumu: arsiv + inceleme kaydi + bulgu teyidi | F01-F14 | VERIFIED | - | ai/reviews/2026-10-10-foundation-review.md (commit 2f7d595) |
| D00 | Kabul gercegini yeniden kur; guvenli baseline; AC yeniden degerlendirme | F13, RG tumu | IN_PROGRESS | P00 | - |
| D01 | Installer mcp=null silici islem kaldir; Node.mjs kurulum (PS1'siz); izole config testi | F02, F10, F13; RG05-RG10 | TODO | D00 | - |
| D02 | test_start'i CandidateLoop'a dispatch; 8 arac; gercek orkestrasyon | F01, F12; RG11-RG14 | TODO | D01 | - |
| D03 | Runner izolasyon gecidi; canonical path containment; supervisor semantigi | F05, F06; RG15-RG20, RG34-RG36 | TODO | D02 | - |
| D04 | Worker 204/mesaj shape; gercek contract testleri | F07; RG24-RG26, RG41-RG42 | TODO | D03 | - |
| D05 | BRANCH hedefi kararlara bagla; birikimli accepted set; final replay | F03, F04, F06, F09; RG21-RG23, RG27-RG30 | TODO | D04 | - |
| D06 | Lease/checkpoint/recovery guvenli devam semantigi | F08, F04, F10; RG31-RG37 | TODO | D05 | - |
| D07 | AST tabanli kalite; gercek test kimlikleri | F09, F13; RG28-RG30, RG43 | TODO | D06 | - |
| D08 | Effective Maven; AST discovery; platform yolu | F10, F14; RG01-RG04, RG38-RG40 | TODO | D07 | - |
| D09 | Apply onay/digest/transaction; binary-safe export | F11, F14; RG45-RG52 | TODO | D08 | - |
| D10 | Tekrar uretilebilir kabul; son bagimsiz denetim | F12, F13 | TODO | D09 | - |

## Eski gorev (arsiv)

AITE-FOUNDATION-001 isleri (W01-W30): ai/tasks/archive/AITE-FOUNDATION-001.md icindeki sozlesmeyle tamamlanmisti; F01-F14 ile yeniden degerlendirildi. Tarihsel kanitlar ai/checkpoints/ altinda korunur.
