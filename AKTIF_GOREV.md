# AKTIF_GOREV - Production Oncesi Kritik Duzeltmeler Ve Gercek Kabul

## 0. Gorev Kimligi Ve Karar

| Alan | Deger |
| --- | --- |
| Gorev kimligi | AITE-PRODUCTION-READINESS-005 |
| Surum | 1.0 |
| Tarih | 2026-10-11 |
| Repository | https://github.com/mehmet-karacan/ai-test-engineering |
| Denetlenen branch | main |
| Denetlenen commit | ac931821f8b9488b264c85d4f616c2ab74383613 |
| Onceki commit | 1925b128e590f91ca1f5a3ee164abd7d48fdccd1 |
| Devralinan aktif sozlesme | AITE-REPORT06-INTEGRATION-004 v1.0 |
| Denetlenen AKTIF_GOREV.md Git blob | b8306f04c6890589765a8375065d02f8cdc96a48 |
| Baslangic karari | NO_GO: production yayini icin kritik kod kusurlari ve eksik kabul kanitlari var |
| Bu teslimatta yapilan | GitHub kaynak incelemesi; Git blob hash'i dogrulanmis dort kaynakla alti dar bilesen tekrar uretimi; duzeltme ve kabul sozlesmesi |
| Bu teslimatta yapilmayan | Urun koduna duzeltme uygulamasi, tam repository suite'i, commit/push/PR, yayin, kurum modeli veya gercek proje pilotu |
| Kanit paketi | PRODUCTION_DENETIM_KANITLARI.zip |

**Bu belge, bulgularin duzeltildigi anlamina gelmez. Uygulayici belgeyi ozetlemek veya yeniden gorev yazmak yerine mevcut urundeki asagidaki isleri uygulayacak ve gercek kanitla dogrulayacaktir.** Yeni arayuz, yeni urun veya sifirdan mimari yazimi istenmiyor. Mevcut iyi implementasyon korunur; normal MCP akisindaki eksik baglantilar ve yanlis guven kabulleri giderilir.

Onceki kayitlarda 56 dosya / 473 testin gectigi, typecheck/build/lint'in basarili oldugu yaziyor. Bunlar tarihsel, repository tarafindan bildirilen sonuclardir. Bu denetimde 473 test yeniden calistirilmadi. Yerel fixture'larin gecmesi, normal MCP akisinin veya kurum ortaminda urunun production kabulunun tamamlandigini kanitlamaz.

### 0.1 Degismeyen Kullanici Sinirlari

- Canli kurum modeli ve gercek proje pilotu **PAUSED_BY_USER** olarak kalir. Gozlenen kabul sonucu **NOT_PASSED**, kok neden durumu **UNRESOLVED** olarak ayri tutulur. "Repo olgun mu, eksikse yapalim" talebi durdurulmus pilotu kendiliginden yeniden baslatma izni degildir. Ayrica acik onay alinmadan model denemesi, provider degistirme, SKY/GPU pilotu veya canli benchmark baslatma.
- CI kullanici karariyla kapali kalir. Yeni workflow, Jenkins veya otomatik yayin tetikleyicisi ekleme. Yerel maintainer dogrulama scriptleri kullanilabilir.
- Musteri projesinin production kaynaklari, POM/build dosyalari, coverage exclusion'lari ve kullaniciya ait dirty/untracked dosyalar otomatik degistirilmez. Yeni test veya onayli test iyilestirmesi, izole aday alanda dogrulanir; orijinal checkout'a sessizce uygulanmaz.
- Bu urunun kendi TypeScript/Java helper/test/kurulum kodlari gorev kapsaminda duzeltilebilir. Musteri repository'si ile urun repository'sinin sinirini karistirma.
- Windows standart akis CMD + Node.js + Git'tir. PowerShell, execution-policy veya TLS/kurum ag politikasi bypass'i yoktur. Host Maven/JVM ile customer execution fallback'i yoktur.
- Runtime DB, checkpoint, adaylar ve ham kanitlar repository disindaki kullaniciya ozel store'da kalir. Kurum kaynak kodu, ham oturumlar, secret veya ic altyapi adresleri public Git'e eklenmez.
- Model/provider kimlikleri birebir ve yapilandirilabilir kalir; kullanicinin istedigi profil global default ile sessizce degistirilmez. Provider prefix'i temizleme, tahmini model adi/suffix/endpoint uydurma.
- Raporu model yazmaz. Urun raporu, JSON, print ve ozet yuzeyleri yalniz arac ve kayitli veri kaynakli olgular tasir. AI kanaati, modelin kabul karari, serbest risk/tavsiye anlatisi eklenmez.
- Yeni commit/push ancak kullanicinin acik Git talimatina gore yapilir. Kimlik yalniz repo-local: `mehmet-karacan <karacan.mehmet@hotmail.com>`. Commit basligi/body Turkce ASCII olur. Global Git ayari, force-push ve gecmis yeniden yazimi yapilmaz.
- Kurum imza anahtari, registry veya yayin hedefi uydurulmaz. Bu dosya tek basina deploy/publish/imzalama yetkisi vermez.

### 0.2 Report06 Ve Onceki Sozlesmeler

Onayli referans:

- Path: `docs/reporting/reference/innova_test_raporu_tasarim_06.html`
- Boyut: 257845 bayt
- SHA-256: `e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80`

Referansin yalniz dosya olarak repoda bulunmasi entegrasyon sayilmaz. Normal runtime'in urettigi HTML, onayli tasarimin gercek verilere bagli renderer'ini kullanmalidir. Referans byte-for-byte korunur; ornek/sentetik veriler veya ornek model isimleri gercek rapora tasinmaz.

Onceki AC01-AC70, RG01-RG52, RT01-RT28, PRO01-PRO60 ve N01-N64 kapsamlarindaki gecerli zorunluluklar korunur. Bu gorev bunlari iptal etmez. Registry'nin kendi beyan ettigi toplam sayiya guvenme: her sozlesmedeki kimlik kumesini tekil olarak cikar, eksik/mukerrer kimlikleri karsilastir. Yeni bulgular mevcut kapanis iddialarini kanit duzeyinde yeniden acar; tarihsel notlar silinmez.

## 1. Baslangic Ve Devir Protokolu

