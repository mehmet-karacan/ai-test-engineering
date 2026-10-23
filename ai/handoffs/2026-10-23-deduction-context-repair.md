# Deduction MCP context repair handoff

## 2026-10-23 DeductionService: otomatik %80 hedefi

- Gercek GPU root'tan, onceki veya elle yazilmis test aktarilmadan OpenCode + MCP kosusu tamamlandi. Job `5f6a657a-2187-42f3-81ea-8851b1178d65`: `TARGET_REACHED / AFFECTED_SCOPE`; model `litellm/GLM-5.3-Flash-IT`, reasoning low.
- Hedef LINE %80 ve BRANCH %80. Sonuc: LINE 263/272 = %96.69; BRANCH 85/104 = %81.73.
- update LINE47/47 BRANCH12/14; deleteLogical LINE17/17 BRANCH7/10. %80 kabulu sinif toplamidir; her metodun tum dallari kapsandi iddiasi yok.
- 12 yeni dosyada 35 model testi. Final: 670 test, 659 basarili, 11 atlanan, sifir failure/error. Mevcut 635 test eksiksiz korundu.
- 21 model oturumu; 21 gecerli cevap MCP artifact hash'leriyle eslesti. Kaynak/build kimligi ayni; raporda eksik dosya veya hash uyusmazligi yok.
- Dogrulama profili: 32 fiziksel cagri, aday basina 4 onarim, 6 ilerlemesiz deneme, 120 dakika. Normal kullanici ayari 20/2/3 olarak korundu. Onceki hedef alti kosular tarihsel kayitlarda tutuluyor; her varsayilan kosu icin %80 garantisi yok.
- MCP duzeltmeleri: onceki aday ve bagimlilik davranis baglami, son dogrulanmis method gap bilgisi, saglanmayan metrik onceligi, negatif Mockito oracle tanima ve bozuk model cevabindan sonra ayni onarim baglamini koruma.
- Urun kapilari: 8 dosya / 78 test, typecheck, build, lint (0 hata / 89 mevcut uyari), yerel release gate ve bagimsiz review gecti. Tam aktif Windows matrisi: 133 dosya / 1078 test dogrulandi, 1 browser dosyasi / 1 test atlandi. Ikinci tam komut exit 1 verdi: P01 eski build kimligini reddetti. Build yenilemesinden sonra P01 41/41 PASS; toplam matris bu odakli tekrar ile dogrulandi. Full391 GO yeniden kosulmadi.
- Asil GPU checkout'a test uygulanmadi; G2/G3 ayri karar, CI kapali. Kabul: `ai/acceptance/deduction-context-repair.json`; ayrinti: `ai/checkpoints/2026-10-23-deduction-context-repair.md`.

- Uygulama commitleri:0fdba8d,3c124e4,cd7ca69,efd0604,0e17b66. Onceki assisted99.63/95.19 ve otomatik basarisizliklar tarihsel korunur.
- Bilinen sinirlar:20call her kosuda80garantisi degil; model ciktisi semantik review gerektirir. Onceki runlarda literal-only ek assertion/LENIENT/sinirlioraclebulgulari kayitli. Terminalresume-output/native-no-scanpin sorunlari ayri.
- G2 orijinalcheckouta testuygulama/yayin ayri; CI kapali.
