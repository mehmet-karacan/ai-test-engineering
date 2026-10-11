# AKTIF_GOREV — AI Test Engineering: Rapor 06 Entegrasyonu ve Kanit Zinciri Duzeltmeleri

## 0. Gorev kimligi, kullanici kararlari ve uygulama siniri

| Alan | Deger |
| --- | --- |
| Gorev | `AITE-REPORT06-INTEGRATION-004` |
| Surum | `1.0` |
| Hazirlama tarihi | `2026-10-11` |
| Repository | `https://github.com/mehmet-karacan/ai-test-engineering` |
| Incelenen branch / HEAD | `main` / `1925b128e590f91ca1f5a3ee164abd7d48fdccd1` |
| Onceki kapsam | `AITE-RUNTIME-ACCEPTANCE-003 v2.0`; AC01–AC70, RG01–RG52, RT01–RT28, PRO01–PRO60 |
| Yeni tasarim referansi | `docs/reporting/reference/innova_test_raporu_tasarim_06.html` |
| Uygulama amaci | Mevcut kodu koruyarak normal MCP yolundaki eksikleri gidermek; 06 tasarimini gercek, dogrulanmis verilere baglamak; model yorumu olmayan otomatik baseline/progress/final raporlari teslim etmek |
| Canli pilot | Kullanici tarafindan durduruldu; bu gorev kendiliginden yeniden baslatma yetkisi VERMEZ |
| Bu belgenin hazirlanmasi | Kaynak/oturum incelemesi ve dar tekrar uretimleridir; urun implementasyonu veya canli pilot yapilmis degildir |

**Uygulayici bu belgeyi ozetlemek veya yeni bir gorev yazmak icin degil, mevcut repository'de uygulamak icin okur.** Tek aktif giris `AKTIF_GOREV.md` olarak kalir. Baska oturum/model bu dosya ve kalici gelistirme kayitlariyla devam eder.

### 0.1 Son kullanici kararlarinin onceligi

Bu dosya, onceki gorevin asagidaki iki kararini acikca gunceller:

1. **Raporu model YAZMAZ.** Model test kodunu uretir/iyilestirir. Rapor motoru test kaynaklarini, arac sonuclarini, kayitli olcumleri ve sabit kurallari gosterir. Serbest model yorumu, risk kanaati, AI senaryo aciklamasi, assertion yeterlilik yorumu, AI tavsiyesi veya modelin kabul/onay karari rapora, rapor JSON'una, yazdirma ciktisina ve kullaniciya sunulan rapor ozetine giremez. Eski gorevdeki rapor/reviewer/semantic review talepleri bu sinira gore uyarlanir; uretim icindeki analiz dusuncesi dogrulanmis sonuc kaynagi olamaz.
2. **Uzayan canli pilot durdurulmustur.** `session-ses_ed90.md` icinde kullanici pilotun basarilmadiginin kaydedilmesini ve diger islere gecilmesini istemistir. Yeni gorev rapor entegrasyonu ve yerel dogrulanabilir eksikleri kapsar. Canli kurum modeline tekrar tekrar sorgu, baska modele kendiliginden gecis, SKY/GPU gercek projesinde yeniden pilot veya benchmark baslatma YOKTUR. Bunun icin ayrica kullanici onayi gerekir.

Pilotun durdurulmasi, urunun canli kabulden gectigi veya nedenin kesin provider kaynakli oldugu anlamina GELMEZ. Eski `BLOCKED_PROVIDER` beyanini tarihsel kayit olarak koru; guncel kayitta gozlem, urun kusuru ve henuz kanitlanmamis neden birbirinden ayrilsin. Uygun bir kayit: `evidence_status: NOT_PASSED`, `execution_control: PAUSED_BY_USER`, `root_cause_status: UNRESOLVED` + bilinen kusur kimlikleri. Bu isimleri mevcut domain'e kontrollu migration ile esleyebilirsin; sadece kelime degistirip davranisi birakma.

### 0.2 Degismeyen sinirlar

- Son kullanici OpenCode kullanir; yeni son-kullanici CLI, ayri web uygulamasi/UI veya Jenkins entegrasyonu ekleme. HTML, mevcut urunun rapor ciktisidir. Maintainer `.mjs` dogrulama/kurulum scriptleri yeni CLI urunu sayilmaz.
- Musteri production kaynaklari, POM/build dosyalari, exclusion'lar, mevcut testler ve kullanicinin dirty/untracked dosyalari otomatik degistirilmez. Test-only patch varsayilandir. Urunun kendi TypeScript/Java helper/test/build dosyalarini bu gorev kapsaminda duzeltebilirsin; iki repository sinirini karistirma.
- Calisma/olcum orijinal checkout'a aday test yazilip sonra geri alinmasiyla yapilmaz. Izole snapshot + accepted set + candidate workspace kullanilir. Customer host Maven/JVM fallback'i yoktur.
- CI kullanici karariyla kapali kalir. Kurum TLS/PowerShell/izin politikalari bypass edilmez. Windows zorunlu akisi CMD + Node.js + Git ile calisir; PS1 ve PowerShell gerektirmez.
- Git kullanici ayarlari sadece repo-local: `user.name=mehmet-karacan`, `user.email=karacan.mehmet@hotmail.com`. Yeni commit mesajlari ve commit body Turkce ASCII olacak. Global Git ayarlari degistirilmez; force-push/history rewrite yapilmaz.
- Model/provider kimlikleri birebir, yapilandirilabilir kalir. Yeni ozel provider adresi, anahtar, model adina tahmini `~low` eki veya provider prefix temizligi uydurulmaz.
- SQLite/job/artifact store repository disinda kalir. Ham oturum dosyasi, kurum kodu, dahili URL/IP/config, API anahtari ve model dusunme metni public Git'e eklenmez. Bu gorev paketine ham oturum dahil edilmemistir.
- `java-support/.../JavaMetadataScannerCoverageTest.java` oturumda sahibi bilinmeyen untracked dosya olarak geciyor. Yeni checkout'ta varligini/sahibini kontrol et; silme, ustune yazma veya kendiliginden stage etme.

### 0.3 Kapsamin kapanisi ile urunun release kabulunu ayir

`004_IMPLEMENTATION_VERIFIED`: Bu gorevin butun yerel/deterministik/izole ve rapor kabulleri gerekli kanitla gecti; ertelenen canli kabuller ayri listede. Bu durum **FULL_PRODUCT_ACCEPTANCE_VERIFIED DEGILDIR**.

`FULL_PRODUCT_ACCEPTANCE_VERIFIED`: Eski ve yeni zorunlu kabullerin, gerekli canli model/proje/operasyonel kanitlari dahil gercekten tamamlanmasidir. Kullanici tarafindan durdurulmus pilot, eksik benchmark veya kanitsiz platform bu kapida PASSED sayilamaz. Canli kabuller ertelendiginde release denetimi tam kabul icin non-zero donmeli; yerel denetim ayrica kendi sonucunu verebilir.

## 1. Kaynaklar ve dogrulanmis baslangic

### 1.1 Girdiler ve butunluk

| Girdi | Kaynak / sabit kimlik |
| --- | --- |
| Guncel repo | `1925b128e590f91ca1f5a3ee164abd7d48fdccd1`; bu HEAD oturumun son push'u ile eslesiyor |
| Ek oturum | `session-ses_ed90.md`; 2969 satir; 2026-10-11 kapanis kayitlari; yerel/ozel inceleme girdisi |
| Onaylanan HTML | `innova_test_raporu_tasarim_06.html`; **257845 bayt**; SHA-256 `e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80` |
| Onceki aktif gorev | **150429 bayt**; SHA-256 `40819cc6f2680bc15e4e9c7c3cdb53a62a16171d998e353bb4a99b5bab4c58a3`; Git blob `2d8423d8d462047c66d97eef6184a1c80cbedbb8` |
| Onceki gorevin arsivi | `ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v2.0.md`; pakette yukaridaki baytlarla bulunur |

Onayli HTML'i byte-for-byte referans olarak koru. Logo, arayuz ve davranis referansidir; gercek runtime data schema veya olcum motoru olarak oldugu gibi kopyalanmaz. Dosyanin kendisi `Structural projection ... not a production schema validator` der. `synthetic`, `provided`, sabit testler ve ornek model adlari uretim verisi degildir.

Baslamadan HEAD farkliysa yeni commitlerin etkisini oku, bulgulari yeni duruma gore yeniden dogrula. Incelenen commit'e zorla donme; duzeltilmis isi geri alma. Arsiv veya referans dosyasi ayni path'te farkli hash ile varsa sessizce ezme. Eksik referansi hayali SVG veya onceki revizyonla ikame etme.

### 1.2 Oturumun destekledigi ve desteklemedigi sonuclar

- Kaynak govdesinin prompt'a eklenmesi ve JSON output biciminin yazilmasi gercek kod degisiklikleri; `76b429c`, `f6e494a` commitlerinde var. Bunlar korunacak ama asagidaki eksikler tamamlanacak.
- Tek bir diagnostic kosuda semaya uygun bir changeset alinmis (oturum 2380–2383). **Bu, aday testin derlendigi, kesfedildigi, gectigi, coverage arttirdigi veya final replay'in gectigi kaniti DEGILDIR.**
- Normal MCP pilot kosulari generation asamasinda hata ile kalmis (1682–1688, 2505–2512, 2534–2541). Pilot wrapper'inda `job_id:null` varken dispatch logunda job ID var; wrapper/response parsing kusuru ile urun kusuru ayrica teshis edilmeli.
- Model kaynak istedigi, markdown dondurdugu, bos final, `tool-calls`, `finish=length` ve kesik JSON durumlari gorulmus. Bunlardan tek basina provider yuk/kota/kararlilik nedeni cikarilamaz.
- Kapanista 375/375 iddiasi var; fakat bu ek oturumda tum `npm test` kosusu aborted (1463–1478), gorunur son hedefli kosu 25/25 (2587–2589), onceki hedefli kosu 30/30 (1453–1456). Tam suite'in baska kaniti varsa ara; yoksa son HEAD'e bagli yeni tam kosu yap. Bu dosya 375/375 sonucunu yeniden olculmus saymaz.
- `release-verify exit 0` gercekte raporlanmis; ama mevcut verifier asagidaki gibi sadece sinirli yapisal kontroller yapiyor. Exit0, 210 gereksinimin kabul kaniti yerine gecmez.
- Kullanici pilotu durdurdu (2548–2550). Bu sinir butun kalan islerden once gelir.

### 1.3 Hazirlayan incelemesinin siniri

Guncel kaynaklar GitHub connector ile commit'e sabitlenerek okundu. Yerel runtime'da repo clone'u DNS nedeniyle alinmadi; 375 testin tamami, Windows/Docker/Maven veya kurum modeli burada yeniden calistirilmadi. Okunan kod ifadeleriyle 10 dar tekrar uretim yapildi: tool-calls tamamlanma, bos finalin timeout sayilmasi, branch-only red, exit0+XML failure baseline PASSED, hash-mismatch'i yok sayan export sonucu, NO_CGROUP'in memory probe'u gecmesi, POSIX backslash yolu, zero-branch son karar, suffix FQCN ve package SQL. Bunlar **ifade/fixture kontroludur**, tam uygulama testi degildir. Uygulayici normal MCP yoldan regresyonlari ekleyip gercek sinirlarla dogrulayacak.

## 2. Guncel kodda kalan bulgular

Asagidaki kimlikler yeni gorevde kapatilacak davranislari izler. Yorum satiri, import veya yardimci sinifin varligi kapanis degildir. Belirtilen path'ler 1925b12 commit'ine aittir.

