# AKTIF_GOREV - AI Test Engineering: Gercek Runtime ve Uctan Uca Kabul

## 0. Gorev kimligi ve uygulama emri

- Gorev: `AITE-RUNTIME-ACCEPTANCE-003`
- Surum: `1.0`
- Inceleme tarihi: `2026-10-10`
- Repository: `https://github.com/mehmet-karacan/ai-test-engineering`
- Incelenen dal: `main`
- Sabit inceleme HEAD'i: `7620f206d1bab3e2014518593dcb322277a9ddbf`
- Onceki gorev: `AITE-REMEDIATION-002` v1.1; ondan once `AITE-FOUNDATION-001`.
- Git kimligi: `mehmet-karacan <karacan.mehmet@hotmail.com>`; yalniz repository-yerel ayar.
- Yeni commit mesajlari ve repository'ye yazilan Turkce aciklamalar Turkce ASCII olacak. Kullanici kaynaklarindaki Unicode metinler donusturulmeyecek.
- Tek aktif gorev dosyasi: repository kokundeki `AKTIF_GOREV.md`.

**Bu dosyayi yalniz ozetleme. Mevcut urunu koruyarak asagidaki eksikleri uygula, gercek normal giris yolundan dogrula ve kanitlarini kaydet. Bu yeni bir urun, yeniden yazim, UI, CLI veya Zekam gorevi degildir.**

Bu gorevin amaci, daha once onaylanan kullanici deneyimini gerceklestirmektir:

> Kullanici Java projesinde OpenCode'u acar, "PaymentService icin coverage %90 olsun" der. MCP mevcut testleri koruyarak test uretir, izole Maven/JaCoCo ile olcer, LINE ve uygulanabilir BRANCH hedefini dogrular, gercek rapor ve test degisikliklerini verir. Kesilince ayni job ve kabul edilmis test setiyle devam eder. Customer production/POM degismez.

**Onemli ayrim:** Musteri Java projesinin production dosyalarina dokunulmaz. Bu MCP urununun kendi `src/`, `scripts/`, testleri ve build dosyalari ise bu gorevde degistirilebilir. Urunun gelistirilmesini test-only kuralini yanlis yere uygulayarak durdurma.

### 0.1 Baslangic ve arsivleme

1. Gercek branch/HEAD/status/remote'u, `AGENTS.md`, mevcut aktif gorevi, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, kabul matrisi ve son handoff'u oku. Inceleme commit'inden sonra degisiklik varsa ilgili farklari once degerlendir. Yeni ve dogru duzeltmeyi eski hale getirme.
2. Onceki `AITE-REMEDIATION-002` metnini inceleme commit'inin `AKTIF_GOREV.md` Git nesnesinden `ai/tasks/archive/AITE-REMEDIATION-002.md` olarak arsivle. Yeni dosyayi eski gorev diye arsivleme. Arsiv mevcutsa hash/icerik kontrolu yap, ezme. Foundation arsivi korunur.
3. Foundation R01-R20/AC01-AC70 ve remediation RG01-RG52 sozlesmelerini koru. Kriterleri daraltmak, hedefleri dusurmek veya zor kriterleri bilesen testiyle degistirmek bu gorevi tamamlamaz.
4. `AGENTS.md` icindeki eski bolum numaralarini duzelt: mevcut dosyadaki olmayan "bolum 20/22" yonlendirmeleri yerine aktif gorev, arsivdeki urun sozlesmesi ve guncel durum dosyasini gostersin. Baslangic protokolu kisa kalsin.
5. Onceki "70/70, 52/52, tum bulgular kapandi" kayitlarini silme. Tarihsel uygulayici beyanlari olarak koru; hangi kabullerin asagidaki kanitlarla yeniden acildigini yeni review dosyasinda belirt. Yeni durum: `RUNTIME_ACCEPTANCE_IN_PROGRESS`.
6. Kullanici dosyalari, dirty/untracked degisiklikler ve farkli projeler korunur. Otomatik stash/reset/clean, force push, genis klasor temizligi veya baska projeye gecis yok.
7. Windows'ta standart yol CMD + Node.js'dir. PS1/PowerShell zorunlu degildir. Git Bash yalniz kurulu ve izinliyse kullanilir; Git.exe surum kontrol aracidir. Kurumun imza/execution policy/uygulama kontrolunu degistirme veya dolanma; Bypass/EncodedCommand/Invoke-Expression ile engellenmis script calistirmaya calisma.
8. CI kullanici karariyla kapalidir. Kendiliginden acma. Yerel tekrarlanabilir kabul ve explicit calistirma scriptleri olusturmak CI'yi yeniden acmak degildir.

### 0.2 Incelemenin kanit duzeyi

Bu gorev, sabit HEAD'deki kaynak kodun GitHub connector ile okunmasi, kullanicinin `session-ses_ede2(1).md` kaydi ve resmi OpenCode/Node/MCP belgeleri ile karsilastirma sonucunda hazirlandi.

- Oturum kaydi 24 dosyada 200 testin gectigini gosteriyor. Bu test kosusunun varligi reddedilmiyor. Ancak o testlerin assertion'lari tum urun sozlesmesini kanitlamiyor.
- Inceleme ortaminda repository'nin 200 testi, gercek Windows/CMD kurulumu, Docker/Maven veya kurum ici modelle pilot yeniden calistirilmadi. Kullanilabilen yerel Node surumu `v22.16.0`; urun hedefi Node 24 ailesi. Container'dan Git clone DNS nedeniyle basarisizdi; GitHub connector kaynak okumasi calisti.
- Sekiz dar kapsamli ifade/ESM mikro deneyi yapildi. Bunlar urunun entegrasyon testleri degildir. Sonuclari bolum 3'tedir; uygulayici ayni kusurlari gercek repository testleriyle yeniden uretmelidir.
- Gercek kurum endpoint'ine erisilmedi; kullanici config'i degistirilmedi; bu incelemede Git'e commit/push yapilmadi.

---

## 1. Ne korunacak, ne tamamlanmis sayilmayacak?

Gercek ilerleme var. Su duzeltmeleri koru:

- MCP registry sekiz araci kaydediyor: inspect/query/start/status/resume/cancel/result/apply.
- OpenCode client `204 No Content` cevabini JSON'a zorlamiyor; mesajlarda `info/parts` okunmasi eklenmis.
- Node `.mjs` kurulum girisleri ve ayri config merge bileseni eklenmis.
- CandidateLoop icinde LINE+BRANCH hedef kontrolu eklenmis.
- Lease release'in satiri silmek yerine expire etmesi eklenmis.
- Test apply bileseninde expected-before alanlari ve repository disi journal yolu eklenmis.

Ancak bilesendeki duzeltme normal runtime'a bagli degilse kapanis degildir. Ornegin loop'un iki metrigi kontrol etmesi, dispatcher'in sonradan yalniz LINE ile sonucu tekrar yazmasini duzeltmez. Sekiz tool adi bulunmasi, resume/cancel'in gercekten calismasi degildir.

---

## 2. Sabit HEAD'de yeniden acilan / yeni bulunan kusurlar

Asagidaki konular mevcut kod uzerinden tespit edilmistir. Dosya/fonksiyon isimlerini uygulama HEAD'inde tekrar dogrula. Linkler bolum 10'dadir.

### B01 - P0: Normal test_start guvensiz host yolunu secip AI worker'i kapali baslatiyor

**Kaynak:** `src/application/services.ts:handleTestStart`, `src/orchestration/job-dispatcher.ts:dispatch`, `src/orchestration/candidate-loop.ts:constructor`, `src/runners/failclosed-runner.ts`.

- `AITEST_RUNNER` verilmezse `host_dev_only` seciliyor.
- `AITEST_WORKER_ENABLED === "1"` olmadikca worker kapali.
- Dispatcher baseline'da host Maven kullanabiliyor; candidate loop yine `new CandidateLoop()` ile varsayilan host MavenRunner'a gidiyor.
- Eklenen `FailClosedRunner` bu zincirde kullanilmiyor. Ustelik verified durumda dahi somut run'a gitmeyip `INTERNAL_ERROR` firlatiyor. Koruma ismi veya class'in bulunmasi calisan izolasyon degildir.
- `AITEST_RUNNER` type cast'i runtime deger dogrulamasi degildir; bilinmeyen deger de guvenli kontrol yolunu atlayabilir.

**Etkisi:** Normal kullanici komutu, AI ile test uretmeden host kodu calistirabilir. Docker secmek de adaylarin hosta donmesini engellemiyor.

