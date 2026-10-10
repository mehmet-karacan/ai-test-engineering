# AKTIF_GOREV - AI Test Engineering: Gercek Uctan Uca Akis ve Guvenli Kabul

## 0. Gorev kimligi, yetki ve baslangic protokolu

- Gorev kimligi: `AITE-REMEDIATION-002`
- Belge surumu: `1.1`
- Inceleme tarihi: `2026-10-10`
- Repository: `https://github.com/mehmet-karacan/ai-test-engineering`
- Incelenen dal: `main`
- Incelenen HEAD: `c5307f5315a288092a1293d874c335f8db5ecd3d`
- Onceki gorev: `AITE-FOUNDATION-001`, repository'deki `AKTIF_GOREV.md` v1.0.
- Amac: Onceki gorevin mevcut implementasyonundaki kanitli hatalari duzeltmek, kopuk bilesenleri gercek MCP kullanici akisina baglamak ve ilk kapsamli teslimati gercek kabul kanitlariyla tamamlamak.
- Bu bir yeni urun/yeniden yazim/UI gorevi degildir. Mevcut kod, anlamli testler, kararlar ve Git gecmisi korunur.
- Uygulayici model bu dosyayi yalniz ozetlemez; asamalari uygular, test eder ve kesilirse kayitlardan devam eder.

### 0.1 Ilk yapilacaklar

1. Mevcut `AGENTS.md`, bu belge, `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md` ve son handoff'u oku. Gercek branch/HEAD/status/remote'u kontrol et.
2. Incelenen HEAD'den sonra commit varsa ilgili diff'i incele. Bu belgede duzeltilmesi istenen bir konu zaten giderilmisse bunu test ve commit kanitiyla isaretle; duzeltilmis kodu eski hale getirme. `reset --hard`, `clean`, otomatik stash, force push veya kullanici dosyasi silme yapma.
3. Onceki gorevin orijinal metnini, belirtilen commit'in Git nesnesinden okuyarak `ai/tasks/archive/AITE-FOUNDATION-001.md` altinda arsivle. Mevcut arsiv varsa hash/icerik kontrolu yap, ezme. Yeni aktif gorevi yanlislikla eski gorev diye arsivleme.
4. `AGENTS.md` baslangic protokolunu bu aktif goreve ve arsivdeki R01-R20/AC01-AC70 sozlesmesine yonlendir. Eski bolum numaralarini yeni dosyada ayni sanma. Tek aktif giris noktasi kokteki `AKTIF_GOREV.md` olsun.
5. `ai/reviews/2026-10-10-foundation-review.md` olustur; bu belgedeki F01-F14 bulgularini kaynak/islev ve tekrar uretme kanitiyla takip et. Gecmis "tamamlandi" kayitlarini silme; yeni denetimin onlari neden gecersiz kildigini acik bir duzeltme kaydi ekle.
6. Mevcut `FULL_ACCEPTANCE_VERIFIED` etiketi yeniden kullanilmayacak. Ilk durum `REMEDIATION_IN_PROGRESS`; eski 70/70 kaydi tarihsel model beyanidir, yeni kabulun gercegi degildir.
7. **Guncel hatali `scripts/install.ps1` ve `scripts/clean-install-verify.ps1` dosyalarini gercek kullanici konfigurasyonunda calistirma. Once D01'deki koruma ve izole kurulum testleri tamamlanacak.**
8. **Windows'ta PowerShell script calistirma yetkisi olmayabilir. Kurulum/verify/uninstall ve gelistirme komutlari PS1'e bagimli olmayacak; CMD + Node.js standart yol olacak. Kurumsal imza/execution policy ayarini degistirme veya dolanma. Git sadece surum kontrolu icin, Git Bash ise kurulu ve izinliyse opsiyonel shell icin kullanilabilir.**

### 0.2 Kanit duzeyleri ve bu incelemenin siniri

Bu belge, kullanicinin verdigi oturum kaydi, GitHub connector ile okunan sabit commit kaynaklari ve resmi OpenCode/Node/MCP belgelerinin karsilastirilmasina dayanir. Kaynakta gorulen hata ile gercek ortamda calistirilarak dogrulanan davranis ayri tutulmustur.

- Oturum kaydi `session-ses_ede2.md`, modelin 168/168 TypeScript testinin gectigini ve son commit'in push edildigini bildiriyor. Bu tarihsel cikti reddedilmiyor; ancak bu testlerin kapsami tum urun sozlesmesini kanitlamiyor.
- Bu inceleme ortaminda tam repository build'i, 168 test, Docker, Windows kurulum, Maven veya kurum ici model kabul testi yeniden calistirilmadi. Container Node surumu `v22.16.0`; urunun hedefi Node 24 ailesi. Maven/Docker/PowerShell bu ortamda yoktu. GitHub connector okumasi calisti, container'dan repository clone'u DNS nedeniyle basarisizdi.
- Bazi saf ifade davranislari ayri mikro deneyle tekrar uretildi: test-root ham prefix/canonical path uyusmazligi, HTTP 204'te JSON parse hatasi, ic ice message nesnesini duz okuma, POSIX ters slash yolu, tautolojik assertion regex acigi. Bunlar tam urun test sonucu degildir.
- Gercek kurum kaynaklarina/endpoint'lerine erisilmedi, repository'ye degisiklik/commit/push yapilmadi. Bu gorevi uygulayan model kendi ortaminda gercek dogrulama yapmak zorundadir.

**Hedef:** "Kod dosyasi var" -> "bilesen testi geciyor" -> "normal MCP yolundan calisiyor" -> "kesinti/guvenlik/kabul testleri geciyor" basamaklarini ayri ve kanitli tamamla.

---

## 1. Degismeyen urun sozlesmesi

Arsivlenen foundation gorevinin R01-R20 ve AC01-AC70 maddeleri gecerliligini korur. Bu belge, onlara aykiri implementasyonu duzeltir; kapsamlarini azaltmaz.

| Konu | Baglayici davranis |
| --- | --- |
| Arayuz | Kullanici mevcut OpenCode CLI/TUI'yi kullanir. Yeni test CLI'i, web UI veya IDE eklentisi yok. |
| Windows komut ortami | PowerShell/PS1 gerektirmeden CMD (`cmd.exe`) ve Node.js ile kurulum, dogrulama, kaldirma ve gelistirme testleri. Git Bash yalniz opsiyonel; Git.exe surum kontrol aracidir. |
| Entegrasyon | Gercek MCP server + application services + kalici job motoru. Skill yalniz kisa yonlendirme katmanidir. |
| Dogal dil | "PaymentService icin coverage %90 olsun" normal giristir. Kesif/analiz/tasarim/uretim/test/olcum otomatik ilerler. |
| Varsayilan hedef | Secilen her sinif icin LINE ve uygulanabilir BRANCH hedefi. Proje ortalamasi, yuvarlama veya line-only karar basari yerine gecmez. |
| Musteri kaynaklari | Production, POM/build, wrapper, coverage politikalari degistirilmez. Test icinden uretim kodunu/shadow siniflari/agent'i degistirerek sonuc oynanmaz. |
| Testler | Yalniz dogrulanmis test koklerinde yeni test/iyilestirme. Mevcut anlamli testler silinmez, devre disi birakilmaz veya anlamsizlastirilmaz. |
| Calistirma | Musteri build/test kodu guvenli izole runner'da calisir. Izolasyon yoksa BLOCKED; sessiz host fallback yok. |
| Kabul | Sonucu model degil gercek build/test/JaCoCo/provenance ve kalite kapilari belirler. |
| Hedef saglanmazsa | Son dogrulanmis test seti korunur. Plateau, butce, ortam engeli, testability engeli ve belirsizlik birbirinden ayrilir. |
| Devam | Konusma gecmisi olmadan ayni job/checkpoint'ten devam; model degisebilir. Ilerleme sifirlanmaz. |
| Depolama | SQLite proje/checkout/envanter/test/job/run/coverage/model gecmisini tutar; buyuk ve hassas artifact'ler dis yerel store'dadir. |
| Rapor | OpenCode ozeti + offline HTML + JSON + gercek JaCoCo XML/HTML + test loglari + patch + checkpoint. IDE'de yeniden coverage kosmak gerekmez. |
| Uygulama | Orijinal checkout'a yazma ayri ve acik onaylidir. Guvenilir onay adapter'i yoksa patch-only sonuc; modelin "onay verildi" metni yetki degildir. |
| Ortamlar | Tek/cok modullu Maven; mevcut JUnit 4/5 ve varsa Mockito; Windows ve Linux icin gercek destek kaniti. |
| Gizlilik | Kurum ici endpoint, token, customer kaynak/rapor/DB ve raw session public repository'ye gitmez. |
| Sinir | Zekam, yeni UI/CLI, SaaS, Jenkins botu, Gradle motoru, otomatik production refactor veya yeni dil kapsam disidir. |

Urunun kendi `src/`, testleri ve build dosyalari bu gorevde degistirilebilir. Musteri projesine ait test-only kurali, MCP urununu gelistirmeyi engelleyen genel bir yazma yasagi degildir.

---

## 2. Sabit commit'te tespit edilen bulgular

Kaynaklarin tumu bolum 12'deki inceleme commit'ine baglidir. Oncelik P0: guvenlik, veri kaybi, yanlis basari veya ana kullanici akisinin eksikligi. P1: zorunlu destek/kalite/kabul eksigi. Tam satir numarasi, uygulanacak HEAD'de degisebilecegi icin islev adlariyla birlikte dogrulanacak.

### F01 - P0: MCP is kaydi aciyor, otomatik test muhendisligini calistirmiyor

**Kaynak:** `src/mcp/stdio-entry.ts`, `src/mcp/server-setup.ts:createToolRegistry`, `src/application/services.ts:handleTestStart/handleTestStatus`.

Gercek stdio girisi dort arac kaydediyor: `project_inspect`, `project_query`, `test_start`, `test_status`. `test_start` kesif/is kaydi/event olusturup donuyor. Buradan CandidateLoop, OpenCode worker, Maven runner, checkpoint veya rapor akisina dispatch yok. `test_status.last_trusted_coverage` sabit `null`. `test_resume`, `test_cancel`, `test_result`, `test_apply` normal MCP yuzeyine bagli degil.

**Etkisi:** Bilesenlerin ayri ayri varligi, "tek cumleyle biten ve devam edebilen urun" anlamina gelmiyor. `tests/integration/stdio-client.test.ts` yalniz dort araci, is kimligini ve event varligini dogruluyor; job'un test uretip bitmesini beklemiyor.

**Kapatma:** D02; normal dagitilan server entrypoint'inden, gercek transport uzerinden RG11-RG14 ve RG41-RG44.

### F02 - P0: Windows kurulum merge islemi diger MCP baglantilarini silebiliyor

**Kaynak:** `scripts/install.ps1`, ozellikle `Add-Member -Name mcp -Force -Value $null`; `scripts/clean-install-verify.ps1`; oturumdaki temiz-kurulum ciktilari.

