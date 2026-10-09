# Checkpoint: AITE-REMEDIATION-002 P00 - Gorev kurulumu

- Tarih: 2026-10-10
- Asama: P00 (gorev kurulumu)

## Yapilan is

1. Yeni gorev dosyasi okundu: AITE-REMEDIATION-002 v1.1 (kullanicinin verdigi Downloads\AKTIF_GOREV.md, 683 satir). F01-F14 bulgulari ve D00-D10 duzeltme asamalari analiz edildi.
2. Kokteki AKTIF_GOREV.md yeni gorev dosyasiyla degistirildi (kullanici talebi).
3. Bulgular uygulayici ortaminda TEYIT EDILDI:
   - F01: src/application/services.ts:373 `last_trusted_coverage: null` sabit; test_start CandidateLoop'a dispatch etmiyor.
   - F02: scripts/install.ps1:108 `Add-Member -Name mcp -Force -Value $null` - mevcut mcp alanini silip kendi kaydini yaziyor.
   - F03: candidate-loop.ts:140,282 yalniz `line_target_bps` kontrolu; branch_target_bps kullanilmiyor.
   - F06: `src/test/java/../../../README.md` PolicyGuard'da `allowed: true` (canonical hedef README.md, test root disinda).
   - F07: worker-client.ts:77,109,120 kosulsuz `response.json()`; :142,146 mesaj `role/completed` dis nesnede araniyor.
4. Onceki gorev arsivlendi: ai/tasks/archive/AITE-FOUNDATION-001.md (git show c5307f5:AKTIF_GOREV.md ile birebir, 108282 byte; PowerShell pipe UTF-16 sorunu cmd native redirect ile duzeltildi).
5. Inceleme kaydi: ai/reviews/2026-10-10-foundation-review.md (F01-F14, P0/P1 onem, teyit kanitlari).
6. Kabul durumu: FULL_ACCEPTANCE_VERIFIED -> REMEDIATION_IN_PROGRESS; onceki 70/70 kaydi tarihsel beyan olarak korunuyor.
7. session-*.md .gitignore'a eklendi (kullanici oturum kaydi public'e gitmez - gorev bolum 12.1).

## Onemli bulgular

- Incelenen HEAD (c5307f5) guncel HEAD ile aynIydi; gorev dogrudan bu durumdan devam ediyor.
- PowerShell pipe ile git show ciktisi UTF-16'ya donusturuluyor (arsivleme icin cmd native redirect kullanilmali).
- Yeni gorev dosyasinin onemli zorunlulugu: PS1 calistirma engelli ortamda CMD + Node.js kurulum yolu (D01) ve gercek kullanici config'ine dokunmayan izole testler (D01/RG07).

## Test ozeti

- Bulgu teyidi: davranis seviyesinde dogrulandi (node script ile).
- Turkce ASCII denetimi: tum yeni dosyalar temiz.

## Sonraki adim

- D00: guvenli test baseline'i al (unit/contract izole), AC01-AC70 yeniden degerlendirme haritasi baslat.
- D01: install.ps1 mcp=null silici islemi kaldiran regression testi + Node.mjs kurulum girisleri (scripts/install.mjs, verify-install.mjs, uninstall.mjs).