**Kapanis:** Baseline, kesif icin gereken build komutlari, candidate, repair, final replay ve regresyon ayni guvenli runner contract'indan gecsin. Customer job'da host yolu urun girisinden secilemesin. Guvenilir sentetik urun testleri icin test-runner injection ayri test composition'inda olabilir; public env bayragi bunu customer job'a acamaz.

### B02 - P0: Worker eksikligi plateau diye sunuluyor; gercek analiz/onarim baglami eksik

**Kaynak:** `job-dispatcher.ts:buildGoalContract/generateCandidateFromWorker`, `workers/opencode/role-prompts.ts`, `worker-client.ts`.

- Sabit `http://127.0.0.1:14096` varsayiliyor; hazir olmasi yonetilmiyor. Saglik kontrolu basarisizsa `null` aday donup plateau'ya gidiliyor.
- Istekte model profile/butce bilgisi olsa bile goal'de model `null`, butce sabit 20/2/3; goal.project_root yanlislikla storage.root.
- Prompt'a hedef sinif govdesi yerine ilk bes kaynak dosyadan imzalar aktariliyor. Mevcut test ozeti bos; mevcut testler varken "Mevcut test yok" denebiliyor. Coverage aciklari genel metin; gercek satir/branch ve onceki hata/denemeler aktarilmiyor.
- Her denemede yeni session var; typed candidate semasi prompt'a bagli degil. Analyzer/plan/reviewer/gap rolleri normal akis tarafindan kullanilmiyor.
- Worker cagrisi politika tool flags'ini gecmiyor. Dosya okuma/yazma, diger MCP ve global plugin mirasinin kisitlandigi bu cagrida kanitli degil.
- Yalniz 204/info duzeltmesi; terminal mesaj korelasyonu, hata sinifi, HTTP timeout ve gercek abort garanti etmiyor.

**Etkisi:** Calismayan model ile zor test edilebilir sinif birbirine karisiyor; model gercek kod ve test geri bildirimini alamiyor; yetki siniri sahipsiz kalabiliyor.

**Kapanis:** Kontrollu OpenCode worker yasam dongusu + dogru version/API + yeterli kod/test/coverage baglami + typed artifact + gercek bounded repair. Model/baglanti/auth/config yoksa acik `BLOCKED_MODEL` veya mevcut uygun hata sinifi; plateau degil. Sabit model/port yok, dis saglayiciya fallback yok.

### B03 - P0: Final dispatcher karari BRANCH'i yeniden yok sayiyor

**Kaynak:** `job-dispatcher.ts:verification`, `candidate-loop.ts:evaluateGoalMet/meaningfulGain/readCoverageAfterRun`.

- Loop'taki iki metrik kontrolune ragmen dispatcher `allMet` kararinda yalniz LINE bps kullaniyor.
- Loop outcome'u sadece `phases` metnine yaziliyor; finalde yeniden LINE veya plateau karari veriliyor. Budget, kalite reddi, gecersiz kanit gibi durumlar kaybolabiliyor.
- LINE ayni kalip BRANCH artsa bile `meaningfulGain` yalniz LINE oldugu icin aday reddediliyor.
- Branch toplam 0 ile branch verisinin eksik olmasi ayni `null` yolunda karisiyor.
- Coverage okuyucu yalniz kok `target/site/jacoco/jacoco.xml` kullaniyor; modul/aggregate ve run provenance ayrimi yok. Reddedilmis son aday veya eski XML final sonuca tasinabilir.

**Kapanis:** Tek per-target/per-metric sonuc evaluator'u authoritative olsun. Tum kabul/final/rapor/DB/status ayni trusted run sonucunu kullansin. Basarisiz aday raporundan veya yuvarlanmis yuzdeden hedef karari verme.

### B04 - P0: Accepted set ve checkpoint callback'leri runtime'a baglanmamis

**Kaynak:** `job-dispatcher.ts:iterateOptions`, `candidate-loop.ts:accepted_snapshot_dir/on_accepted/applyOverlay/revertOverlay`.

- Loop'a opsiyonel accepted set ve callback alanlari eklenmis; dispatcher bunlari gecmiyor.
- Dispatcher'da `LeaseManager` ve `CheckpointStore` olusturulmasi publish/acquire/renew yapildigi anlamina gelmiyor.
- Adaylar `projectRoot` uzerine gecici overlay oluyor, finally ile geri aliniyor. Ana akis immutable source snapshot + accepted tests + ayri candidate workspace kullanmiyor.
- Accepted dosyalarin kopyalanmasi da tek basina sonraki denemenin o set uzerinden calistigini kanitlamaz. Sonraki iterasyonun gercek class/test seti ve final replay eksik.
- `max_repairs_per_candidate` ve deneme hafizasi gercek repair/continue dongusune bagli degil.

**Kapanis:** Kabul edilen her test seti immutable/cumulative olarak dis store'da saklanacak; her sonraki aday o setten tureyecek; rejected aday onu kirletmeyecek. Callback opsiyonuna guvenmeyen runtime checkpoint transaction'i zorunlu olacak. Son test seti temiz workspace'te yeniden kosulmadan sonuc yayinlanmayacak.

### B05 - P0: Resume/cancel state degistiriyor; isi devralmiyor veya durdurmuyor

**Kaynak:** `src/application/job-tools.ts:handleTestResume/handleTestCancel`, `job-dispatcher.ts`, `lease-manager.ts`.

- Resume lease aliyor, `RUNNING` yaziyor ve donuyor. Source/checkpoint dogrulamasi, accepted set restore ve dispatcher'a yeniden devam yok.
- Cancel/pause DB durumunu degistiriyor; calisan model, Maven/JVM ve Docker isine gercek iptal sinyali bagli degil.
- Dispatcher'in kendisinde aktif is sahipligi, renew ve fenced write yok. Uzun is boyunca lifecycle'in gercek ilerleme semantigi tutarli degil.
- Lease acquire baska owner'in henuz suresi dolmamis lease'ini hala overwrite edebiliyor. Release sonrasi ayni owner yeniden acquire ederse eski token korunabiliyor. Owner yalniz PID olmamali.

**Kapanis:** Kalici job contract'i, tek owner/generation, worker/process supervisor, explicit cancellation ve yeniden calistirma algoritmasi. Kaldigi yerden devam, sadece `resumed: true` cevabi veya yeni bir pilot job yaratmak degildir.

### B06 - P0/P1: Raporlarda sabit degerler var; sonuc araci artifact'i veremiyor

**Kaynak:** `job-dispatcher.ts:reportData`, `application/services.ts:handleTestStatus`, `application/job-tools.ts:handleTestResult`, `reporting/report-generator.ts`.

- Raporda `iterations: []`, `tests_added: 0`, `tests_modified: 0`, sifir test sayilari, bos model/gap listeleri ve sabit `production_changed_files: 0` kullaniliyor.
- `test_only_policy: PASSED` gercek manifest karsilastirmasindan hesaplanmiyor.
- `test_status.last_trusted_coverage` sabit null. `test_result` rapor yolunu null, artifact listesini bos donuyor.
- HTML uretim cagrisi eklenmis ancak DB/checkpoint'ten authoritative rapor projeksiyonu degil. Rapor hata verirse terminal state ile sonucun tutarliligi bozulabilir.
- Exporter hala `Record<string,string>` aliyor; nested/binary JaCoCo paketlemesi tamamlanmamis. Path traversal/reserved name korumasi yok; `hash_mismatch` hesaplanip `verification_passed` kararinda kullanilmiyor.

**Kapanis:** Hicbir gercek veri sabit sifir/PASSED ile doldurulmayacak. Olculmeyen alan `null/NOT_RUN/UNAVAILABLE` ve nedenli olacak. DB, status, result, JSON, HTML ve ham artifact ayni trusted run/checkpoint'ten gelecek; export tum hash/path/binary kontrolleriyle dogrulanacak.

### B07 - P1: PS1'siz installer temiz clone'da kendi dist dosyasina erken bagimli

**Kaynak:** `scripts/install.mjs`, `.gitignore`, `src/configuration/config-merge.ts`, `src/mcp/stdio-entry.ts`.

