# Yerel ekran uygulama plani

**Goal:** Onayli yerel proje/analiz/secim/hedef/calisma/rapor akisini calisir urune ekle.
**Architecture:** Node loopback HTTP ve ince application adapter; mevcut servisler/DB/rapor dogrulamasi korunur.
**Spec:** ai/tasks/2026-10-22-local-ui-design.md. Uygulama ayni oturumda executing-plans ile yapilir; final reviewer farkli agent olur.
**Tech stack:** Node24, TypeScript strict, Zod, SQLite, vanilla DOM; ek runtime dependency yok.

## Isler

- [x] 1. RED: ayri branch_percent eski percent uyumu/invalid inputs ve gercek test_start DB/immutable hedef testi. GREEN: tool-schemas ve services dort esik cagrisi; ilgili eski testler.
- [x] 2. RED: gercek HTTP request ile loopback/Host/Origin/cookie/CSRF, boyut/route/yayin/dosya guvenligi ve scan/start adapter kontrati. GREEN: backend/server/page/client/entry; npm ui. DB history ve kayitli snapshot series, explicit secim, eksik/hata durumlari.
- [x] 3. Gercek Chromium sentetik backend ile proje/analiz/oneriler/hedef/model/start/live/rapor/refresh/gecmis; mobile/keyboard/XSS/offlineasset. Backend'in gercek uygulama handler'lariyla entegrasyonu; fixture rapor bytes dogrulama. Screenshot private runtime altinda.
- [x] 4. Bagimsiz review bulgusuz; typecheck/build/local gate PASS, lint0error89warning. Sabit ef073ca kaynak131dosya1058/1058 PASS. Checkpoint/kabul/handoff kayitli; kimlik/ASCII/gizlilik/staged diff kontrol edildi. Ana dal build/MCP ve push teslim asamasidir; kullanici untracked dosyalari korunur.

## Review odagi

- Kaynak analizden sonra degisirse start servisi yeniden analiz ister; UI eski sinifi yeni projeye tasimaz.
- Worker/model ayari yoksa gorunur engel; otomatik customer/model kosusu yok.
- Kullanici pencereyi yenileyince history/job bulunur; cift tik/request ayni idempotency key ile tek is yaratir.
- Test ve proje coverage paydalari farkli: grafik/etiket bunlari karistirmaz, olculmemis deger sifir olmaz.
- Kotuye kullanilan Origin/Host/path/symlink/tampered report bytes kaynak disina veya yetkisiz calistirmaya gitmez.