Installer, mevcut `mcp` alanini okumadan once `null` yapiyor, sonra yalniz kendi kaydini yaziyor. Bu merge degildir. Temiz-kurulum testi sadece `LOCALAPPDATA` degistirirken installer `USERPROFILE/.config/opencode/opencode.json` dosyasina yaziyor; oturum ciktilari gercek kullanici config'inin bu denemelerde degistirildigini gosteriyor. Gecici backup dizini temizlikte silinebiliyor.

**Etkisi:** Diger MCP baglantilarinin kaybi, testin gercek kullanici ayarini kirletmesi. Bu inceleme kullanicinin mevcut config'ini okumadi; hangi kayitlarin fiilen kayboldugu bilinmiyor.

**Kapatma:** D01. Once mevcut dosyanin guvenli yedegi; yalniz kayip oldugu kanitlanan kayit icin kullanici onayli kurtarma. Tum config'i eski backup ile korlemesine ezme.

### F03 - P0: BRANCH hedefi varken LINE ile TARGET_REACHED veriliyor

**Kaynak:** `src/orchestration/candidate-loop.ts:iterate`.

`branch_target_bps` girisi var ama hedef karari yalniz `afterBps >= line_target_bps`; `afterBps` LINE sayacindan geliyor. `candidate === null` yolunda da yalniz LINE kontrol ediliyor. `evaluateMetric/evaluateTarget` import edilmis olmasi gercek dongude kullanildigi anlamina gelmiyor.

**Etkisi:** LINE %95, BRANCH %40 olan sinifa %90 hedefine ulasildi denebilir. Branch-only kazanim da kaybedilebilir.

**Kapatma:** D05; her karar yolu ayni per-target/per-metric dogrulayicidan gecsin. RG21-RG23 zorunlu.

### F04 - P0: Sonuc puani tutuluyor, birikimli dogrulanmis test seti sahiplenilmiyor

**Kaynak:** `src/orchestration/candidate-loop.ts:applyOverlay/revertOverlay/iterate`, `src/application/patch-applier.ts`.

Aday overlay'i `finally` icinde geri aliniyor; daha sonra karar `adopted` olabiliyor. Sonraki iterasyon, onceki kabul edilmis testlerin birikimli snapshot'i yerine eski calisma agaci uzerinden baslayabiliyor. Loop DB/checkpoint/artifact katmanlarina bagli degil. Ayni staging alaninda reddedilen/yarim aday dosyalari kalabiliyor. `max_repairs_per_candidate` gercek repair dongusune baglanmamis.

**Etkisi:** Yuksek coverage rakami ile disari verilen test dosyalari farkli hale gelebilir; kesinti sonrasinda sonucun yeniden kurulmasi kanitli degil.

**Kapatma:** D05/D06; immutable baseline + accepted test snapshot + ayri candidate snapshot. Final export, yeni temiz workspace'te yeniden olculen ayni accepted set olmalidir.

### F05 - P0: Docker bileseni var, normal test dongusu host Maven calistiriyor

**Kaynak:** `src/runners/maven-runner.ts`, `src/runners/docker-runner.ts`, `src/orchestration/candidate-loop.ts`.

Loop varsayilani `new MavenRunner()`; bu sinif host `spawn` ile calisiyor ve `process.env`'i miras veriyor. DockerRunner eklenmis olsa da bu yolun yerine baglanmamis. Docker timeout yolu platforma bakmadan `taskkill` kullaniyor; Docker CLI process'ini oldurmek container sonlanma kaniti degil. Writable mount'larin sahipligi/siniri dogrulanmiyor. Log/buffer ve disk sinirlari tamamlanmamis. `assertIsolationHolds` probe'unun basarili yazma durumunda hata uretmesi de garanti degil.

Linux Maven kill yolundaki `child.killed`, process'in gercekten bittigi anlamina gelmez [E02]. Calisma sonucunu `exit` olayindan almak butun stdout/stderr'nin bittigini kanitlamaz; `close` ve supervisor semantigi gerekir.

**Etkisi:** Ana akisa yalniz kablo baglamak guvensiz host calistirmasini aktiflestirebilir. Once izolasyon gecidi kurulacak.

**Kapatma:** D03; guvenli capability yoksa ana job calismaz. RG15-RG20, RG34-RG36.

### F06 - P0: Test-root denetimi canonical hedef yerine ham metne bakiyor

**Kaynak:** `src/policies/policy-guard.ts:checkPath`, `src/application/patch-applier.ts:apply`.

`src/test/java/../../../README.md` ham olarak izin verilen prefix'le basliyor, fakat canonical hedef proje kokundeki `README.md`. Proje disina cikmadigi icin mevcut proje-root denetimi bunu engellemiyor. Symlink/junction hedefinin gercek test-root'a ait olmasi ayrica dogrulanmiyor. `new_content ?? patch`, unified diff'i dosyanin yeni icerigi gibi yazabiliyor. Silme eylemi genel olarak kabul ediliyor; before-hash eslesmesi zorunlu degil.

**Etkisi:** Izin verilen test koku disina yazma; yanlis/yarim changeset; kullanici testlerini silme veya stale aday.

**Kapatma:** D03/D05. Ham prefix degil normalize edilmis gercek test root containment; platform path kurallari; schema/onceki hash/atomic aday uygulanmasi. RG15, RG19, RG27.

### F07 - P0: OpenCode worker'in yanit sozlesmesi resmi API ile uyusmuyor

**Kaynak:** `src/workers/opencode/worker-client.ts:promptAsync/waitForCompletion/createSession`, `tests/integration/opencode-worker.test.ts`; resmi server belgesi [E01].

- `prompt_async` resmi cevap olarak `204 No Content` verir; client kosulsuz `response.json()` cagiriyor.
- Mesaj listesi `{ info: Message, parts: Part[] }[]`; client role/completed/id alanlarini dis nesnede ariyor.
- Directory, request korelasyonu, auth, timeout/abort ve tamamlanma semantigi kurulu server'in gercek `/doc`/SDK tipleriyle baglanmali. `createSession` body'sine `directory` koymak tek basina dogru dizin kaniti degil.
- Entegrasyon testi gercek prompt/cevap dongusunu calistirmiyor; health/session/abort ve flag degerlerine bakiyor.
- Worker config, flag nesnesi uretmekle sinirli; global config/plugin/MCP/hook izolasyonunu tek basina kanitlamiyor.

**Kapatma:** D04. Mevcut sunucunun surumu ve tipleriyle gercek prompt, response, timeout ve model hatasi testleri. RG24-RG26, RG41-RG42.

### F08 - P0: Lease/checkpoint/recovery semantigi guvenli devam sozlesmesini karsilamiyor

**Kaynak:** `src/orchestration/lease-manager.ts`, `checkpoint-store.ts`, `recovery-manager.ts`.

- `acquire`, diger sahibin suresi bitmemis lease'ini bile guncelleyip devraliyor; `previous_owner_alive` sonucu devri engellemiyor.
- `release` kaydi siliyor; yeni acquisition token'i yeniden 1 olabilir. Kalici monoton fencing saglanmiyor.
- Checkpoint publish'te fence opsiyonel, expiry kontrolu yok; parent generation dogrulamasi job'un guncel pointer'ina atomik CAS degil.
- `UNVERIFIED` kayit `best_checkpoint_id` olabiliyor. Verify, manifest'in hash/schema'sini kontrol ediyor; accepted test blob/run/coverage grafini dogrulamiyor.
- Recovery yalniz non-null eski dirty_digest'i karsilastiriyor; build digest girdisi kullanilmiyor. Birden fazla isi sessizce en yenisine indiriyor. Bozuk son checkpoint'te daha eski guvenilir ancestor yerine fresh_start donuyor.

**Kapatma:** D06; uygulama genelindeki butun yan etkilerde fence/generation, immutable accepted artifact zinciri, gercek hard-kill testleri. RG31-RG37.

### F09 - P1: Kalite/regresyon denetimi esas olarak regex ve exit code'a dayaniyor

**Kaynak:** `src/policies/quality-gate.ts`, `src/orchestration/build-plan.ts`, `candidate-loop.ts`.

`assertTrue(true)` anlamli assertion sayilabiliyor. `isSutShadowing` test kaynaklarindaki ayni production FQCN'i degil `/src/main/` yolunu ariyor. Dosyada test silinmesi/assertion zayiflatilmasi ile baz seti karsilastirilmiyor. Baseline exit 0 ise missing/zero-test raporu PASSED olabiliyor; XML parse hatalari sessizce atilabiliyor. `UNSTABLE` tipinin bulunmasi tekrarli baseline/flake kontrolu oldugunu gostermiyor.

**Kapatma:** D07; AST + gercek test kimlikleri + once/sonra davranis incelemesi + fail-closed run raporu. RG28-RG30, RG22, RG43.

### F10 - P1: Kesif ve platform destegi dar fixture disinda eksik

**Kaynak:** `src/discovery/java-inventory.ts`, `pom-discovery.ts`, `source-snapshot.ts`, `src/application/services.ts`, `src/configuration/config-loader.ts`, `src/mcp/stdio-entry.ts`.

- Gercek envanter regex tabanli; JavaParser helper'inin asil yola baglandigi gosterilmiyor.
- Java dosyasi arama ve overlay yollari `/` karakterini sabit `\\` yaparak Linux yolunu bozuyor. Config/DB default yollarinda da ayni sorun var.
- Statik POM okuma aktif profil/inheritance/properties/effective model degil; custom source/test-root path semantigi modul icin tutarsiz.
- Ayni modulde ayni simple name'e sahip iki FQCN otomatik belirsizlik sayilmiyor. Paket/modul hedefleri gercek sinif listesine acilmiyor.
- Snapshot `dirty` degeri hic guncellenmiyor; `.mvn` dislaniyor. Git HEAD okuma packed refs/worktree icin yeterli degil.
- `isWithinRoot` normal cwd'de `startsWith("")` nedeniyle false'a donuyor; symlink davranisi guvenli ve dogru destek olarak kanitlanmis degil.

**Kapatma:** D08; effective model ve AST asildan kullanilsin; snapshot/identity/run baglantilari tamam olsun. RG01-RG04, RG38-RG40.

### F11 - P0: Checkout'a apply gercek onay/preimage/transaction guvencesi tasimiyor

**Kaynak:** `src/reporting/test-apply.ts`.

Varsayilan kapali olmasi olumlu. Acildiginda onay yalniz metin uzunluguyla kontrol ediliyor; trusted adapter listesi kullanilmiyor. Dosyanin expected-before hash'i request'te yok; yeni icerik hash'i eski dosyanin degismedigini kanitlamiyor. Global patch_digest/checkpoint/workspace baglari dogrulanmiyor. Backup/journal customer repo icine yaziliyor. Tekrar apply backup'i yeniliyor; cok dosyada crash rollback veya resume algoritmasi yok.