- `install.mjs` en ustte `../dist/configuration/config-merge.js` statik import ediyor; dist'i uretecek npm/build cagrisi daha sonra `mainInstall` icinde. Dist olmayan temiz clone'da ana fonksiyona ulasilmadan module-not-found olusur.
- `new URL(import.meta.url).pathname` fiziksel path yerine kullaniliyor; bosluk ve Unicode URL encoding'i yanlis dizine goturebilir.
- Stdio varsayilan DB yolu hala ters slash birlestirmesiyle kuruluyor. POSIX path duzeltmesi tum runtime'a yayilmamis.
- Yeni merge bileseni eski MCP'leri semantik olarak koruma yonunde ilerleme; fakat butun dosyayi JSON olarak yeniden yaziyor, yorumlari siliyor, gercek expected-before CAS yok. JSONC destegi/idempotency/atomiklik iddialari guclendirilmelidir.

**Kapanis:** Fresh clone + dist/node_modules yok + PS kullanilamiyor senaryosunda kurulum. Bootstrap build'den once build ciktisina baglanmasin. Paylasilan merge mantigi farkli/test edilmeyen kopyalara bolunmesin. Runtime/config/OpenCode yollarini explicit ve guvenli cozumle; testte gercek HOME/config'e yazma.

### B08 - P0: Tam pilot ve resume kaniti olarak sunulan test kapsam disi hafifletilmis

**Kaynak:** `tests/security/pilot-full.test.ts`, `ai/ACCEPTANCE_MATRIX.md`, kullanici oturum kaydi.

- "Tam pilot" testi `AITEST_RUNNER: host_dev_only` ve `AITEST_WORKER_ENABLED: 0` ile calisiyor.
- Basit add fixture'inda AI yeni test uretmek zorunda degil. Terminal lifecycle tek basina test uretimi ve coverage kazanimi degil.
- RG42, yeni bir `runPilot` ile yeni gecici DB/proje/is aciyor. Onceki job'u kesip yeni session'da `test_resume` cagirmiyor. Rapor dosyasi/ham coverage/kabul edilen test seti assertion'i yok.
- Son assertion COMPLETED/FAILED/CANCELLED/INTERRUPTED degerlerini kabul ediyor. Basarisiz terminal sonucunun dogru raporlanmasi ayri negatif test olabilir; pozitif pilot veya recovery kabulunun yerine gecmez.
- Outcome regex'i gecerli escaped JSON'u okuyamiyor. Kayitta bu assertion kaldirilarak test gecmis; sorun zamanlama diye dusunulmus. Dar mikro deney ayni yanitta regex'in null, JSON.parse'in dogru outcome verdigini gosterdi.
- AC/RG matrisi araliklari toplu PASSED yapiyor; her kriterin gercek assertion/run eslesmesi yok. RG01-RG04 ayri kanit satiri bile yokken ozet 52/52.

**Kapanis:** Eski testi yararli bir worker-disabled smoke testi olarak dogru adlandir ve siniflandir. Onu gercek pilot diye sayma. Orijinal RG41/RG42 senaryolarini degistirmeden normal entrypoint, gercek model, izole runner ve ayni job ile uygula. Assertion'lari sonucu kolay gecirmek icin gevsetme.

### B09 - P1: Cok modullu/effective Maven ve platform destegi tamamlanmis degil

**Kaynak:** `discovery/pom-discovery.ts`, `job-dispatcher.ts`, `candidate-loop.ts`, `mcp/stdio-entry.ts`.

- Statik POM okumasi effective profile/parent/pluginManagement/test dependency zincirini tam cozmuyor.
- Target kind package/module olabilmesine ragmen runtime sinif aramasina gidiyor; genisletilmis somut class listesi yok.
- Worker kaynak secimi ve candidate allowlist hala sabit src/main/java/src/test/java; custom test root akisi uctan uca kanitli degil.
- Coverage path kokte; child module raporu secimi yok.
- Candidate overlay/accepted path'lerinde slash'i Windows ters slash'ine cevirme devam ediyor; Linux'ta farkli fiziksel dosya adi uretebilir.

**Kapanis:** Maven effective model + AST/helper + module/FQCN/binary class identity + gercek report yolu tek kaynak olacak. Statik hizli kesif yaklasimi kesin sonuc diye sunulmayacak. Desteklenmeyen/eksik toolchain acik tani; hosta kacis veya customer POM degisikligi yok.

### B10 - P1: Kalite kurallari bilesende var ama gercek test semantigi korunmuyor

**Kaynak:** `policies/quality-gate.ts`, `candidate-loop.ts`, `role-prompts.ts`.

- Tautoloji icin bazi regex'ler eklenmis, fakat kalite hala metin/regex agirlikli.
- `isSutShadowing` helper'i candidate kabul zincirinde cagrilmiyor. Kendi helper'inda normal bir kaynak yorumunun package satirinin onune gelmesi ayni FQCN tespitini bozuyor.
- Mevcut testlerin silinmesi/gevsetilmesi, AST test kimlikleri, semantik duplicate, anlamli assertion helper, JUnit4 expected exception ve parameterized/dynamic testlerin runtime kesfi guvenilir sekilde bagli degil.

**Kapanis:** Mevcut JavaParser/helper ve gercek test run kimlikleriyle once/sonra karsilastirma. Regex hizli sinyal olabilir, otorite degil. Assertion helper'i var diye dogru testi reddetme; assertion kelimesi yorumda var diye testi kabul etme. Test dosyasi altina production sinifi koymak veya SUT'u tamamen mock'lamak coverage kazanimi sayilmaz.

### B11 - P0/P1: Guvenli apply ve export tamamlanmis kabul edilmis ama sinirlar acik

**Kaynak:** `application/job-tools.ts:handleTestApply`, `reporting/test-apply.ts`, `report-generator.ts`.

- Normal tool her defasinda default kapali config olusturuyor ve `PATCH_ONLY` donuyor; gercek patch artifact'i ise result'tan sunulmuyor.
- Default patch-only guvenli bir tercihtir; zorla auto-apply acilmayacak. Ama patch-only sonuc gercek indirilebilir/incelenebilir ve yeniden uygulanabilir test degisikligi icermelidir.
- Ayri apply servisinde onay referansi yalniz minimum metin uzunluguyla denetleniyor. Trusted adapter, job/checkpoint/root/patch baglama ve tek kullanimli onay yok.
- Shared temp backup/journal ve path'in kisaltilmis kodlamasi farkli job'larda cakisma/backup ezilmesi riski tasiyor. Multi-file crash recovery ve ayni modify talebinin gercek idempotency'si kanitli degil.

**Kapanis:** Onay dogrulanamiyorsa calisan patch-only teslimati. Apply aciksa trusted approval + expected-before/after + owned durable journal + rollback/resume + test-only guard. Salt sekiz karakterlik model metni onay sayilmaz.

### B12 - P1: V2 profil testi yeni protokolu degil eski handshake'i test ediyor

**Kaynak:** `tests/contract/v2-wire.test.ts`, `mcp/stdio-entry.ts`, `mcp/server-setup.ts`; resmi MCP 2026-07-28 changelog [E03].

Her iki test `initialize` ve `2025-11-25` gonderiyor; AITEST_PROFILE secimi ayni eski SDK server'inin aciklama/log etiketini degistiriyor. Protocol response degeri assertion ile dogrulanmiyor. Bu, uygulama profili smoke'u olabilir; 2026 protokol destegi degildir.

Resmi 2026-07-28 degisiklikleri initialize/initialized handshake'ini kaldirir; `server/discover` ve istek metadata'si kullanir. Bu nedenle test edilen sey ile dokumandaki iddia birbirinden ayrilmalidir.

**Kapanis:** Eski OpenCode uyumluluk adapter'ini koru. Onceki sozlesmedeki yeni profil resmi SDK/gercek protokol kurallariyla ayri adapter olarak uygulanip wire testinden gecsin. Uygulama profile adi, SDK major surumu ve MCP protocol tarihi ayni kavram degildir. Destek kanitsizsa unsupported/NOT_RUN olarak acik kalsin; legacy akisi V2 diye yeniden adlandirma. Bu maddeyi bahane edip ana test motorunu yeni bir framework'e tasima.

---

## 3. Dar mikro tekrar uretimler: sonuc ve dogru yorum

Incelemede calistirilan asagidaki deneyler yalniz kopyalanan kontrol ifadelerinin semantigini dogrular; gercek urun build/test/pilot sonucu degildir.