| ID | Oncelik | Kanit / gozlenen kod | Zorunlu duzeltme |
| --- | --- | --- | --- |
| F01 | P0 | `workers/opencode/worker-client.ts`: `completedField` her dolu `finish` degerini tamamlanma kabul ediyor; `promptForJson` bos finali de `MODEL_TIMEOUT` yapiyor | Terminal state, intermediate tool step, empty output, truncation, HTTP/provider error, cancel ve gercek elapsed timeout ayri; nihai mesaj/request korelasyonu |
| F02 | P1 | `job-dispatcher.ts/generateCandidateFromWorker`: attempt yalniz basarili `promptForJson` sonrasinda yaziliyor; message/hash/usage null; parse oncesi `status:ok`; session cleanup finally yok | Dispatch oncesi durable attempt, tum sonuclar, typed failure, hash/session/message/usage, bounded retry ve owned cleanup |
| F03 | P0 | `worker-server-manager.ts`: sabit 14096, ortak temp XDG, config sadece ilk kez yaziliyor, tum provider/config ve process env kopyalanabiliyor; health owned child'i kanitlamiyor | Job/profil bazli izole config, secret allowlist, endpoint ownership/auth, process error/exit, config digest, deadline; yabanci server kullanma |
| F04 | P1 | Govde dosyasi basename suffix ile aranmis; mevcut testler ilk 5 dosya; `role-prompts.ts` 12000 karakterde kesip 'birebir' diyor; onceki hata/accepted set yeni istege tasinmiyor | Cozulmus sembol/path, ilgili dependency/test govdeleri, sinirli fakat acik context manifest, gercek repair feedback; sessiz kesme yok |
| F05 | P1 | `inventory-repository.ts`: `%Name` ile suffix FQCN; paket icin `%package.`; module listesinde source_set filtresi yok. `services.ts` listeyi dispatch'e somut hedef olarak vermiyor; dispatcher `endsWith('Test')` ile main sinifi eleyebiliyor | Tek typed resolver; main/test source set, exact module/FQCN, paket siniri, concrete target listesi; dosya adindan sinif turu cikarma |
| F06 | P0 | `build-plan.ts`: framework none ise runner'i cagirmadan exit0/NO_TESTS; XML parse hatalari yutuluyor; run exit0 ise failure/error sayilari status'u degistirmiyor | Framework yok / test yok / skip / bozuk rapor / basarisiz baseline ayrimi, fresh run delili, tam test envanteri |
| F07 | P0 | Build goals `test`, `test+jacoco:report`; affected modules fiilen komuta yansimiyor; JaCoCo yoksa instrumentation yolu yok; okuyucu yalniz root `target/site/jacoco/jacoco.xml` | Effective plan + agent/run/report provenance, per-module outputs, POM'a dokunmayan destekli olcum veya typed blocker |
| F08 | P0 | `candidate-loop.ts/applyOverlay`: aday orijinal proje test kokune kopyalanip geri aliniyor; slash'lar her platformda backslash yapiliyor | Tamamen ayri candidate workspace; native path guvenligi; orijinal checkout hic degismez |
| F09 | P0 | Aday dosyalari accepted klasorune kopyalaniyor, fakat sonraki run basinda bu setten workspace kurulmuyor; dispatcher `on_accepted` yalniz event/log | Immutable cumulative A+B seti, publish edilen gercek checkpoint, reddedilen C izolasyonu ve temiz final replay |
| F10 | P0 | Loop'taki `meaningfulGain` hala LINE-only; dispatcher son outcome'u en son XML'den tekrar kuruyor; branch 0/0 null ile karisiyor; budget/plateau ayrimi kayboluyor | Tek raw-counter evaluator; branch-only kazanc, diger metrikte gerilememe, applicable/N/A, accepted final evidence ve gercek stop reason |
| F11 | P0 | `resumeDispatch` yeniden `dispatch` cagiriyor; source/checkpoint/butceyi eski noktadan yuklemiyor. Cancel/pause lifecycle yaziyor fakat aktif worker/container'i durdurmuyor | Checkpoint'ten gercek resume, immutable contract/butce, owner generation/fence, abort/stop/reap ve gec cevap reddi |
| F12 | P0 | `services.ts`: ozel env yokken worker kapali; requested mode/model_profile kalici contract'a kismen girse bile goal/worker kararinda kullanilmiyor. Status/result mevcut checkout XML'ini 'trusted' okuyor | Acik report-only/generate ayrimi; secilmis model snapshot'i; worker eksigi plateau olmaz; tum yuzeylerde tek trusted evidence |
| F13 | P0 | `job-dispatcher.ts`: `iterations:[]`, test sayilari0, models[], `production_changed_files:0`, sabit PASSED; job COMPLETED rapordan once; failure yolunda rapor yok | Gercek collector/DB projeksiyonu; baseline+failure raporu; report publish ve lifecycle tutarliligi; bilinmeyen sayac sifir degil |
| F14 | P1 | `report-generator.ts` halen eski basit HTML; 'yorumlar AI tarafindan uretildi' metni var; test/metot detay veri kontrati yok | 06 gorunumu + facts-only v2 schema + gercek kayit adaptoru; model narrative tum ciktilarda yasak |
| F15 | P0 | `ReportExporter`: verification_passed yalniz missing uzunluguna bakiyor, hash_mismatch'i dikkate almiyor; extraFiles string; `join(root,name)` yeterli containment degil | Byte-guvenli manifest, hash+size+scope+job dogrulamasi, nested assets/binary .exec, traversal/reserved-name reddi, atomik publish |
| F16 | P0 | `docker-runner.ts`: provisioning `network:bridge`; allowed_mirrors fiilen ag filtresi degil. Paylasilan m2 mount rw; kullanici settings dosyasi execution'a baglaniyor. Capability probe normal gate'e bagli degil; `NO_CGROUP` memory success sayiliyor | Enforcement'i kanitli provisioning, credentialsiz execution, immutable seed/job overlay, gercek capability kapisi; bilinmeyen probe PASSED olmaz |
| F17 | P0 | `scripts/release-verify.mjs`: dosya/sayim/marker/tek entry mtime; actual suite/job/manifest kaniti yok. `catalog.json` AC/RG/PRO'yu grup olarak ve RT'yi NOT_RUN tutuyor | Tekil obligation/evidence ledger ve negatif kanitla bozulan bagimsiz verifier; eski README/state ile tutarlilik |
| F18 | P1 | Oturum `lint` icin bir hatayi 'kapsam disi' demis; tam test sonuclari/son prompt degisikligiyle test edilen digest mutabakati yok; gecici pilot scriptleri kalici harness degil | Lint/test/build tam kanit, bounded kalici fixture harness, redakte destek kaydi; pilotu tekrar acmadan diger asamalari bitir |

**Bu liste provider'in saglikli oldugunu da kanitlamaz.** Gozlenen arizalarda urun katmaninda bulunan sebepler duzeltilmeden kalan tum sorunu provider'a atfetme. Onceden '16/16 tamam' denilen paketler kaynak/normal-yol kanitiyla yeniden degerlendirilir; tum eski kazanimi silip sifirdan yazma.

## 3. Onceki gereksinimlerin devri ve yeni is sirasi

Onceki 003 v2.0 arsivi ve onun referans verdigi 001/002 arsivleri normatif kaynak olmaya devam eder. Eski toplam **210 kabul kimligi** korunur; 004 maddeleri bunlarin yerine daha dar bir liste DEGILDIR. Son kullanici kararlarini sadece Bolum 0.1'de belirtilen alanlarda supersession olarak isle. Canli pilot/benchmark ertelenmesi implementasyon kusurlarini waiver'a donusturmez.

`ai/acceptance/catalog.json` icinde her AC/RG/RT/PRO kimligi icin tekil kaynak bolumu, normatif davranis, required evidence level, uygulama path'i, test/run/predicate kimligi, mevcut status ve varsa defer/waiver kaydi bulunacak. Bir test birden cok gereksinime baglanabilir ama her birini gercekten karsilamasi gerekir. Aralik satiri `AC01-AC70 tamam` delil degildir. Yeni asagidaki N01–N64 kabullerini de tekil izle; ayni davranisin eski kimlikleriyle eslesmesini yap, sahte test sayisi sismez.

Uygulama paketleri:

| Paket | Kapsam | Beklenen cikis |
| --- | --- | --- |
| W00 | Devir, kaynak/hash, ledger ve test baseline'i | Guncel durum, onceki gorev arsivi, asagidaki testlerin map'i; pilot pause korunmus |
| W01 | Typed worker state, context/profil, attempt/cleanup | Canli modele cikmadan yerel HTTP/worker fixture'lariyla kanit |
| W02 | Guvenli runner/workspace/provisioning | Original degismeden model doubles + gercek izole Maven kosulari |
| W03 | Baseline-only ve Maven/JUnit/JaCoCo collector | Modelsiz gercek baseline raporu, no-tests/failure/blocked ciktisi |
| W04 | Cumulative adaylar, repair, exact coverage, final replay | Accepted A+B, C red ve ortak sonuc |
| W05 | Kalici contract, checkpoint, resume/cancel | Ayni job/hashes/butce ve gercek owned process sonlandirma |
| W06 | Facts-only data contract + 06 renderer | HTML/JSON/text/print/status/result ayni dogrulanmis olcum |
| W07 | Artifact/patch/guvenli export ve uygulama siniri | Gercek diff, manifest, binary dosyalar, onaysiz apply reddi |
| W08 | 06 UI/regresyon/erisim/performans | Onaylanan sade gorunum, calisan detay/filtre/yazdirma, XSS ve veri sizintisi yok |
| W09 | Yerel paket/kurulum/ops kalanlari | PS1'siz fresh install/upgrade/rollback/backup/restore/owned uninstall kaniti |
| W10 | Tum obligation'lar ve release verifier | Sahte/eski/eksik/ertelenmis kanitta full-release non-zero |
| W11 | Nihai teslim ve model devri | Dogru yerel kabul, ayri canli kabul durumu, evidence links ve tek sonraki adim |

W01'de provider cevabi bekleyerek butun gorevi tuketme. Canli deneme izni olmadigi icin deterministik fixture ile gereken davranislar gelistirilir. W03/W06 rapor-only hattini erkenden calisir teslimat yap; final raporun gercek veriye baglanmasi W04/W05 ile tamamlanir. Paket tamam demeden normal composition'daki cagri zincirini kanitla.

## 4. W00 — Baslangic, kaynak koruma ve test kaniti

1. AGENTS, yeni AKTIF_GOREV, PROJECT_STATE, BACKLOG, ACCEPTANCE_MATRIX, son checkpoint/handoff ve ilgili ADR'leri oku. AGENTS ve backlink'leri yeni tek aktif gorevi gosterecek sekilde guncelle; eski tarihsel iddialari kayit olarak tut.
2. Repo-local Git kimligi, remote/branch/HEAD/status ve staged diff'i kaydet. Kullanici dosyalarini veya yabanci process/container'i temizleme. Yeni dosyalara sahiplik kaydi koy; genel temp temizligi/docker prune yapma.
3. Referans/arsiv hash'lerini kontrol et. Aktif gorevin eski kopyasinin hash'i eslesmiyorsa branch farkini incele, ustune yazma.
4. Uygulama kaynaklari + prompts/config/schema/lockfile/helper/scripts/test/reference assets icin canonical relative path + bytes kullanan deterministic code digest olustur. `source_commit`, `verified_code_digest`, `delivery_commit` ayri alanlar.
5. Lint, typecheck, build ve tam test suite'i shell pipeline'iyle exit code kaybetmeden calistir. PowerShell `Select-Object` / `Write-Output` komutlarini yeni standart haline getirme. Node collector bounded stdout/stderr loglar, actual exit/signal/timeout, komut ve sureyi kaydeder. Test basarisi son echo/pipe exit'iyle belirlenmez.
6. Takilan testte tam run'i basarili yazma. Hangi test/process asamasinda takildigini zamanli fixture ve owned cleanup ile ayristir; ilgili testleri filtreleyerek son 'tam suite' kabulunu olusturma. Kismi kosu ayri etiketlenir.

## 5. W01 — Model adapter'i ve test uretim kontrati

### 5.1 State machine ve hata siniflari

`prompt_async` HTTP cevabi, model cevap parcalarinin tamamlanmasi ve kullanisli changeset alinmasi farkli asamalardir. Kurulu OpenCode surumunun `/doc` ve resmi schema'sini incele; version/profile bilgilerini kaydet. Session/message/parent-request korelasyonu olmayan son mesaj kabul edilmez. Yeni request'ten onceki gecerli JSON, yeni istegin sonucu olamaz.