**Kapatma:** D09; guvenilir onay yoksa patch-only, approval-bound digests, compare-before-write, dis store'da journal ve tested crash recovery. RG45-RG48.

### F12 - P1: MCP v2 kabul kaniti protokol yerine metadata kontrol ediyor

**Kaynak:** `src/mcp/v2-profile.ts`, `tests/contract/mcp-profile.test.ts`, `package.json`.

`createV2ProfileServer`, ayni v1 SDK McpServer'ini kuruyor ve tool adlarini donduruyor; araclardan server'a kayit yapmiyor. Contract testi, version metinleri ve tools array'ini karsilastiriyor; ikinci profile gercek wire initialize/discovery/call yapmiyor.

**Kapatma:** D02/D10; kurulu ve dogrulanmis resmi SDK/protokol adapter'i ile gercek lifecycle testleri. Profil adinin `v2` olmasi protokol destegi degildir. Onceki sozlesmedeki ikinci profil sessizce silinmez; uyumsuzluk varsa gercek acik blocker olarak tutulur.

### F13 - P0: Kabul matrisi bilesen/metin kanitlarini tam kabul gibi topluyor

**Kaynak:** `ai/ACCEPTANCE_MATRIX.md`, `tests/security/pilot.test.ts`, `tests/security/docker-isolation.test.ts`, `tests/integration/stdio-client.test.ts`, `tests/contract/mcp-profile.test.ts`, oturum kaydi.

Bazi satirlar enum, prompt, schema veya fonksiyon varligini PASSED sayiyor. Pilot testi kullanici home config'ine ve repository'ye dahil olmayan `tmp/pilot-stdout.txt` dosyasina bagli; gecmiste alinmis model cevabini parse edip elle host Maven kosuyor. LINE esigi 5000 bps (%50); bu ne %90 hedefi ne de normal MCP akisinin kabul kaniti. Production kontrolu bir sinif metninin hala bulunmasi, hash eslesmesi degil. Docker memory testi `NO_CGROUP` sonucunu da kabul ediyor. Mevcut `lint` komutu eslint cagiriyor ama package.json'da eslint bagimliligi tanimli degil.

**Kapatma:** D00/D10; gecen testleri silmeden kapsama uygun adlandir. Model testi, replay, unit, adapter, transport E2E ve ortam kabulunu ayir. Kismini kanitladigin AC'nin tamamini PASSED yazma.

### F14 - P1: Rapor/export butunlugu ve envanter gecmisi normal job'a bagli degil

**Kaynak:** `src/reporting/report-generator.ts`, `src/application/services.ts`, `server-setup.ts`.

Rapor renderer'i mevcut, ancak asil job'dan DB/run/checkpoint kanitlariyla otomatik uretim yolu yok. `assertReportConsistent` yalniz job_id/outcome karsilastiriyor. Export `verification_passed` kararinda `hash_mismatch` dikkate alinmiyor. `extraFiles` adlari canonical export-root ve reserved-name korumasi olmadan yazilabiliyor; export tum dosyalari string olarak ele aliyor. HTML'de "ham kanitlar burada" metni bulunmasi, gercek exec/XML/HTML/log/patch dosyalarinin varligi ve baglantilarinin dogrulugu degil.

**Kapatma:** D09; tek kanit projeksiyonundan DB/JSON/terminal/HTML, hash ve schema denetimi, binary-safe artifact export, path/reserved-file kontrolu. RG49-RG52.

---

## 3. Calisma organizasyonu ve bitis disiplini

Bu gorev tek teslimattir. D00-D10 asamalari ayri urun surumleri veya "simdilik demo" siniri degildir. Bir asamayi bitirince siradakine gec; dis onay/ortam engeli varsa ilgili maddeyi BLOCKED kaydet, bagimsiz diger isleri tamamlamaya devam et.

Her asamada:

1. Ilgili hata icin dar ve anlamli regression testi olustur; mevcut davranisin neden yanlis oldugunu gostersin. Guvenlikte zararsiz sentetik canary kullan.
2. En kucuk tutarli implementasyon duzeltmesini yap. Bir testin bekledigini yanlis implementasyona uydurma.
3. Unit + ilgili integration + normal giris yolundaki kapsami calistir. Yeni rapor/DB semantigi icin migration/geri uyum kontrolu yap.
4. Tam komut, ortam, exit code, sonuclar ve artifact hash'lerini kaydet. Kuyruktaki test sonucunu onceki run'dan alintilama.
5. Kalan isleri ve tek somut sonraki eylemi `ai/` altinda checkpoint/handoff'a yaz. Modelin gizli dusunce zincirini isteme/saklama.
6. Dogrulanan mantiksal parcayi belirtilen Git kurallariyla commit/push et. Gecmemis bir testin varligini saklamak icin skip/exclusion/threshold degistirme.

### 3.1 Gerekli gelistirme kayitlari

- `ai/PROJECT_STATE.md`: aktif gorev, gercek asama, son kanitli durum, acik blocker.
- `ai/BACKLOG.md`: D00-D10 ve regression ID'leri; TODO/IN_PROGRESS/BLOCKED/VERIFIED.
- `ai/ACCEPTANCE_MATRIX.md`: onceki AC01-AC70'nin yeniden degerlendirilmis durumu.
- `ai/reviews/2026-10-10-foundation-review.md`: F01-F14, kod konumu, tekrar uretim, duzeltme commit'i, kanit.
- `ai/decisions/`: yalniz gercek mimari karari degistiren ADR; kanitsiz tam yeniden yazim yok.
- `ai/checkpoints/`: her anlamli asamadan sonra komut/test/commit/kalan is.
- `ai/handoffs/`: son oturum/model devri; basarisiz denemeler ve siradaki eylem.
- `ai/verification/`: public'e uygun sentetik kanit indeksleri, toolchain ve commit bilgisi. Hassas raw run'lar dis store'da.

---

## 4. Uygulanacak duzeltme asamalari

### D00 - Kabul gercegini yeniden kur ve mevcut varliklari koru

**Hedef:** F13, tum temel gereksinimler.

- Onceki FULL_ACCEPTANCE iddiasini tarihsel kayit olarak koru; guncel state'e bu incelemenin duzeltmesini ekle. AC'leri toplu PASSED veya toplu FAILED yapma; her birinin kanitini incele.
- Kullanilan test case'in hangi assertion'inin AC'yi karsiladigini yaz. Bir bilesen testi yararli olsa da AC'nin geriye kalan davranisini acik tut.
- Node 24, npm lockfile, Java/Maven/JaCoCo/OpenCode/MCP SDK/container surumlerini gercek ortamdan kaydet. Dis SDK patch surumu tahmin edilmez.
- Mevcut user dirty/untracked dosyalari, global ayarlar, aktif process'ler, runtime DB ve backup'lar korunur. Raw session dosyasini public repository'ye kopyalama.
- Tamir oncesi guvenli calistirilabilen unit/contract testlerinin baseline'ini al; gercek user config'ine bagli integration/installer testlerini once izole et.
- Test suite'i altyapisiz durumda "passed" saymayacak; hangi katmanin gercekten kosuldugu ve hangisinin yetki/ortam bekledigi acik olacak.

**Cikis:** F01-F14 acik is kayitlari, AC01-AC70 yeniden dogrulama haritasi, guvenli baseline.

### D01 - Kullanici konfigurasyonunu koru ve kurulumu guvenli hale getir

**Hedef:** F02/F10/F13; RG05-RG10.

- Installer tarafinda `mcp = null` silici islemi kaldir. JSON/JSONC icindeki diger MCP'ler, provider/model/agent/plugin/permission alanlari ve bilinmeyen alanlar korunacak. Desteklenmeyen format bozulmadan acik hata verecek.
- Tek kendi kaydini minimal merge ile degistir; atomik temp+replace, content hash/preimage kontrolu, rollback ve kalici backup index'i kullan. Ayni kurulum tekrarinda gereksiz churn olmasin.
- Kurulum, verify, uninstall ve worker profil okuma ayni path/config resolution sozlesmesini kullansin. Testler icin acik home/config/data dizini injection'i sun; dogal kullaniciya yeni CLI ogretme.
- **Temiz-kurulum testinde sadece LOCALAPPDATA override yeterli degil.** Etkin OpenCode config, user home, XDG, auth/cache/plugin/search yollarinin tumunu ayri gecici alana yonlendir. Gercek kullanici config'i sentinel hash ile once/sonra ayni kalmali.
- Kurulum basarisizliginda veya timeout'ta sadece sahipligi dogrulanan child process'leri durdur; testin kullandigi yeni gecici dosyalari temizle. Gercek kullanici backup'larini cleanup kapsamindan cikar.
- Onceki script nedeniyle kayip MCP ihtimali varsa mevcut config'i once yedekle. Sag kalmis backup'lari yalniz metadata/hash ve kayit adlariyla karsilastir. Eksik girdileri kullaniciya goster; ayrica onay olmadan eski config'i tumden restore etme. Secret degerlerini loga basma. Backup yoksa tahmin etme.
- **Zorunlu Windows PS1'siz kurulum:** `scripts/install.mjs`, `scripts/verify-install.mjs`, `scripts/uninstall.mjs` gibi Node.js girisleri gelistir; Windows'ta `cmd.exe` uzerinden `node scripts/install.mjs` / `node scripts/verify-install.mjs` / `node scripts/uninstall.mjs` ile calisabilsin. `.cmd` sarmalayicilari opsiyonel olabilir ama yalniz `node.exe` cagiracak; `.ps1`, `powershell.exe`, `pwsh.exe` veya Git Bash cagirarak dolayli bagimlilik yaratmayacak. Bu yeni bir son-kullanici test CLI'i degil, bir defalik kurulum/yonetim araci istisnasidir. Linux'ta ayni Node entrypoint'leri veya izinli `.sh` kullanilabilir.
- `git.exe` yalniz repository clone/status/add/commit/push gibi surum kontrol islemlerinde kullanilir; installer veya script interpreter yerine konmaz. Git Bash kurulu/kurumca izinli ise `bash`/`.sh` yardimci secenegi olabilir; Windows zorunlu kabul testi Git Bash yuku olmadan da gececek.
- `npm.cmd`, `npx.cmd`, `node.exe`, `git.exe` gibi Windows executable'larini shell'a ozel pipeline yerine argv ile, guvenli child-process wrapper ve exit code kontroluyle yurut. `npm.ps1` gibi PowerShell shim'lerine baglanma. Build/test runner da kurumun PS1 izinlerinden etkilenmemeli.
- Execution-policy/signing engelini kabul kriteri olarak kaydet. Kurumsal politikayi atlamak icin `-ExecutionPolicy Bypass`, `-EncodedCommand`, `Invoke-Expression`, policy degisikligi ya da benzeri dolayli yollari otomatik kurulum standardi haline getirme. Kullanici PS1 calistiramiyorsa PS1'siz standart yoldan devam et; kurumsal onay zorunlu baska bir adim varsa acik BLOCKED raporla.
- Mevcut `.ps1` dosyalarini uyumluluk icin tutmak zorunlu degildir; tutulursa opsiyonel, imzali/kurumca izinli kullanim olarak belgelenir. Temel install/verify/uninstall davranisi PS1'siz Node koduna tasinir; ayri implementasyonlarin config merge mantigi zamanla farklilasmayacak.
- `npm ci`/lockfile'a dayali tekrar uretilebilir kurulum; install sirasinda global provider'a giden tum test suite'ini calistirma. Hafif, gercek MCP handshake/smoke ile baglanti dogrula. Tam kabul suite'i ayri gelistirme dogrulamasidir.
- Uninstall yalniz urunun sahipligi bilinen MCP kaydini kaldirsin. Kullanici tarafindan sonradan degistirilmis girdiyi silmeden once conflict versin. Runtime is gecmisi varsayilan korunur; kalici veri silme ayri onaylidir.
- Path'lerde `path.join`/platform API kullan. Kurulumun yazdigi product config ve server'in okudugu config birebir ayni olsun; gerekirse `AITEST_CONFIG` acik aktarilsin.

