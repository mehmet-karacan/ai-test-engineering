# Onayli uygulama raporu - izole gelistirme kaniti

BASE aced11e; branch codex/apply-report-20261024. Gorev4 siniri:
reporting, report-runtime, read-only apply-operation-view ve OpenCode docs.
Plan SHA256 08971BEB23BD3C2D2EE3B41059AA72638F3EF54A4967C8122A5517712B4E5FF4.
Migration/coordinator/status/result yazi akisinin sahibi ana koordinatordur.

## Degisiklik

- getApplyOperationView(db,jobId) en yeni created_at/operation_id kaydini okur.
  Eski tablonsuz DB null; bozuk yeni kayittan eski APPLIED'a geri dusulmez.
  Row/view/plan job-operation-checkpoint-digest-zaman kimligi, durum,
  sayac mutabakati ve planlanan yollar kontrol edilir. APPLIED icin PASS,
  exit0, failures/errors0, nonzero test/PASS, mevcut/tum testler korunma
  bayraklari ve tum plan dosyalari gerekir. Bilinmeyen alanlar tasinmaz.
- ReportData.application opsiyoneldir. HTML/JSON/summary uygulama state/phase,
  operation/checkpoint/digest, test total/PASS/failure/error/skip, korunma
  bayraklari, failure/rollback nedeni ve execution root'u ayrica gosterir.
  FULL_PROJECT_SNAPSHOT asil projenin hash-dogrulanmis owned kopyasidir.
  Generation outcome/coverage/verification_scope ve run_summary ayni kalir.
- Runtime sync application degisikligini job.apply_state ayni olsa da gorur.
  Getter job ile ayni DB transaction'inda okunur. Onceki PUBLISHED/manifest/
  hash dogrulamasi ve kanit yeniden kontrolu korunur; kirik kanit onarilmaz.
  Uygulama kaydi olmayan eski export'a application eklenmez; no-op idempotent.
- OpenCode skill/docs preview, plan kimligine pinlenmis apply, transport
  insan formu, ayni job/operation polling, gercek PASS sonrasi APPLIED ve
  rollback/recovery/cakisma davranisini anlatir. Approval text onay degildir.

## RED -> GREEN ve dogrulama

Ilk report-application kosusu: 5 testten 3 beklenen assertion FAIL; application
projeksiyonu/HTML yoktu. Uygulama sonrasi ayni testler PASS. Getter unknown
alan projeksiyonu testi once FAIL (private_debug tasindi), explicit alan
projeksiyonu sonrasi PASS.

Son odakli komut:
node node_modules/vitest/vitest.mjs run tests/unit/apply-operation-view.test.ts
tests/integration/report-application.test.ts
tests/integration/report-runtime-sync.test.ts tests/unit/report07.test.ts
tests/unit/report07-baseline.test.ts

Sonuc: 5 dosya / 61 test PASS, exit0. Yeni testler: getter21 + application5.
Beklenen negatif runtime-sync fixture'i stderr'e projeksiyon yenilenemedi
yazar; bu kontrollu disk hatasi testidir. Typecheck tsc --noEmit exit0.
Yedi degisen TS/test dosyasinda scoped eslint exit0, 0 hata/uyari.
git diff --check exit0. Kimlik local mehmet-karacan/karacan.mehmet@hotmail.com.
Yeni metinler Turkce ASCII; runtime/customer/secret dosyasi eklenmedi.

## Devam noktasi ve sinir

Ana koordinatore dar API: withJobRuntime(data,job,application?) ve
ReportExporter.synchronizeRuntime(job,application?). Undefined eski caller
kontratini korur; explicit null eski application snapshot'ini kaldirir.
Asil getter yolu src/storage/apply-operation-view.ts.

Bu dalda tam suite/build veya musteri/model/Maven/browser kosusu yoktur;
tam Windows suite ve gercek sentetik integration ana koordinatorde. Bagimsiz
nihai review henuz bu checkpoint'in kaniti degildir. OpenCode skill icin
review senaryolari: unsupported/decline/cancel, approval_reference-only,
APPLYING sirasinda basari iddiasi, failure/rollback/conflict ve yeni onayla retry.
CI/yayin/push yok. Kalan is entegrasyon, bagimsiz review ve tam kabul kapilari.

## Bagimsiz review sonrasi yazdirma/fixture duzeltmesi

Approval agent review'i application bolumunun ekran shell'iyle birlikte
print CSS tarafindan gizlendigini buldu. Iki ek assertion RED: print-view'de
APPLIED/tam proje sayaclari ve ROLLED_BACK/failure nedeni eksikti. Ayni escaped
application gercekleri unique print-application kimligiyle statik print-view
icine eklendi. beforeprint/afterprint'in degistirdigi print-records disinda
kalir; JavaScript kapaliyken de uygulama ozeti yazdirma alaninda bulunur.
Tarayicida PDF kosusu bu dalda yapilmadi; ana koordinatore birakildi.

Migration10 entegrasyonundaki NOT NULL/FK fixture uyumsuzlugu da giderildi:
gercek project_id, sentetik APPROVED TEST_APPLY kaydi ve
owner_id/fencing_token/approval_id/active kolonlari kullanilir. Izole dalda
migration henuz yoksa fallback tablo ayni NOT NULL/FK/CHECK kolonlarini kurar;
entegrasyonda mevcut migration tablosuna dokunmaz.

Sonuc tekrar 5 dosya/61 test PASS, exit0. Typecheck ve uc degisen TS/test
dosyasinda eslint exit0. Onceki generation/kanit ve legacy no-op kabulleri
korundu. Bu followup yalniz report/helper/fixture/checkpoint dosyalaridir.