Asgari ayrimlar: REQUEST_ACCEPTED, IN_PROGRESS, TOOL_STEP, FINAL_TEXT, EMPTY_FINAL, OUTPUT_TRUNCATED, INVALID_JSON, SCHEMA_MISMATCH, AUTH_OR_PERMISSION_ERROR, TRANSPORT_ERROR, REQUEST_TIMEOUT, CANCELLED. Isimler mevcut domain ile eslenebilir; hepsinin `MODEL_TIMEOUT` olmasi kabul edilmez.

- `finish=tool-calls`, tek basina butun session'in bitmesi degildir. Yasak/beklenmedik tool varsa policy kontrolu ve typed error; desteklenen izinli ara adim varsa gercek session bitisini bekle. Interaktif question/skill/todowrite/MCP araci gerektiren istemsiz agent dongusunu acarak cozme.
- `finish=stop` + tamamlanmis bos final: EMPTY_FINAL. `finish=length`: OUTPUT_TRUNCATED. Provider error ayrintisi maskelenerek kendi koduyla kaydedilir. Hicbiri zaman dolmadan TIMEOUT olamaz.
- Part streaming devam ederken kesik JSON'u parse etme. Nihai metin parcalari sirali ve ayni message'a ait olmali. Dusunme/reasoning content, final text veya Java JSON'u yerine kullanilmaz.
- HTTP create/prompt/list/abort dahil tekil deadline ve tum attempt deadline'i vardir. Timeout gercek saat/sure deliline baglanir; session abort ve process/container cleanup sonucu kayitli olur.
- Ust MCP response ve diagnostic wrapper ayni schema ile okunur; job olusmussa hatada da job_id kaybolmaz. Sonuc/rapor yolu dururken 15 dakika null handle poll edilmez.

### 5.2 Attempt, retry ve output

Worker attempt kaydi model istegi yapilmadan once yazilir. Job/target/iteration/parent-checkpoint/attempt/session/request/model-profile-digest alanlari baglanir. Basarili, bos, kesik, sema hatali, HTTP hatali, timeout, aborted ve tool-policy sonuclarinin hepsi bitirilir. Unknown usage null'dir; 0 uydurulmaz. `status:ok` yalniz JSON parse ve changeset schema gectikten sonra verilir; compile/test kabulunu ifade etmez.

Retry sayisi, overall deadline ve kalan job butcesi kalicidir. Auth/model bulunamadi/schema-desteklenmiyor hatalarinda ayni istegi sinirsiz tekrarlama. Transient retry ve format repair ayri, bounded ve kayitli olacak. Yeni retry onceki session'in halen aktif kaldigi ust uste isler uretmez. Kullanici canli pilotu durdurdugu icin bu davranislar once yerel endpoint fixture'larinda dogrulanir; bu turda canli provider denemesi yoktur.

Her worker rolunun output schema'si explicit secilir. Test ureten role CandidateChangeSet; ic analiz rolune ayni changes alanini zorlayan ortak prompt uygulanmaz. Ic analiz/review kullaniliyorsa ciktisi rapora veya nihai kabul kararina dogrudan gecemez. Desteklenmeyen role serbest fallback yok.

Changeset create/modify test kaynagiyla sinirli, before-hash veya expected-absence, encoding/EOL, target/module ve parent digest'e bagli olmalidir. Delete veya bilinmeyen alan/aksiyon sessizce kabul edilmez. `new_content` gercek tam dosya veya tanimli patch parser'inin sonucu olur. Modelden 'production degismedi', 'kabul edildi', 'coverage95' alanlari istenmez/kabul edilmez; bunlari collector hesaplar.

### 5.3 Baglam ve profil

Hedef dosyasi tam sembol kimligi/verified relative path ile bulunur. Ayni basename farkli pakette, nested class, custom root, multi-module ve ilgili testin altinci dosya olmasi senaryolari kapsanir. Gercek hedef class/metot govdesi + ihtiyacli constructor/import/field/dependency imzalari + mevcut ilgili test/helper govdeleri verilir. Kritik kodu ilk 12000 karakterde sessizce kesme; bolumlenmis context, satir araligi/hash, disarida kalan parcalar ve replan karari kayitli olacak.

Cumulative accepted test seti, gercek compile/failure diagnostics, remaining coverage, onceki changeset/error fingerprint ve kalan repair butcesi sonraki istege gider. Yalniz ayni prompt'u tekrar gondermek repair degildir. Baseline/aday ciktisina bakip yanlis assertion beklentisini sorgusuz mevcut degeri kabul edecek sekilde degistirme.

Requested `model_profile` ve frozen config gercek worker istegine yansir. Kullanici global config'i sonradan degistirse eski job sessizce model degistirmez; acik model degisimi contract revision/handoff olur. Tam provider/model ID korunur; modeli dokumanda onerilen varsayilanlarla kurum ayarini ezerek calistirma.

### 5.4 Owned worker

Per-job veya digest-keyed guvenli cache'li, sahipligi belli minimal worker config; selected provider icin gereken environment secret referanslari allowlist'lenir. Tum process.env/provider nesnesini veya kullanici HOME config'ini kopyalama. Dosyada literal secret bulunursa loglamadan guvenli aktarim veya typed blocker; 'referanslari koruyoruz' yorumu secret-guvenligi kaniti degildir.

Yabanci listener'a baglanmayan port/secim/nonce-auth el sikismasi; startup process error/exit ve gercek timeout; profil config degisiminde stale dosya reuse yok. User project AGENTS/plugins/skills/MCP mirasi etkisi desteklenen izolasyonla kesilir. Worker icin context verilmis bos kontrollu dizin kullan; korumayi kaldirarak read/bash/write acma. Windows .cmd fallback onayli guvenli argv kuraliyla; POSIX executable PATH cozumlemesi dogru. Her tamamlanma/hata/cancel yolunda owned session/server kaynagi try/finally/dispose kontratiyla kapanir.

## 6. W02 — Izole calisma, dependency hazirlama ve process sahipligi

Normal MCP baslangicinda sadece Docker daemon/image varligina degil, aktif runner profilinin gercek capability sonucuna bakilir. Kaynak/POM read-only, non-root, gerekli output writable, memory/CPU/PID/time limitleri, secret ve network sinirlari kanitlanir. Probe komutunun calismamasi, arac yoklugu veya `NO_CGROUP` basarili olcum DEGILDIR. Probe sinirlari ve runner image/config digest'i eslesir; degisince yeniden dogrulanir.

Job alani: immutable source snapshot; ayri accepted snapshot; her aday icin parent+changeset'ten kurulan workspace; run'a ozel outputs; runner'in yazamadigi trusted collector store. Original checkout, dirty testler, POM, config ve dosya zamanlari aday olcumu icin degistirilmez. Tum `/work` rw veya customer `target` dizinine yazma yerine resolved module output mount'lari job store'a yonlendirilir. Windows/Unix separator, symlink/junction/hardlink/ADS/UNC/traversal ve uzun yol sinirlari yazmadan once dogrulanir.

Dependency provisioning bir mirror listesi yazmaktan ibaret degildir. `network:bridge` + Maven settings tek basina egress allowlist olamaz. Onayli proxy/firewall/network adapter enforcement'i ve negatif erisim testi gerekir. Destekli enforcement yoksa BLOCKED_DEPENDENCIES; interneti acarak ilerleme yok. Provisioning de untrusted POM/plugin/extension girdisi calistirabilecegi icin izoledir.

Kullanici `~/.m2/settings.xml` icindeki sirlar execution container'a veya modele baglanmaz. Provisioning icin gereken kimlik kisa omurlu/ayri kapsamda tutulur; execution'a credentialsiz gerekli konfigurasyon verilir. Global writable m2 yerine manifest/hash dogrulanmis seed + job'a ozel writable cache/overlay; job A, B'nin trusted dependency'sini degistiremez. Cache varligi ve content fingerprint'i dogrulanir; 'enabled && allowed_mirrors.length' her run'da gereksiz download dongusu yaratmaz.

OCI container ID/labels/cidfile ve PID+start identity, job/attempt/generation ile kaydedilir. CLI process'ini oldurmek container'in durdugunu kanitlamaz. Stop -> bekleme -> kill -> inspect/reap; Windows ve POSIX farkli destekli yollarla. Timeout dahil butun bitislerde kaynaklar kapanir; yalniz owned kaynaklara dokunulur. Kaynak/log limitleri bounded streaming ile uygulanir, tum stdout'u sinirsiz RAM'de biriktirme.

## 7. W03 — Ilk standart cikti: modelsiz baseline raporu

### 7.1 Son kullanici akislari

**A. Yalniz olcum:** 'Bu projenin mevcut test ve coverage raporunu olustur.' Kullanici tek MCP yuzeyinden proje veya secili hedeflerle baseline-only/report-only istegi verir. Hedef yuzde zorunlu degildir. Sistem model key, worker server veya model erisimi olmadan kesif -> guvenli mevcut test run -> coverage collector -> 06 raporu yapar. Test uretmez, kaynak degistirmez, modele aciklama yazdirmaz.

**B. Test iyilestirme:** 'PaymentService coverage %90 olsun.' Once ayni baseline ve rapor/checkpoint olusur; ardindan generate/repair/candidate sureci baslar. Baseline HTML ve JSON model ilk adayini uretmeden kullanilabilir olmali. Hedef zaten saglanmissa gercek `TARGET_ALREADY_MET`, yeni test/model katkisi 0; kazanc uydurulmaz.

**C. Engelli/basarisiz olcum:** Framework/config/dependency/izolasyon eksik, mevcut test failure/error, bozuk XML veya test skip durumda da mevcut bilinenler ve tipli durumla baseline raporu olusur. Olculemeyen coverage `UNAVAILABLE`; sifir, N/A veya hedef basarisi degildir. Rapor dosyasi uretimi bile engelliyse typed storage/report error ve onceki trusted artifact korunur.

Yeni davranisi mevcut MCP schema/use-case/descriptor/dokumanlarina bagla. Mevcut mode alaninin degerlerini once oku; gerekirse surumlu yeni mode veya uyumlu arac ekle. Kullaniciya yeni komut satiri urunu acma. Baseline-only ile worker-disabled generate ayni sey olamaz: generate secili ama model yoksa BLOCKED_MODEL; plateau degil.

### 7.2 Effective build ve discovery

Maven reactor/modul/source-set/test-root/output-root/JDK/test framework/JaCoCo bilgisi guvenli effective plan'dan gelir. Parent/profile/pluginManagement/argLine/Surefire/Failsafe konfigurasyonu dikkate alinir. Java metadata helper mevcutsa gercek yola bagla; sadece testlerde kullanilan ayri adapter yeterli degildir. Modelin imza/fixture tahmini kesif sayilmaz.

`NO_TESTS`, `BLOCKED_TEST_FRAMEWORK`, `TESTS_SKIPPED_BY_CONFIG`, `NO_DISCOVERED_TESTS`, `REPORT_MISSING`, `MALFORMED_TEST_REPORT`, `BASELINE_FAILED`, `UNSTABLE` ayrimlarini mevcut domain ile esle. Framework kesfi basarisizken sahte `exit_code:0, duration:0, command:[]` gercek kosu olarak saklanmaz. Gercek run yapilmadiysa `run:null/executed:false` ve neden olur.

SkipTests/skipITs/maven.test.skip/config excludes raporda gorunur. Kullanici politikasini sessizce degistiren POM edit, yeni exclusion veya disable ile test basarisi olusturma. Calistirma icin onayli, dar runtime flag profili gerekiyorsa acik contract'a bagla; konfigurasyonun literal skip politikasini otomatik override etme. Sadece skip calismasi sonucunu gecmis test kosusu gibi etiketleme.

### 7.3 JUnit/Surefire/Failsafe veri modeli

Sadece suite sayilari degil, test sinifi/metodu, engine, module, display name kaynagi, source path/hash/line range, invocation/parametrization kimligi, outcome, duration, failure/error/skip kaynagi ve retry attempt kayitlari tutulur. Test tanimi ile calistirilmis invocation farklidir. Bir test birden fazla hedef sinifla iliskili diye toplamda iki kez sayilmaz; unique key ve aggregation scope aciktir.