**Ek zorunlu fault testi:** Windows makinesinde `powershell.exe`/`pwsh.exe` ve `.ps1` cagrilari child-process seviyesinde reddedilmis gibi davranan test hazirla. CMD + Node.js install -> verify -> normal MCP handshake -> uninstall zincirinin eksiksiz calistigini, mevcut kullanici MCP/provider ayarlarinin hash'inin korundugunu, engelli PS1'i gizlice tetiklemedigini kanitla. PS1 policy engelini bypass ederek gecen test basari kaniti sayilmaz.

**Cikis:** Mevcut config'i koruyan Windows/Linux install-verify-uninstall, tum testleri gercek user ortamindan izole kurulum kabul kaniti.

### D02 - Gercek kalici orkestrasyonu MCP yuzeyine bagla

**Hedef:** F01/F12; RG11-RG14.

- Tek application composition root olustur. Konfigurasyon, DB, artifact store, guvenlik politikasi, discovery, worker adapter, izole runner, coverage, kalite, checkpoint/recovery ve reporter burada baglansin. MCP handler sadece use-case'e yonlendirsin.
- Foundation'daki sekiz yuksek seviyeli araci uygula: `project_inspect`, `project_query`, `test_start`, `test_status`, `test_resume`, `test_cancel`, `test_result`, `test_apply`. Apply yetenegi guvenilir onay yoksa disabled/patch-only kalabilir; sonucu acik olsun.
- `test_start`, dogrulanmis talebi ve tum semantigini (hedefler, metrikler, butce, policy/model, checkout/snapshot) transaction ile kalici kaydeder; executable job'u queue'ya alir ve kisa surede job_id dondurur. Ayni process hayattayken ana sohbetten yeni komut beklemeden ilerler.
- Queue/job dispatcher, source snapshot -> baseline -> analiz -> plan -> aday -> run -> dogrulama -> accepted checkpoint -> sonraki gap -> final rapor yolunu gercekten yurutur. Yalniz event ekleyip done demek kabul degil.
- `test_status`, gercek DB/run/checkpoint'ten per-target LINE/BRANCH, aktif deneme, son guvenilir sonuc, event cursor, kalan butce ve required_action dondursun. Verification yokken null dogrudur; olcumden sonra sabit null degildir.
- `test_result` tamamlanan/blocked/failed job icin DB ve artifact registry'den raporu dondursun; keyfi path okuma ya da yeni test kosma yapmasin.
- `test_resume` otomatik tek guvenilir eslesen isi bulabilir; birden fazla uygun is varsa acik adaylar verir. Model degisimi is kimligini/accepted set'i sifirlamaz.
- Pause/cancel, sure asimi ve EOF/termination durumlarini kalici state'e bagla. Stdio kapaninca surekli arka plan calismasi vaat edilmez; restartta interrupted is saptanir.
- Ayni request icin idempotency korunur; ancak yeni kaynak revizyonu, farkli policy/hedef/model veya tamamlanan eski is ile yeni is birbirine karistirilmaz. Butce ve izinlerin hash/disambiguation semantigi dokumante edilir.
- MCP tool execution hatalarini gercek protokolun hata semantigiyle dondur; sadece text icinde error yazip dis envelope'u basari gostermekten kacin.
- Resmi SDK ile desteklenen v1/v2 profiller ayni use-case'leri kullanir. Her profilde gercek tool registration ve transport lifecycle vardir. Profilin public tools array'ini karsilastirmakla yetinme.

**Calistirma kilidi:** D03 guvenli runner/preflight bitmeden dispatcher customer kodunu hostta calistiramaz. Gecici baglantilarda explicit blocked davranisi kullan; guvensiz fallback ekleme.

**Cikis:** Bir MCP istegi normal entrypoint'ten otomatik ilerleyen kalici ise donusur; status/result/resume/cancel ulasilabilirdir.

### D03 - Test-only siniri, izolasyon ve process supervision

**Hedef:** F05/F06; RG15-RG20/RG34-RG36.

- Baseline/aday/final calistirmalar, orijinal checkout disindaki sahipligi bilinen workspace'te ve OS/container izolasyonunda olsun. Orijinal customer kaynaklari salt okunur kalir; modele DB/rapor/runner state'ine yazma yetkisi verilmez.
- Tek zorunlu Runner arayuzu, guvenli capability/preflight olmadan `run` kabul etmez. Eski host MavenRunner yalniz urunun guvenilir gelistirme testleri icin acikca sinirli olabilir; customer job'da otomatik kullanilamaz.
- Test path dogrulamasi, canonical izinli test root icinde containment yapar. Proje icinde kalmak tek basina yeterli degildir. `..`, mutlak yol, drive/UNC, alternatif separator, symlink/junction, junction-root, Windows case/ADS ve degisen path hedefi durumlarini ele al.
- Modelden gelen network/image/mount/env/command/user parametreleri ham olarak runner'a aktarilmaz. Guvenilir adapter'in hazirladigi typed RunPlan, onayli kabiliyet ve allowlist kullanilsin.
- Source/POM/buildconfig read-only; her modul icin build-output/temp alanlari kontrollu writable; read-only container root ve gerekli sinirli tmp/cache alanlari uyumlu sekilde hazirlansin. Writable mount kaynak/konfig/soket/home dizinlerini override edemesin.
- Non-root, onayli image kimligi/digest, CPU/memory/pids/time/log/disk sinirlari uygulanir ve kabiliyet gercekten dogrulanir. Disk sert limiti saglanamiyorsa bunu saglanmis gibi yazma; uygun backend veya explicit blocker gerekir.
- Runtime test network'u kapali olur. Maven bagimlilik hazirligi gerekiyorsa ayri onayli download asamasi, kisitli repo erisimi, credential redaction, untrusted POM/hook calistirmama ve sonrasinda network-disabled test asamasi tasarla.
- Paylasilan cache'in bir job tarafindan zehirlenip digerini etkilemesini engelle; immutable/trusted seed + job'a ait writable alan veya dogrulanmis esdeger. Credential'lari cache/workspace'e kalici kopyalama.
- Docker container kimligini kalici kaydet; timeout/cancel/restart cleanup'da sadece job'a ait container/process group'a stop/kill/wait uygula. Sadece docker CLI PID'si yeterli degildir. Linux ve Windows process semantics ayri test edilir.
- `subprocess.killed` yerine exit/close/process identity ve tamamlanma kullan. Log ciktilari bounded streaming ile dis store'a akar; hem bellekte hem diskte sinirsiz biriktirme. Sonuc raporu ancak process ve loglarin sonlanmasi dogrulandiginda READY olur.
- Environment allowlist kullan; corporate model anahtarlari Maven/JVM'ye gecmesin. Model worker icin gereken secret ile runner secret siniri ayri olsun.
- Basari/erisim probe'lari beklenen sentinel sonucu, exit code ve side effect hash ile dogrulansin. `NO_CGROUP`, komut yok veya belirsiz permission hatasi success yerine gecmez.

**Cikis:** Ana job yolu izolasyon olmadan ilerlemez; malicious test ve POM fixture'i host/secret/production'a ulasamaz; cancel/timeout orphan birakmaz.

### D04 - OpenCode worker ve model geri bildirim dongusunu gercek sozlesmeyle duzelt

**Hedef:** F07; RG24-RG26/RG41-RG42.

- Resmi SDK'yi surum uyumlu kullan veya mevcut HTTP adapter'ini kurulu OpenCode `/doc` tipleriyle dogrulanmis hale getir. Elle tahmin edilen JSON ile ilerleme. Surum/base-url/auth/context kabiliyetlerini kaydet.
- `204 No Content` body parse edilmez. Mesajlar `{info,parts}` semantigiyle ve gercek tamamlanma/hata alanlariyla okunur. Yanitta yalniz son text parcasini almak yerine ilgili tamamlanmis mesajin gerekli text parcalari birlestirilir.
- Her prompt'a kalici invocation ID, job/phase/candidate/checkpoint/fence ve parent message korelasyonu ver. Eski cevap, incomplete streaming parcasi, farkli model/session sonucu ve gec gelmis stale response kabul edilmez.
- Her HTTP cagrisi bounded timeout/AbortSignal tasir. Timeout'ta sadece `aborted=true` donme; asil server session'i durdur, sonucu ve sonraki recovery adimini kaydet. Auth, 401/403/429/5xx, hatali JSON, eksik structured output ve model notfound ayri tani olsun.
- Worker server'in dizini, ayri HOME/config/cache/plugin/MCP/hook/formatter/LSP mirasi ve izinleri gercek etkili ayarlarla kontrol edilir. Bos inline mcp nesnesinin mirasi temizledigini varsayma.
- Host config'ten sadece kullanicinin yetkili provider/model profili ve gerekli secret referanslari kontrollu okunur. Provider prefix'ini silme; model ID birebir korunur; dis modele otomatik fallback yapma. Gizli deger rapor/loga yazilmaz.
- Worker proposal-only'dir: bounded ProjectContext/Analysis/TestPlan/CandidateChangeSet/Review/GapAnalysis schemasi. Salt okunur ek context gerekiyorsa source manifest + boyut/izin kontrolu ile ver. Tum repoyu veya sistem home'unu modele topluca acma.
- Analyzer, Designer/Developer ve Reviewer rolleri gercek job asamalari olsun; ayri modeller zorunlu degil. Hangi rolun hangi modeli kullandigi kaydedilir. Bagimsiz test dogrulayici daima model disindadir.
- Derleme/test/coverage/quality hatalari sonraki prompt'a structured evidence olarak girer. Repair limitleri ve total budget gercekten uygulanir. Model anlamsiz tekrar yaptiginda deneme/strateji hafizasi devreye girer.

**Cikis:** Gercek prompt -> gercek yanit -> schema -> guvenilir candidate akisinin surum, timeout ve model degisimi dahil test kaniti.

### D05 - Coverage gercegi, birikimli adaylar ve final replay