| Deney | Girdi | Gozlenen sonuc |
| --- | --- | --- |
| M01 | Runner/worker env degerleri yok | default runner host_dev_only; worker false |
| M02 | LINE 95, BRANCH 40, ikisi icin hedef 90 | loop-style iki metrik karari false; dispatcher final TARGET_REACHED |
| M03 | LINE 95 -> 95, BRANCH 40 -> 95 | meaningfulGain false; branch-only kazanim red yoluna gidiyor |
| M04 | missing=[], hash_mismatch=[report.json] | exporter verification_passed true |
| M05 | file:///C:/test%20project/scripts/install.mjs | pathname fiziksel path'te %20 birakiyor; fileURLToPath dogru bosluklu path'i veriyor |
| M06 | Ayni FQCN, package onunde normal kaynak yorumu | shadow helper yorumsuz true, yorumlu false |
| M07 | Gecerli escaped MCP JSON cevabi, outcome TARGET_NOT_MET_PLATEAU | mevcut outcome regex null; JSON.parse dogru sonucu okuyor |
| M08 | dist yokken installer'in statik import'u | ERR_MODULE_NOT_FOUND; main fonksiyonuna ulasilmiyor |

Uygulayici bunlari gercek kaynak fonksiyonlarini import eden regresyon testlerine donusturecek. Mikro deneydeki kontrol ifadesini yeniden yazip onu test etmek urun duzeltmesinin kaniti OLMAZ.

---

## 4. Uygulama sirasinin baglayici plani

### K00 - Kaniti yeniden kur; daha fazla status makyaji yapma

- B01-B12 icin dosya/fonksiyon/call-chain ve ilgili eski AC/RG kimligini kaydet.
- Her yeni regresyonu once mevcut kaynakta calistir; gercek hata nedeniyle kirmizi oldugunu kaydet. Ortam eksikligi yuzunden run edilemiyorsa `BLOCKED`; mevcut kodun basarisizligi diye karistirma.
- `tests/security/pilot-full.test.ts` gibi yararli smoke testlerini koru; ama pilot/recovery etiketi ve AC/RG eslesmesi duzeltilsin. Orijinal pilot kabulu silinmesin.
- Kabul matrisi her AC ve RG icin ayri satir icersin. Tablo araliklarina PASSED yazip sayilari doldurma. Eski basarilarin hepsini rastgele FAILED yapma; kanit yoksa NOT_RUN, davranis yanlissa FAILED.
- Kurumsal model/sandbox hazirligini secret degerlerini yazmadan kontrol et. Bu preflight gercek test uretimi diye sayilmaz.

### K01 - Once guvenli normal calistirma yolu

- `test_start` normal kompozisyonunun tek runner factory/port'u olsun; default verified izolasyon profili. WorkerEnabled=false ile sessiz basari veya plateau yolu kaldirilsin.
- Customer job'da host calistirmaya izin veren env/config parametresi dagitilan entrypoint'ten kullanilmasin. Unit testlerde fake runner ve urunun guvenilir fixture'larinda kontrollu host runner gerekiyorsa test-only composition ile ayrilsin.
- Invalid/eksik runner capability fail-closed olur; uretim kodunu calistirmadan typed hata ve rapor verir. Model yoksa analiz/generation icin dogru blocker verilir.
- Customer orijinal checkout'u execution workspace olarak kullanma. Snapshot'i urunun sahip oldugu dis store'a al; production ve build girdileri salt okunur kalsin. Adaylar yalniz dogrulanmis test setine uygulanir.
- Docker/JVM calisma planinda JDK/Maven, mevcut wrapper/argLine/ayarlar, dependency cache ve modul output mount'lari gercekten calisabilir olsun. /work read-only verip target output alanini kurmadan "izole Maven calisiyor" deme.
- Model ve test runner'a host home, tum process.env, SSH/private keys, Docker socket, kurumsal secret dosyalari veya genis writable bind mount verme. Izin verilen model endpoint erisimi test JVM'sine ag izni anlamina gelmez.
- Network/model/artifact gereksinimlerini ayir. Build dependency indirmesi gerekiyorsa operatorun mevcut onayli cache/registry politikasini kullan; otomatik genel dis ag acma.
- Gercek container identity/job label/process group kaydi; cancel/timeout sonunda yalniz o ise ait kaynaklarin sonlandigi dogrulansin. Docker CLI'yi oldurmek container'in kapandigi kaniti sayilmasin.
- Yazma alani boyutu, log/buffer, process sayisi, bellek ve sure sinirlari fail-closed uygulanir. Global kill/prune yapma.

### K02 - Tek kalici job motoru ve dogru contract

- Start, resume ve cancel ayni application job motorunu kullanacak. Tool'a ozel birbirinden kopuk state degistiren handler birakma.
- Istek dogrulanip hedefler somut class listesine cozuldukten sonra asagidakileri kalici kaydet: original request, gercek canonical root/location, source snapshot/digest, build/policy/toolchain digest, targets/FQCN/module/class identity, LINE/BRANCH thresholds/applicability, budget, selected/resolved model profile, runner profile ve artifact root.
- Baslangic discovery snapshot'i job'a baglansin. `goal.project_root` storage root olmasin. Ayar onceligi acik: kullanici talebi -> proje politikasi -> global varsayilan. Sabit 20/2/3 ile verilen butceyi yok sayma.
- Idempotency ayni request kimligi icin double-dispatch yapmasin. Kaynak/model/goal degismis yeni is eski tamamlanmis istege yanlis eslesmesin. Parametreleri tekrar verilmeden resume edilebilsin.
- Acquire, QUEUED->RUNNING, heartbeat, phase, run, accepted pointer ve terminal state islemleri generation/fence ile bagli olsun. Her mutation owner/generation ve kaynak revision'a gore yetkilendirilsin.
- Stdio/model session kapanmasi job hafizasini kaybettirmesin. Bu teslimatta kesintisiz daemon zorunlu degildir; yeniden acildiginda guvenli resume zorunludur.
- Uzun islemler event loop'u engellemesin; status/cancel sinirli gecikmeyle cevap verebilsin. Sync DB transaction icinde model/Maven bekleme yok.

### K03 - OpenCode worker: kodu anlayan ve gercek geri bildirim alan zincir

- Yetkili mevcut LiteLLM provider/model id'sini birebir koru. Model isimlerine ekstra prefix ekleyip cikarma. Provider fallback veya yeni dis model secimi yok.
- Sabit porta sessiz baglanmak yerine urune ait kontrollu worker server manager veya acikca konfigure edilmis, kimligi/surumu dogrulanmis worker endpoint'i kullan. Sahipligi bilinmeyen kullanici TUI/server process'ini kapatma.
- Gercek kurulu OpenCode surumunu ve kendi OpenAPI'sini/SDK tiplerini kaydet. v1/v2 deneysel API'leri karistirma. Health/model auth/session/prompt/terminal response/abort yolunu ayni adapter test etsin.
- Worker'a uygun sandbox snapshot baglami ver. Hedefin gercek kaynak govdesi, kullanilan sinif imzalari, mevcut testler/fixture'lar, effective test framework ve derleme ayarlari, raw coverage'tan cikarilmis gercek aciklar ile onceki deneme/hata ozeti kontrollu aktarilsin.
- Hedef dosya ilk bes kaynak dosya arasinda degilse de calissin. Bilgi yoksa "bilinmiyor" kullan; mevcut test yok diye uydurma.
- Analiz -> senaryo plani -> CandidateChangeSet -> deterministic validation -> bounded repair -> reviewer/gap analizi mantiksal asamalari gercek artifact'lerle bagli olsun. Bunlar ayri ticari ajan framework'u veya zorunlu farkli model gerektirmez.
- Prompt cikti semasini ve mevcut test-only kontratini bilsin. AST/policy/compile hatasi exact sinirli feedback olarak sonraki denemeye girsin. Yeni oturumda eski artifact'lerden baglam kurulabilsin.
- Basarisiz veya duplicate stratejileri hash/senaryo kimligiyle tut; ayni denemeyi baska adla sonsuz uretme. `max_repairs_per_candidate` gercekten harcansin ve persist edilsin.
- Worker'in genel write/bash/task/web/diger MCP/plugin mirasi customer projeye veya hosta yetki veremesin. Tool flags cagrida gercekten uygulansin; gerekirse sadece kontrollu read/context araclari. Model kodu CandidateChangeSet olarak teslim eder, uygulama kontrol katmani yazar.
- Mesajlari request/session/message kimligine gore eslestir. Ara tool round'unu final sanma; stale onceki cevabi alma. HTTP timeout, model hatasi, schema hatasi ve iptal ayri. Timeout'ta gercek abort/sonlanma teyidi.
- Gizli dusunce zinciri istenmez/saklanmaz; acik plan, karar gerekcesi, deneme ve kanit yeterlidir.

### K04 - Coverage ve kabul edilen test setinin tek gercegi

