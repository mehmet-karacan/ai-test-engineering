# Production rapor sayim ve hacim duzeltmeleri

- BASE: f1c77c1fbbf5e720cc78920293be540845125564.
- Izole dal: codex/prod-report-20261024; worktree: prod-report.
- Ortak brief: ai/tasks/2026-10-24-production-final-plan.md (d03b), SHA256 363ed43f4a410389137a947874ae66f40794137194555d40164362f0739ca199.
- Parent tarafindan devredilen kapsam: custom Maven test-root sayim duzeltmesi, rapor lookup Map/Set, baseline XML-only toplama; ardindan acik ek yetkiyle metot BRANCH counter omission gorunumu. Customer/model/Maven/browser kosusu ve push yok.

## Kok neden ve dar duzeltme

1. report-projection isTestSourcePath isim/yol heuristigi custom/checks/unit/demo/CalculatorSpec.java dosyasini production sayiyordu. Ayni dosya mevcut PolicyGuard icin izinli testtir. Dispatcher artik kabulde kullanilan resolved module test-root metadatasini projection'a ve rapora test_roots olarak aktarir. Report07 patch sayimi ayni PolicyGuard containment sonucunu kullanir. Kayitli kok yoksa tarihsel raporlar onceki fallback davranisini korur. Yeni raporda kok disindaki ProductionTest.java gibi yaniltici isimler test sayilmaz.
2. collectReport07BaselineEvidence once tum JaCoCo asset/test XML/log dosyalarini yukleyip yalniz XML'i tutuyordu. XML-only collector secenegi mevcut contained file/symlink ve baseline SHA kontrolleriyle sadece jacoco.xml toplar. Final replay tam collector davranisi korunur; ayni fixture'daki symlink asset final replay'de halen reddedilir.
3. JaCoCo XMLCoverageWriter yalniz totalCount > 0 counter yazar. Gecerli branching sinif icindeki branchless constructor/helper metodu BRANCH elemani tasimayabilir. Yalniz method projection bu durumda 0/0 NOT_APPLICABLE gosterir; LINE, class/target sayac mutabakati ve duplicate/corrupt XML retleri degismez. Sinif seviyesi eksik BRANCH davranisi ve engine hedef degerlendirmesi degistirilmedi. Birincil kaynak: https://raw.githubusercontent.com/jacoco/jacoco/master/org.jacoco.report/src/org/jacoco/report/internal/xml/XMLCoverageWriter.java (writeCounters).
4. Manifest/evidence ve required test-report ic ice lineer aramalar Map/Set'e donusturuldu. Hash, dosya boyutu, canonical path, duplicate ve publication kapilari ayni; tum byte'lar her poll'da yeniden okunur. Hash cache veya DB lock/CAS mimari degisikligi yok.

## RED/GREEN ve dogrulama

- Baslangic: p07-report-projection, report07, report07-baseline: 3 dosya / 28 PASS.
- RED: production-report-regressions 4/4 fail: custom root 0 added/0 modified/2 production; Report07 patch INVALID; baseline ilgisiz symlink asset traversal nedeniyle throw; method BRANCH UNAVAILABLE.
- GREEN: yeni 7 regresyon (4 pozitif + class mismatch/duplicate/corrupt negatifleri) dahil 8 dosya / 71 PASS; exit 0, 2026-10-24 18:28 TRT. Beklenen fault-injection stderr kayitlari testlere aittir.
- Komut: npm.cmd test -- tests/unit/production-report-regressions.test.ts tests/unit/p07-report-projection.test.ts tests/unit/report07.test.ts tests/unit/report07-baseline.test.ts tests/unit/p07b-report06-evidence.test.ts tests/unit/p07b-report06-surfaces.test.ts tests/integration/report-runtime-sync.test.ts tests/integration/report-finalization.test.ts --maxWorkers=1.
- Typecheck, degisen rapor/test dosyalarinda eslint ve git diff --check calistirildi. Tam Windows suite/build/publication gate parent'in birlesik kaynak dogrulamasidir; bu alt gorev bunlari PASS ilan etmez.
- Gelistiren kendi nihai reviewer'i degildir; bagimsiz review parent tarafindan atanacak.

## Ayni sentetik hacim fixture ile once/sonra

Olcum komutu node temp/aitest-prod-report-perf.mjs; SHA256 b4a397b4a0577bbe60a6317f98bf9894651e6a379438f2bfeb343b206fa08372. Probe yalniz olusturdugu temp dizini kullanir; musteri/runtime verisi okumaz. Node registerHooks + TypeScript transpileModule ile BASE ve fix kaynaklarini dogrudan yukler. Ayni script her iki worktree'de sirali calistirildi; disk/host yuku zaman ve RSS sonucunu etkileyebilir. Esik veya genel latency garantisi turetilmedi.

Fixture: sentetik SQLite job, degismeyen lifecycle/outcome/runtime, 10,000 adet 1KiB binary extra evidence. Export sonrasi uc handleTestStatus poll'u, readFileSync sayaclari; her poll sirasinda ikinci SQLite baglantisindan busy_timeout=1 ile yazma denemesi.

| Olcum | BASE | Fix |
| --- | --- | --- |
| Export ms | 41925.7 | 37591.0 |
| Poll ms (3 tekrar) | 5186.8 / 5445.5 / 5069.2 | 2231.9 / 1809.1 / 2050.3 |
| Poll median ms | 5186.8 | 2050.3 |
| Her poll dosya okuma | 10009 | 10009 |
| Her poll okunan byte | 32390859 | 32390859 |
| Ikinci writer locked | true | true |

Baseline-only fixture: 26byte jacoco.xml, her biri 32MiB olan ilgisiz JaCoCo HTML asset, Surefire XML ve stdout.log. Donen XML sayisi/boyutu her iki kosuda 1/26byte.

| Olcum | BASE | Fix |
| --- | --- | --- |
| Dosya okuma | 5 | 1 |
| Okunan byte | 100663322 | 26 |
| Sure ms | 132.93 | 1.425 |
| RSS delta byte | 134238208 | 57344 |

## Kalan sinir ve devam

- Steady status/result halen IMMEDIATE SQLite transaction icinde tum rapor evidence byte'larini hashler. 10k fixture'da fix sonrasi yaklasik 2 saniye boyunca baska writer bekler; Map/Set bu IO/lock sinirini kaldirmaz. Parent ek kisa lock/CAS tasarimi icin ayri karar verebilir; tamper testleri korunmalidir.
- Report07 fact parser'in mevcut 16MiB/XML siniri degismedi. 17MiB system-out tasiyan gecerli Surefire XML test_run INVALID dondurur. Bu belge bunu gecen test/eksiksiz rapor kabulu saymaz; daha buyuk XML'ler icin ayri urun limiti karari gerekir.
- Devam noktasi: alt gorev commit'ini parent'e bildir, bagimsiz review; parent birlesik kaynakta tam suite/build ve yayin hazirlik kararini dogrular. G3 yayin yetkisi verilmis sayilmaz.