1. `AGENTS.md`, bu belge, mevcut `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md`, son handoff ve ilgili ADR'leri oku. Onceki 004 sozlesmesi ile N gereksinimlerinin tamamini da oku.
2. Gercek branch/HEAD/status/remote ve repo-local kimligi kaydet. HEAD denetlenen commit'ten ilerideyse yeni diff'i oku ve her bulguyu yeniden dogrula; eski commit'e reset yapma, duzeltilmis isi geri alma.
3. Bu dosya eski aktif dosyanin yerine alinacaksa, eski 004 dosyasini once byte/hash korunarak `ai/tasks/archive/` altinda uygun tekil adla arsivle. Var olan arsivi farkli icerikle ezme. Tek aktif giris `AKTIF_GOREV.md` kalir.
4. Kullanici degisikliklerini ayir. Ozellikle onceki devirde adi gecen `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` dosyasinin sahipligini tahmin etme; silme/ezme/kendiliginden stage etme.
5. Node 24+, lockfile bagimliliklari ve mevcut tam test suite'i ile gercek yeni baseline al. Sonucu commit + calisma agaci digest'i + komut + exit + log hash'i ile kaydet. Hata varsa ilk once raporla; sayilari onceki kayittan kopyalama.
6. Mevcut dokumanlarda "LOCAL_VERIFIED" olan ancak bu denetimde kusuru bulunan alanlari yeniden ac. Kodun/dosyalarin varligi veya kaynak metin iceren bir test kabul kaniti degildir.
7. Her anlamli parcadan sonra `ai/checkpoints/`, `ai/handoffs/` ve durum/ledger kayitlarini guncelle. Kesinti sonrasi yeniden arastirma yapmadan hangi is ve testte kalindigi anlasilsin.

## 2. Denetim Yontemi Ve Kanit Siniri

Bu denetimde GitHub uzerinden commit'e sabitlenmis kritik kaynaklar okundu: normal MCP baslangici, dispatcher, candidate loop, baseline/coverage, Docker runner, lease/checkpoint/recovery, report/export, release verifier ve kurulum/config.

Tum repository yerel olarak clone edilip calistirilamadi; clone DNS erisimi basarisiz oldu. Yerel ortam Node 22.16.0 / Linux idi; Docker ve Maven yoktu. Paket ise Node 24+ istiyor. Dolayisiyla burada tam build, semantic TypeScript typecheck, 473 testlik suite, Windows, Docker, Maven, kurum modeli veya gercek proje kabulu yapilmis sayilmaz.

Dort kaynak dosyanin connector'dan alinan baytlari Git blob SHA'lariyla birebir dogrulandi. Bu dosyalar TypeScript ile JavaScript'e donusturuldu ve `node:sqlite` uzerinde ince bir senkron adapter/minimal SQL semasi ile alti bilesen senaryosu calistirildi. Bu, salt yorumdan daha guclu tekrar uretimdir; production `better-sqlite3` surumu ve gercek migration'lar ile entegrasyon testi yerine gecmez.

### 2.1 Gercekte Yeniden Uretilen Kusurlar

| Kanit | Bulgu | Gozlenen gercek sonuc | Guvenli davranis |
| --- | --- | --- | --- |
| R01 | PR02 | B sahibinin acquire'i `previous_owner_alive=true` donerken DB owner'i B oldu; A'nin fence'i stale oldu | B reddedilirken A'nin kaydi/token'i degismemeli |
| R02 | PR02 | `assertFence` LEASE_EXPIRED dedi; ayni lease ile checkpoint publish ve verify basarili oldu | Suresi dolmus lease accepted pointer'i ilerletememeli |
| R03 | PR03 | Accepted test baytlari/blobi hic sunulmadan manifest `valid=true` oldu | Resume icin accepted content ve run zinciri de dogrulanmali |
| R04 | PR03 | Kayitli digest null, yeni digest dolu iken `action=resume`, `source_changed=false` oldu | Bilinmeyen kaynak, degismeyen kaynak sayilmamali |
| R05 | PR02 | Aktif A varken recovery owner B'ye gecti; RUNNING is INTERRUPTED oldu ve resume plani verildi | Ikinci owner mevcut isi bozmadan reddedilmeli |
| R06 | PR03 | Best pointer ilerledikten sonra eski parent uzerinden publish kabul edildi ve yeni head ezildi | CAS gercek head/parent/generation ile uyusmazligi reddetmeli |

`results.json` ve `execution.log` bu sonuclari icerir. Reproducer'in exit 0 vermesi "urun basarili" demek degildir: script mevcut kusurlarin gozlenmesini assert eder. Duzeltme sonrasinda urun testlerinde ters beklentiyle guvenli davranis dogrulanacak; eski bozuk davranisi koruyan test yazilmayacak.

### 2.2 Kanit Dosyalarinin Birebir Kaynagi

| Kaynak | Git blob |
| --- | --- |
| `src/domain/errors.ts` | e31a28fb88acf4c33f45a8d42a6f7e373b62b97f |
| `src/orchestration/lease-manager.ts` | 0591faf50c670f8bf4c7424d6c5b7cb491086b33 |
| `src/orchestration/checkpoint-store.ts` | ee05254bf0fed60f7355cb94f9d616cffeb12f7b |
| `src/orchestration/recovery-manager.ts` | 3d43c41ff28c73e457b3d95f1b30e516c997acca |

## 3. Yeniden Acilan Kritik Bulgular

Oncelik: P0 yayin engelleyici guvenilirlik/izolasyon kusuru; P1 zorunlu urun davranisi/kurulum/rapor entegrasyon kusuru. Bunlar bir kullanici projesinde istismar veya veri kaybi yasandigi iddiasi degildir. Kodun gosterdigi kusur ile gercek ortamda kanitlanmis sonuc ayridir.

### PR01 - Release Verifier Gercek Kabul Kanitini Dogrulamiyor [P0, Kaynak Incelemesi]

Kaynak: `scripts/release-verify.mjs`; `main`, `checkCatalogIntegrity`, `checkCorpusIntegrity`, `checkDistNotStale`.

Mevcut verifier dosya varligi, RT dizisi sayisi/alanlari, fixture sayilari, dokuman marker'lari ve referans HTML hash'ini kontrol ediyor. Gercek kabul run'larini, tum zorunlu predicate'leri, kaynak/run/job eslesmesini veya ertelenmis canli kabulleri okumuyor. Buna ragmen genel basari metni ve exit 0 uretebiliyor. Hesaplanan source digest tek basina herhangi bir run'a baglanmiyor; dist freshness tek entrypoint mtime'i ile olculuyor. Secret taramasi da adi staged tree olsa da yalniz dort dosyayi kapsiyor.