- Her aday workspace'i = immutable source snapshot + son kabul edilen test seti + yalniz bu candidate'in degisiklikleri. Baseline'daki dirty/untracked testler dahil kullanici verisi kaybolmasin.
- Staging/diff validation tum degisiklik setinde once tamamlansin. Kismi yazilan rejected aday accepted set'i kirletmesin; degisiklik path'i, before hash ve action semantigi dogrulansin. Unified diff'i Java dosyasinin tam icerigi diye yazma.
- Maven/JaCoCo ciktilari her run icin taze/ayri olsun; eski target/exec/XML kabul edilmesin. Source/class bytecode kimlikleri, agent/command/toolchain ve report dosyasi hash'leriyle provenance kaydet.
- Multi-module raporu modul ve binary class identity ile sec; aggregate ve child raporundan ayni class'i iki kere sayma. Ayni FQCN'nin farkli moduldeki kopyasini karistirma.
- Kapsanan/toplam tamsayi sayaclarindan hesapla; finalde percent yuvarlamasi kullanma. LINE/BRANCH metric secimi ve branch=0 NOT_APPLICABLE, eksik/bozuk rapor UNAVAILABLE/INVALID ayrilsin.
- Tek evaluator; baseline already-met, candidate kabul, early stop, null aday, plateau, budget, final, DB/status/HTML ayni contract'a gore degerlendirilsin. Dispatcher outcome'u kendiliginden yeniden LINE ile yazmasin.
- Branch-only ve anlamli davranis kazanimi korunabilsin. Mevcut test/coverage gerilemesini fark et; quality veya basarili test silerek hedef tutturma. Davranis kazanimi coverage artisi degilse ayri raporla.
- Kabul sonrasi run/test identities + coverage + candidate/accepted hashes + kalan budget/plan tek checkpoint yayiniyla tutarli hale gelsin. CandidateLoop'un optional parametresi verilmedi diye checkpoint atlanamasin.
- Finalde temiz yeni workspace'te tam accepted set ile gercek replay/regresyon yap. Rapor ve patch'in ayni replay edilen baytlardan geldigini dogrula. Final run basarisizsa daha onceki sayilara dayanip TARGET_REACHED verme.
- Hedef alti sonucun nedeni kanitli olsun: model yok/timeout/altyapi = blocker, deneme butcesi = budget, coklu farkli denemede ilerleme yok = plateau, analizle desteklenen structural engel = testability. Birbirine donusturme; ulasilabilir maksimum oldugunu kanitsiz iddia etme.

### K05 - Gercek kesinti/devam/iptal ve fencing

- Acquired unexpired lease baska owner'a verilemesin. Yeni process/session icin unique owner id kullan; PID tek basina kimlik degildir. Gerekli stale-owner takeover proseduru acik ve testli olsun.
- Generation release/expire/restart ve owner tekrarinda geriye gitmesin. Kalici job generation kullan; lease satirinin yoklugu eski generation'i sifirlama gerekcesi olmasin.
- Her trusted publish'te lease owner/generation/expiry, job source revision ve parent/current accepted pointer compare-and-swap kontrolu ayni transaction'da yapilsin.
- Checkpoint verify yalniz manifest JSON'una bakmasin: referansli source/accepted dosya blob'lari, test/run/coverage artifact'leri ve hash'leri dogrulansin. Verified ile unverified checkpoint ayrilsin.
- Resume orijinal job contract'ini DB'den yuklesin; kaynak/build/policy degisimini kontrol etsin; accepted set'i geri kursun; yarim candidate'i untrusted biraksin; ayni job'dan gercek dispatcher devamini baslatsin.
- Source degismisse eski coverage current sayilmaz. Onceki kazanimi koru, kontrollu rebaseline/revision veya onay gereksinimini raporla. Bastan yeni job acip resume oldu deme.
- Pause/cancel once yeni isi engellesin, sonra running worker/Maven/container'e sinyal gondersin, process termination'i dogrulasin, en son state commit etsin. Sonradan gelen worker sonucu fenced olarak reddedilsin.
- Hard kill'de finally calismayabilir. Orijinal repo hic candidate workspace olmadigi icin kullanici testini geri almaya mecbur kalma. DB+artifact publish recovery'sini process-kill fault testleriyle kanitla.
- Atomic rename tek basina disk/power-loss garantisi diye sunulmasin; desteklenen platform icin dayaniklilik/flush/yedekleme politikasi, incomplete publish ve WAL backup/restore dogrulamasi belgelensin.

### K06 - Discovery ve test kalitesi gercek projede calissin

- Effective Maven modelini guvenli runner uzerinden cozumle. Parent/profile/properties/pluginManagement, custom source/test roots, JUnit4/5/Mockito, dependency modulleri ve mevcut JaCoCo wiring'i hesaba kat.
- Su anki JavaParser/helper'i uctan uca kullan; parser'i projenin POM'una ekleme. Comment/string/annotation/multiline/nested/overload/record ve gercek method signatures icin regex tek kaynak olmasin.
- Package/module hedefi once somut class listesine acilsin. Ayni simple name farkli modul/paket varsa sessiz ilk eslesme kullanma. Sinif/module/test path'lerinin root-relative semantigi tum katmanlarda ayni olsun.
- Gercek source snapshot HEAD+dirty/untracked+build/config digest kullansin. Cache/envanter stale ve silinen dosyalari version'lu olarak guncellesin. Her hedef icin eski snapshot'tan class bulup yeni kaynakta kullanim yapma.
- Kalite denetimi onceki test setiyle AST/test identity karsilastirmasi yapsin. Silinen/disabled/atlanan/gevsetilen testler, ayni FQCN shadow, mock-SUT, reflection/private API, anlamsiz duplicate ve tautoloji kontrolu gercek accepted path'te calissin.
- JUnit4 expected-exception, JUnit5 assertThrows, assertion helper ve Mockito interaction testi gibi anlamli stilleri destekle. Metindeki "assert" kelimesi yeterli sayilmasin; her dogru teste gereksiz direkt assertion zorlamasi yapma.
- Surefire/JUnit report parsing fail-closed olsun. Bozuk raporu atlayip 0 failures deme. Yeni test gercekten kesfedildi mi, mevcut basarili testler yeniden calisti mi kanitla; exit 0 ve 0 test tek basina passed suite degildir.
- Windows/Linux path ve command adapter'lari her runtime yerinde duzelsin: source, candidate, accepted, config, DB, report, wrapper ve node bootstrap. Unicode ve bosluklar korunur; supported shell'e gore quoting dogrulanir.

### K07 - Gercek rapor, patch-only sonuc ve guvenli apply

- Tek typed evidence projection hizmeti DB/artifact registry'den job/targets/runs/iterations/model/coverage/gates/gaps/accepted set sonucunu ciksin. HTML/JSON/status/result ayni projection'i kullansin.
- Source degisikligi 0 ancak manifest dogrulamasi sonucuysa gosterilir. Unknown veri sifir veya PASSED olamaz.
- Baslangic/final line-branch sayaclari, somut test ekleme/iyilestirme sayilari, test sonucu, budget/plateau, model rol kimligi, coverage aciklari, son trusted checkpoint ve replay scope raporda olsun.
- `test_result` gercek rapor ve patch artifact referanslarini dondursun. Keyfi path okuma yok; registry'de o job'a ait artifact'ler. Terminalde dosya yolunu dogru goster; kullaniciya tekrar IDE coverage calistirtma.
- Basarili, blocked, baseline-failed, model-failed, invalid-evidence, cancelled, budget ve plateau icin ayni rapor akisinin uygun parcasi calissin. Terminal state ile rapor yayini tutarsizsa durum ve recovery gereksinimi acik olsun.
- Binary `.exec` Buffer/stream olarak, nested JaCoCo HTML/CSS/assets bayt koruyarak export edilsin. Gerekli parent dizinleri olustur; tum hash'leri dogrula; missing VE hash_mismatch sonucunda verification false olsun.
- Export path containment, symlink, reserved adlar (report.json/index.html/manifest.json), duplicate yollar ve HTML escaping/redaction kontrolu. Extra artifact ana raporu ezemesin, root disina yazamasin.
- Patch-only varsayilanina saygi duy. Gercek accepted changeset/diff/final test dosyalarini dis store'da eksiksiz sun. Sadece PATCH_ONLY yazisi teslimat degildir.
- Onayli apply destekleniyorsa approval record'u trusted mekanizmadan gelsin, job/checkpoint/patch/root/expiry'ye baglansin. Modelin kendi urettigi onay metni kabul edilmez. Guvenilir kanal yoksa patch-only devam; uydurma adapter yapma.
- Expected-before/absence ve after hash; yazmadan hemen once source revision/path/symlink kontrolu; idempotent modify/create; multi-file journal recovery. Backup'lar job/operation bazli unique durable owned store'da, ilk preimage ezilmeden saklansin.
- Birden fazla kaynakta partial apply olursa APPLIED deme; conflict/recovery'i ve hangi dosyalarin yazildigini dogru dondur.