Failure/error/skip/passed birbirinden ayri; run exit0 olsa bile XML failure/error varken PASSED olamaz. Bozuk XML silently continue edilmez; dosya/parse hata kodu kaydedilir, etkilenen sonuc gecersiz veya eksik olur. Report directory yoklugu 0 testle es anlamli degildir. Tekrarlanan/stale suite'ler ve ayni testin rerun kayitlari ayristirilir. Paralel surelerin toplami wall-clock olarak gosterilmez. Baslangicta bozuk test sonradan AI regresyonu olarak yanlis atanmaz.

### 7.4 JaCoCo collector

Mevcut calisan konfigurasyon korunur. Eksikse customer POM'u, dependency versiyonu, fork davranisi ve coverage exclusion'larini degistirmeyen destekli harici agent/report plani kullanilir; bunun gercek JVM'e baglandigi kanitlanir. Metrik uretmek icin sirf `jacoco:report` cagirmak yeterli sayilmaz. Desteklenmeyen profil typed blocker ile durur; eski XML veya goruntuden oran kullanilmaz.

Her run izole, taze `.exec`, class/binary ve XML/HTML ciktilariyla baglidir. Module/report-aggregate outputlari tek planla cozulur; root path hardcode olmaz. Multi-fork outputlari kontrollu merge edilir. Collector run ID, source/build digest, target identity, image/tool versions, timestamps ve artifact hash'leriyle `RunEvidence` uretir. Exception/try-catch kapsamindan JaCoCo branch sayaciymis gibi yeni dal uydurma; line debug metadata yoklugu ve class mismatch acikca gosterilir.

## 8. W04/W05 — Aday kalitesi, accepted set, checkpoint ve final

### 8.1 Tek hedef ve coverage karari

Hedefler cozulmus module+source-set+FQCN+symbol/path kimlikleriyle frozen contract'ta tutulur. Package hedefi boundary-aware ve module hedefi source-set-aware'dir. Bir module selector'ini sonra class gibi yeniden arama. `PaymentService` ile `FakePaymentService`, ayni simple name farkli modul, production `LoadTest` sinifi ile test source sinifi ayrilir.

Tum esitlik/kiyaslar ham covered/missed ve hedefin tam degerinden yapilir. Goruntuleme yuzdesinin yuvarlanmasi sonucu etkilemez. Buyuk tam sayi/overflow, negatif/NaN, total uyumsuzlugu reddedilir. Aggregate yuzde uygun scope'taki raw toplamdan; sinif yuzdelerinin ortalamasindan gelmez. Her applicable hedef icin LINE/BRANCH ayri; ortalama ile tek hedef gizlenmez.

- Diger gerekli metrikte gerileme yokken branch-only kazanc kabul edilebilir. Metrik gerilemesi veya source/scope/payda degisikligi sirf line artiyor diye kabul edilemez.
- `BRANCH total=0` ancak gercek ve dogru kapsamli raw counter ile NOT_APPLICABLE. XML yoklugu veya yanlis sinif UNAVAILABLE/INVALID'dir. Tum ilgili metriklerin bos oldugu hedef otomatik basarili olmaz.
- Plateau, butce, ortam/model hatasi, user cancel ve kaynak degisikligi ayri sonuclardir. Generation hata/worker disabled `TARGET_NOT_MET_PLATEAU`ye donusturulmez.
- Hedef degerler degismediginde loop/dispatcher/DB/MCP/HTML/JSON/text/print ayni evaluator'dan ayni karar alir. Final sonradan LINE-only veya root XML ile yeniden yazilmaz.

### 8.2 Accepted set ve repair

Her candidate parent accepted snapshot'tan kurulur. A kabul -> B, A'yi iceren workspace'te kosar -> C red -> final A+B'yi temiz workspace'te tekrar calistirir. A veya B testleri kaybolmaz; C'nin coverage/artifact'i accepted set'e karismaz. Modify isleminde resulting bytes, parent before hash, test source'lar ve EOL korunur.

Compile, discovery, run, existing-tests retention, policy/static checks ve coverage kapilari siralidir. Sadece test dosyasi sayisinin artmasi kabul degildir; yeni testin gercekten kesfedilip calistirildigi kayitli olur. Source comments icinde 'assert' var diye anlamli assertion sayma; helper/expected exception/verification davranisini unsupported ise kesin basarisiz gibi yorumlama. Statik kontrol siniri tool/rule ID ile gosterilir. Assertion kalite kanaati modele raporlatilmaz.

Her red/repair karari structured code, rule version, input ref ve gercek diagnostic'e baglanir. Model yorumunu `decision_reason` diye rapora sizdirma. Test beklentisini sadece 'test gecsin' diye degistirme; onceden kabul edilmis kosul/source/test kontrati korunur. Quality gates'in ic modelleri olabilir fakat son karar yetkisi deterministik kapilardadir; rapor reviewer kanaati tasimaz.

### 8.3 Durable checkpoint

JobContract'in yalniz hash'i degil yeniden kurulabilir tam secretsiz icerigi/version'u kalici olsun. Budget, source manifest, resolved scopes, profile refs ve policy snapshot'i orada bulunur. DB+artifact schema migration ve eski job uyumlulugu test edilir.

Candidate output yaz -> hash/size/scope doğrula -> immutable artifact publish -> checkpoint transaction -> accepted pointer/fence update. Yarim dosya/DB pointer accepted olamaz. `on_accepted` yalniz log degil, gercek accepted manifest/checkpoint yayinlar. Job, target, iteration, run, worker attempt, control result, patch ve report relation'lari nullable placeholders ile sahte tamamlanmaz.

Resume once current source/build/accepted/evidence digests kontrol eder. Eski model sohbeti gerekli degildir. Tamamlanmis asamalar tekrarlanmaz; yarim run gerekiyorsa yeniden kosar ve onceki attempted state gorunur kalir. Kalan iterasyon/repair/no-progress/butce korunur; global config degisimi bunu sifirlamaz. Ayni job_id; yeni session olabilir. Iki resume yarismasinda tek owner, generation/fencing ve bounded heartbeat. Eski owner dosya/pointer/outcome yazamaz.

Cancel/pause/lease-loss/disconnect -> yeni candidate kapali -> owned session abort -> child/container stop/reap -> terminal/pause state. Gec basarili run CANCELLED/PAUSED'i COMPLETED'e ceviremez. Hard-kill sonrasi orphan owned kaynaklar kimlikle bulunur; yabanci kaynaga dokunulmaz.

### 8.4 Final ve teslim

Final kaynak, accepted set ve build planindan temiz run ile olusur. Yalniz trusted collector sonuclari, asagidaki ReportEvidence kontratina projekte edilir. Son XML veya aday copy klasoru tek basina final degildir. Hedefe erisilmezse son dogrulanmis kazanimi ve test patch'ini koru; daha dusuk sonucu basari etiketiyle gizleme. Gercek modelde kaliteli test uretilebilecegi, deterministik fake response fixture'inin gectiginden cikarilmaz.

## 9. W06 — Raporun tek veri kontrati: model yorumu YOK

### 9.1 Sorumluluklar

`Model -> yalniz aday test degisikligi -> guvenli runner + collector + verifier -> versioned ReportEvidence -> 06 renderer / JSON / text / print / MCP`

Renderer model client import etmez; token/model erisimi olmadan yeniden rapor uretir. Rapor olusurken yeni Maven run da kendiliginden baslamaz; secili immutable kaniti render eder. Yeni olcum kullanici tarafindan ayri baseline/refresh job ile istenir. Gecmis rapor bugunun checkout'undan veri okumaz.

### 9.2 Asgari veri gruplari

Mevcut `ReportData.schema_version:1` ile uyum icin explicit adapter/migration yaz. Yeni kontrat versiyonlu ve runtime validated olacak; yalniz TS interface veya UI `projectInput` allowlist'i yeterli degil.

| Veri grubu | Zorunlu bilgi / kaynak |
| --- | --- |
| Report identity | schema/template/rule versions, report_id, job_id, source/checkpoint/run IDs, phase, generated_at, selected scope, preview/real classification |
| Proje ve hedefler | project/location/snapshot kimligi, module/source-set/FQCN/path, commit/dirty/build/source digest, requested metrics/targets |
| Runs | baseline/candidate/final, command/image/JDK/Maven/JaCoCo versions, exit/signal/timeout, wall time, discovery/result coverage validity |
| Coverage | INSTRUCTION/BRANCH/LINE/COMPLEXITY/METHOD/CLASS raw covered/missed; valid/applicable/source refs; before/after ayni kapsam |
| Test records | test definition + invocation IDs, engine/module/class/method/displayName provenance, source bytes/hash/line, outcome/duration, skip/failure/error raw record refs |
| Degisiklikler | test file/method sayilari ayri; existing/generated/modified kaynagi diff+attempt chain; create/modify preimage ve final hash |
| Control results | rule_id/version, input_refs, actual result code, observation/evidence state, metrics/thresholds; acik calistirilmislik bilgisi |
| Uretim metadata | requested/actual provider-model kimligi, attempt/session/message, generation/repair lineage, sure/usage known/null; yorum/puan yok |
| Artifact records | relative approved path, kind, media type, bytes, SHA-256, sensitivity, source/run/checkpoint relation, availability/integrity state |
| Sonuc | job lifecycle/outcome, report publication/integrity, coverage goal status, test run status, apply state; ayri alanlar |

`0`, `null`, `NOT_RUN`, `NOT_APPLICABLE`, `UNAVAILABLE`, `INVALID`, `REDACTED` ayni anlamda kullanilmaz. Missing field varsayilan PASSED veya 0 uretmez. Beklenmeyen/yanlis tipli sayisal veri red edilir; modelin `riskScore`, `summary`, `review`, `recommendation`, `assertion_rationale`, `reasoning`, `verdict` gibi alanlari izinli report schema'ya giremez. Forbidden field'in reddi/sanitization davranisi belirli ve testli olsun; hem UI hem export/print ayni projection'dan gelir.

### 9.3 Rapor metinlerinin kaynak siniri

Izinli uc tur:

1. **Kaynakta bulunan ham kayit:** Test metot adi, gercek kaynak anotasyonundan `@DisplayName`, escaped test kodu, runner XML/log hata veya skip kaydi, path/source ref. DisplayName dogrulanmis semantik aciklama degil kaynak etiketidir; kaynagi baglanir. Kodun icindeki modelce yazilmis yorum ham kod olarak gorulebilir fakat rapor anlatimina tasinmaz.
2. **Aracin olctugu sonuc:** raw counters, process exit, kaynak hash karsilastirmasi, statik rule sonucu, discovery, mevcut testlerin korunumu. Kaynak artefakti ve tool version gerekir.
3. **Sabit sablon + deterministik hesap:** 'Satir hedefi saglandi', 'Dal hedefi saglanmadi', 'Veri yok', 'Kontrol calistirilmadi', known missing paths vb. Her sonuc rule_id/input ref'ten tekrar hesaplanabilir.

Izinli olmayanlar: isimden Turkce davranis aciklamasi uretmek, testin is kurali dogrulugunu yorumlamak, business-risk puani, 'kapsamli/guclu/yetersiz' kanaati, model hatayi yorumlasin, 'inceleyen/onaylayan model' bolumu. Sabit metin dahi desteklenmeyen anlam tasiyamaz; coverage artisi tum yazilimin dogrulugunun kaniti gibi yazilmaz.

Model plan/analysis/repair icin ic veri kullaniyorsa rapor katmanina giden yol allowlisted collector interface ile kesilir. Raporun kaynak belgesine ic model yorumunu 'tool finding' olarak yeniden adlandirip koymak YASAKTIR. Agent'in kendi rapor JSON'unu doldurmasi yerine rapor motoru kayitlari okur.

### 9.4 Coverage ve test hiyerarsisi

Proje -> modul -> paket -> production sinifi -> uygulama metodu; test result hiyerarsisi modul -> test sinifi -> test metodu/invocation olarak ayrilir. Sinif-test iliskisi explicit mapping/static reference veya per-test execution kaniti turuyla kaydedilir. Isim benzerligi coverage attribution olamaz. Per-test coverage yoksa 'Olculmedi'; iliski bilinmiyorsa test sinifi bagimsiz listelenir, data kaybolmaz.