Duzeltme:

- Yapilari kontrol eden yerel gate ile tum urun kabul gate'ini acikca ayir. Bare `release-verify` production onayi gibi sunuluyorsa varsayilani full/fail-closed olsun; local mod acik secilsin.
- Makine-okunur sonuc: scope, source commit/tree digest, run manifest kimligi, zorunlu obligation/predicate bazinda durum, eksik/gecersiz/bloke kanitlar, nihai karar ve non-zero gerekcesi.
- Tum zorunlu ID'ler tekil olmali. Eksik ID, duplicate ID, yanlis evidence level, yalniz `passed:true`, bos manifest, yanlis job/commit/run veya hash bozulmasi gecemez.
- Kaynak/paket/lockfile/config/build input digest'i deterministik relative path + baytlarla uret; olcumu ve dagitilacak build'i buna bagla. Dosya mtime'i tek basina provenance degildir.
- Canli pilot PAUSED_BY_USER veya zorunlu platform kaniti NOT_RUN ise full gate non-zero donsun. Local basari full basari gibi yazilmasin.
- Secret kontrolu calisma kapsamiyla dogru isimlendirilsin; yayinlanacak Git/paket artifact envanteri kapsansin. Bulunan ic adres/secret'i public raporda tekrar yazma.

Kapanis: source fixture degil, maintainer komutunun gercek exit ve JSON ciktilariyla pozitif/negatif gate testleri.

### PR02 - Lease Sahipligi, Sure Ve Process Sonlandirma Guvenli Degil [P0, R01/R02/R05 + Kaynak Incelemesi]

Kaynaklar: `lease-manager.ts/acquire/renew/assertFence`; `recovery-manager.ts/planRecovery`; `checkpoint-store.ts/publishCheckpoint`; `job-dispatcher.ts/dispatch`; `docker-runner.ts/run/stopAll`.

Acquire aktif baska owner'i tespit etmesine ragmen kaydi onceden degistiriyor. Dispatcher sonradan reddediyor. Recovery ise mevcut isi INTERRUPTED yapip devam edebiliyor. Dispatcher'in lease'i 300000 ms, baseline timeout'u 600000 ms; okunan normal akis lease heartbeat yenilemesini baglamiyor. Checkpoint publish expiry kontrol etmiyor. Docker timeout yolu platformdan bagimsiz `taskkill` cagiriyor; normal stop yalniz Docker client process'ini hedefliyor, owned container'in durdugunu kanitlamiyor.

Duzeltme:

- Acquisition tek atomik islemde kosullu olmali. Saglikli baska owner varken job, lease, event, accepted pointer ve process sahipligi degismeden fail etsin.
- Expired lease'i geri alan ayni owner/process kimligi dahil stale execution'i ayiracak yeni generation/token uret. Yenileme owner + token + gecerlilik kosullariyla yapilsin; expired token sessiz canlanmasin.
- Heartbeat, deadline, cancellation ve sahiplik kaybi birlikte yonetilsin. Sahiplik kaybinda yeni aday/run/publish durdurulsun. Timer/process cleanup finally ile tamamlansin.
- Checkpoint ve diger sonuc/lifecycle yazimlari gecerli fencing ve beklenen row version ile yapilsin. Reddedilen ikinci dispatch aktif isin durumunu FAILED yapamasin.
- Docker container kimligi/cid ve job sahipligi kalici veya kurtarilabilir sekilde kaydedilsin. Cancel/timeout, owned container stop/kill + wait/inspect ile sonlanmayi dogrulasin. Yabanci container/TUI/process'e dokunulmasin.
- Linux'ta Windows komutu calismasin; spawn error/exit/close tutarli yakalansin. Unbounded stdout biriktirme yerine sinirli stream/log politikasi ve disk butcesi olsun.

Kapanis: R01/R02/R05'in ters beklentili gercek DB testleri; iki ayri process; TTL'yi asan calisma; cancel sonrasi gec sonuc; timeout sonrasi yetim container kontrolu.

### PR03 - Checkpoint, Source Identity Ve Resume Zinciri Eksik [P0, R03/R04/R06 + Kaynak Incelemesi]

Kaynaklar: `job-dispatcher.ts/on_accepted/resumeDispatch`; `checkpoint-store.ts`; `recovery-manager.ts`; `candidate-loop.ts` accepted set yayinlama.

Normal accepted manifest'te HEAD, dirty/build/policy digest'leri, baseline/last trusted run kimlikleri, model/session ve toolchain bilgileri bos. `verifyCheckpoint` yalniz manifest hash/JSON/schema_version kontrol ediyor; accepted test baytlari ve run'lar dogrulanmiyor. Parent generation kontrolu gercek best pointer'i degil, bildirilen eski parent satirini kontrol ediyor. Recovery digest'leri yalniz ikisi de doluysa karsilastiriyor; build digest kullanilmiyor. Resume ayni dispatch'i baseline/discovery'den cagiriyor. Accepted set mutable klasore kopyalaniyor; catch rollback'i hard-kill atomikligi kanitlamaz. Adopted karar kaydi checkpoint basarisindan once yazilabiliyor.

Duzeltme:

- Is basinda kaynak, build/policy/config, cozulmus hedefler ve kullanici hedeflerini degismez kontrat olarak tam icerikle kalici sakla; yalniz digest yeterli degil.
- Git clean olsa bile HEAD ve dosya kimligi dogrulansin. Dirty/non-Git icin sirali canonical relative path + bayt digest'i kullan. Null/bilinmeyen ile ayni kaynak ayrilsin; rename ve build config degisikligi yakalansin.
- Accepted dosyalar immutable content-addressed blob'lar olarak yayinlansin. Manifest her dosyayi, action'ini, boyut/hash'ini, kaynak/run/coverage kanitini ve parent'ini eslesin.
- Publish islemi gecerli lease + gercek best pointer/generation + lifecycle/row version icin CAS yapsin. Adoption ve trusted pointer birbiriyle tutarli commit edilsin. Parent baska job'a ait olamasin.
- Manifest schema, accepted blob varligi/hash/boyut, test run sonucu, source identity ve zorunlu metrikler dogrulanmadan trusted resume verilmesin. Eksik accepted content sessiz sifirlanmasin.
- Kaynak degistiyse eski accepted set yeni baytlarla karistirilmasin. Kontrollu rebaseline/yeni revision ancak acik ve kayitli bir akistir; hedefin altinda eski sonucu basari diye sunma.
- Iterasyon, repair, no-progress, target cursor, zaman butcesi ve son trusted evidence kalici yuklensin. Reddedilmis denemeler de harcanan butceyi tuketsin. Resume bunlari global config ile sifirlamasin.
- Blob/manifest/fsync/rename/DB commit arasi crash noktalarini tasarla. Yalniz catch blogu hard-kill garantisi sayilmaz. Kullaniciya ait olmayan orphan cleanup bile sahipligi kanitlanarak yapilsin.