**Hedef:** F03/F04/F06/F09; RG21-RG23/RG27-RG30.

- User goal'den tek bir immutable GoalContract olustur. Her hedefin LINE ve uygulanabilir BRANCH esigi bu nesneden gelir. Butun done/early-exit/candidate-null/plateau/result yollarinda ayni TargetEvaluator calisir.
- Yuzde karari covered/total sayaclarindan yuvarlamasiz/rasyonel esik karsilastirmasiyla hesaplanir; basis points rapor alanidir. %89.96, %90 olmaz. BRANCH total=0 uygun durumda NOT_APPLICABLE; kayip/bozuk rapor veya LINE debug yoklugu sahte %0/%100/N/A'ya donusturulmez.
- JaCoCo XML path'i sabit root varsayimindan degil effective module/run plan'dan gelir. Aggregate/child tekrar sayimi, nested/inner class, ayni FQCN farkli modul ve eksik class durumlari acik kimlikle cozulur.
- Her run icin temiz ve ayrik output/exec/report namespace'i, source/class/agent/toolchain/run fingerprint'i olsun. Eski rapor veya farkli bytecode class kimligi guncel kanit diye kullanilamaz. Enstrumantasyon hatasi exit0 olsa bile coverage trust'i durdurur.
- Mevcut argLine/agent/profiller korunur. JaCoCo yoksa POM'a dokunmayan gercek desteklenmis yontem uygulanir; guvenli olcum yoksa `BLOCKED_COVERAGE_CONFIGURATION`. Exclusion ekleme, denominator degistirme veya test classpath shadow ile puan artirma yok.
- Adaylar base accepted checkpoint'e baglidir. Her aday ayri staging/workspace'te denenir. Partial changeset/kalite/build/test/coverage hatasi accepted set'e dokunmaz. Kabulde test blob'lari, run/provenance ve yeni metric vector birlikte commit edilir.
- Sonraki aday, bir onceki accepted set'in uzerinden olculur. Gerektiginde model full file content verebilir; before-hash ve checkpoint uyumu yine zorunludur. Patch formatini desteklemiyorsan explicit reddet; diff'i Java icerigi gibi yazma.
- LINE sabit BRANCH artisi kazanimdir. Coverage artirmayan ama dogrulanmis yeni davranis/exception/regresyon testi kendi kalite politikasiyla kabul edilebilir; bunu coverage artisi diye raporlama. Metrik gerilemesi veya existing test kaybi kabul edilmez.
- Hedef zaten baseline'da saglaniyorsa test uydurma. Final hedef saglandi karari icin baseline/test quality/provenance gerekliliklerini yine kontrol et.
- Plateau farkli denenen stratejiler ve kalici gap kimlikleriyle incelenir. Bir kac deneme sonucunu "matematiksel maksimum budur" diye yorumlama. Testability barrier, butce sonu ve henuz cozulemeyen alan ayrilir.
- Export/onaydan once accepted set'i baseline snapshot'tan yeni temiz izole workspace'te kur; gercek final Maven/JaCoCo ve etkilenen regresyonu tekrar dogrula. Rapor, patch ve best checkpoint ayni dosya setini gostersin.

**Cikis:** Istenen metriklerin tamamini saglamadan hedef basarisi yok; en iyi dogrulanmis testler sonraki iterasyon ve restartta aynen kurulabilir.

### D06 - Kalici lease/fencing, checkpoint transaction'i ve gercek resume

**Hedef:** F08/F04/F10; RG31-RG37.

- Job/workspace icin tek aktif yurutucu. Baska sahibin suresi bitmemis lease'i devralinamaz. Idempotent resume mevcut aktif isi dondurur; ikinci loop baslatmaz. Operator takeover varsa ayri acik eylem ve guvenli process sonlandirma gerekir.
- Fencing generation'i lease row silinse de gerilemeyen kalici job/workspace state'inde sakla. Worker owner kimligi process yeniden baslatmada benzersiz olsun; PID tek basina kimlik degildir. Renew expiry/fence/owner eslesmesini dogrulasin.
- Her mutating DB update, artifact pointer yayini, model response kabul ve apply/cancel karari aktif owner+fence+expiry+expected generation ile kosullu yapilir. Kaybedilmis/expired lease'ten sonraki gec sonuc best durumu degistiremez.
- Checkpoint publish: test/run/coverage/plan blob'larini once immutable olarak yaz, hash ve schema kontrolu, dosya durability, atomik publish; sonra kisa DB transaction icinde guncel best pointer+generation CAS. DB model/runner beklerken transaction tutmaz.
- Analysis checkpoint ile TEST_VERIFIED/BEST checkpoint farkli tutulur. Yalniz manifest JSON'u dogru diye UNVERIFIED adayi best yapma. `best_checkpoint_id` gercek kabul edilmis ve yeniden kurulabilir kanita isaret etsin.
- Manifest'teki tum zorunlu referanslarin varligi/hash/schema/job/snapshot kimligi dogrulanir. Yeni oturum sadece metin ozetini degil accepted test blob'larini ve gercek run bilgisini devralir.
- Power loss/OS crash dayanimi icin dosya flush/DB synchronization ayarlari ve platform sinirlari acik olsun. Sadece rename'i enerji kesintisi garantisi gibi yazma. Temp/orphan blob'lar READY olmaz.
- Resume'da mevcut checkout'un HEAD/dirty/untracked kaynaklari, buildconfig/wrapper, testbase, policy/toolchain/model uyumu dogrulanir. Clean'den degismis duruma gecis de tespit edilir; sadece eski dirty_digest varsa karsilastirma yapilmaz.
- Degisen kaynaklar icin accepted calisma korunur, eski coverage stale isaretlenir; guvenli rebaseline/revision/merge ihtiyaci acik taniyla yonetilir. Sessizce yeni job acip onceki emegi kaybetme.
- En son checkpoint bozuksa ancestor zincirinde son guvenilir nokta aranir; hepsi bozuksa acik recovery failure, sahipligi belirsiz dosyalari silme yok.
- EOF/normal stop/hard kill/Maven sirasinda kill, DB busy/disk full/artifact-DB arasi crash gercek process sinirlarinda test edilir. Resume kaldigi asamayi dogrular; tamamlanmis dogrulanmis analiz/plan gereksiz tekrar uretilmez.
- SQLite migration/checksum/foreign_keys/WAL ayarlari, online backup/restore ve retention gercek dosya/transaction testleriyle dogrulansin. Eski schema'yi yerinde bozma; yedek + migration + validation. Active/best/approval-pinned artifact silinemez.

**Cikis:** Iki model veya process ayni isi eszamanli yonetemez; hard-kill'den sonra ayni job guvenilir kanitla surer.

### D07 - Mevcut testleri koru, gercek kalite ve regresyonu olc

**Hedef:** F09/F13; RG28-RG30/RG43.

- Java AST/symbol tabanli test structure ve baseline test identity envanteri olustur. Metin regex'i yardimci lint olabilir; tek semantik kalite kapisi olamaz.
- JUnit4 expected exception, JUnit5 assertThrows/dynamic/parameterized tests, proje assertion helper'lari, AssertJ/Hamcrest veya uygun verify kullanimi mevcut bagimliliklar icinde dogru ele alinsin. Yeni dependency upgrade yok.
- Test sinifinda/helper'da assertion kelimesi olmasini anlamli dogrulama sayma. Tautoloji, self-comparison, mocklanan SUT, duplicate, swallowed exception, fail'siz catch, bos test, private reflection, yeni ignore/assumption/disabled ve zayiflatilmis existing assertion kontrolu yap.
- Tum onceki test kimlikleri ve davranis kanitlari korunur. Silme/yeniden adlandirma/parametre veri kaybi/skip artisi veya testin Surefire tarafindan kesfedilmemesi acik red/inceleme nedenidir. Coverage artisi bu kaybi telafi etmez.
- Test kaynaklari icindeki production FQCN, package/classpath shadowing, test kaynaklarindan Java agent/coverage raporu uretme ve izin disi kaynak degistirme yollari incelenir. AST ve classpath/provenance denetimi kullan.
- Statik incelemenin kanitlayamadigi anlamli assertion veya is kurali belirsizligi `REVIEW_REQUIRED` olarak kaydedilebilir. Kalite kararini otomatik kesinlik gibi gosterme. Davranis beklentisini sadece mevcut hatali koddan turetip assertion'i ona uydurma.
- Surefire raporlarinda total/status/identity birlikteligi dogrulansin. Bozuk/missing/stale XML sessizce atlanmasin. Zero tests ayri NO_TESTS, instability ayri kanitli durum, timeout/fork crash ayri altyapi sonucu.
- Final regresyon kapsamindaki module/test listesi ve calisan testler rapora baglansin. Etkilenen modul/consumer testleri sozlesmeye gore kosulmadan full regression PASSED yazma.

**Cikis:** Testlerin calismasi, korunmasi ve anlamli davranisi kapsamasina dair ayri kanit; yalniz coverage odakli sahte testler reddedilir.

### D08 - Effective Maven, Java AST, proje kimligi ve kalici envanter

**Hedef:** F10/F14; RG01-RG04/RG38-RG40.

- Statik POM kesfi yalniz on kesif olsun. Asil RunPlan, izinli izole ortamda effective Maven model/profiles/settings/toolchain/reactor'dan uretilsin. Parent inheritance, pluginManagement, custom source/test roots, build-helper roots ve test dependency varyantlari ele alinsin; desteklenmeyen durum acik tani verilsin.
- POM/helper/model olusturma da kod calistirabilir; guvenlik siniri disinda Maven plugin/hook calistirma. Parent/relative module yolunun yetkili snapshot scope'unda kaldigini dogrula.
- JavaParser helper'i gercek discovery/quality akisina bagla; regex scan'den authoritative sinif/metot sonucu verme. Nested/inner/record/enum/sealed/overload/comments/text block icin test et. Desteklenmeyen dil ozelliginde unresolved'i gizleme.
- Simple class name, FQCN, modul/package hedeflerini acik identity'lere coz. Ayni modulde iki FQCN, ayri modullerde ayni FQCN ve birden fazla checkout testleri zorunlu. Tek guvenilir sonuc yoksa sor; ilk adayi secme.
- Tum path/URI/manifest representation'larini tanimla: depolanan relative path normalize, filesystem path platform API ile. Windows separator'u Linux'a tasima; Unicode/case/space verisini transliterate etme.
- Snapshot, build davranisini etkileyen `.mvn`/wrapper/resources/testdata/customroot dosyalarini korusun. Secret dosyalarini modele ve public rapora otomatik tasima; gerekli dosya onay/secret-safe profile ile calistirma alanina kontrollu girsin.
- Git metadata'si gitdir/worktree/packed refs/dirty/untracked durumlariyla dogru elde edilsin. Git komutlari arg-array ve onayli safe process wrapper'iyla calissin; kaynak repo degismez.
- SQLite kayitlari gercek project identity ve checkout identity ayrimini korusun. Tarama snapshot'i ile job_target/run/coverage/model/test_case iliskileri gercek akista yazilsin. Silinmis/stale sembol guncel gorunumden kalksin ama gecmis kanit silinmesin.
- Artimli yenileme yalniz fingerprint uyumunda kullanilsin. Iki checkout'un kapsamini/counter'larini birbirine karistirma. `project_query` gercek uretilen/calistirilan testleri, son guvenilir ve gecmis coverage'i ayirsin; serbest SQL kabul etmesin.