JaCoCo'nun class/report seviyesindeki LINE sayacini metot LINE toplami olarak uretme; metotlar ayni source satirini paylasabilir. METHOD/CLASS kapsam sayisini `lineCovered>0` sezgisinden cikarma; ilgili raw counter'i kullan. 06'nin temsili veri setinde ortusmeyen metotlardan toplama ve line bazli basit method sayimi **production'a tasinmayacak**. Her seviyenin kendi raw sayaci/uygun merge kaniti olur. N/A etiketine her zaman 'dal yok' yazma; LINE/BRANCH ve diger sayaclar kendi applicability nedenini gosterir.

Gecmis before/after kapsam veya source/binary uyusmuyorsa delta hesaplama; NOT_COMPARABLE olarak goster. UI filtresi coverage hedefinin paydasini degistirmez; 'secili filtre ozeti' veriliyorsa resmi hedef sonucundan ayri adlandir.

## 10. W06/W08 — Revizyon 06 tasarimini urune bagla

### 10.1 Onayli gorunumu koru

06 ayni zamanda 05'in hafif, ferah gorunumunu koruyan referanstir. Kullanici 04'te ic ice cok border/kart olmasini reddetti. Yeni dashboard tasarlama; dark theme, yogun mavi, rainbow, gradient/glow, bol bol kart/kenarlik ekleme.

- Ozgun gomulu Innova SVG'nin cizimi, orani ve renkleri degismez; uydurma fontla logo yazilmaz. Referanstan tek asset olarak cikartilabilir; hash/provenance tutulur.
- Acik slate/beyaz, koyu metin, az marka vurgusu; ana bolumler bosluk + baslik + ince ayirac. Acik sinif detayi tek hafif tonlu yuzeyde.
- Ust bolumler aynen: **Genel bakis, Sinif & testler, Kontrol sonuclari, Uretim kayitlari, Kanitlar**. UI metinleri gercek Turkce karakterlerle yazilir; ASCII zorunlulugu commit metnidir.
- Sinif detaylari: **Test kayitlari, Metot kapsami, Kontrol sonuclari, Kaynak & kanit**. Teknik test adi birincil; varsa kaynak DisplayName ikincil. Kaynak kodu/hata metni salt okunur.
- Baslangic/Ilerleme/Sonuc gorunumleri yalniz mevcut snapshot'larla etkin. Olusmamis final icin buton bastiginda ornek veri gelmez; 'Bu asamanin raporu yok' durumuyla kapali/erisim belirli.
- Paket/module/class/test arama, module/status/origin filter, sayfalama, sinif ac-kapa, method/test dialog, kaynak kopyalama, aktif section scroll takibi, keyboard/tab/focus/Escape ve mobil 2x2 alt sekmeler korunur.

### 10.2 Prototip ile urun render'i ayrilsin

Referans HTML birebir kalir; ornek/test fixture'lari sadece test/demo dizininde. Production renderer'a yalniz verified report payload girer. Mevcut HTML'deki hazir static body, inline `report-data`, `DEMO/GIVEN`, print-view, export fonksiyonlari ve sabit model listelerinin **tum** yollarini gozden gecir. Bir JSON tag'ini degistirip initial HTML/no-JS/print/metadata icinde ornek isim-sayi birakma.

Gercek raporda `isDesignPreview:false` yazmak tek basina gerceklik kaniti degildir; collector provenance bunu belirler. Tasarim/demo secici gercek customer raporuna gomulmez. Demo modu ayrik entrypoint veya test fixture'i olabilir; runtime'da fallback degildir. Gercek raporda paylasilan ekran goruntusu verileri asla test sonucu yerine kullanilmaz.

Renderer CSS/JS/data/template parcalarini bakimi yapilabilir katmana ayir. Tum HTML'i modelin yeniden yazmasi yerine mevcut markup/component/semantics korunur. Runtime paket gerekli template/logo/script/style dosyalarini beraber tasir; temiz kurulumda eski basit renderer fallback'i olmaz. Template/schema version ve referans SHA kayitli olacak.

### 10.3 Tum ciktilarda esitlik

HTML metrik/status, rapor JSON, MCP `test_status/test_result`, summary.txt ve print ayni immutable ReportEvidence'dan gelir. Rapor-only model erisimi olmadan calisir. JSON download secili stage'in resmi kaydini verir; dosya SHA'sinin hangi byte scope'a ait oldugu aciktir. Tum embed dataset hash'ini secili JSON'un hash'i diye yazma.

Print tum secili rapor snapshot'inin kayitlarini kapsar; UI filtre ve sayfa siniri nedeniyle testler kaybolmaz. Buyuk raporda print kapsam/limit varsa acikca belirtilir; ilk 6 testi tum testler gibi sunma. Print standardi ayni dogru statuslari kullanir; optional PDF dosyasi otomatik uretmek bu isin yeni zorunlu servisi degildir, tarayici yazdirma yeterlidir.

### 10.4 UI guvenligi ve performansi

Veri, HTML degildir. Metinler context-aware escape edilir; raw `innerHTML` veya script interpolation ile source/test/error/comment icinden executable HTML cikamaz. JSON `<script type=application/json>` icinde `</script>`, `<`, Unicode separator ve bozuk karakter fixture'lari test edilir. Data'dan gelen href/ID/selector/copy values validasyona tabidir; javascript/data-executable/external artifact linkleri yok.

HTML offline acilir; harici JS/font/CDN/model endpoint/network fetch yok. CSP template'e uygun ve testli olacak; tercihen sabit script hash/nonce, dynamic data icin guvenli embed. CSP tek basina escaping alternatifi degil. Trusted logo disinda keyfi SVG/script inline alma. Buyuk kaynak/log code bloklari limitli, kesilen bolum isaretli; tam artifact varsa gercek link.

Browser kontrolleri Chromium + WebKit'te desktop/tablet/mobile, 320/390/430/768/1280/1920 px; mevcut screenshot referansina gore gozle ve otomasyonla. Sticky nav ustuste binmesi, dialog icindeki scroll, yatay tasma, odak ve uzun FQCN/test ismi icin kontroller. Ayni veri fixture'iyle gorsel golden al; runtime farklari gorunumu yeniden tasarlama bahanesi olmaz. Ozel erisilebilirlik denetim araci olmasa da keyboard/focus/label/contrast akislari gercek test edilir. Onbinlerce testte arama ve paging UI'i kilitlemez; butun test kodu tekrar tekrar DOM'a basılmaz.

## 11. W07 — Kanit, export, gercek test patch'i ve gizlilik

Rapor artifacts tablosu yalniz gercekte yayinlanan ve kaydi eslesen dosyalari linkler. 'JaCoCo XML/HTML rapor dizininde' sabit cumlesi yerine exact relative link + size/hash/availability. Missing/withheld/redacted/unavailable farklidir. Nested JaCoCo HTML assetleri ve binary `.exec` UTF-8 string'e cevrilmez; byte API ile export edilir. Her artifact job/run/checkpoint/source zincirine baglidir.

Export guvenligi: canonical path containment, symlink/hardlink/traversal/UNC/ADS/reserved-name kontrolleri; nested directory kontrollu olusturulur; manifest/index/report.json dosyalari extraFiles ile ezilemez. Eksik **veya** hash_mismatch **veya** size/scope/foreign-job uyumsuzlugu `verification_passed:false`; `verifyExport()` parametresiz bos listeyi dogrulamak yerine canonical manifest'i yukler ve dogrular. Corrupt manifest/yanlis schema fail-closed.

Rapor json/html/manifest birbirine dogru baglanir: manifest kendini hash'lemek zorunda degil; hash kapsam kurali acik olur. Gecici dizine yaz -> fsync/uygun durability -> byte validation -> atomik rename/pointer. Process ortasinda kesilirse onceki trusted report calisir. Lifecycle 'COMPLETED' rapor ve checkpoint yayiniyla tutarli transaction/durable event sirasi sonunda verilir. Rapor yazma hatasi test sonucunu yalan yapmaz ama teslim state'i REPORT_FAILED olur; kullanici bilgisi kaybolmaz.

Changes.patch/diff accepted test dosyalarinin immutable before/after halinden uretilir. Patch-only sonucu bos mesaja indirgenmez. Mevcut testlerin silinmedigi/disabled edilmedigi, production/POM'un degismedigi dogrulanmis kontrollerle gosterilir. Workspace apply yalniz onayli adapter + job/checkpoint/root/digest + before hash'lere bagli acik onayla; offline HTML butonu ile kaynak yazilmaz. Onay adapter'i yoksa PATCH_ONLY, apply verified denmez. Eski onayli apply gereksinimleri ledger'da gercek durumuyla korunur; basarili kalem diye isaretlenmez.

Yerel tam artifact paketi hassas olabilir; varsayilan otomatik dis paylasim yok. Paylasim/redacted export src/URL/absolute path/token/headers/source code gizliligi politikasiyla uretilir. Maskelenmis dosyanin yeni hash'i orijinalden ayri; hassas dosya cikartildiysa manifest linki sahte mevcut kalmaz. UI tooltip/HTML source/print/JSON/download/manifest/supportbundle dahil narrativa/secret sizintisi test edilir.

## 12. W09/W10 — Isletim, kurulum ve gercek kabul kapisi

### 12.1 Onceki olgunluk kapsami korunur

003 v2.0'in migration, backup/restore, upgrade/rollback, diagnostics, GC/retention, SBOM/lisans/SCA, protocol compatibility, benchmark corpus, bounded PIT/tekrar kosusu ve platform gereksinimleri silinmez. Bu incelemede tum bu adapter'lerin satir satir dogrulandigi iddia edilmiyor. W00 tekil registry ile mevcut gercek kanitlarini esle; eksik veya helper seviyesinde kalan mandatory normal yollarini tamamla. Rapor06 icin gerekiyorsa schema/template migration ve artifact retention pin'lerini ekle. Yeni feature kategorisi acma.

PIT/tekrar/static analysis sonucu yalniz ilgili arac gercekten calistiysa gosterilir. 'Calistirilmadi' dogru bir rapor durumudur ama sozlesmede zorunlu arac kabulunu PASSED yapmaz. Test suite tekrarinin 2/2 ayni sonucu 'hic flaky degil' garantisine cevirmeden tekrar sayisi ve outcome dizisi olarak goster.

Kurulum: `dist/node_modules` olmayan temiz copy, CMD+Node bootstrap, mevcut OpenCode MCP/provider sentinel'leri korunarak config merge, owner-only uninstall. Kullanici global settings'ini yedeksiz ezme. Assetler (template/logo/script) paket listesine dahil ve hash'li; temiz paketten baseline report uretimi test edilir. Yeni npm dependency ancak gerekce/lockfile/lisans taramasi ile; keyfi bulk upgrade yok. Paket signature yoksa UNSIGNED/NOT_PUBLISHED gercek durumu korunur; yayın onayi uydurulmaz.

### 12.2 Release verifier yeniden baglansin

Mevcut `release-verify.mjs` isim/kontrol sayisi/mtime kontrolu olarak kalamaz. Iki acik mod/sonuc siniri tasarla: **implementation evidence verify** ve **full product/release evidence verify**. Full varsayilan veya explicit full modu butun applicable zorunlu delilleri denetler. Yerel mod basariliysa ciktida full acceptance pending acik kalir; full gate bunu 0 kabul etmez. CI'yi acmadan maintainer Node girisleriyle calisir.

Her evidence record: requirement/test/predicate ID, scope, evidence level (`UNIT`, `CONTRACT`, `INTEGRATION_ISOLATED`, `OPERATIONAL`, `LIVE_MODEL`), exact command+exit+signal+timeout, timestamp, source/build/lock/helper/template digest, platform/toolchain, fixture input hash, actual observed values, immutable artifact hash/size refs. 'model dedi PASSED' field'i proof degildir.