Kapanis: R03/R04/R06; clean new commit, dirty edit, file rename, build change, missing/corrupt blob, yanlis job/run ve her publish asamasinda hard-kill negatif testleri; ayni job'da gercek kaldigi yerden devam.

### PR04 - Izolasyon Ve Mirror Politikasi Normal Akista Uygulanmiyor [P0, Kaynak Incelemesi]

Kaynaklar: `runners/runner-factory.ts/ensureVerified`; `job-dispatcher.ts/dispatch/buildVerifiedLoopRunner`; `docker-runner.ts/buildTmpMounts/run/provisionDependencies`.

Normal dispatcher `ensureVerified` probe yolunu kullanmak yerine Docker daemon/imaj varligini kontrol ediyor. Dependency preparation mirror listesinde yalniz bos/dolu kontrolu yapiyor; listedeki hedeflerle ag erisimini sinirlamadan `network:bridge` kullaniyor. Bos listeye typed blocker, cagiran fonksiyon bos listede preparation'i atladigi icin o yoldan ulasilamiyor. Tum run'larda ayni Maven cache volume'u writable baglaniyor. Host `~/.m2/settings.xml`, credential'siz oldugu dogrulanmadan dogrudan container'a aktariliyor.

Duzeltme:

- Normal MCP customer job'u gercek verified capability sonucu olmadan baslayamasin. Probe sonucu profil/image/config kimligine baglansin; fixture veya `docker info` production izolasyon kaniti olmasin.
- Network deny/allow davranisi gercek zorlayici mekanizmayla kanitlansin. Mirror allowlist yalniz config veya Maven settings sozu olmasin; yetkisiz hedef/DNS/redirect erisimleri engellensin. Kurum ag kurali kendiliginden degistirilmesin; zorunlu mekanizma yoksa typed blocker verilsin.
- Preparation'da customer POM/extensions/plugin kodunun da guvenilmeyen girdi oldugunu kabul et. Kimlik bilgisi veya serbest egress'i guvenilmeyen execution'a tasima.
- Maven settings icindeki secret'ler ve gerekli salt config ayrilsin. Kurum credential gereksinimi onayli provider/proxy mekanizmasiyla sinirlansin; host settings dosyasinin ro olmasi gizlilik saglamaz.
- Cache immutable temel + job'a ozel writable alan veya esdeger enforce edilen izolasyonla ayrilsin. Bir job digerinin cache/artifact'ini degistiremesin.
- Capability probe komutu calismadiginda, tool eksikliginde, stale probe dosyasinda veya cgroup olcumunde hata varsa fail-closed olsun. Bos ciktidan "secret yok/izin yok" sonucu uretme.
- Image ve runtime ortam kimligini kaydet; desteklenmeyen profil durumunu acik bildir. Guvenlik gerekcesiyle host execution fallback ekleme.

Kapanis: gercek Docker ile negatif egress, host secret, source write, cache cross-job, output write, non-root, memory ve process ownership testleri. Kurum izolasyon profili bu ortamda kanitlanamiyorsa NOT_RUN/BLOCKED kalir.

### PR05 - Baseline, Maven Kapsami Ve Final Sonuc Guvenilir Degil [P0, Kaynak Incelemesi]

Kaynaklar: `orchestration/build-plan.ts`; `candidate-loop.ts/readCoverageAfterRun/workspaceCoverage/iterate/replayAcceptedSet`; `job-dispatcher.ts/dispatch`.

Maven coverage plani `test` + `jacoco:report`; affected module listesi komuta yansimiyor. Agent kurulumu/varligi ile run/report zinciri kanitlanmiyor. Coverage reader yalniz root `target/site/jacoco/jacoco.xml` okuyor. Writable mount yalniz root target icin kuruluyor. Baseline original checkout uzerinden calisiyor; loop baslangic olcumu stale checkout XML'inden gelebiliyor. Aday workspace her seferinde degisebilen orijinal checkout'tan kopyalaniyor. All-skipped baseline PASSED olabiliyor; malformed/UNSTABLE/NO_TESTS ayrimi caller'da yeterince korunmuyor. Final replay'in basarisi Maven exit0 + timeout olmamasina bagli; Surefire/Failsafe test sonuclari final kararda yeniden dogrulanmiyor.

Duzeltme:

- Baseline dahil tum execution frozen kaynak + ayri workspace'te olsun. Adaylar original checkout'a yazilmasin; baseline icin de orijinal target/log uretimi yapilmasin.
- Effective Maven plan: reactor, affected modules/dependency scope, source/test roots, parent/profile/plugin/framework, skip ve failure-ignore politikasi gercek kullanimla cozulsun. Cozulemeyen destek typed blocker olsun; tahminle PASSED deme.
- POM/build degistirmeden destekli JaCoCo agent + run + report yolu sagla; mumkun degilse BLOCKED_COVERAGE_CONFIGURATION. Kullanici argLine/politikasini bozma.
- Her modulun output mount/report kimligi dogru olsun. Ayni FQCN farkli modullerde karismasin. Custom test root destekleniyorsa policy/applier da ayni cozulmus root'u kullansin; hardcoded `src/test/java` varsayimini kaldir.
- JaCoCo XML/class/source/run kimlikleri eslesmeden counter kullanma. Once/sonra ayni payda/kapsam ile exact counter oranlari karsilastirilsin; bps yuvarlamasi karar kaynagi olmasin.
- Test exit0 olsa da failure/error varsa basarisizdir. XML validation/schema, sayac tutarliligi, test kimligi ve fresh run baglantisi zorunlu olsun. Bozuk XML, framework bilinmiyor, test yok, tum testler skipped, failure-ignore ve time-out ayri tutulur.
- Baseline/aday/final stage'lerinde gerekli tum scope'un test kesfi ve calismasi dogrulansin. Aday dosyasinin derlenmesi, kesfedilmesi, kosmasi ve meaningful assertion kalite kontrolleri ayri kanitlansin.
- Son sonuc yalniz temiz accepted-set replay + test/pass/regression + coverage + policy kanitindan gelsin. Yalniz XML varligi veya Maven exit0 TARGET_REACHED uretemez.
- Mevcut basarili testler korunur. Karsilastirmada baseline test inventory kaybolmasi/skip artisi/silme ile elde edilen gorunur coverage kazanci kabul edilmez.

