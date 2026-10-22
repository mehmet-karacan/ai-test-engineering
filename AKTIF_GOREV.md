# AKTIF_GOREV: Yerel Test Muhendisligi Ekrani

Gorev AITE-LOCAL-UI-008. Kullanici 2026-10-22 sohbetinde once onerilen yerel web ekranini onayladi, sonra yapilmasini istedi. Tasarim ai/tasks/2026-10-22-local-ui-design.md, uygulama plani ai/tasks/2026-10-22-local-ui-plan.md. Akis: proje sec -> genel JaCoCo analizi -> kullanici sinif secimi -> satir/dal hedefi -> test uret -> gercek durum/egri -> rapor ve degisiklikler.

Kabuller U01..U08 tasarim belgesindedir. Mevcut MCP/application/runtime ve Windows native korumalari korunur. Yeni customer/model piloti, ozgun checkout'a test uygulama, Docker/macOS/CI, hesap/ekip yonetimi kapsam disidir. Yeni kullanici istegi onceki007'deki yeni web uygulamasi kapsam disi maddesini bu gorev icin degistirir; eski007 byte-korunmus arsiv ai/tasks/archive/AITE-REPORT07-PRODUCTION-007-20261022.md SHA5bae0f670e721095741af261017e366d7ee63c596109476a76b8e58249709249. Eski kabul kanitlari tarihsel kalir.

Baslangic/kayit/Git/gizlilik kurallari AGENTS.md'den devam eder. Kod gelistiren nihai reviewer olamaz; izole worktree ve bagimsiz review gerekir. Sonuc kanitlari ai/checkpoints, ai/acceptance, ai/handoffs altina kaydedilir. Commit/push mevcut kullanici yetkisiyle yapilir; Turkce ASCII mesajlar, yerel Git kimligi, staged diff ve gizlilik kontrolu zorunludur.

2026-10-22 kullanici duzeltmesi: kurumsal tasarim ve logo icin verilen innova_kurumsal_kimlik.zip tek resmi kaynaktir. Logo fontla/AI ile uretilmez; resmi SVG byte-korunarak yerel UI ve yeni Report07'de kullanilir. Rehber font/renk/oran/guvenlik alani kurallari docs/branding/README.md'de kayitlidir. Onceki immutable tasarim referanslari korunur; mevcut exportlar otomatik yeniden yazilmaz.

2026-10-22 onayli Sky hazirlik devam isi: proje bazli JDK21, owned kopyada acikca kayitli unit-test skip override, gercek baseline/JaCoCo ve Maven hata ozeti. Sky Maven kosusu bu dar kapsamda yetkilidir; yeni model uretimi ve ozgun checkout yazimi kapsam disidir. Plan ai/tasks/2026-10-22-sky-readiness-plan.md.