Verifier kaynak/paket digest'ini actual evidence'a baglar; dosya adi marker'i veya tests count'u tek basina kabul degildir. Duplicate/missing obligation, eski commit test sonucu, hash mismatch, baska job raporu, noop reviewer, missing source, fake live-model kimligi, unexpected skip, false-success outcome, yeni test discover edilmemesi, resume yerine yeni job ve orphan process halinde non-zero. Guncel catalog/PROJECT_STATE/README/BACKLOG durumu bu ledger'dan uretilir veya deterministic consistency check'ten gecer.

`sha256File unused` dahil lint hatalari bu urunun mevcut dosyalarinda ise kapsam disi diye birakilmaz; dogru sekilde duzelt. Son davranis/prompt/template degisikligi ardindan ilgili suite ve nihai gate tekrar kosar. Docs-only delivery commit ile tested code digest ayrilir; en son commit SHA'sini onceden uydurma.

### 12.3 Canli testler icin durma standardi

Bu gorevde canli model/proje kosusu yok. Yerel fixture/harness icin scripted worker endpoint/model double kullanilabilir; **LIVE_MODEL diye etiketlenmez**. Bir yerel integration fixture'inin gercek Maven/JaCoCo calistirmasi kendi `INTEGRATION_ISOLATED` delilidir; model tarafinin scripted oldugu yazilir. Hosted model benchmark/pilot tekrarina kullanici acik onay verdiginde bounded plan, butce, target ve stop kosullari ayrica kayda girer. Eski %90 pilot basarisizligi 'kullanici kapatti' diye basarili olmaz.

Herhangi bir gerekli yerel capability yoksa kod ve engellenmeyen diger dogrulamalara devam et; cozulmemis capability icin NOT_RUN/BLOCKED kaydi ver. Yalniz string fixture ile gercek sandbox testinin yapildigini iddia etme. Tam kabul engelliyken 004'in de yerel butun isleri bitmediyse 004_IMPLEMENTATION_VERIFIED yazma.

## 13. Zorunlu yeni normal-yol regresyonlari — N01–N64

Bu tablo test dosyasi sayisi degildir; **64 davranis kabuludur**. Her satir pozitif/negatif assert ve exact evidence'a baglanir. Eski 210 kimlik ile kapsadigi davranislar eslenir. Beklenen hata durumunun dogru raporlanmasi bu hata testini gecirir; ulasilabilir pozitif fixture'in FAILED/BLOCKED sonucu pozitif kabul sayilmaz.

### A. Rapor siniri ve baseline

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N01 | W00/W08 | Referans dosyasi ve logo | Paketteki 06 HTML hash/bayt sayisi dogru; renderer logo oran/rengini ve 05/06 sade gorunumunu korur. Referans farkliysa ustune yazmak yerine durur. | CONTRACT + BROWSER |
| N02 | W06 | Model yorumu negatif enjeksiyonu | Inputa model_review, risk_score, rationale, recommendation, scenario_explanation ve nested benzer alanlar ekle. HTML, hidden DOM, JSON, print, text ve MCP report ozetinde bu anlatimlar yok; schema/projection ihlali kayitli. | CONTRACT + BROWSER |
| N03 | W06 | Test adi, DisplayName ve kaynak kodu | Yalniz source/run kaydindaki ad ve kaynak referansi gosterilir. Annotation yoksa aciklama uydurulmaz. Code/string/comment icindeki metin ayri kaynak blokudur, dogrulanmis sonuc diye sunulmaz. | CONTRACT + BROWSER |
| N04 | W06 | Bilinmeyen, sifir ve uygulanamaz | null/missing/0/0/INVALID/NOT_RUN ayri gorunur. Coverage verisi yokken %0 veya PASSED; hic kosu yokken 0 failure anlaminda basari uretilmez. | CONTRACT + BROWSER |
| N05 | W03 | Yalniz baslangic raporu istegi | Normal MCP rapor-only yolunda model ayari ve model kimlik bilgisi yokken mevcut test/coverage olcumu ve HTML uretilir. Worker process/API cagrisi sayisi gercek gozlemle 0. | INTEGRATION_ISOLATED |
| N06 | W03/W06 | Raporun generation oncesi yayini | Baseline artifact ve report snapshot yayini ilk generation eventinden once tamamlanir. Worker daha sonra hata verirse baseline ayni job altinda okunabilir kalir. | INTEGRATION_ISOLATED |
| N07 | W03/W06 | Olculemeyen/basarisiz baseline | No-framework, test yok, test disabled, bozuk XML, tool missing ve failed test fixturelarinda ayri reason/status ve rapor var. Gercek kosu olmadan sentetik exit0 kaydi yaratilmiyor. | INTEGRATION_ISOLATED |
| N08 | W06/W08 | Asama verisi bulunmamasi | Yalniz baseline olan jobda progress/final metrikleri uretilmez; gecerli snapshot olmayan asama devre disi veya Veri yok. Tarayicida asama secimi yeni sonuc hesaplamaz. | CONTRACT + BROWSER |

### B. Worker ve baglam

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N09 | W01 | 204 ve nihai mesaja korelasyon | prompt_async 204 sonrasinda request/session/message/parent eslesmesiyle stream veya polling tamamlanir. Bos HTTP govdesine JSON parse uygulanmaz. | CONTRACT_HTTP |
| N10 | W01 | tool-calls ara adimi | Ara tool-calls ardindan gelen final JSON beklenir; tools-denied fixture ayri policy hatasi olur. Ara mesajdaki text/JSON nihai changeset diye kabul edilmez. | CONTRACT_HTTP |
| N11 | W01 | Erken bos final | 18 saniyede finish=stop, text yok, 300 saniye deadline fixture: EMPTY_FINAL. Gercek zaman dolmadan MODEL_TIMEOUT yok; attempt ve cleanup kayitli. | CONTRACT_HTTP |
| N12 | W01 | Length ve kesik JSON | finish=length, yarim text, fence-only, schema-mismatch ve reasoning-only fixturelari ayri kodlarla reddedilir. Reasoning nihai test koduna veya rapora tasinmaz. | CONTRACT_HTTP |
| N13 | W01 | HTTP/izin/timeout/cancel | 401/403, 429, baglanti hatasi, fetch'in takilmasi, gercek deadline ve kullanici cancel fixturelari dogru status/bounded bekleme/owned abort uretir. | CONTRACT_HTTP |
| N14 | W01/W05 | Attempt gecmisi ve bounded retry | Basarisizlar dahil butun attempts start/end ve profile/input/output/message kimlikleriyle kalici. Eski message kabul edilmez; retry crash-resume'da butceyi sifirlamaz. | INTEGRATION_LOCAL |
| N15 | W01 | 12K sonrasi kod ve ilgili altinci test | Ayni basename farkli paket/module; hedef govdesi >12K; ilgili test ilk bes disinda. Tam kimlik/dogru kesit/exclusion kaydi, kabul seti ve onceki compile hatasi contextte; sahte birebir/tam iddiasi yok. | CONTRACT + INTEGRATION_LOCAL |
| N16 | W01 | Owned worker ve frozen profile | Sabit portta yabanci servis, stale XDG, child startup error, global model degisimi ve farkli platform executable fixturelari. Yabanciya baglanma/sonlandirma ve user config'e yazma yok; istenen profil aynen gercek istege gider. | CONTRACT_HTTP + OPERATIONAL |

### C. Izolasyon, hedef ve build

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N17 | W02 | Orijinal checkout butunlugu | Aday apply/run/crash/reject/cleanup boyunca kullanici checkout ve dirty test/POM hashleri degismez; candidate yalniz ayri workspace'te. Before/after gercek FS snapshot ile dogrulanir. | INTEGRATION_ISOLATED |
| N18 | W02/W07 | Platform ve path sinirlari | Windows/POSIX, bosluk, Turkce karakter, traversal, symlink/junction ve ADS/UNC saldirilari. Izinli test yoluna dogru yazim; containment disi bayt yazilmaz; POSIX literal backslash hatasi yok. | CONTRACT + OPERATIONAL |
| N19 | W02 | Gercek capability probe | Olumlu kontrollu run ile source-ro/output-rw/non-root/limit/egress kaniti; probe executable yok, NO_CGROUP veya onceki output dosyasi ile false PASS alinmaz. Normal dispatcher probe sonucunu kullanir. | INTEGRATION_ISOLATED |
| N20 | W02 | Egress, settings ve cache siniri | Izinli mirror erisimi ve izinsiz endpoint reddi gorulur. Execution credential/settings secrets goremez; paylasilan seed cache'i zehirleyemez. Enforcement yoksa typed BLOCKED, bridge fallback yok. | INTEGRATION_ISOLATED |
| N21 | W03/W04 | Gercek hedef listesi | Ayni simple name iki moduldedir; package boundary, module selector, source_set ve adi Test ile biten production sinifi birlikte denenir. Dispatcher frozen concrete hedefleri kullanir; test siniflari karismaz. | INTEGRATION_ISOLATED |
| N22 | W03 | Inherited framework ve runtime plan | Parent/BOM/pluginManagement/profile/custom test root iceren Maven fixture'da effective plan ve gercek runner cagrisi eslesir. Static tespitte none sonucundan fake NO_TESTS exit0 uretilmez. | INTEGRATION_ISOLATED |
| N23 | W03 | Skip, kesif, bozuk XML ve exit0 | skipTests/maven.test.skip, sifir discovered, XML failure/error + process exit0, missing/invalid attributes fixturelari. Bilinen test varken sessiz no-tests basarisi yok; skip politikasi kayitli, POM degismez. | INTEGRATION_ISOLATED |
| N24 | W03 | Cok modullu taze JaCoCo | Mevcut pluginli ve pluginsiz desteklenen fixturelarda gercek agent + yeni run raporu; custom report path, module outputs, binary/source mismatch ve eski XML denemesi. Her sayac run/hash/scope ile dogrulanir. | INTEGRATION_ISOLATED |

### D. Aday kabul ve coverage

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N25 | W04/W06 | Iki metrik birlikte | LINE95/BRANCH40 hedef90 fixture'inda loop/dispatcher/DB/MCP/HTML/JSON/print ayni TARGET_NOT_MET sonucunu verir. Proje ortalamasi veya sadece LINE ile basari yok. | INTEGRATION_ISOLATED + BROWSER |
| N26 | W04 | Branch-only kazanim | LINE ayni, BRANCH artmis aday kabul edilir; LINE artarken mevcut BRANCH gerileyen aday tanimli koruma kuralina takilir. Yardimci evaluator degil gercek CandidateLoop yolu test edilir. | INTEGRATION_ISOLATED |
| N27 | W04/W06 | Gecerli total0 ve kayip veri | Kaniti gecerli dal total0 N/A; XML/kaynak kayip UNAVAILABLE/INVALID. Gecerli diger metrik hedef saglarsa buna gore karar; tum istenen metrikler N/A ise otomatik basari yok. | CONTRACT + INTEGRATION_ISOLATED |
| N28 | W04/W06 | Kesin esik ve toplama | %89,96 hedef90'da hedefe ulasmamis; raw counter agirlikli toplama; method line overlap sinif sayacini sisirmez. Baseline/final kapsam uyusmazligi delta olusturmaz. | CONTRACT + BROWSER |
| N29 | W04 | A+B kabul, C red, final A+B | Iki ayri test adayi kumulatif kabul; ucuncu reddedilir. Temiz final workspace'i A+B'yi kesfeder/calistirir, C yoktur. Patch/checkpoint/report ayni accepted baytlari gosterir. | INTEGRATION_ISOLATED |
| N30 | W04/W01 | Gercek feedback ile repair | Compile ve assertion failure ayri adaylarda gercek log/konum/onceki degisiklikle sonraki bounded istege gider. Ayni yanlisi koruyan tekrarlar sinirli; repair budget kalici. | INTEGRATION_ISOLATED |
| N31 | W04 | Mevcut testlerin korunmasi | Eski test silme/disabled/annotation kaldirma/SUT shadowing ve anlamsiz coverage oyunu reddedilir; helper uzerinden gecerli assertion yanlis kesin hukme donusmez. Yeni testin kesfedilmemesi kabul degildir. | CONTRACT + INTEGRATION_ISOLATED |
| N32 | W04/W06 | Final replay ve durma nedeni | Temiz final run+accepted digest gercek sonuc kaynagi. Rejected/stale output kazanimi sonuca gecmez; BUDGET/PLATEAU/FAILED/BLOCKED/ALREADY_MET farkli ve kanitli. | INTEGRATION_ISOLATED |

