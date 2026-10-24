# Gorev odakli yonlendirme kontrolu

- BASE b57e15c, mevcut izole d03b, branch codex/task-guidance-20261024.
- Kullanici sabit meslek/persona rollerinin yetenegi daraltmamasi icin mevcut
  talimatlari okuyup gerekirse duzeltmeyi istedi. Arac izinlerini acma talebi yok.
- Baseline:5dosya/26PASS. RED:3dosya/19FAIL/6PASS. Gercek sorunlar: analiz/
  reviewer/gap prompt'una changeset/path/@Test zorlama; genel agent adapter'de
  rol/kimlik var ama acik gorev/teslim/kabul brief'i yok; optional assignment
  bilinmeyen alan diye kayboluyordu. JSON ornekleri ilgili semayla tutarsizdi.
- Fix: backward-compatible optional assignment, 8KiB UTF-8 kaynak butcesi;
  task brief'in HTTP prompt'a aktarimi; asama ile uyumlu mevcut output semalari;
  persona/KOD YAZMA yerine hedef ve kanit. Production aday gorevi sinif,
  istenen LINE/BRANCH hedefleri, onarim ve Maven/JaCoCo kabulunu acikca tasir.
- Imza listesi tek API ilan edilmez; ODAK onceliktir, bagli metotlar kullanilir.
  Repair calisan testleri korur ama hatali fixture yeniden duzenlenebilir.
- Ruling: kalici rol etiketleri, farkli inceleme baglami, worker izinleri ve
  JSON/test-only/policy/butce korunur. Yeni rol/multi-agent mimarisi kurulmaz.
- Odakli9dosya/92PASS, typecheck PASS. Eski KOD YAZMA beklentili unit'ler
  yeni gorev amacina uyarlandi; as never ile gecersiz test_developer WorkerRole
  kullanan FIN05 fixture'i canonical test_designer oldu (AgentRole degismedi).
- Devam: kalici brief testi, bagimsiz review, tam Windows suite; ozel kaynak/
  provider/session/model metni public repoya alinmaz. Customer kosusu yok.

## Explicit teslim ve gercek model denemesi

- Explicit delivery_kind verilirse rol etiketi yalniz metadata olur. Ayni
  assignment+delivery ile 4 rol prompt'u etiket satiri disinda byte-esit; eski
  cagri role-default ile uyumlu. Ek test RED1FAIL/12PASS -> GREEN.
- Kalici assignment testi parse/JSON disinda gercek AgentTaskRepository ile
  geciyor; ayni idempotency anahtariyla gorev sessiz degistirilemiyor.
- Ilk gercek GLM-5.3-Flash-IT sentetik dort gorevinde review ve candidate
  semalari PASS; analysis/gap dogru davranisi anlatip string[] yerine object[]
  dondurdu ve semada reddedildi. Parser/semalar gevsetilmedi.
- Gercek Zod validator'lerinden JSON Schema prompt'a aktarildi. Yeni3 schema
  ve mevcut HTTP2 vakasi RED5FAIL/14PASS -> GREEN; son7dosya87PASS, build
  PASS, lint0error89eskiwarning. Ilk full run kaynak degisince erken durduruldu;
  PASS iddiasi yok, log TEMP/task-guidance-first-full-aborted.log sakli.
- Bagimsiz final review: engelleyici yok; reviewer2dosya19PASS/diffcheck PASS.
  Custom UTF-8 byte refinement JSON Schema'da temsil edilmez; runtime
  validator halen uygular. Gercek model rerun ve final full suite bekler.
- Mevcut ayni-key task recreation immutable job_revision/butce cakismasi
  tarihsel konu; bu talimat gorevinde mimari degisiklige cevrilmedi.

## Son dogrulama

- Gercek model son analysis/review/gap semalari PASS; ilk candidate prompt'u
  degismedigi byte/hash ile kontrol edilerek onceki PASS kaniti korundu.
  Toplam7gercekoturum,4teslimturu; parser/validator gevsetilmedi. Ham model
  metni/provider konfigurasyonu ozel alanda; public kayitta yalniz hash var.
- Son full139dosya/1211test PASS,1dosya/1test SKIP; exit0. Typecheck/build
  PASS; lint0error89mevcutwarning; review engelleyicisiz. Ilk full calismasi
  canli tip bulgusu sonrasi kaynak degismeden erken durdurulup logu saklandi.
- Devam: main commit/FF/build/yerel gate/kurulu MCP kontrolu; kurulu skill
  eski hash kontrolu ve yedekle guncellenir. Ana model izinleri ve kullanici
  opencode.json ayni kalir. Son remote HEAD eslesmesi teslimde dogrulanir.

## Kurulu main teslim kontrolu

- Uygulama commit72398a1 main dalina fast-forward edildi. Main build/yerel
  gate PASS;9dosya97test PASS. Kurulu stdio MCP9arac, explicit task/delivery
  ve typed schema dogrulandi. Eski rapor manifesti ve670testlik sonuc ayni.
- OpenCode skill eski hash/yedek kontrolunden sonra main byte-lariyla
  guncellendi; opencode.json ve ana model izinleri ayni. Opsiyonel primary
  agent kurulumu yapilmadi. Kanit digestleri acceptance JSON icindedir.
- Bu kayit commitinden sonra main build damgasi/stdio kontrolu yenilenir;
  push sonrasi remote HEAD eslesmesi teslim mesajinda dogrulanir.
