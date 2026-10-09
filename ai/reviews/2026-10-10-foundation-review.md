# Foundation Incelemesi - F01-F14 Bulgulari

- Tarih: 2026-10-10
- Inceleyen: AITE-REMEDIATION-002 (AKTIF_GOREV.md v1.1, Downloads'tan alindi)
- Incelenen HEAD: `c5307f5315a288092a1293d874c335f8db5ecd3d`
- Bu kayit: onceki gorevin "FULL_ACCEPTANCE_VERIFIED" kabulunun yeniden degerlendirilmesi

## Neden yeni denetim

Onceki kabul, bilesen varligi ve test sayisini (168/168) tam kabul gibi toplamisti. Yeni inceleme, "kod var" ile "normal MCP yolundan calisiyor" arasindaki farklari ayiriyor. Gecmis checkpoint/handoff kayitlari tarihsel olarak korunur; bu denetim onlari gecersiz kilar ve duzeltme asamalari (D00-D10) kanitli tamamlanir.

## Bulgular teyit durumu (uygulayici ortaminda dogrulandi)

| Bulgu | Onem | Teyit | Kanit |
| --- | --- | --- | --- |
| F01 - MCP is kaydi aciyor, otomatik test muhendisligi calismiyor | P0 | TEYIT EDILDI | src/application/services.ts:373 `last_trusted_coverage: null` sabit; test_start CandidateLoop'a dispatch etmiyor |
| F02 - Windows install merge baska MCP'leri silebilir | P0 | TEYIT EDILDI | scripts/install.ps1:108 `Add-Member -Name mcp -Force -Value $null` (mevcut mcp'yi silip kendi kaydini yaziyor); temiz-kurulum testi gercek USERPROFILE config'ine yazdi |
| F03 - BRANCH hedefi varken LINE ile TARGET_REACHED | P0 | TEYIT EDILDI | src/orchestration/candidate-loop.ts:140,282 yalniz `line_target_bps` kontrolu; branch_target_bps kullanilmiyor |
| F04 - Sonuc puani tutuluyor, birikimli accepted set sahiplenilmiyor | P0 | TEYIT EDILDI | candidate-loop overlay finally'de geri aliniyor; DB/checkpoint baglantisi yok |
| F05 - Docker bileseni var, dongu host Maven calistiriyor | P0 | TEYIT EDILDI | candidate-loop `new MavenRunner()` (host spawn + process.env miras) |
| F06 - Test-root denetimi ham metne bakiyor | P0 | TEYIT EDILDI | `src/test/java/../../../README.md` PolicyGuard'da `allowed: true` (canonical README.md hedefi; test root disinda) |
| F07 - Worker yanit sozlesmesi resmi API ile uyusmuyor | P0 | TEYIT EDILDI | worker-client.ts:77,109,120 kosulsuz `response.json()` (204 No Content parse hatasi); :142,146 mesaj `role/completed` dis nesnede araniyor (resmi `{info,parts}`) |
| F08 - Lease/checkpoint/recovery guvenli devam sozlesmesi eksik | P0 | TEYIT EDILDI | lease-manager release kaydi siliyor (token yeniden 1 olabilir); acquire sure bitmemis lease'i devraliyor |
| F09 - Kalite/regresyon regex + exit code agirlikli | P1 | TEYIT EDILDI | `assertTrue(true)` assertion regex'ine uyor; `isSutShadowing` `/src/main/` yolu ariyor |
| F10 - Kesif/platform destegi dar fixture disinda eksik | P1 | TEYIT EDILDI | regex tabanli envanter; POSIX ters slash; `dirty` hic guncellenmiyor |
| F11 - Checkout apply onay/preimage/transaction guvencesi yok | P0 | TEYIT EDILDI | test-apply.ts onay yalniz metin uzunlugu; expected-before hash yok; backup/journal customer repo icinde |
| F12 - MCP v2 kabul kaniti metadata kontrolu | P0 | TEYIT EDILDI | contract testi tools array karsilastiriyor; gercek wire initialize/discovery yok |
| F13 - Kabul matrisi bilesen/metin kanitlarini tam kabul gibi topluyor | P0 | TEYIT EDILDI | AC30/AC44 gibi satirlar enum/akis varligini PASSED sayiyor; pilot 5000 bps (%50) esigi |
| F14 - Rapor/export butunlugu normal job'a bagli degil | P1 | TEYIT EDILDI | assertReportConsistent yalniz job_id/outcome; verification hash_mismatch dikkate almiyor |

## Duzeltme baglantisi

Her bulgunun kapatma asamasi kokteki AKTIF_GOREV.md (AITE-REMEDIATION-002) bolum 4'te (D00-D10) tanimli. Duzeltme ilerlemesi `ai/BACKLOG.md` (D00-D10) ve `ai/checkpoints/` altinda izlenir.

## Kabul durumu degisimi

- Onceki: `FULL_ACCEPTANCE_VERIFIED` (70/70 PASSED) - **yeniden degerlendiriliyor**
- Yeni: `REMEDIATION_IN_PROGRESS`
- Onceki 70/70 kaydi tarihsel model beyani olarak korunur; yeni kabulun gercegi bu incelemenin duzeltme kanitlaridir.
