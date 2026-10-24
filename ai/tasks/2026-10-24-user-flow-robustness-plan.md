# Kullanici akislarini saglamlastirma plani

> Agentic workers: inline execution via superpowers:executing-plans; final fresh reviewer via requesting-code-review.

Goal: farkli, eksik ve tutarsiz kullanici/model isteklerinin sessizce yanlis islem veya yaniltici sonuc uretmesini engellemek.
Architecture: mevcut MCP registry/use-case/storage akisini sentetik projelerle sinayip yalniz yeniden uretilen sorunlari duzeltmek. Yeni UI, penetrasyon taramasi veya customer/model kosusu yok.
Tech stack: TypeScript, Zod, SQLite, Vitest, Windows native.
Spec: kullanicinin 2026-10-24 tarihinde farkli sorular/problemli kullanimlari test etme ve duzeltme istegi; AKTIF_GOREV.md AITE-MCP-GPU-009.

## Constraints

- Ana checkout'taki onceki uncommitted dosyalar korunur; mevcut izole worktree'de yeni branch kullanilir.
- GPU/Sky, CI, Docker/macOS ve bekletilen session dosyasi bu calismaya dahil degildir.
- Canli model/Maven yerine disposable fixture ve gercek SQLite/use-case/registry kullanilir.
- Her urun duzeltmesi once RED, sonra GREEN kaniti tasir; son tam Windows suite dogru private AC67 girdisi ve guncel build ile kosulur.

## Review focus

- Bos/beyaz bosluklu root/hedef veya bos/tekrarli metrik: is baslamadan acik parametre hatasi.
- Farkli projeye ait job_id ve project_root: sessizce job_id kazanmaz; is durumu degismez.
- Bos/negatif/harfli/buyuk cursor: ilk sayfaya sessiz donus olmaz.
- Gercek coverage kaydi: sorguda gorunur ve sayfalama dogru calisir.
- Tekrar istek, belirsiz Maven root/sinif, tamamlanmis ise devam/iptal: yanlis yeni islem baslamaz.

## Tasks

- [x] 1. tests/integration/user-flow-robustness.test.ts: registry uzerinden gecersiz girdiler, ilk hatadan sonra normal istek ve yanlis proje kimligini RED ile goster. src/domain/tool-schemas.ts ve services/job-tools'ta dar duzeltme; ilgili mevcut testlerle GREEN.
- [x] 2. coverage_history ve project query filtrelerini gercek SQLite kayitlariyla RED olarak goster; src/application/inventory-query.ts ve gerekirse services.ts duzelt; LIMIT/OFFSET ve bos kayit davranisini dogrula.
- [x] 3. Mevcut proposal/idempotency/ambiguous-target/cancel/report testlerini calistir. Ek sorun varsa once yeniden uret, sonra dar duzelt; kapsamli yeniden tasarim gerektirenleri gerekcesiyle kaydet.
- [x] 4. typecheck/lint/build/local gate, tam aktif Windows suite, bagimsiz review, checkpoint ve devir kaydi.

Execution ruling: kullanici test etme ve duzeltmeyi bu oturumda acikca istedi; plan icin yeniden onay istenmeden inline devam edilir.
