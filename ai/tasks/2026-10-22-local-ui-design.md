# Yerel kullanim ekrani tasarimi

Kullanici 2026-10-22 sohbetinde onerilen Proje sec -> Analiz et -> Sinif sec -> Hedef belirle -> Baslat -> Raporu ac akisini onayladi ve uygulanmasini istedi. Yeni arayuz alt sistemi; mevcut uygulama servisleri aynen kullanilir. Yerel bilgisayarda tek kullanici, hesap/sunucu/ekip yonetimi yok. OpenCode MCP kullanimi surer.

## Kullanim

- npm run ui ile127.0.0.1 uzerinde acilir. Proje yolu yazilir veya kayitli projeden secilir; tarayiciya tam dosya sistemi gezdirilmez.
- Genel analiz mevcut project_coverage servisidir. Gercek Maven/JaCoCo sonucundan genel satir/dal sayaclari ve uygun sinif onerileri gosterilir. Kullanici secmeden test uretimi baslamaz. Analiz hatasi ve skipTests gibi engeller gorunur, bos sonuc basari sayilmaz.
- Satir ve dal hedefi0..100, iki ondalik; varsayilan80/70. Dal secimi kapatilabilir. Kullanici ortak coverage.percent kullanan eski MCP istemcileri ayni davranisi korur; optional branch_percent ayri hedef saglar.
- Model alani mevcut OpenCode model kimligini kullanir veya istege bagli provider/model girdisi kabul eder; secret UI'a tasinmaz. Worker kapaliysa baslatma kapisi acik hata verir, sessiz modelsiz uretim yok.
- Calisma alani gercek lifecycle/phase/outcome, son dogrulanmis olcumler, test sayaclari, olaylar ve gecmisi gosterir. Egri sadece kayitli coverage snapshot'larindan gelir; global proje kapsami ile secilen hedefin kapsami ayri etiketlenir. Sayfa yenilenince is kaybolmaz, son isler DB'den bulunur. Kesilmis/paused islerin otomatik resume'u yok.
- Sonuc dogrulanmis yayin raporuna ve kayitli degisiklik dosyasina baglanir. Ozgun checkout'a test uygulama bu surumde yok; TEST_ONLY motoru ve patch raporu kullanilir.

## Teknik kararlar

Node http + mevcut TypeScript, yeni UI kutuphanesi/derleme araci yok. src/ui/server.ts loopback HTTP, src/ui/backend.ts mevcut servis adapter'i, src/ui/page.ts CSS/HTML ve src/ui/client.ts DOM davranisi. Statik JS/CSS kendi endpoint'lerinde; CSP, no CORS, exact Host/Origin, HttpOnly SameSite cookie ve CSRF token. Request body64KiB, sayfali son isler/olaylar, serbest tool proxy veya serbest dosya yolu endpoint'i yok. Rapor yalniz job'a ait dogrulanmis manifest listesi ve realpath containment ile sunulur; kanit HTML'i sandbox uygulanarak acilir, script dosyalari indirilir.

## Kabul U01..U08

U01 baslatma ve proje secimi; U02 mevcut genel analiz/oneriler ve hata/bos durum; U03 acik sinif secimi ve ayri hedeflerin DB/immutable contract'a aynen yazilmasi; U04 gercek durum/olay/olcum/test sayaclari ve kalici gecmis; U05 dogrulanmis rapor/degisiklik ve portable evidence linkleri; U06 loopback/origin/CSRF/path/hash/XSS guvenligi; U07 masaustu/mobil/klavye/refresh/uzun ad/bounded listeler; U08 gercek test/build/lint/MCP uyum ve bagimsiz review kaniti.

Yeni canli Sky/model piloti yok; sentetik fixture ve mevcut kanitlar kullanilir. CI, Docker, macOS ve hesap/ekip yonetimi kapsam disinda. Gecmis kabuller yeni goreve otomatik aktarilmaz.