### K08 - Temiz PS1'siz kurulum ve gercek protocol adapterleri

- `node scripts/install.mjs` temiz clone'da dist/node_modules yokken calissin. Build'den once dist import'u yok. Static source helper veya build sonrasi dynamic import gibi gercek bir bootstrap yolu sec; ayni merge mantigini test edilenden farkli kopyalama.
- `fileURLToPath(import.meta.url)` veya dogru esit deger; cwd'ye bagimsiz script root. Windows CMD, bosluk/Unicode path; Linux path ve `.cmd` wrapper siniri dogru.
- Locked dependency kurulumu; package metadata gercegi; version/preflight. Eski customer POM degismeyecek fakat MCP kendi build/dependency dosyalari duzeltilebilir.
- Config merge yalniz urunun record'unu degistirsin. JSON/JSONC destekleniyorsa yorum/alan/format koruma kontrati testli; desteklenmeyen formati bozmak yerine tani. Eszamanli degisiklikte preimage CAS; kalici yedek ve ownership-based uninstall.
- Test kurulumunda HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG/OpenCode config/runtime tum ilgili yollar kontrollu olsun; gercek kullanici config sentinel'i degismesin. Child env isolation esas; global env degistirip unutma.
- PS1 optional wrapper olarak kaliyorsa ortak mantiga delege etsin; PS1 yetkisi kurulum sartina donusmesin. Temiz kurulum testi onceden derlenmis dist'e veya onceki kullanici config'ine guvenmesin.
- Legacy OpenCode-compatible MCP adapter'i resmi SDK ile korunur. Yeni protocol adapter'inde resmi SDK/surum kilidi, `server/discover`, per-request version/capability metadata ve yeni result semantigi gercek wire uzerinden test edilsin [E03]. Client/server ayni old SDK ile konusup sadece v2 etiketi veremez.
- Structured MCP errors and results typed olsun. Bir `tools/call` hatasi JSON metninde saklanip disarida basari gibi gosterilmesin; kullanilan protocolun hata/result kurallari izlenir.
- Tasarlanacak tool/schema API'lerini gercek SDK API'si sanma. OpenCode version'u, MCP SDK major'u ve protocol revision ayri manifest alanlaridir.

### K09 - Bagimsiz son kabul ve dogru teslim

- Bolum 5 senaryolarini gercek normal MCP entrypoint'ten calistir. Component/mocked/recorded replay/live kurum pilotu acikca ayri kosular olsun.
- Her testin outcome/assertion'i kendi senaryosuna bagli olsun. Pozitif senaryoda FAILED de kabul ediliyor gibi gevseklik yok. Rapor varligini yalniz bir boolean alanin adindan cikarma; dosyayi ac ve hash'ini kontrol et.
- Resmi MCP client kullan veya streaming JSON framing + request id + inner content JSON parse et. Biriken stdout'ta regex arayip onceki QUEUED cevabini/yanlis outcome'u alma. Sabit sleep artirmak temel parser/correlation kusurunun cozumu degildir.
- Her eski AC/RG icin fixture, assertion/test id, run id, source commit, command/toolchain, state ve artifact/hash eslesmesi olustur. Otomatik ozet bunu toplasin; model elle 70/70 yazmasin.
- Release verifier zorunlu kriterde NOT_RUN/BLOCKED/FAILED veya eksik/dogrulanamayan evidence varsa sifir-disi exit uretsin. Legacy smoke'un gecmesi yeni protocol veya live worker kabulunu karsilamasin.
- Gercek kurum modeli/sandbox bulunmuyorsa local component sonuclarini koru; institutional acceptance'i BLOCKED olarak acik birak. Kosulmayan seyi PASSED yapip gorevi kapatma.

---

## 5. Zorunlu normal-yol kabul senaryolari

Bu matris eski AC/RG'yi daraltmaz. Asagidaki 28 senaryo, onceki kapanis yanlislarini yakalayacak release kapilaridir. Her biri mevcut urun fonksiyonlarini/normal dagitilan entrypoint'i kullanmali; ayni ifadenin test icinde yeniden yazilmasi veya private dispatcher yerine parallel demo pipeline kabul degildir.

| ID | Senaryo | Kanitli beklenen sonuc |
| --- | --- | --- |
| RT01 | Hic AITEST_RUNNER/WORKER env ayari olmayan normal kurulum | Customer host JVM/Maven baslamaz. Izolasyon/model hazirsa worker+izole run; degilse specific BLOCKED, plateau veya success degil. |
| RT02 | Invalid runner string veya customer icin host_dev_only | Tip donusumune guvenilmez; model/build calismadan red. Unit-test injection bu yola public erisim acmaz. |
| RT03 | Gercek izole baseline -> candidate -> final replay | Tum run'larda guvenli runner kimligi ve output mount'lari; source/POM ayni; host-only code path'i cagirilmaz. |
| RT04 | Gercek worker server ilk basta yok / yanlis auth / model yetkisiz | Kontrollu baslatma veya specific BLOCKED_MODEL; hicbirinde TARGET_NOT_MET_PLATEAU yok. |
| RT05 | Gercek worker, hedef dosya ilk bes dosyanin disinda, mevcut test var | Dogru kaynak/test/gap baglami aktarilir; dogru full model kimligi; typed aday; gercek yeni test kesfedilir. |
| RT06 | Bir aday compile error, sonraki repair dogru | Hata worker'a geri gider; bounded repair butcesi dogru harcanir; ayni job; eski accepted set korunur. |
| RT07 | LINE=95, BRANCH=40, ikisi icin hedef90 | Loop, dispatcher, DB, status, JSON ve HTML hepsi hedef saglanmadi; final overwrite yok. |
| RT08 | LINE ayni, BRANCH40->95; sonra baska hedef hala80 | Branch-only kazanimi kabul et; diger hedef dusukse genel basari verme; ortalama kullanma. |
| RT09 | Branch total0, branch raporu eksik, line metadata eksik, %89.96 | N/A/UNAVAILABLE/INVALID ayri; yuvarlama sahte90 yapmaz. Hedef/alakali metrik politikasina uygun sonuc. |
| RT10 | Reddedilen son aday XML'i yuksek; eski run XML'i veya class ID uyusmaz | Final yalniz accepted+fresh replay; forged/stale rapor kabul edilmez; trusted onceki set kaybolmaz. |
| RT11 | A testi kabul, sonra B testi kabul, C reddedildi; 2 ayri dosya | Final replay A+B'yi calistirir, C yok; output patch/checkpoint ayni A+B baytlari; kaynak repo degismez. |
| RT12 | Kabul edilen testten sonra process hard-kill; yeni MCP/OpenCode session | Ayni job_id/goal/budget/source ve accepted hash'leri yuklenir; `test_resume` gercekten ilerler; yeni sifir job degil. |
| RT13 | RT12'yi baska yetkili model profiliyle surdur | Onceki test/deneme kaniti korunur; yeni model kaydi eklenir; eski chat/session zorunlu olmaz. |
| RT14 | Maven/JVM calisirken pause/cancel/timeout | Yalniz o job'un child/container'lari dogrulanmis bicimde biter; yeni aday baslamaz; sonradan worker cevabi state'i degistiremez. |
| RT15 | Iki client ayni anda resume; aktif unexpired lease; release+ayni owner | Tek owner calisir; generation artar; eski token yazamaz; process PID tekrar kullanimi sahiplik sayilmaz. |
| RT16 | Artifact yazma/manifest publish/DB pointer arasinda hard-kill | Yalniz tam verified checkpoint secilir; yarim aday accepted olmaz; eski guvenilir pointer korunur. |
| RT17 | Resume oncesi source/POM/dirty test degisti | Source change algilanir; stale coverage basari sayilmaz; kullanici degisikligi korunur; controlled rebaseline/revision. |
| RT18 | 2 modul, ayni simple name; profile/parent/custom test root; package target | Dogru concrete class/module/test/report; belirsizlikte soru/typed candidates; custom path'te gercek test calisir. |
| RT19 | Shadow FQCN comment header ile, eski test silme, disabled, regex-assert yorumu | Accepted path'te engellenir; production davranisi test kaynagiyla degistirilemez. Anlamli helper/exception testleri yanlis reddedilmez. |
| RT20 | Zero-discovered yeni test, bozuk Surefire XML, baseline failed/unstable | Exit0/zero failures sahte PASSED degil; gercek test identity/sonuc korunur, hatalar specific siniflanir. |
| RT21 | Gercek model + bilinen ulasilabilir fixture, baseline iki metrigin en az birinde90 alti | Normal OpenCode->MCP->worker->izole Maven/JaCoCo; gercek yeni/gelistirilmis test; iki uygulanabilir metrik >=90; temiz final replay. |
| RT22 | Test-only engelli hedef veya gercek butce/plateau | Son trusted kazanim/patch korunur; neden/different attempts kanitli; prod/POM degismez; dusuk sonuc hedef basarisi olmaz. |
| RT23 | test_status/test_result ve HTML/JSON/DB | Gercek once/sonra sayac/test/model/iteration/gap/manifest eslesir; last_trusted ve report referanslari doldurulur; sahte sifirlar yok. |
| RT24 | Binary exec, nested HTML, hash corruption, reserved/path escape | Bayt-hash birebir; offline linkler calisir; mismatch sonucu false; root disina/reserved dosyaya yazma red. |
| RT25 | Patch-only ve onaysiz/yanlis approval; onayli apply sonrasi kullanici degisikligi | Onaysiz yazma yok, gercek patch teslim; onay job/checkpoint/root/digest bagli; conflict'te kullanici dosyasi korunur. |
| RT26 | Multi-file apply ortasinda kill; ayni modify apply tekrar | Durable journal ile controlled recovery; ilk backup korunur; double-apply idempotent; farkli job backup cakismasi yok. |
| RT27 | Fresh clone, dist/node_modules yok, PS1 yasak; CMD+Node, Unicode/bosluk path; sonra uninstall | Bootstrap calisir; gercek config sentinel ve diger MCP/provider kayitlari korunur; sadece owned uninstall; Windows/Linux farklari testli. |
| RT28 | Legacy ve yeni protocol wire; parcalanmis/coklu JSON mesajlar; outcome parser | Legacy eski contract; yeni profil gercek yeni protocol isteklerini karsilar. Negotiated version dogru; request id/outcome kesin; failed positive pilot diye gecmez. |

