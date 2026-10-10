# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

Aktif gorev: AITE-REMEDIATION-002. Duzeltme asamalari D00-D10; bulgular F01-F14 (ai/reviews/2026-10-10-foundation-review.md).

## Duzeltme asamalari

| ID | Is | Ilgili F/RG | Durum | Bagimlilik | Kanit |
| --- | --- | --- | --- | --- | --- |
| P00 | Gorev kurulumu: arsiv + inceleme kaydi + bulgu teyidi | F01-F14 | VERIFIED | - | ai/reviews/2026-10-10-foundation-review.md (commit 2f7d595) |
| D00 | Kabul gercegini yeniden kur; guvenli baseline; AC yeniden degerlendirme | F13, RG tumu | VERIFIED | P00 | ai/ACCEPTANCE_MATRIX.md yeniden degerlendirme (commit d99824c) |
| D01 | Installer mcp=null silici islem kaldir; Node.mjs kurulum (PS1'siz); izole config testi | F02, F10, F13; RG05-RG10 | VERIFIED | D00 | ai/checkpoints/2026-10-10-remediation-d01.md (commit c7a77f0) |
| D02 | test_start'i CandidateLoop'a dispatch; 8 arac; gercek orkestrasyon | F01, F12; RG11-RG14 | VERIFIED | D01 | ai/checkpoints/2026-10-10-remediation-d02.md (commit ff0d095) |
| D03 | Runner izolasyon gecidi; canonical path containment; supervisor semantigi | F05, F06; RG15-RG20, RG34-RG36 | VERIFIED | D02 | failclosed-runner + PolicyGuard canonical (commit 6ff1076) |
| D04 | Worker 204/mesaj shape; gercek contract testleri | F07; RG24-RG26, RG41-RG42 | VERIFIED | D03 | worker-response.test.ts (commit 340bc72) |
| D05 | BRANCH hedefi kararlara bagla; birikimli accepted set; final replay | F03, F04, F06, F09; RG21-RG23, RG27-RG30 | VERIFIED | D04 | evaluateGoalMet + accepted-set.test.ts (commit 28d31e8, 9f5de8e) |
| D06 | Lease/checkpoint/recovery guvenli devam semantigi | F08, F04, F10; RG31-RG37 | VERIFIED | D05 | fencing.test.ts (commit 94fcbfb) |
| D07 | AST tabanli kalite; gercek test kimlikleri | F09, F13; RG28-RG30, RG43 | VERIFIED | D06 | quality-strict.test.ts (commit 5396e98) |
| D08 | Effective Maven; AST discovery; platform yolu | F10, F14; RG01-RG04, RG38-RG40 | VERIFIED | D07 | platform separator + dirty tespiti (commit 19a8f1a) |
| D09 | Apply onay/digest/transaction; binary-safe export | F11, F14; RG45-RG52 | VERIFIED | D08 | expected-before + dis store journal (commit 86f7898) |
| D10 | Tekrar uretilebilir kabul; son bagimsiz denetim | F12, F13 | VERIFIED | D09 | eslint + final-audit (commit f27b755, 017cfed) |

## Eski gorev (arsiv)

AITE-FOUNDATION-001 isleri (W01-W30): ai/tasks/archive/AITE-FOUNDATION-001.md icindeki sozlesmeyle tamamlanmisti; F01-F14 ile yeniden degerlendirildi. Tarihsel kanitlar ai/checkpoints/ altinda korunur.