### E. Kalicilik ve is yasam dongusu

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N33 | W05 | Normal yolda checkpoint yayini | Gercek candidate_accepted callback'i immutable manifest/bloblari ve DB pointer'ini yazar. Yalniz event/log yeterli degildir. Yarim artifact accepted checkpoint secilemez. | INTEGRATION_ISOLATED |
| N34 | W05 | Hard-kill ve ayni jobdan devam | Is ikinci kabulden sonra sert kesilir. Yeni process ayni job/goal/accepted/baseline/kalan budget ile sonraki iterasyondan devam eder; tum analizi veya butceyi bastan baslatmaz. | INTEGRATION_ISOLATED |
| N35 | W05 | Kaynak degisiminde resume | Arada customer source/POM/dirty test degisir. SOURCE_CHANGED ve provenance uyumsuzlugu acik; eski coverage yeni kaynaga atanmaz, kullanici degisikligi geri alinmaz. | INTEGRATION_ISOLATED |
| N36 | W05 | Iki resume, tek owner | Iki istemci ayni isi alir; bir lease sahibi calisir. Epoch/fence eski worker'in DB/checkpoint/report yazmasini engeller; ayri joblarin kaynaklari karismaz. | INTEGRATION_ISOLATED |
| N37 | W05/W02 | Cancel gercek processleri bitirir | Calisan worker, Maven/container owned kimlikleriyle sonlanir; late output CANCELLED'i overwrite edemez. User TUI veya yabanci container/PID etkilenmez. | INTEGRATION_ISOLATED + OPERATIONAL |
| N38 | W05 | Pause ve tekrar devam | Pause son accepted checkpoint'i ve remaining budget'i korur; aktif eski child sonlanir. Resume yeni child ile kayitli isten devam eder; sadece lifecycle degisikligi degildir. | INTEGRATION_ISOLATED |
| N39 | W05/W01 | Contract ve job handle | Goal/model/scope/config/budget tam kaydi restartta okunur. Global config degisse sessiz degisim yok. Hata halinde MCP/diagnostic wrapper gercek job_id ve specific reason'i korur; null handle polling yok. | CONTRACT + INTEGRATION_LOCAL |
| N40 | W03/W05/W06 | Generation hatasinda kullanilabilir sonuc | Worker empty/length/error fixture'inda baslangic raporu ve son kabul kazanimi durur; hata typed attempt kaydindan gosterilir. Test_result mevcut raporu/veriyi tekrar model cagirmadan verir. | INTEGRATION_ISOLATED + BROWSER |

### F. Olcum projeksiyonu ve artifactler

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N41 | W03/W06 | Gercek test invocation kayitlari | Parametreli/dynamic/nested test, failure/error/skip, retry ve sure fixturelari. Logical test metodu ile calistirilma sayisi karismaz; test dosyasi adedi tests_added olarak etiketlenmez. | CONTRACT + INTEGRATION_ISOLATED |
| N42 | W06 | Tek veri kaynagi | Status/result/HTML/JSON/text/print ayni report revision/digest ve raw counterlardan gelir. Rapordan sonra checkout XML'i degistirilse eski rapor ve last_trusted sonucu degismez. | INTEGRATION_ISOLATED + BROWSER |
| N43 | W06/W08 | Tam liste, dogru sayfalama | Filtre/arama ve sayfa degisimi o kaydin testlerini gostermeye devam eder; duplicate adlar collision yapmaz. Export/print tum uygun kayitlari kapsar, yalniz gorunen sayfayi degil. | BROWSER |
| N44 | W07 | Binary ve nested export | Gercek veya byte-fixture .exec, JaCoCo nested html/assets ve UTF-8 kod exporttan sonra byte/sha256/size birebir. Asset linkleri offline calisir. | CONTRACT + BROWSER |
| N45 | W07 | Hash bozulmasi ve manifest dogrulamasi | Eksik dosya olmadan bir bayt degistir: verification_passed false. Parametresiz verify canonical manifest'i okur; bos liste kabul etmez; corrupt/missing manifest de reddedilir. | CONTRACT |
| N46 | W07 | Foreign-job ve export path korumasi | Baska job/run artifacti, traversal/symlink/UNC/ADS ve extraFiles ile index/report/manifest ezme denenir. Kaynak disina yazim yok; kayip/hatalinin yerine sahte link yok. | SECURITY + INTEGRATION_LOCAL |
| N47 | W05/W07 | Atomik yayin ve partial failure | JSON/HTML/blob/DB pointer arasindaki crash failpointlerinde onceki complete snapshot secilir. Rapor yazma hatasi sessiz completed olmaz; REPORT_FAILED ve asil run sonucu ayri korunur. | INTEGRATION_LOCAL |
| N48 | W07 | Gercek accepted patch ve apply siniri | Actual before/after test bytes patchten geri kurulur. Kanitsiz production0/PASSED/READY_FOR_REVIEW yok. Onaysiz apply reddedilir; onayli adapter varsa hash/conflict/rollback/idempotency normal yolda kanitlanir. | CONTRACT + INTEGRATION_ISOLATED |

### G. Onayli UI, guvenlik ve olcek

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N49 | W08 | 06 gezinme ve detay davranislari | Genel bakis, sinif/test, kontrol, worker kayitlari, kanitlar; class expand/tab, test dialog, copy, pagination ve scrollspy calisir. Keyboard/focus/Escape/return-focus kaybolmaz. | BROWSER |
| N50 | W08 | Mobil/masaustu yerlesim | Chromium ve WebKit 320/390/430/768/1280/1920 genislik; uzun adlar, sticky nav, dialog scroll. Kritik tasma/ustuste binme yok; 04 kutu-icinde-kutu tasarimina donulmez. | BROWSER + VISUAL_REVIEW |
| N51 | W08/W09 | Cevrimdisi ve paket assetleri | Network bloklu file:// raporda logo, JS/CSS, arama ve detaylar calisir. Temiz kurulan paketten uretilen HTML ayni asset/renderer surumune sahiptir; runtime CDN/model fetch yok. | BROWSER + OPERATIONAL |
| N52 | W08 | HTML/JSON injection | Test adi/code/error/DisplayName icinde </script>, SVG/onerror, quoted attribute ve Unicode control fixturelari. JavaScript tetiklenmez, DOM veya link kapsam disina cikmaz, JSON guvenli okunur. | SECURITY + BROWSER |
| N53 | W06/W07 | Narrative ve secret tum cikti yuzeylerinde | Rapor proje kaynagindan alinan code haricinde model commentary aktarmaz; metadata alanlari da allowlist/typed olur. Maskelenmis exporttaki artifact hashleri yeni baytlara ait; secret/debug reasoning support bundle'a sizmaz. | SECURITY + CONTRACT |
| N54 | W06 | Gercek raporda ornek veri bulunmamasi | DEMO/GIVEN/synthetic/example source switch/stale prerendered body/print fallback production renderer bundle ve rapordan cikarilir. Referans06 dosyasi aynen arsivde kalir; fixture yalniz test/demo yuzeyinde etiketli. | CONTRACT + BROWSER |
| N55 | W08 | Buyuk rapor | En az 10.000 test kaydi ve coklu sinif fixture'inda bounded DOM/search/page; dogru tam sayilar, filtre sonucu ve full export. Olculen sure/bellek/test makinesi kaydedilir, uydurma performance PASS yok. | BROWSER + PERFORMANCE |
| N56 | W06 | Metot ve test iliskisi sinirlari | JaCoCo class/method/raw line sayaclari source kimligiyle; test-source heuristic ayri etiket. Per-test coverage yokken belirli testin kapsadigi satir veya kazanci kesinmis gibi gosterilmez. | CONTRACT + BROWSER |

### H. Kabul, kurulum ve teslim

| ID | Paket | Girdi / davranis | Beklenen kanit | Asgari kanit seviyesi |
| --- | --- | --- | --- | --- |
| N57 | W00/W10 | Son kaynakla gercek suite | Lint/typecheck/build ve tam suite actual exit/digest ile kayitli. Aborted/timeout/pipe son echo, eski test run veya degismis prompt/template kaynak digest'i PASSED olamaz. | OPERATIONAL |
| N58 | W00/W10 | 210+64 tekil ledger | AC70/RG52/RT28/PRO60 ve N64 kimlikleri ayri kayit; duplicate/missing/unsupported PASSED yakalanir. Eski semantic rapor taleplerinin degisen siniri SUPERSEDED gerekcesiyle, test kalite korumalari korunarak eslenir. | CONTRACT |
| N59 | W10 | False-proof verifier negatifleri | Sadece dosya sayisi/isim marker'i, passed:true JSON, RT28 adetli bos proof, degismis digest, eksik binary/hash, fake live ve unexpected skip ile full gate non-zero. Gercek uygun evidence local modu gecirir. | CONTRACT + OPERATIONAL |
| N60 | W10 | Pilot pause ile kabul ayrimi | Tum yerel kanitlar gectiginde local IMPLEMENTATION_VERIFIED olabilir; LIVE_MODEL ertelenmisken full gate non-zero. CI/suite kendiliginden corporate model/proje pilotu veya benchmark baslatmaz. | CONTRACT + OPERATIONAL |
| N61 | W09 | PS1 olmadan temiz Windows kurulum | dist/node_modules olmayan copy; CMD+Node install/build/handshake/baseline report/uninstall. User MCP/provider sentinel degismez; yeni rapor template/logo assetleri eksiksiz. | OPERATIONAL |
| N62 | W09 | Mevcut veri ile upgrade ve geri donus | Onceki schema/store fixture'iyle migration, quiesce, backup/restore, rollback, GC ve checkpoint/artifact pinleri normal yolda denenir. Unsupported future schema guvenli durur; kullanici verisi korunur. | OPERATIONAL + INTEGRATION_LOCAL |
| N63 | W09/W06 | Diger araclarin gercek durumu | Devralinan PIT/SCA/static/tekrar/protocol kabulleri gerekli seviyede kayitli. Arac yoklugu sayisal 0/PASSED olmaz; heuristik finding kesin assertion-guvenilirligi veya business-risk yorumuna donusmez. | CONTRACT + OPERATIONAL |
| N64 | W11 | Teslim tutarliligi | Guncel task/ledger/README/PROJECT_STATE/handoff/manifest ayni kapsami anlatir. Exact06 hash, gercek package smoke, yerel/full kabul ayrimi, durdurulmus pilot ve sahipligi belirsiz dosyalar acik; staged privacy/Git ASCII/CI-off kontrolu gecer. | OPERATIONAL + REVIEW |


**Seviye aciklamasi:** `CONTRACT_HTTP`, model yerine yerel kontrollu HTTP endpoint'iyle OpenCode cevap semantiginin testidir. `INTEGRATION_LOCAL`, gercek urun composition'i + gercek SQLite/FS/process ile, gerektiğinde acikca etiketlenmis worker double kullanir. `INTEGRATION_ISOLATED`, gercek sandbox ve Maven/JaCoCo calistirir; worker scripted olabilir ama bu bilgi kayittadir. `BROWSER` gercek renderer'dan uretilen HTML uzerindedir, yalniz referans HTML'i acmak degildir. Bu yeni seviyeleri onceki registry seviyeleriyle explicit map et; adlari farkli diye kanit seviyesi dusurme. `OPERATIONAL` platform/kurulum/run kaniti ister. Biri digerinin yerine sessizce gecmez.

### I. Bulgu–kabul ilk esleme tablosu

Bu ilk esleme uygulayicinin tekil eski/yeni obligation ledger'ini kurmasi icindir; her bulgunun tum alt davranislarini W00'da esle. Eslesme bulunmasi testin gectigi anlamina gelmez.