**Cikis:** Diger bir Maven projesinde yol/fixture sabitlemesine gerek kalmadan ayni MCP kullanilir; projeyi taniyan DB kayitlari gercek run'lara baglidir.

### D09 - Guvenli apply, kanitli rapor ve binary-safe export

**Hedef:** F11/F14; RG45-RG52.

- Apply request'i keyfi model dosya listesi yerine dogrulanmis immutable checkpoint/patch registry referansina bagla. Approval, job/checkpoint/patch digest/checkout identity/source revision/sure/tek kullanim gibi gerekli alanlarla trusted adapter'de uretilip dogrulansin.
- Sadece 8 karakterlik bir metin onay olamaz. Guvenilir adapter yoksa orijinal checkout'a yazma tamamen kapali; dogrulanmis patch/diff artifact'i sun.
- Degisecek tum dosyalar icin expected before-hash veya expected absence kaydi olsun. Butun preimage'ler ilk yazmadan once, sonra yazma sinirinda yeniden dogrulansin. Kullanici arada degistirdiyse CONFLICT; dosyasi ezilmez.
- Journal/backup dis runtime store'da, job/operation namespace'inde, immutable ve quota-aware olsun. Basarili olduktan sonra dogrulanmis test dosyalari disinda customer repo'ya artifact yazilmasin.
- Multi-file apply'i recoverable transaction olarak uygula: staged changes + before/after hashes + durable journal; crash'te sadece kendi yazdigi bilinen state'i tamamla/geri al. Sonradan kullanici edit'i varsa rollback de ezmesin; conflict raporla.
- Tekrar ayni approved operation idempotent olur; ilk backup korunur, yeni approval gerekmeyen replay ile farkli patch uygulanamaz. Farkli root/checkpoint/model talebine onay replay edilmez.
- Rapor verisi actual DB/run/checkpoint'ten toplanir ve schema ile dogrulanir. Outcome, per-target LINE/BRANCH before/after, provenance, tests executed/added/modified, gate results, gaps, model roles ve source integrity ayni projection'dan terminal/JSON/HTML'e gider.
- Hash mismatch, missing file, stale source veya report-DB uyusmazliginda `verification_passed=false`; yalniz missing sayisina bakma. Artifact isimleri canonical export root icinde ve reserved output dosyalarindan ayri olmalidir.
- Exec/zip/png gibi binary dosyalar byte olarak korunur; string encode ile bozulmaz. XML/HTML/log/patch gercekten kopyalanir, alt klasorleri olusturulur, offline linkler ve manifest hash'leri dogrulanir.
- HTML sade, okunur ve offline olsun; mevcut tasarimi gereksiz yeniden tasarlama. AI yorumu ile olcum sonucu ayrilsin; yorumlayan/ureten model kimligi kayitli olsun. Harici font/script/CDN ve otomatik dis yayin yok.
- Test run'i blocked/failed/cancelled ise olmayan coverage yerine acik durum ve son guvenilir nokta raporlanir. Hedef altinda bir job, urunun dogru failure raporlama testini gecmis olsa da TARGET_REACHED olmaz.
- Secret redaction, HTML escaping'den farklidir. Structured JSON, stdout/stderr, hata, model payload ve export kanallari sentetik secret/endpoint canary ile test edilir. Ham kanitlar yetkili yerel store'da hassas sinifiyle tutulur.

**Cikis:** Kullanici IDE acmadan guvenilir sonucu/ham kaniti gorur; onayli testleri mevcut degisikliklerini kaybetmeden uygular veya patch-only alir.

### D10 - Tekrar uretilebilir kabul, temiz ortam ve son bagimsiz denetim

**Hedef:** F12/F13 ve tum maddeler.

- Test katmanlarini net ayir: pure/unit, adapter contract, transport E2E, real Maven/container, real OpenCode, kurum ici model, install/uninstall ve hard-kill recovery.
- Scripted worker'li E2E, gercek job motoru/policy/runner/storage/rapor yolunu kullanmali. Sadece worker metni deterministik olabilir. Runner/policy/coverage evaluator'i bypass eden elle dikis bu katmanin kaniti degil.
- Gercek kurum modeli pilotunda normal OpenCode kullanici talebi ve normal MCP entrypoint kullanilsin. Modelin ayri `opencode run` ile host dosyasi degistirmesi ve sonra output replay'i AC67'yi kapatmaz.
- `tmp/pilot-stdout.txt`, gelistiricinin home config'i, sabit port veya host Windows komutu normal test suite'inin sessiz onkosulu olmasin. Replay artifact'i gerekiyorsa sentetik, surumlu ve acikca replay olsun.
- Gercek kurum pilotu yetkili model profiliyle opt-in calissin; credentials yoksa NOT_RUN/BLOCKED raporlasin. Bu, tum testler gecti demek degildir. Port/process/config kimlikleri izole ve dinamiktir.
- `npm run lint` bagimlilik/config ile gercekten calissin; `typecheck` test/script kodlarini da uygun ayri TS config ile kapsasin. Missing import'lar runtime'a kadar gizlenmesin.
- Urunun kendi line/branch coverage'i gercek kosuyla olculur ve artefact olarak verilir. Urunun customer coverage hedefine karistirilmaz; threshold/manipulasyon ile kapatilmaya calisilmaz.
- Node24 temiz clone'da locked dependencies + build + test; Java8/JUnit4, Java17/JUnit5/Mockito ve Java21/cokmodul fixture matrisi gercek toolchain bilgisiyle calissin. Java8 target bytecode'u yeni JDK ile derlemek ile JDK8'de calistirmak ayrica etiketlensin.
- Windows/Linux installer/worker/runner/AST/native SQLite binding kanitlari toplanir. Temiz veri klasoru deneyi ile gercek temiz clone/temiz user ortam kabulunu farkli adlandir.
- CI kullanici karariyla kapali; kendiliginden acma, yeni workflow/tetikleyici ile bu karari dolanma. Ayni komutlari yerelde/container'da kanitla. CI durumu son raporda acik yazilsin.
- Son bagimsiz inceleme, test sayisindan once call graph/trust boundaries/DB projections/final replay/AC evidence eslesmesini sorgulasin. Gerekirse farkli model reviewer olabilir; onun sozu test kaniti yerine gecmez.

**Cikis:** Tum eski AC ve yeni regression senaryolari kanitli; asil urun yolu gercek model/resume ile dogrulanmis veya gercek kalan ortam kabul maddeleri durustce acik.

---

## 5. Gercek job akisinin kabul modeli

Calisma diyagrami yerine uygulanacak sirali sozlesme:

1. Dogal dil talebi -> OpenCode'un typed MCP `test_start` cagrisi.
2. Yetkili proje/root + hedef cozumu + effective config/model/runner preflight.
3. Kalici GoalContract/job/targets/policy/snapshot + sahiplik/lease.
4. Immutable source ve izole baseline; gercek Surefire ve JaCoCo evidence.
5. Analiz ve test plani, schema dogrulama ve kalici plan checkpoint'i.
6. Accepted snapshot uzerinden candidate generation; before-hash/schema/path/quality denetimi.
7. Ayrik candidate workspace'te izole run; freshness/bytecode/test identity/coverage/quality/regression.
8. Kabulde test seti + run + coverage + checkpoint atomik referans yayini; redde accepted set degismez.
9. Hedef saglanana veya kanitli durma nedenine kadar feedback/repair/gap dongusu.
10. Accepted snapshot'in yeni temiz workspace'te final replay'i; sonuc/kanit farki varsa done yok.
11. SQLite/JSON/HTML/terminal ayni gercek sonuclar; `READY_FOR_REVIEW` veya dogru blocked/failed outcome.
12. Guvenilir acik onay varsa safe apply, yoksa patch-only. Customer Git commit/push yok.

Kullanici `test_status` cagirmasa bile 4-10 ilerler. Status sorgulama business loop'u tetikleyen gizli zorunluluk olamaz. OpenCode/MCP kapanirsa is guvenli interrupted olur; bir sonraki oturum `test_resume` ile 3. asamadaki state ve son guvenilir checkpoint'i devralir. Tamamlanmis adimlari yeniden uretmek yerine sadece gerekli stale/run dogrulamasi yapilir.

---

## 6. Zorunlu regression ve uctan uca kabul matrisi

Bu liste eski AC01-AC70'nin yerine gecmez; bulunan hatalarin geri gelmesini onleyen zorunlu ek kanittir. Her RGxx icin gercek test adi, komut, platform, exit code, commit ve artifact/hash index'i yazilacak. Test yazilmis ama kosulmamis ise NOT_RUN; altyapi yoksa BLOCKED; assertion basarisizsa FAILED. `PASSED (kismen)` kullanma.