### 5.1 Gercek pilotun devredilemez kosullari

RT21 ile RT12/RT13 icin sadece unit/fake/replay kaniti yeterli degildir. Son kabul kaydinda su zincir birlikte bulunacak:

1. Gercek OpenCode talebi ve MCP `test_start` istegi, exact hedef ve yuzdeyle.
2. Baslangic source/accepted manifest'i ve hedeften dusuk taze JaCoCo sayaclari.
3. Yetkili kurum modeli tarafindan gercek olusturulan aday; provider/model/session/message korelasyonu. Sadece config'te model ismi yazmasi yetmez.
4. Izole runner'da compile, gercek kesfedilen testler, outcome ve taze coverage.
5. Aday kabul/red gerekcesi; cumulative accepted set ve checkpoint/DB baglantisi.
6. Ayrica gercek kill/restart/resume'da ayni job ve onceki accepted hash korunumu, devamdaki yeni run.
7. Temiz final replay; gercek rapor/patch/exec/XML/HTML artifact'leri, orijinal customer source/POM butunlugu.

Model error, kurulum hatasi veya cancellation icin negatif testte FAILED dogru olabilir; fakat bunlari RT21'in yerine PASSED yazma. Hedef fixture zaten100 ise bu ayri `TARGET_ALREADY_MET` testi olur, AI coverage kazanci kaniti olmaz.

---

## 6. Gelistirme hafizasi ve checkpoint standardi

`ai/` urunun gelistirme hafizasidir; runtime customer job verisi degildir. Mevcut dizinler korunur.

Bu gorev icin en az:

- `ai/reviews/2026-10-10-runtime-acceptance-review.md`: B01-B12, eski F/AC/RG eslesmesi, source/test kaniti, status.
- `ai/plans/runtime-acceptance-003.md`: K00-K09, bagimlilik, son dogrulanan asama ve siradaki somut is.
- `ai/PROJECT_STATE.md` ve `ai/BACKLOG.md`: tek guncel durum; test edilmemis konu VERIFIED degil.
- `ai/checkpoints/`: anlamli her parcadan sonra once/sonra HEAD, degisen dosyalar, kosulan komut ve exit, log/artifact konumu/hash, bilinen aciklar, siradaki test/duzeltme.
- `ai/handoffs/`: model degisiminde hedef, kaynak revision, gecerli kanitlar, yarim degisiklikler ve tam devam noktasi. Sadece "devam et" metni yeterli degil.
- Kabul registry'si: her AC/RG/RT icin tekil record; hangi test assertion'inin hangi davranisi kanitladigi, component/integration/live etiketleri, run id, commit/toolchain, outcome, artifacts.

Yeni oturum once Git durumu ve checkpoint'i dogrular, sonra kalan onayli ise gecer. Eski basarisiz yontemleri sebepsiz tekrar etmez. Kayitlarda bosluk var diye gercek kaynak degisikligini silmez. Urunun implementation task'i ile runtime test job'unu karistirmaz.

Runtime SQLite ve artifact store customer/urun repository'lerinin disinda, sahipligi bilinen kullanici dizinindedir. Customer kaynak, raw prompt/response, JaCoCo HTML kaynaklari, model credential'lari ve session ekleri public repoya gitmez. Sentetik fixture kanitlari hassas veri taramasindan sonra paylasilabilir. Gizli dusunce zinciri aktarimi yok.

---

## 7. Test ve kanit standardi: ayni hata ucuncu kez kapanmasin

- Testin adi degil assertion'i esas. "recovery" isimli test yeni job baslatiyorsa recovery kaniti degildir.
- Su kaynak oruntuleri release review'da aranir: customer akista host_dev_only, worker-disabled success, sabit port, sahte gates/test sayilari, sabit null result fields, unused checkpoint/lease, goal'un calismayan profile/budget alanlari, eski XML reuse, as never ile bilinmeyen phase, outcome yerine generic string.
- Bu arama tek basina kapatma degildir. Her bulgu runtime davranis testiyle kapanir. Islev yeniden adlandirilinca kusur gizlenemez.
- Coverage hedefi fixture/assertion icinde90'dan50'ye dusurulmez. SUT production kodu test amaci icin degistirilmez. Istek hedefleri/AC/RG tanimlari "smoke"a cevrilmez.
- Hatali testin yanlis beklentisi duzeltilebilir; fakat bunun gerekcesi requirement/gercek contract'a baglanir. Uygulamanin kusurlu sonucunu kabul etmek icin assertion silmek yok.
- Fake worker/runner'lar unit testler icin yararlidir; live pilot olarak etiketlenmez. Canary/parse/transport smoke ile kod uretimi, tool authorization veya sandbox semantigi iddia edilmez.
- Zamana duyarli testler olay/checkpoint barrier'lari ve bounded polling kullanir. Request/response correlation parsing kesin olsun; sabit sleep'i tekrar tekrar buyutme.
- Node typecheck ve lint gercek calisir; test kodlari da typecheck kapsaminda olsun. Kullanilmayan import/adapter, uygulanmamis contract ve tip kacislarini sifir hata etiketiyle gizleme.
- Kurulum, integration ve live pilot testleri gercek kullanici config'ini/sirlarini bozmayacak; zararsiz isolated home/runtime ve sentetik fixture kullanacak. Institutional profile yalniz acik yetkili yerel kaynaktan, secret loglamadan cozulur.
- Tam suite exit code'u ve test runner structured sonucu korunur. Sadece son bes satir, greple "passed" arama veya bir stdout string'i kabul delili degildir.
- Kabul validator'u missing artifact, farkli source commit, beklenmeyen skip, scope uyusmazligi, hash mismatch veya NOT_RUN zorunlu kriterde basarisiz cikar. Kendi JSON'undaki "passed=true" degerini kendi dogrulamak yeterli degil; kayit gercek collector/runner evidence'ina bagli olur.

---

## 8. Bitis ve teslim tanimi

### 8.1 IMPLEMENTATION_VERIFIED

B01-B12 normal runtime davranislarinda duzeltilmis; K00-K09 implementasyonlari gercek; yerel tekrar uretilebilir component/integration/fault testleri gecmis; eski AC/RG ve RT matrisi eksiksiz kanitli siniflanmis olmalidir. Gercek kurum pilotu kosulmamissa bu etiket tek basina tum urunun hazir oldugu anlamina gelmez.

