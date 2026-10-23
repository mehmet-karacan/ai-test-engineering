# OpenCode + MCP devam plani

Kullanici 2026-10-23 tarihinde frontend rollback ve gercek GPU dizininden genel coverage -> oneriler -> acik sinif secimi -> test uretimi istedi. Mevcut MCP/application motoru ve kurumsal rapor korunur. UI HTTP sunucusu, client ve yalniz bunlara ait test/komutlar kaldirilir; Git gecmisi silinmez.

- [ ] UI dosyalarini ve npm ui komutunu kaldir; ortak coverage-flow testini dogrudan MCP registry uzerinden calistir. Bagimsiz satir/dal hedeflerini koru.
- [ ] Kullanim ve aktif gorevi MCP akisina guncelle. Test secimi gerektigini arac aciklamasinda belirt.
- [ ] Typecheck/build, coverage-flow/goal/transport regresyonlarini calistir. Eski dist/ui dosyalarinin kullanilmasini engelle.
- [ ] GPU mevcut uc baseline failure'ini gercek dizinde kontrol et; production duzeltmesi icin acik cevap bekle. Test atlama veya basarisiz baseline'i basarili sayma yok.
- [ ] Gercek MCP stdio ile GPU root coverage analizi yap; sonucta WAITING_INPUT ve model0 dogrula. Onerileri kullaniciya sun; sinif secmeden generation baslatma.
- [ ] Secim geldiginde coverage_scan_id ile test_start ve mevcut OpenCode model profili kullan. Baslangic/son sayaçlar, test sayisi, patch-only sonuc ve raporu dogrula.
- [ ] Bagimsiz review, checkpoint/handoff ve Git kimligi/staged diff/gizlilik kontrolunden sonra commit/push.

Kisitlar: Windows native; CI kapali; Sky bekler. GPU checkout dirty dosyalari korunur, GPU Git commit/push yok. Generated testlerin asil checkout'a uygulanmasi bu is kapsaminda otomatik yapilmaz.