Kapanis: tek/cok modullu ve custom test root fixture'lari; JaCoCo configured/absent; stale/wrong XML; all-skipped; ignore-failure exit0; derlenen ama kosmayan aday; source mismatch; branch-only kazanc; branch 0/0 ve unavailable ayrimi; gercek final replay.

### PR06 - MCP Hedef/Model/Kontrat/Repair Akisi Parcalanmis [P1, Kaynak Incelemesi]

Kaynaklar: `application/services.ts/handleTestStart`; `job-dispatcher.ts/buildGoalContract/dispatch/generateCandidateFromWorker/resumeDispatch`; `candidate-loop.ts/iterate`.

Servis module hedefini sinif listesine aciyor; dispatcher bu listeyi almadan module selector'u yeniden sinif gibi ariyor. Kontrat resolved_fqn=null degerlerle kuruluyor ve normal yolda yalniz digest'leri kaydediliyor. Kullanici model_profile'i ephemeral kontratta gorunse de generation global OpenCode profilini okuyor; GoalContract model_profile=null. Repair butcesi tasiniyor ama generate callback'i onceki compiler/test hatasini veya accepted kaynaklari almiyor. Test context'i original checkout'taki ilk bes teste indirgenebiliyor. Total job time ve farkli target'larda paylasilan butce normal akisla tam bagli degil.

Duzeltme:

- Tek typed resolver ve frozen concrete target listesi kullan: module + FQCN + source set + source path + snapshot identity. Sinif adi suffix'i veya dosya adina bakarak test/production ayrimi yapma.
- Package/module expansion limit/butcesini somut hedef sayisina gore uygula. Baslangicta kullaniciya donen hedefler runtime/resume/report ile ayni olsun.
- Kontratin tam icerigi, surumu/digest'i ve model secimi kalici olsun. Runtime ve resume, global config yerine sabit kontrati kullanir; kontrollu revision disinda sessiz degisiklik yoktur.
- Model kimligi birebir uygulansin. Profil yok/erisim yok/worker kapali durumlari acik typed blocker olsun. Deneme baslamadan durable attempt yazilsin; ensureRunning/createSession/prompt/schema/cleanup hatalari da kayitli olsun.
- Iterasyon/repair geri beslemesi gercek derleyici, test ve coverage ciktilarinin guvenli/sinirli temsiliyle saglansin. Accepted test govdeleri ve ilgili dependency/testler context'e girsin. Sessiz truncation yok; manifest eksikleri acik gosterir.
- `max_repairs_per_candidate`, no-progress, total job deadline ve targetlar arasi toplam maliyet/butce gercekten enforce edilsin ve kesinti sonrasi tuketim korunsun.
- Desteklenen mode degerlerini mevcut schema'dan dogrula; baseline-only gibi modlar varsa normal handler -> dispatcher -> rapor yolunda uygulanmali, sadece request digest'ine konmamali.

Kapanis: normal MCP target/model/mode/repair/budget testleri; ayni isimli farkli moduller; sinif adi Test ile biten production sinifi; no-progress ve source isteyen model output'u; farkli modelle resume'da sabit kontrat ve acik revision kurali.

### PR07 - Report06, Gercek Rapor Verisi Ve Export Zinciri Tamamlanmamis [P0/P1, Kaynak Incelemesi]

Kaynaklar: `job-dispatcher.ts` final reportData ve exporter cagrisi; `reporting/report-generator.ts/buildReport/ReportExporter/verifyExport`; `application/services.ts/handleTestStatus`.

Dispatcher eklenen/degisen test ve run sayilarini sabit 0; test-only gate'i sabit PASSED; production degisiklik sayisini 0; models/gaps'i bos yaziyor. Normal exporter eski sade HTML `buildReport` yolunu cagiriyor; onayli 06 referansinin hash'i tek basina bu baglantiyi kurmuyor. Exporter'a ham JaCoCo/log/patch dosyalari verilmedigi halde HTML bunlarin rapor dizininde oldugunu soyluyor. Job rapordan once COMPLETED yapiliyor; export verification false olursa sadece phase metni ekleniyor. Manifest artifacts bosken verifyExport eksik tespit etmeyebiliyor; bytes degeri okunuyor ama kontrol edilmiyor. Status, original checkout'taki XML'den ilk hedefi okuyabiliyor.

Duzeltme:

- Baseline/progress/final icin tek authoritative facts projection kullan. Status/result/JSON/HTML/print/ozet ayni kayitli evidence'i gorsun; checkout'taki eski XML'e geri donmesin.
- Bilinmeyen, uygulanamaz, calistirilmadi, unavailable ve dogrulanmis sifir ayrilsin. Sayilar gercek Surefire/test inventory/diff/run kayitlarindan gelsin. Politika gate'i ancak korunan scope before/after dogrulamasi ile PASSED olabilir.
- Report06 layout/davranisini uretim renderer'ine bagla. Kullanici onayi olmadan baska tasarima donme; referans ornek verilerini gercek veri yerine koyma. DOM/etkilesim/print/offline ve gercek runtime report acceptance testleri yaz.
- Model serbest yorumu hicbir rapor yuzeyine girmesin. Sanitizer'a tek basina guvenme: schema allowlist/provenance ve rapor yuzeylerinin tamamini negatif test et.
- Gercek accepted patch/source, JaCoCo XML/HTML/assets, test run loglari ve checkpoint manifestlerini izinli hassasiyet/redaksiyon kurallariyla export et. Binary dosya baytlari korunur; text signature ile binary aktarim var sayilmaz.
- Manifest zorunlu dosya/kind kimliklerini, job/source/run/contract eslesmesini, hash ve boyutu dogrulasin. Bos liste, duplicate/empty/reserved path, missing/corrupt/wrong bytes ve symlink/path escape fail etsin.
- Export atomik yayinlansin. Verifier gecmeden rapor READY/final basari karari sunulmasin. Hata olsa da son trusted checkpoint kaybolmasin; acik rapor/teslimat hatasi durumu donsun.
- Rapor icindeki her "dosya var" veya "testler gecti" beyaninin somut artifact karsiligi olsun. Gercek olmayan ham kanit linki/metni kaldirilsin.

