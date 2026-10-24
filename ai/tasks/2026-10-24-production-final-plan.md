# Production son denetim kapsam ve plan

- BASE f1c77c1fbbf5e720cc78920293be540845125564; branch codex/production-final-20261024, d03b izole worktree.
- Kullanici son bug/performans/rapor eksiklerini tamamlamamizi ve uretilen hazirlik sonucuna gore urunu kendisinin production'a verecegini belirtti. Bu tur hazirlik/dogrulama ve commit/push; otomatik deploy/tag veya customer checkout degisikligi yok.
- Yaklasim: mevcut Windows native/OpenCode/MCP mimarisini koru, somut bulgulari RED/GREEN testle duzelt. UI/Docker/macOS/CI, yeni platform veya rastgele refactor ekleme. %99.99 hatasizlik test sayisindan turetilemez; olcum/hatakodu/tamamlanma ayrimi korunur.
- Hedef: guncel kaynakta tam Windows suite (opsiyonel Report07 browser testi dahil), gercek sentetik Maven/model akisinin dogrulanmasi, kurulum/smoke, kesinti/kalici durum, rapor kanit ve hacim gecikme kontrolleri, bagimsiz review, acik engel/risklerin durust teslimi. Eski391 kabul otomatik tasinmaz; full gate kanitlari ayrica kontrol edilir.
- [x] Salt okunur uc bagimsiz audit; backlog/kabul/bilinen limitleri guncel kodla karsilastir.
- [x] Tarayici toolchainini kesfet; atlanan testi explicit paket yoluyla calistir, hatayi reproduce et.
- [x] Dogrulanan bulgular icin failing regression -> minimal fix -> GREEN; performansi gercek hacim fixture ve sure/bellek ile olc.
- [x] Guncel source/build kimligiyle tam test/typecheck/build/lint/Java/MCP/kurulum ve uygun gercek sentetik akisi calistir; publication gate durumunu dogru ayir.
- [x] Bagimsiz final review, kabul/checkpoint/devir/isletim dokumani, main commit/push/kurulu MCP dogrulamasi.

## Audit ortak brief

Bu belge kapsam ve brief'tir. Yalniz belirtilen alt alani salt okunur incele. Kod/dokuman degistirme, provider/customer session/secret okumasi veya customer/model/Maven kosusu yapma. Sentetik hedefli test calistirabilirsin. AGENTS.md ve ilgili mevcut testleri oku. Kritik/major bug ya da olculebilir performans problemi icin path:line, somut trigger, beklenen/gercek, repro/test ve onerilen dar fix ver. Varsayimlari bulgu diye sunma. Tamamlanan eski isleri kanitsiz tekrar acma. Nihai reviewer kendisinin kod yazdigi alani onaylamaz.