### 8.2 FULL_ACCEPTANCE_VERIFIED

Yukariya ek olarak normal OpenCode/MCP girisinden gercek model + izole runner ile RT21, RT12/13 ve RT22; temiz CMD+Node kurulum RT27; ilan edilen platform/protocol kabiliyetleri kanitli olmalidir. Kaynak/POM/test-only, cumulative accepted set, actual resume ve rapor/provenance kosullari eksiksizdir. Zorunlu kriterlerden biri BLOCKED/NOT_RUN/FAILED ise bu etiket kullanilmaz.

### 8.3 Kullaniciya verilecek son teslim

- Tamamlanan gercek davranislar, review HEAD ve teslim HEAD, gercek test komutlari/exit kodlari.
- Hedefi saglanan sentetik pilotun LINE/BRANCH before/after sayaclari, yeni test kimlikleri, final replay ve rapor/patch dosya konumu.
- Ayni job ile kesinti/devam kaniti; kullanilan model kimlikleri.
- Hedef alti senaryonun gercek nedeni ve korunan test seti.
- PS1'siz kurulum/verify/uninstall komutlari ve temiz-ortam kaniti.
- Acik kalan kosullar varsa tek tek neden, son guvenilir checkpoint ve siradaki somut eylem. "Tum isler bitti" ile celisen NOT_RUN kalmaz.
- Degisiklikler yalniz bu urunun onayli kapsamindadir. Customer projelerine otomatik commit/push yok.

Commit/push oncesi staged diff, ASCII aciklamalar, secrets, beklenmeyen generated/runtime dosyalari, Git author/committer ve test sonucu kontrol edilir. `git config --local` kullan; global ayarlara dokunma. CI'yi acma, force push yapma.

---

## 9. Kapsam disi ve durma kurallari

Yeni UI, yeni kullanici CLI'i, Zekam entegrasyonu, baska dillerin test uretimi, Gradle motoru, merkezi SaaS/remote worker platformu, Jenkins/PR botu ve otomatik production refactoring eklenmeyecek. Onceki sozlesmede yer almayan ek urun ozellikleri bu aciklari kapatma bahanesiyle eklenmez.

Modelin baglami dolarsa veya oturum kesilirse gelistirme durumu ai/ checkpoint'e kaydedilir; sonraki model dosyalardan devam eder. Altyapi eksikliginde riskli alternatifle zorlamadan BLOCKED kaydi ve tekrar uretim adimi birakilir. Bu "gorev tamamlandi" demek degildir.

Isin gercekten bitmesi, daha cok dosya/satir/tool ismi veya yesil bir tablo degil, kullanicinin onayladigi normal akis ve kanitli guvenlik/devam/olcum sozlesmesidir.

---

## 10. Inceleme kaynaklari ve sabit referanslar

### 10.1 Repository ve kullanici kaniti

Tum repository referanslari su sabit commit'e aittir:

`https://github.com/mehmet-karacan/ai-test-engineering/tree/7620f206d1bab3e2014518593dcb322277a9ddbf`

| Referans | Path / incelenen nokta |
| --- | --- |
| S01 | `src/application/services.ts` - handleTestStart varsayilan runner/worker, handleTestStatus null coverage |
| S02 | `src/orchestration/job-dispatcher.ts` - goal, baseline, worker, loop, final outcome, reportData |
| S03 | `src/orchestration/candidate-loop.ts` - evaluateGoalMet, meaningfulGain, optional accepted/callback, overlay ve rapor path |
| S04 | `src/application/job-tools.ts` - resume/cancel/result/apply gercek handler davranisi |
| S05 | `src/runners/failclosed-runner.ts` - guard + eksik somut run |
| S06 | `src/runners/docker-runner.ts` - read-only work, mount, timeout/process yollari |
| S07 | `src/orchestration/lease-manager.ts` - acquire/release/renew/generation |
| S08 | `src/workers/opencode/worker-client.ts` - 204/info-parts duzeltmesi ve kalan terminal response davranisi |
| S09 | `src/workers/opencode/role-prompts.ts` - rol/baglam/onceki deneme sozlesmesi |
| S10 | `scripts/install.mjs` ve `.gitignore` - dist bagimliligi, bootstrap, file URL |
| S11 | `src/configuration/config-merge.ts` - JSONC/merge/write semantigi |
| S12 | `src/mcp/server-setup.ts`, `src/mcp/stdio-entry.ts` - 8 tool, path ve profile |
| S13 | `tests/security/pilot-full.test.ts` - disabled worker, host runner, yeni runPilot, outcome assertion yok |
| S14 | `tests/contract/v2-wire.test.ts` - her iki profilde eski handshake/version |
| S15 | `src/reporting/report-generator.ts` - export/hash/binary/path, projection contract |
| S16 | `src/reporting/test-apply.ts` - expected-before, approval, backup/journal |
| S17 | `src/discovery/pom-discovery.ts` - statik POM ve source/test root secimi |
| S18 | `src/policies/quality-gate.ts` - regex kalite ve header'li shadow davranisi |
| S19 | `ai/ACCEPTANCE_MATRIX.md`, `AGENTS.md` - toplu kapanis ve stale yonlendirme |
| S20 | Kullanici eki `session-ses_ede2(1).md`: 200/200 sonucu, RG42 assertion degisikligi, 7620f20 kapanis kaydi. Raw session public'e kopyalanmaz. |

Incelemede connector'un bildirdigi bazi Git blob SHA'lari:

| Dosya | Blob SHA |
| --- | --- |
| services.ts | `64f72480ab973ee95a19a6999aea55e168d85176` |
| job-dispatcher.ts | `68b6fb5c0dc75a94ed783ee146bac39186d3de89` |
| candidate-loop.ts | `e0665d8be3a1c9aafd397c93f0dd96ef3faeb102` |
| job-tools.ts | `47cdd47b2b345b56a72557b0d2a435fe43979ed8` |
| failclosed-runner.ts | `d4f54f3771db9faf1ab256924d3f831cc2e94355` |
| install.mjs | `6bffc9ec7cbd4ab15bff681682ba4f3bce3592ff` |
| pilot-full.test.ts | `e5f1e239d7ded40608bb47adb217bc43e4faef9f` |
| report-generator.ts | `26970b73e9e691a6de0acdd9347b89e1f3b1f2fd` |

Blob SHA'lari commit SHA'si diye raporlanmaz. Uygulama baslangicinda HEAD degismisse bu kusurlari guncel kodda yeniden degerlendir; literal SHA'ya donmek icin kodu reset etme.

### 10.2 Resmi kaynaklar (2026-10-10 tarihinde kontrol edildi)

- [E01] OpenCode Server: https://opencode.ai/docs/server/
  - Gercek server/port, health/auth, session, 204 prompt_async, info/parts ve OpenAPI kesfi icin. Kullanilan kurulu surumun /doc kontrati esas.
- [E02] Node.js URL: https://nodejs.org/api/url.html#urlfileurltopathurl-options
  - file URL ile fiziksel Windows/POSIX path farki; percent encoding cozumlemesi.
- [E03] MCP 2026-07-28 Key Changes: https://modelcontextprotocol.io/specification/2026-07-28/changelog
  - Yeni protocolde handshake kaldirilmasi, server/discover ve request metadata/result semantigi. Eski handshake'e v2 etiketi yeterli degildir.
- [E04] MCP resmi SDK listesi: https://modelcontextprotocol.io/docs/2026-07-28/sdk
  - Gercek protocol uyumlu SDK secimi; surumleri uygulama baslangicinda dogrula/lock et.

Bu belgedeki application tool/worker/checkpoint kontratlari urunun tasarim gereksinimleridir. Dis SDK'da ayni isimli API varmis gibi kullanma. Teknik surum/paket kimliklerini tahminle doldurma.

---

## 11. Ilk somut is

K00 kayit/arsiv ve gercek source kontrolunden sonra **RT01/RT02 ile normal customer yolundaki host fallback'i kirmizi testle goster ve K01 ile kapat**. Paralel olarak RT27'de temiz bootstrap sorunu yeniden uretilsin. Sonra normal entrypoint'ten worker+izole run+cumulative checkpoint dikey akisini tamamla. RG41/RG42'yi basarili saymak icin modelin kapali veya her kosuda yeni job oldugu yolu kullanma.

Tum asamalar bu tek gorevin parcasidir; kullanicidan her maddede yeni aktif gorev bekleme. Gercek bitis kaniti yokken durum etiketini ilerletme.