Kapanis: normal MCP'den non-zero test/degisiklikli rapor, eksik olcum durumlari, Report06 render, print, tum linkler, binary hash, corrupt manifest, export hatasi sonrasi lifecycle ve JSON/HTML/status tutarliligi.

### PR08 - Temiz Kurulum Varsayilanlari Ve Tasima Guvenilir Degil [P1, Kaynak Incelemesi]

Kaynaklar: `scripts/install.mjs`; `mcp/stdio-entry.ts`; `configuration/config-loader.ts`; `application/services.ts/handleTestStart`.

Worker normal akista yalniz `AITEST_WORKER_ENABLED=1` ise aciliyor. Kurulumun yazdigi OpenCode server entry'si yalniz node + entry path; bu ayari/profil dogrulamasini saglamiyor. Smoke icin ayrica verilen DB path gercek server entry'sinde yok. Config/DB varsayilanlari backslash birlestirmesi kullaniyor; Linux/XDG icin olusturulan konum ile okunan konum ayrisabilir. Default config icinde urune gomulmus ic mirror adresi var; tasinabilir/onayli ortam konfigurasyonu degil. Burada ic adres yeniden yayinlanmamistir.

Duzeltme:

- Kurulum, gercek server entry, config loader ve smoke ayni runtime/config/DB path resolver'ini kullansin. Native path.join; bosluk/Unicode/CMD ve XDG senaryolari dogrulansin.
- Test generation kullanima hazirsa worker/profile secimi tutarli yapilandirilsin. Hazir degilse "MCP handshake basarili, test uretimi hazir degil" gibi ayri readiness sonucu donsun; handshake urun kabulu sayilmasin.
- Kuruma ozel endpoint/credential koddan cikarilip kullanicinin onayli private config'ine alinsin. Mevcut kullanici config'i ezilmesin; acik migration/merge ile guncellensin. Bos config'e kurum adresi tahmin edilmesin.
- Kurulum bagimliliklari lockfile ile tekrarlanabilir kurulsun; paket/build kimligi sabitlensin. `npm audit`/bagimlilik envanteri mevcut tarih ve registry kanitiyla ayrica degerlendirilsin; kanit olmadan "guvenli/vulnerable" denmesin.
- Native better-sqlite3 kurulumu, migration, backup/restore, upgrade/rollback, uninstall ve runtime verilerinin korunmasi desteklenen platformlarda gercekten test edilsin.
- Repo kamuya acik olsa da package private/UNLICENSED kararini kendiliginden degistirme. Dagitim kanali/kurum imzasi yoksa UNSIGNED/NOT_PUBLISHED olarak acik bildir; imzali release var sayma.

Kapanis: temiz Windows CMD kurulum + gercek kaydedilen OpenCode entry'siyle job; desteklenen Linux path senaryolari; upgrade/rollback'de DB/config/job korunumu; eksik provider/dependency icin dogru readiness/blocker.

## 4. Uygulama Paketleri Ve Sira

Bu sira, birbiriyle bagli kusurlarin ustunu daha fazla fixture ile ortmek yerine normal akisi guvenilir hale getirir. Paketler bitmeden yenilerini "VERIFIED" sayma.

| Paket | Uygulama | Zorunlu cikis |
| --- | --- | --- |
| P00 | Devir, eski 004 arsivi, baseline ve bulgu yeniden dogrulama | Gercek HEAD/diff/ortam, mevcut suite sonuclari, acik PR01-PR08 ledger |
| P01 | False-positive release gate'i durdurma | Local/full ayrimi; full eksik kanitta non-zero; negatif gate testleri |
| P02 | Lease, owner, fencing, heartbeat ve cancellation | R01/R02/R05 guvenli davranis; iki process ve timeout testleri |
| P03 | Immutable contract/source/accepted blobs + atomic checkpoint | R03/R04/R06 guvenli davranis; crash noktasi ve gercek resume testleri |
| P04 | Zorunlu izolasyon, controlled provisioning, cache/secret/process siniri | Gercek Docker capability ve egress negatif testleri veya acik blocker |
| P05 | Tek resolver, model/mode, persistent butce ve repair | Normal MCP'de kullanici talebinin birebir uygulanmasi |
| P06 | Frozen baseline, effective Maven, per-module JaCoCo ve final verification | Gercek Java fixture'larinda test/calismis coverage provenance'i |
| P07 | Report06 facts-only projection + guvenilir artifact/export | Non-zero gercek verili end-to-end rapor ve negative export tests |
| P08 | Kurulum/konfigurasyon/upgrade/backup readiness | Gercek server entry'si ile desteklenen platform kabulu |
| P09 | Tum regression ve zorunluluk ledger'inin commit'e bagli son dogrulamasi | Tam test/typecheck/build/lint + kabul manifestleri + local/full ayri exit |
| P10 | Teknik devir ve yayin karari | Acik kalanlar, son trusted artifact, FULL gate karari; otomatik deploy yok |

P01 gate'i hemen guvenli hale getirir; fakat kalan PR02-PR08'i sadece BLOCKED yazarak gorev kapatilamaz. Uygulanabilir yerel/izole duzeltmeler bitirilir. Ortam/onay gerektiren kabuller ayri bloke kalir; full release onayi verilmez.

## 5. Zorunlu Kabul Senaryolari

Asagidakiler onceki 004 ve arsiv kabullerine ektir. Test case kimligi, gercek test path'i, command/run id, source digest, exit/result ve artifact hash'i ledger'de tekil eslestirilir. Bu tablo tek basina test sonucu degildir.