| Bulgu | Yeni kabul baglantilari |
| --- | --- |
| F01 | N09–N13, N37, N40 |
| F02 | N14, N16, N37, N39–N42 |
| F03 | N16, N17, N19, N37 |
| F04 | N03, N15, N30 |
| F05 | N21, N24, N39, N56 |
| F06 | N05–N07, N22–N23, N41 |
| F07 | N06–N07, N22–N24, N28 |
| F08 | N17–N18, N29, N34–N35 |
| F09 | N29, N32–N34, N47–N48 |
| F10 | N25–N28, N32, N42 |
| F11 | N33–N40, N47 |
| F12 | N05, N08, N16, N21, N39–N42 |
| F13 | N04–N08, N40–N42, N47–N48 |
| F14 | N01–N04, N41–N43, N49–N56 |
| F15 | N44–N48, N51–N53 |
| F16 | N17–N20, N24, N37 |
| F17 | N57–N60, N64 |
| F18 | N14, N57, N60–N64 |

## 14. Uygulama ritmi, checkpoint ve yeni modele devir

### 14.1 Beklenen gelistirme dosyalari

- `AGENTS.md`: mevcut baslangic protokolu korunarak yeni aktif gorev/ledger linkleri guncellenir.
- `ai/PROJECT_STATE.md`: son dogrulanmis asama, testlenen code digest, yerel kabul ve full kabul ayrimi; pilot pause.
- `ai/BACKLOG.md`: W00–W11 ve F01–F18'in gercek acik/kapali durumu; kapanis evidence pointer'i.
- `ai/ACCEPTANCE_MATRIX.md` ve `ai/acceptance/catalog.json`: tekil 210 eski + 64 yeni gereksinim; grup ozeti yalniz bunlardan turetilir.
- `ai/reviews/2026-10-11-report06-runtime-review.md`: bu inceleme bulgularinin kullanici gizliligini koruyan kaynak referanslari, guncel durum ve gercek regresyon kanitlari. Ham oturumu kopyalama.
- `ai/decisions/`: facts-only reporting, pilot pause/full acceptance separation, frozen context/runtime projection ve diger degisen kararlar icin kisa ADR.
- `ai/checkpoints/` ve `ai/handoffs/`: her dogrulanmis parcada asagidaki devam kontrati.
- `docs/reporting/reference/innova_test_raporu_tasarim_06.html`: salt referans, exact hash.
- `docs/reporting/`: schema, kaynak/alan esleme, sabit rule catalog, artifact layout, gizlilik ve baslangic raporu kullanim bilgisi. Gercek template/modul dosyalari mevcut `src/reporting/` mimarisine entegre edilir.

Adlari mevcut yapinin esdegerleri varsa kullan; paralel ayni isi yapan ikinci rapor/verifier/runner olusturma. Erişilebilir mevcut helper'i normal composition'a baglamadan yeni bir helper daha yazarak kapanis verme.

### 14.2 Her checkpoint'in zorunlu icerigi

1. Task ID/version, HEAD/branch, verified code/template/lock digests, dirty/untracked inventory ve sahipligi.
2. Aktif W paketi, son tamamlanan F/N/old acceptance IDleri ve precise evidence konumlari.
3. Gercek kosulan komut/platform/toolchain, exit/signal/timeout, tam/kismi test sonucu; son invalidated proof listesi.
4. Degisen dosyalar ve nedenleri; tamamlanmayan kaynak baglantisi veya gecici code path kaldiysa acik kayit.
5. Denenen yaklasimlar ve gercek hata fingerprint'leri; sonraki modelin ayni yanlis denemeleri tekrar etmemesi icin sinirli teknik ozet. Ham model dusunmesi kaydedilmez.
6. Kalan butce, aktif owned process/container/session ve nasil guvenli sonlandirilacagi; yabanci kaynaklara dokunmama notu.
7. Pilot: `PAUSED_BY_USER / NOT_PASSED`; canli model tekrarina izin yok.
8. **Tek sonraki somut eylem**: exact dosya/fonksiyon, test ve beklenen observable sonuc. 'Kalanlari tamamla' yeterli degildir.

Bir oturum bitmeden kullaniciya devretmek icin tamamlanmayan isi tamamlandi yazma. Yeni model checksum/branch/code degisikliklerini dogrular; onceki local suite'nin bugun hala gecerli oldugunu varsaymaz. Ayni task devam eder; otomatik yeni AKTIF_GOREV yazip kapsami daraltmaz.

### 14.3 Commit ve gizlilik

Anlamli bir dogrulanmis W parcasi sonrasinda commit hazirla. Stage exact owned paths; `git add .` ile yabanci dosya/kurum oturumu/config'i toplama. Repo-local identity ve yeni commit subject/body icin ASCII kontrolu yap. Kod/rapor UI metinleri Turkce karakter kullanabilir; ASCII kurali UI'yi bozmak icin uygulanmaz. Onceki commitleri Turkce karakter var diye amend/rebase etme.

Secrets/static privacy taramasi staged dosya baytlari ve yeni rapor assetleri icin gercekten yapilir. Kurum server/model deployment/team kimligi, gercek musteri sinif govdesi/SQL veya ozel log yeni public dosyaya konmaz. Allowlist ihtiyaci olursa field/path bazli gerekce, gizli deger olmadan kayitli olur. Bu gorevin kaynak oturumu repoya eklenmez.

## 15. Nihai teslim ve kabul beyaninin sekli

### 15.1 Beklenen urun teslimi

- Normal OpenCode/MCP girisinden **yalniz baslangic olcumu ve raporu**; model ayari olmadan calisir.
- Test gelistirme isinde **baseline -> candidate -> accepted -> final replay -> report** veri akisi; eski test/production/POM korumasi, dogru cancellation ve ayni job resume.
- Rev06 gorunumunde, **modelsiz rapor motoru** tarafindan uretilen gercek HTML/JSON/text/print ciktilari; classes/methods/test-invocations/controls/worker-metadata/evidence baglantilari.
- Byte-dogrulanmis nested artifacts, gercek accepted patch, canonical manifest; privacy-safe istege bagli paylasim ciktisi.
- Is yukunu customer checkout veya global OpenCode config'ine tasimayan PS1'siz paket/kurulum/guncelleme.
- Normal yoldan gectigi kanitlanan N01–N64 ve devralinan applicable yerel kabuller; kalici exact obligation/evidence registry.
- Gercekten kosulmadigi icin NOT_PASSED kalan canli pilot/benchmark ve varsa diger blocker'lar, urun kabulunu yanlis yukseltmeden ayri kalir.

### 15.2 Kapanis raporu

Uygulayici son mesajda yalniz 'bitti / 375 test gecti' demez. Su alanlari verir:

| Alan | Gereken kayit |
| --- | --- |
| Uygulama durumu | `004_IMPLEMENTATION_VERIFIED` veya acik kalemleriyle `IN_PROGRESS/BLOCKED` |
| Tam urun kabul durumu | `FULL_PRODUCT_ACCEPTANCE_VERIFIED` veya **`NOT_VERIFIED`**; durdurulmus pilot varken ikincisi |
| Baslangic / teslim | Reviewed HEAD, tested code digest ve gercek delivery commit |
| Referans | Rev06 exact SHA-256 ve renderer schema/template version |
| Degisiklikler | F01–F18 kapanis/remaining ve W paketleri |
| Kanitlar | Gercek komut, exit, tam suite adetleri, N/old ID kanit seviyeleri, browser/platform kapsamı |
| Canli kabuller | Kullanici tarafindan durdurulanlar, yeni model cagrisi yapilip yapilmadigi, acik root-cause durumu |
| Teslim dosyalari | Paket, baseline/final fixture rapor ornekleri, manifest/patch/JSON ve guvenli evidence konumlari |
| Kullanici icerigi | Korunan dirty/untracked dosyalar ve varsa cozulmemis conflict |
| Devam | Tam kabul bekliyorsa yalniz gereken onay/engel; basarisizligi basari gibi adlandirmayan tek devam noktasi |

Bir HTML maketi, basarili JSON changeset parse'i veya helper unit testleri bu teslimat yerine gecmez. **Model test kodunu uretir; araclar olcer; rapor motoru kayitlari gosterir; kabul verifier'i kanitlari dogrular.**

## 16. Kaynak haritasi ve yeniden dogrulama

Bu bolumdeki repository referanslari asagidaki immutable commit'e aittir:

`https://github.com/mehmet-karacan/ai-test-engineering/tree/1925b128e590f91ca1f5a3ee164abd7d48fdccd1`

Path'te `src/` ile baslayan dosyalar bu commit altinda okunmustur. Yerel kanitlar buraya uydurulmaz; asagidakiler hazirlama incelemesinin kaynaklaridir.

| Kaynak | Okunan path / bolum | Destekledigi inceleme |
| --- | --- | --- |
| S01 | `AGENTS.md`; `package.json`; tree/son commit listesi | Baslangic protokolu, kimlik, CMD/Node, CI kapali; incelenen surum |
| S02 | `src/workers/opencode/worker-client.ts` | `completedField`, `waitForCompletion`, `promptForJson`, timeout/empty/tool-calls |
| S03 | `src/workers/opencode/worker-server-manager.ts`; `src/workers/opencode/role-prompts.ts` | Shared port/XDG, env/config aktarimi; class body ve JSON format degisikligi |
| S04 | `src/orchestration/job-dispatcher.ts` | Baseline, targets, worker/context, accepted callback, rapor data, manual final outcome, resume |
| S05 | `src/orchestration/candidate-loop.ts` | Original overlay, separator, LINE-only gain, accepted set, current XML |
| S06 | `src/orchestration/build-plan.ts` | Plan, NO_TESTS sentetik run, XML parse/status, instrumentation |
| S07 | `src/runners/docker-runner.ts` | Capability, cache/settings, provisioning network ve owned timeout |
| S08 | `src/application/services.ts`; `src/application/job-tools.ts` | MCP mode/profile/dispatch, contract, status/result, resume/cancel/apply |
| S09 | `src/storage/inventory-repository.ts` | Suffix/package hedef cozumu ve DB iliski yazimi |
| S10 | `src/reporting/report-generator.ts` | Eski HTML, data schema, AI yorum cumlesi, export/manifest/hash sonucu |
| S11 | `scripts/release-verify.mjs`; `ai/acceptance/catalog.json` | Yapısal verifier siniri ve obligation/proof eksikleri |
| S12 | `ai/PROJECT_STATE.md`; `ai/ACCEPTANCE_MATRIX.md`; `ai/checkpoints/2026-10-11-rt21-pilot-kapanis.md` | Kapanis/kanit iddialari; ham metinleri ek oturumda da mevcut |
| S13 | `session-ses_ed90.md` satir 1837–1845, 2254–2271, 2380–2383, 2505–2550, 2587–2595, 2951–2965 | Gozlenen cevap durumlari, sadece changeset kaniti, failed pilot ve kullanici durdurma karari |
| S14 | `docs/reporting/reference/innova_test_raporu_tasarim_06.html` (bu pakette) | Onayli gorunum; facts-only prototype ve guvenli backend schema geregi |
| S15 | `ai/tasks/archive/AITE-RUNTIME-ACCEPTANCE-003-v2.0.md` (bu pakette) | Onceki tam kapsam, 210 kabul kimligi ve guncellenmesi gereken eski rapor yorumu talebi |

Kullanilan dis birincil belgeler (urun davranisi icin kurulu surum ayrica dogrulanacak):

- OpenCode Server: `https://opencode.ai/docs/server/` — HTTP API, prompt_async, session/status ve schema arayuzu.
- OpenCode Permissions: `https://opencode.ai/docs/permissions/` — surume uygun izin konfigürasyonu. Eski tools bayraklarini koruma kaniti saymadan gercek policy denenir.
- JaCoCo Counters: `https://www.jacoco.org/jacoco/trunk/doc/counters.html` — counter kapsam ve sinirlari. Prototype metot toplamini sinif kaniti yapma.
- Maven Surefire Skip Tests: `https://maven.apache.org/surefire/maven-surefire-plugin/examples/skipping-tests.html` — skip bayraklari. Bu belgenin varligi musteri POM'unu degistirme yetkisi vermez.

Dis belge ile kurum kurulumunun ayni oldugu varsayilmaz. Yalniz belgede gordugu parametreyi global config'e ekleyerek canli pilotu tekrar baslatma. Mevcut kod ve yerel contract replay testleri kaynak olarak once gelir; neden kesinlesmediyse belirsizlik acik kayitli kalir.