| ID | Senaryo | Zorunlu assertion/kanit |
| --- | --- | --- |
| RG01 | Linux kaynak/envanter ve default config/DB | Gercek src/main/java bulunur; config/DB dogru platform dizininde; yanlis ters-slash sibling dosyasi yok. |
| RG02 | Windows bosluk/Unicode/case + iki checkout | Root/identity dogru; Unicode korunur; checkout verileri karismaz. |
| RG03 | Parent/profil/custom test root/cok modul | Effective modeldeki root ve bagimliliklar asil run'da kullanilir; sonucun modul kimligi dogru. |
| RG04 | Ayni simple name ayni modulde iki FQCN, package/module secimi | Belirsiz sinif rastgele secilmez; package/module hedefleri acik sinif listesine cozulur. |
| RG05 | Var olan birden fazla MCP + provider/agent/permission ile install | Kendi kaydi disindaki tum yapilandirma semantik olarak ayni; backup kalici ve dogrulanmis. |
| RG06 | JSONC/bilinmeyen alan + tekrar install + eszamanli config edit | Veri kaybi yok; desteklenmeyen format/yeniden edit conflict; atomik rollback. |
| RG07 | Clean install-verify-uninstall izolasyonu | Gercek user config/home sentinel hash ayni; tum degisiklikler fake home/data altinda. |
| RG08 | Kurulum yarida kesildi veya policy/signing engeli | Eski config korundu; basari mesaji yok; politikalari asan workaround varsayilan degil. Ayrica PS1 calistirma yasakliyken CMD+Node ile basarili kurulum/verify/uninstall saglanir. |
| RG09 | Uninstall, kullanici sonradan MCP kaydini degistirdi | Yalniz urun kaydi/sahiplikli dosya silinir; user override ve gecmis veri ezilmez. |
| RG10 | Sifir clone/temiz user kurulum smoke | PowerShell'siz `cmd.exe` + `node.exe` ile locked install/build, gercek transport handshake/tool call, uninstall ve yeniden kurulum; Git Bash gerektirmez; process'in 2 saniye acik olmasi yetmez. |
| RG11 | Dagitilan MCP entrypoint'i, sekiz arac | Iki desteklenen profilde gercek wire discovery/call; disabled apply acik capability dondurur. |
| RG12 | test_start + status + result | Is discovery'de kalmaz; dispatcher run/candidate/checkpoint/rapor uretir; user ara komut yazmaz. |
| RG13 | Duplicate start, degismis source ve eski bitmis job | Ayni talep tek calisma; farkli kaynak/revision eski sonuc gibi donmez; tam request saklanir. |
| RG14 | Yanlis root/hedef/model/config/runner | Gercek BLOCKED/INVALID response ve protokol hata semantigi; sahte preflight ok yok. |
| RG15 | src/test/java/../../../README.md ve path cesitleri | Proje icinde olsa bile test-root disina yazma reddedilir; canary ayni kalir. |
| RG16 | Testin production/POM/secret/home yazma/okuma denemesi | Gercek izole runner'da engelli; host canary ve production hash ayni. |
| RG17 | Docker/network/process/memory/disk/log kotalari | Kaynak ihlali gercek engellenir; NO_CGROUP/komut yok/yanlis probe success degil. |
| RG18 | Docker/runner yok, veya read-only yazma probe'u basarili | Capability fail-closed; host Maven'a dusme yok; yazilabilen source izolasyon ihlalidir. |
| RG19 | Symlink/junction/TOCTOU/mount override | Canonical scope disina erisim/yazma yok; stale path red; Docker socket/home mount edilmez. |
| RG20 | Env canary ve bagimlilik hazirligi | Model credential JVM'ye gecmez; dependency retrieval onayli; runtime test network kapali. |
| RG21 | LINE %95, BRANCH %40, hedef %90 | Tum early-exit/aday-null/final yollarinda TARGET_REACHED yok. |
| RG22 | Branch0, missing/debugsiz/bozuk/stale XML/exec, class mismatch | NOT_APPLICABLE/UNAVAILABLE/INVALID ayrilir; eski/yetkisiz rapor kabul edilmez. |
| RG23 | %89.96 esik ve iki hedef %100/%80, branch-only kazanim | Yuvarlama/ortalama sahte basari yapmaz; branch-only kazanimi korur. |
| RG24 | prompt_async 204 ve ic ice info/parts gercek response | JSON parse hatasi yok; dogru invocation'un tamamlanmis metni bulunur. |
| RG25 | Auth/model hatasi, timeout, stale cevap, kesik JSON | Dogru error/retry/budget; server abort gercek; stale/eksik cevap aday olmaz. |
| RG26 | Global plugin/MCP/hook/formatter mirasi | Worker'da sentetik zararsiz canary kodu calismaz; gereksiz araclar kapali; job recursion yok. |
| RG27 | Ikinci dosyada hatali changeset, stale before-hash, unified diff | Hicbir partial aday best'e girmez; diff raw kaynak diye yazilmaz; accepted blob korunur. |
| RG28 | Ardisik iki accepted aday + arada rejected aday | Son accepted set iki kazanimi da icerir; final temiz replay ayni sayaclari verir. |
| RG29 | Mevcut test silme/skip/assertion gevsetme/tespit edilmeyen test | Test identity/regresyon kapisi red verir; sayac artisi kurali asmaz. |
| RG30 | assertTrue(true), self-comparison, mock SUT, duplicate, helper assertion | Sahteler red/inceleme; anlamli helper/exception/parameterized testler desteklenir. |
| RG31 | Iki ayri process ayni canli job'a resume | Tek aktif owner/loop; gecerli lease calinmaz; durum bozulmaz. |
| RG32 | Release/reacquire, expiry, gec eski worker sonucu | Token monoton; expired/stale cevap DB/best/artifact pointer'ini degistiremez. |
| RG33 | Analiz/generation sirasinda hard kill ve baska modelle resume | Ayni job; son kayitli plan ve accepted dosyalar korunur; unverified aday accepted olmaz. |
| RG34 | Maven/JVM veya Docker sirasinda hard kill/cancel | Sahiplikli container/process sonlanir; orphan yok; restart stale run'i kabul etmez. |
| RG35 | Blob publish ile DB transaction arasinda kill | Yarim dosya READY/best degil; restart son guvenilir ancestor'dan baslar. |
| RG36 | Iki publisher ayni parent, DB busy/disk full | CAS/fence reddi dogru; bir accepted pointer; eski kazanim kaybolmaz. |
| RG37 | Clean->dirty, POM/wrapper/HEAD/testbase degisimi, bozuk latest blob | Kaynak degisimi/stale coverage tespit; ancestor bulunur; sessiz fresh_start yok. |
| RG38 | Git worktree/packed refs/untracked/binary resource/.mvn | Snapshot dogru/replayable; kimlik ve digest degisimi dogru; kaynak depo temizlenmez. |
| RG39 | Envanterde sinif silme/degisme ve onceki run gecmisi | Guncel liste yenilenir; eski run/test/model iliskileri korunur. |
| RG40 | SQLite migration/WAL backup/restore/retention | Restore edilen DB+blob graph tutarli; pinned/active/best silinmez; schema hata fail-closed. |
| RG41 | Gercek yetkili OpenCode+LiteLLM pilotu | Normal MCP girisi; gercek model uretimi, izole Maven/JaCoCo, tam hedef veya dogru unmet; replay degil. |
| RG42 | Pilot kesildi, yeni OpenCode/model oturumu devam etti | Gercek kullanici devam talebi ayni job/accepted set/deneme hafizasina doner. |
| RG43 | Bozuk/zero/unstable baseline; exception kazanimi coverage'i artirmiyor | Sahte PASSED yok; davranis kazanimi coverage olarak yazilmaz; testability belirsizligi acik. |
| RG44 | Ulasilabilir %90 ve test-only sinirli hedef | Ilkinde iki metrik gercek saglanir; ikincide source/POM ayni, best tests korunur ve unmet raporu. |
| RG45 | Guvenilir onay yok/uydurma metin/onay baska checkpoint'e ait | Customer checkout'a hic yazma yok; patch-only veya explicit red. |
| RG46 | Onaydan sonra kullanici test dosyasini degistirdi | Expected-before uyusmazligi CONFLICT; kullanici degisikligi korunur. |
| RG47 | Cok dosyali apply ortasinda crash ve restart | Journal-driven safe recovery; sadece kendi writes; backup dis store'da ve korunmus. |
| RG48 | Ayni apply tekrar/farkli patch onay replay | Idempotent sonuc; ilk backup ezilmez; farkli patch/root'a onay kullanilmaz. |
| RG49 | DB/JSON/HTML/terminal metric/outcome/counter tutarliligi | Ayni trusted run/checkpoint; hash mismatch halinde verification false. |
| RG50 | Binary exec + alt klasorlu JaCoCo HTML offline export | Baytlar ayni hash; baglantilar acilir; gercek dosya varligi; hedef disina yazma yok. |
| RG51 | extraFiles traversal/reserved-name overwrite/XSS/secret canary | Path red; report.json/index/manifest korunur; injection ve secret sizintisi yok. |
| RG52 | Failed/blocked/cancelled/budget/plateau raporlari | Uydurma olcum yok; son guvenilir/eksik kanit ayrimi; gercek blocker/deneme kaydi. |

---

## 7. Kanit sozlesmesi ve eski kabul matrisinin yeniden kurulmasi

Her AC/RG test kaniti en az su alanlari tasiyacak:

- Requirement ID ve assertion aciklamasi; kapsanan ve kapsanmayan parca.
- Test source path ve tam test case adi; hangi gercek entrypoint/API cagirildi.
- Code commit, test commit/dirty durumu ve toolchain/OS/container/model surumleri.
- Run ID, baslama/bitis, gercek komut ve exit code; command/rapor redaction durumu.
- Artifact manifest'i ve SHA-256; raw hassas kanitin dis store referansi; public'e uygun ozet.
- Sonuc `PASSED`, `FAILED`, `NOT_RUN` veya `BLOCKED`; blocker nedenini koda ait eksik ile ortam yoklugu olarak ayir.

**Gecersiz kabul ornekleri:**

- "ErrorCode enum'unda var, AC30 PASSED."
- "role prompt'unda yasak deniyor, private reflection/prompt injection korunuyor."
- "Tool adi array'de var, v2 protokol calisiyor."
- "Docker sinifi var, normal Maven akisi izole."
- "Manifest hash dogru, icindeki test ve coverage blob'lari da dogru."
- "mvn exit0, Surefire 0 test veya stale XML onemsiz."
- "%50 line kosulu geciyor, %90 hedef pilotu tamamlandi."
- "Gecici LOCALAPPDATA kullandim, kullanici config'i degismemistir."
- "Test sayisi 168 oldu, tum fonksiyonlar entegredir."

**Gecerli yaklasim:** Mevcut testleri asil isim/kapsamlariyla tut; eksik davranis icin test ekle. Yeni test once bug'i gostersin, implementasyon duzelince ayni beklentiyle gecsin. Onkosul bekleyen testin skip'i, ilgili kabul maddesini otomatik PASSED yapmasin.

---

## 8. Veri modeli ve runtime artifact duzeni

Foundation'daki veri modeli sozlesmesi korunur; mevcut tablolari incelemeden bastan schema uretme. Zorunlu baglantilar migration ile tamamlanir:

- project -> checkout/location -> source snapshot -> module/package/symbol/test identity;
- job -> GoalContract/target/policy/model/budget -> phase/iteration -> worker invocation;
- run -> exact workspace/test set/toolchain/command -> Surefire identity/status -> JaCoCo/provenance;
- accepted checkpoint -> immutable test blobs + analysis/plan + trusted run/coverage + previous checkpoint;
- artifact -> owner/job/run/checkpoint + hash/schema/sensitivity/retention pin;
- lease/fence/generation -> tum mutating transaction'lar;
- apply approval/operation -> exact checkpoint/patch/checkout/preimage + durable journal;
- report -> ayni run/checkpoint/source identity.

Model invocation ve runner outcome'lari gercekten bu tablolara yazilir; bos tablo taslagi "kalici envanter" kabul degildir. `project_query` bunun okunabilir kontrollu gorunumudur.

Runtime store, product repository ve customer repository disinda kullaniciya ozel izinlerle tutulur. Kurum kaynaklari, API key, ortam dokumu ve model payload'lari public `ai/` klasorune yazilmaz. Gerekli local hassas kanit icin sadece sanitized manifest/reference public kayda girebilir.

---

## 9. Kesintide gelistirmeye devam protokolu

Bu bolum MCP urununun gelistirilmesine aittir; runtime Java test job resume'unun yerine gecmez.