| ID | Senaryo ve kabul kosulu |
| --- | --- |
| PP01 | Full release gate, live/platform evidence eksikken non-zero; local pass'ten full pass uretilmez |
| PP02 | Eksik/mukerrer obligation, yanlis predicate veya sadece passed:true olan evidence reddedilir |
| PP03 | Yanlis commit/tree/lockfile/build digest, corrupt hash, baska job/run evidence'i reddedilir |
| PP04 | R01: aktif lease'i isteyen B reddedilir; A'nin owner/token/lifecycle/event/pointer'i degismez |
| PP05 | R02: expired lease checkpoint/lifecycle/outcome yazamaz; renewal expired token'i diriltemez |
| PP06 | R05: aktif A varken recovery B mevcut isi INTERRUPTED/FAILED yapamaz |
| PP07 | Iki ayri process ayni job'u tek owner olarak yurutur; TTL ustu heartbeat ve owner kaybi test edilir |
| PP08 | Cancel/timeout sonrasi owned container gercekten durur; gec sonuc pointer veya lifecycle'i degistiremez |
| PP09 | Linux spawn failure/timeout event'i yakalanir; Windows taskkill Linux'ta cagrilmaz; log butcesi enforce edilir |
| PP10 | R03: accepted blob eksik/bozuk veya wrong-job iken resume/READY reddedilir |
| PP11 | R04: null/eslesmeyen source/build/config identity unchanged sayilmaz |
| PP12 | Clean commit degisimi, dirty kaynak, rename ve POM/profile degisimi kaynak kontrolunden kacamaz |
| PP13 | R06: stale parent publish best pointer'i ezemez; expected head CAS gercekten uygulanir |
| PP14 | Blob write/manifest publish/DB commit/accepted karar arasi her kritik noktada hard-kill; onceki trusted state korunur |
| PP15 | Resume ayni job/target cursor/accepted set/butce/kontratla surer; reddedilen denemeler unutulmaz |
| PP16 | Izolasyon probe'u gecmeden normal MCP customer job'u baslamaz; host fallback yok |
| PP17 | Yetkisiz egress/DNS/redirect gercek container'da reddedilir; onayli dependency erisimi ayri kanitlanir |
| PP18 | Bos mirror/config, missing probe tool, stale probe output ve NO_CGROUP false-success uretemez |
| PP19 | Customer execution host secret/settings credential'ini okuyamaz; job A, job B cache'ini degistiremez |
| PP20 | Baseline, aday ve final sirasinda original checkout bytes ve dirty/untracked kullanici dosyalari korunur |
| PP21 | Adaylar ayni frozen snapshot'tan uretilir; calisma ortasinda original kaynak degisimi olcume karismaz |
| PP22 | Tek module, cok module, ayni FQCN farkli module ve custom test root dogru cozulur/run edilir |
| PP23 | Package/module hedef listesi servis/kontrat/dispatcher/resume/report'ta aynidir; production LoadTest yanlis elenmez |
| PP24 | Kullanici model_profile'i birebir generation'a gider; yetkisiz/olmayan model typed blocker verir |
| PP25 | Var olan mode'lar normal MCP'de gercek davranisi degistirir; baseline-only ise generation yapilmaz |
| PP26 | Compile/test failure repair feedback'e girer; bounded repair, no-progress ve toplam deadline enforce edilir |
| PP27 | JaCoCo agent/run/report zinciri POM degistirmeden desteklenir veya typed blocker verir |
| PP28 | Root/per-module/stale/wrong-source/wrong-class coverage eslesmeleri dogrulanir; eksik veri 0%/100% sayilmaz |
| PP29 | Exit0 + Surefire/Failsafe failures, malformed XML veya tutarsiz sayac final basari veremez |
| PP30 | All-skipped, test yok, framework bilinmiyor, timeout ve UNSTABLE ayri durumlar olarak korunur |
| PP31 | Aday test derlenir, kesfedilir, calisir; baseline test inventory/regresyon ve anlamli assertion/duplicate kalite kapilari korunur |
| PP32 | Exact counter kazanci, branch-only improvement, branch 0/0, unavailable ve threshold siniri dogru karar verir |
| PP33 | Final replay yalniz accepted setten gelir; reddedilen son aday veya checkout XML'i karara giremez |
| PP34 | Gercek eklenen/degisen test sayisi ve run summary non-zero ornekte DB/JSON/HTML/status'ta tutarlidir |
| PP35 | Dogrulanmayan test-only gate PASSED olamaz; unknown veri sifir gibi gosterilmez |
| PP36 | Normal MCP uretimi Report06 renderer'ini kullanir; referans hash korunur, ornek veri tasinmaz |
| PP37 | Rapor baseline/progress/final, print/offline, DOM ve link kontrolleri gercek runtime data ile gecer |
| PP38 | Model narrative/risk/kabul yorumu JSON/HTML/print/ozet dahil hicbir rapor yuzeyine giremez |
| PP39 | Export'ta accepted patch, raw evidence ve binary asset baytlari dogru; missing/hash/size/path/job/run hatasi reddedilir |
| PP40 | Bos/duplicate/reserved/empty manifest entry veya export failure READY/COMPLETED basarisi uretemez |
| PP41 | Temiz Windows CMD kurulumda gercek OpenCode entry'si dogru config/DB/runtime/worker profilini kullanir |
| PP42 | Desteklenen Linux/XDG/bosluk/Unicode path'lerinde config ve DB ayni native path'tedir |
| PP43 | Eksik worker/model, dependency veya Docker halinde handshake pass urun-ready diye sunulmaz |
| PP44 | Upgrade/migration/backup/restore/rollback/uninstall son trusted job/config/veriyi korur |
| PP45 | Son commit'te tam suite/typecheck/build/lint ve gate'ler yeniden calisir; test sayisi/log/hash gercektir |
| PP46 | Canli pilot onayi yoksa calismaz; full gate NOT_PASSED/PAUSED engelini acik non-zero raporlar |

### 5.1 Test Kalitesi Ve Kabul Seviyeleri

- String `includes`, import varligi veya yardimci sinifa dogrudan happy-path cagri normal MCP entegrasyon kaniti yerine gecmez.
- Birim testler hizli hata izole eder; kritik senaryolar gercek production migration'lari ve better-sqlite3 ile entegrasyon seviyesinde de calisir.
- Kontrol edilen sahte model sunucusu/fixture worker protokol deterministikligini test edebilir. Bu testler canli kurum modelinin test uretim kalitesi/kabulu olarak etiketlenmez.
- Java execution gercek Maven/JUnit/JaCoCo + guvenli Docker yolunda yapilir. Corporate kaynak kodu gerekmeyen kucuk sentetik fixture'lar kullanilir; ham kurum kodu public repoya konmaz.
- Meaningful assertion, edge-case, exception, regression, duplicate, private reflection ve coverage manipulation kontrolleri korunur. Mevcut basarili testleri kaldirip coverage yukseltme yasaktir.
- Mevcut bir test kusurlu davranisi bekliyorsa gerekceyi ve yeni guvenli beklentiyi kaydet. Testi sirf yesil yapmak icin assertion silme veya excluded kapsam yaratma.

## 6. Kalici Checkpoint Ve Modeller Arasi Devir

Her checkpoint/model devri, asagidaki bilgiyi gercek degerlerle tutar. Bu basliklar gelistirme artifact kontratidir; ayni isimleri runtime DB'ye dogrudan ekleme zorunlulugu yoktur.

- Gorev/surum, son branch/HEAD ve dirty tree digest'i.
- Okunan AGENTS/aktif gorev/archive kimlikleri ve hash'leri.
- Tamamlanan paketler; her biri icin degisen path'ler, davranis farki, gercek test komutu/exit ve kanit konumu/hash'i.
- Acik PR/PP kimlikleri: IMPLEMENTED, LOCAL_VERIFIED, RUNTIME_VERIFIED, NOT_RUN, BLOCKED veya FAILED ayrimi. "Hepsi tamam" toplu etiketi kullanma.
- Sahipligi bilinmeyen/kullaniciya ait dosyalar ve dokunulmama siniri.
- Son basarisiz testin adi, hata ozeti ve next action; done listesi ile karistirma.
- Bir sonraki tek somut is, ilgili kod/test path'i ve beklenen sonuc.
- Canli pilot kontrolu, mevcut kullanici izinleri, Git commit/push ve yayin siniri.
- Full acceptance sonucu ile local sonucu ayri; imzasiz/yayinlanmamis paket durumu acik.

Yeni model "kaldigin yerden devam et" dediginde once HEAD ve artifact butunlugunu kontrol eder. Onceki modelin metnine guvenerek testleri veya analizi basarili saymaz. Degismeyen dogrulanmis parcayi yeniden tasarlamaz; kalan somut isten surer.

## 7. Dogrulama Komutlari Ve Kanit Kaydi

Windows CMD'de mevcut proje scriptleri kullanilir:

```text
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run lint
npm.cmd test
node scripts/release-verify.mjs
```

Bu komutlar hedef ortamda gercekten calistirilir; bu dosyada yaziyor olmalari execution kaniti degildir. Local/full parametreleri ve yeni maintainer test scriptleri P01'de uygulanip dokumante edilir; var olmayan CLI komutlarini varmis gibi calistirma. Linux'ta native npm kullanilir. Docker/Maven/platform/benchmark acceptance icin uretilecek maintainer harness'lar normal urun yollariyla ayni evidence kontratina baglanir.

Her run kaydi en az: komut, working directory'nin redakte/canonical kimligi, source commit/tree digest, platform/toolchain surumleri, UTC baslangic/bitis, exit/signal/timeout, test sayilari ve tekil sonuclar, stdout/stderr artifact path/hash/size, gerekli fixture ve config digest'ini tasir. Secret/env degerlerinin tamami loglanmaz.

Gelistirme repoya girecek kanit ozetleri redakte ve kucuk tutulur. Ham runtime/test/customer evidence ayri store'dadir; ozetler dogrulanabilir referanslari tutar. Yalniz hash listesi, hic uretilmemis test sonucunu kanitlamaz.

## 8. Tamamlanma Ve Yayin Karari

### 8.1 Yerel Duzeltmelerin Kapanisi

P00-P10 icindeki uygulanabilir urun kodu, normal MCP entegrasyonu, regresyonlar, deterministic report/exports ve dokuman/ledger tutarliligi gercekten dogrulandiginda local kapanis verilebilir. R01-R06 icin yeni regresyonlar guvenli davranisi beklemeli ve production DB entegrasyonunda gecmelidir.

Tek bir local etiketi, gercek Docker veya Windows testlerinin olmadigini saklamaz. Her kabulu kendi evidence level'inda goster. Uygulama bittigi halde ortam kaniti eksikse sonucu "kod hazir, ilgili kabul NOT_RUN/BLOCKED" olarak ayir.

### 8.2 Full Product Acceptance

Su kosullar birlikte saglanmadan production GO verilmez:

- PR01-PR08 kapsamindaki yayin engelleyici kusurlar ilgili kanitla kapali.
- Tum gecerli zorunlu AC/RG/RT/PRO/N/PP kabulleri beklenen seviyede gecti; zorunlu NOT_RUN/BLOCKED kalmadi.
- Gercek hedef kurulum/izolasyon/upgrade ve hard-kill/iki-owner kabulleri dogrulandi.
- Durdurulmus canli pilot/benchmark icin gerekiyorsa kullanici ayrica onay verdi ve gercek normal MCP kaniti elde edildi. Onay verilmediyse full kabul acik kalir.
- Final replay, rapor, artifact manifesti ve dagitilacak paket ayni kaynak/build kimligine bagli.
- Dagitim kanali, rollback/backup ve yayin yetkilendirmesi net; mevcut imza durumu durustce gosteriliyor.

**Full gate non-zero ise production NO_GO kalir.** Kullanici daha sonra acikca sinirli, non-production pilot onaylayabilir; bu full GO diye yeniden adlandirilmaz. Bu gorev bitmedi diye kapsam disi refactoring veya customer production degisikligi acma.

### 8.3 Son Teslim

Son handoff, gercek degisen dosyalar/diff, test ve kabul kanitlari, korunan sinirlar, kalan bloke isler ve local/full gate ciktilarini icermelidir. Yapilmamis isi "uygulandi" deme. Commit/push/yayin yapildiysa gercek SHA ve artifact'i belirt; yapilmadiysa acik yaz.

## 9. Kaynak Referanslari

Tum repo bulgulari yukarida sabitlenen ac931821f8b9488b264c85d4f616c2ab74383613 commit'ine aittir. Kaynaklari yeni HEAD'de tekrar dogrularken GitHub blob veya yerel Git ile ayni path'leri kullan.

- Repository: https://github.com/mehmet-karacan/ai-test-engineering/tree/ac931821f8b9488b264c85d4f616c2ab74383613
- Docker bridge network resmi dokumani: https://docs.docker.com/engine/network/drivers/bridge/
- Docker container stop resmi dokumani: https://docs.docker.com/reference/cli/docker/container/stop/
- JaCoCo prepare-agent resmi dokumani: https://www.jacoco.org/jacoco/trunk/doc/prepare-agent-mojo.html
- JaCoCo report-aggregate resmi dokumani: https://www.jacoco.org/jacoco/trunk/doc/report-aggregate-mojo.html
- Node child_process resmi dokumani: https://nodejs.org/api/child_process.html

Bu dis kaynaklar ag/process/olcum tasarimini destekler; kullanicinin kurum ortamindaki kurallarin uygulandigini kanitlamaz. Surum/politika ve gercek platform davranisi uygulama sirasinda yeniden dogrulanir.