Her asama sonu/handoff su bilgileri icersin:

1. Aktif gorev/HEAD/branch ve dirty dosyalarin sahipligi.
2. Son VERIFIED Dxx, Fxx kapanislari ve gercek AC/RG test sonuclari.
3. Aktif degisiklikler; gecmeyen assertion'lar, son hata/log referansi ve denenmis yollar.
4. Kesin sonraki eylem: dosya/islev + hedef regression + calistirilacak komut.
5. Calisan sahiplikli process/container varsa kimligi ve guvenli devralma/sonlandirma durumu.
6. Korunacak config/backup/runtime DB ve explicit yasaklar.

Yeni model once bu kayitlari ve gercek Git durumunu karsilastirir. "Hepsi bitti" metni varsa dahi test/transport/run kanitini kontrol eder. Tamamlanmamis asamayi yeniden planlayip tum sistemi sifirdan yazmaz. Acik scope ayni aktif gorevde kalir; bitirmekten kacinmak icin baska gorev dosyasi uretmez.

---

## 10. Git, gizlilik ve kullanici kararlari

- Repo-local `user.name = mehmet-karacan`, `user.email = karacan.mehmet@hotmail.com`, `user.useConfigOnly = true`.
- Global Git config ve baska repository ayarlari degismez. Commit oncesi gercek author/committer; commit sonrasinda logdan tekrar kontrol.
- Yeni commit mesajlari ve urune ait Turkce dokuman/aciklamalar Turkce ASCII. Teknik kod kimlikleri serbest ASCII; musteri Unicode kaynak/path/test girdisi, upstream lisans ve orijinal hata verisi transliterate edilmez.
- Asama commit'i dogrulanmis ve anlamli olsun. Staged diff ve secret scan incelemesi zorunlu; kontrolsuz `git add -A` yok.
- Remote ve mevcut dal/koruma kontrol edilir; push hatasinda force push yok. Kullanici istemeden release/npm publish/PR botu/devops servis ekleme yok.
- CI kapali kalir. Operator acik onay verirse degisir; bu gorev o onay degildir.
- Public repository'ye corporate adresler, raw model config/session, API key/token, model/team UUID, customer kaynak, runtime DB, gercek JaCoCo kaynak HTML'i veya kisisel makine envanteri gitmez.
- Sifre/endpoint leak bulunursa daha fazla yayma; sanitized issue/kanit, yerel containment ve kullanici bildirimi. Gecmisi rewrite/forcepush veya credential rotation kullanici onayi olmadan yapilmaz.

---

## 11. Bitis kriterleri ve kullaniciya verilecek teslim

### 11.1 IMPLEMENTATION_VERIFIED icin

- F01-F14'teki kod hatalari gercek implementasyonla kapanmis; gereksiz yeniden yazim yerine mevcut urun tamamlanmis.
- D00-D10'un implementasyon parcalari ve ortamdan bagimsiz kabul testleri gecmis.
- Normal MCP girisinden scripted worker + gercek izole Maven/JaCoCo fixture E2E; kesinti/guvenlik/coverage/rapor/apply ve clean install kanitli.
- Typecheck/lint/unit/contract/integration/recovery/security testleri ve urunun kendi coverage raporu mevcut; yapilmayan katmanlar acik.
- Eski AC01-AC70 ve yeni RG01-RG52 icin gercek test assertion eslesmesi yapilmis. Sadece ad/metin/schema kanitiyla PASSED kalan satir yok.
- Current state/backlog/acceptance/handoff, run evidence ile tutarli.

### 11.2 FULL_ACCEPTANCE_VERIFIED icin

Usttekilere ek olarak yetkili kurum ortami/OpenCode/model ile RG41/RG42/RG44 ve ilgili AC67/AC68 dahil gercek kullanici deneyimi dogrulanmis olmali. Ulasilabilir hedefte iki metrik sahiden saglanmali; test-only engelli hedefte neden ve korunan kazanim sahiden raporlanmali. Windows/Linux zorunlu kabiliyetleri soz verilen sekilde kanitli olmalidir. Windows kurulum/verify/uninstall icin PowerShell izni gerekmeyen CMD + Node.js gercek E2E kaniti zorunludur.

Kurum modele erisim yoksa, implementasyon gercekten tamamlanmissa `IMPLEMENTATION_VERIFIED + INSTITUTIONAL_ACCEPTANCE_PENDING` denebilir. Eksik scheduler, host runner, yanlis coverage gate veya yetersiz resume gibi kod kusurlarina "ortam bekliyor" deneme. Herhangi zorunlu madde aciksa "tum gorevler bitti" yazma.

### 11.3 Kullaniciya final ozet

Kisa ama kanitli ozet:

- Hangi gercek hatalar duzeltildi; normal OpenCode kullanimi nasil dogrulandi?
- Son LINE/BRANCH, kaynak/test-only koruma, final replay ve kesintiden devam pilot kaniti.
- Mevcut OpenCode konfigurasyonu korunuyor mu; eski kurulumun olasi yan etkisi konusunda ne bulundu?
- Gercek kosulan test katmanlari ve acik ortam/kabul maddeleri.
- Son commit/branch/push ve CI'nin kullanici karariyla kapali oldugu.
- Runtime rapor/DB/ham kanit konumlari ve `ai/` handoff referansi.

Bu urunun basarisi, bir test job'unun %90'a ulasamama nedenini dogru raporlayabilmesini de kapsar. Ancak o job'un kendisine TARGET_REACHED yazilmasini kapsamaz.

---

## 12. Inceleme kaynaklari ve tekrar dogrulama adresleri

### 12.1 Birincil repository ve kullanici kaydi

- Repository: `https://github.com/mehmet-karacan/ai-test-engineering`
- Sabit inceleme commit'i: `https://github.com/mehmet-karacan/ai-test-engineering/commit/c5307f5315a288092a1293d874c335f8db5ecd3d`
- Bu belgede adi gecen kaynak dosyalar icin canonical URL kalibi: `https://github.com/mehmet-karacan/ai-test-engineering/blob/c5307f5315a288092a1293d874c335f8db5ecd3d/<repository-relative-path>`.
- Orijinal sozlesme: ayni commit'teki `AKTIF_GOREV.md`, ozellikle 2, 5-16, 18-22. bolumler.
- Kullanici oturum ciktisi: `session-ses_ede2.md`, son guncelleme 10 Ekim 2026 00:19. Bu dosya public'e kopyalanmayacak. Model/test sayisi iddialari bu kaydin beyanidir; bagimsiz kabul degildir.
- Oturum kanitlari: 168 test gecisi; pilot testinin 5000 bps esigi; temiz kurulumda gercek kullanici config'ine yazma; dogrulama yolu sonradan duzeltilip tekrar tam verification olmadan bitis iddiasi; `c5307f5` commit/push ciktilari.

### 12.2 Resmi API/semantik kaynaklari

**E01 - OpenCode server:** `https://opencode.ai/docs/server/`

Incelemede dogrulananlar: headless server ve `/doc`; `prompt_async` icin 204 No Content; mesaj listesi icin `{info,parts}` yapisi; session/abort/auth API'leri. Bunlar yuklu binary'nin ayni surumde oldugunun kaniti degildir. Uygulamada kurulu surumun `/doc` ve SDK tipleriyle tekrar dogrula.

**E02 - Node child process:** `https://nodejs.org/api/child_process.html`

`killed` flag'i sinyalin gonderilmesini belirtir, gercek process exit'ini degil. Process close/exit, child cleanup ve platform farklari icin resmi semantik esas alinir. Bu dokumanin latest surumu ile urunun Node24 hedefini karistirma; gerekli Node24 belgesini de dogrula.

**E03 - OpenCode SDK/config:** `https://opencode.ai/docs/sdk/` ve `https://opencode.ai/docs/config/`

Typed client ve ayar resolution/merge kurallari icin resmi referans. Global mirasin kapatildigi config nesnesinden tahmin edilmez; efektif ortam canary testi gerekir.

**E04 - MCP:** `https://modelcontextprotocol.io/specification/2025-11-25` ve `https://modelcontextprotocol.io/specification/2026-07-28`

Kullanilan adapter/SDK'nin gercek lifecycle ve tool error semantigi dogrulanir. Version string'i degistirerek yeni protokol destegi ilan edilmez. Job hafizasi Tasks/Sampling desteginden bagimsiz kalir.

**E05 - Docker run:** `https://docs.docker.com/reference/cli/docker/container/run/`

Mount, read-only, network, resource ve process lifecycle secenekleri resmi dokumanla ve gercek kabiliyet fault testleriyle uygulanir. Argumanin kodda bulunmasi tek basina izolasyon kaniti degildir.

### 12.3 Kisitli mikro tekrar uretimler

Inceleme ortaminda sadece saf ifadeler/native API ile, kaynak degistirilmeden ve ag/model cagrisi olmadan tekrar uretildi:

| Kontrol | Gozlem | Sinir |
| --- | --- | --- |
| Test prefix vs canonical path | `src/test/java/../../../README.md`, Windows ve POSIX hesapta proje icinde ama test root disinda; ham prefix izinli. | Policy fonksiyonunun ilgili ifade semantigi; tam urun regression'i uygulayici yazacak. |
| HTTP 204 JSON | `new Response(null, {status: 204}).json()` -> SyntaxError. | Native Response davranisi; gercek OpenCode cagrisi degil. |
| Mesaj shape | `{info:{role:'assistant'},parts:...}` disinda `role` aramak bos string veriyor. | Response shape/okuma mantigi; gercek worker run'i degil. |
| Tautolojik assertion | `assertTrue(true)` assertion regex'ine uyuyor, mevcut `assert(true)` tautoloji regex'ine uymuyor. | Dar regex deneyi; tum kalite suite'i degil. |
| POSIX separator | `src/main/java` icin zorunlu ters slash yolu `/fixture/src\\main\\java` uretir. | Yol ifadesi; source inventory'nin kendi testi gereklidir. |
| Symlink containment ifadesi | Normal cwd icin `!path.startsWith('')` false. | Incelenen boolean kusuru; gercek symlink/junction regresyonu ayri zorunlu. |

Sonraki model bu kayitlari yeniden PASS etiketi uretmek icin degil, gercek urun regression testlerine donusturmek icin kullanmalidir.

---

## 13. Ilk uygulanacak somut adim

`D00` kayit duzeltmesini ve `D01` installer konfigurasyon koruma testini baslat. Once sahte home icinde en az iki baska MCP + provider/agent/permission iceren sentinel config olustur; mevcut kurulum merge mantiginin baska MCP'leri kaybettirdigini tekrar uret. Bu testi sabit beklentiyle gecer hale getir, gercek user config'ine dokunulmadigini dogrula. Sonra `D03` guvenli calistirma gecidiyle birlikte `D02` asil MCP orkestrasyonunu bagla; D04-D10'u tamamla.

**Bitis cumlesi bir model karari degil, gercek kabul kanitlarinin sonucudur.**
