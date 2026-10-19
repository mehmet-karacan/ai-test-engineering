# Proje genel coverage ve kullanici secimi plani

**Yetki/spec:** 2026-10-20 kullanici talebi: MCP once genel JaCoCo raporu cikarsin, dusuk coverage'li uygun siniflari onersin, kullanici secince mevcut test uretimine gecsin; Sky'da dogrula, commit/push yap. Bu ek kapsam 006 Windows gorevinin onceki kapanisini tarihsel tutar.

**Amac:** `project_coverage` hedef istemeden kalici scan job baslatir; mevcut `test_status`/`test_result` gercek tum-modul olcumunu ve onerileri gosterir. Tarama model cagirmaz. Kullanici secimini `test_start` + `coverage_scan_id` ile somut hedefe baglar; source degismisse yeniden tarama ister.

**Mimari:** JobDispatcher native lease/process/toolchain sahipligini ve frozen baseline yolunu yeniden kullan. Coverage analizinde genel LINE/BRANCH sayaclari, modul/artifact kimligi, uygunluk nedenleri ve eksik olcumler saklanir. Sonuc immutable artifact olarak DB registry'ye baglanir. Eksik/stale/malformed rapor ve basarisiz/skip baseline onerilere donusmez.

## Gorevler

- [x] 1. JaCoCo genel analiz/ranking modulu + RED/GREEN testleri. Tum executable moduller; source/class/report eslesmesi; null branch ve unmeasured siniflar; deterministik ilk 5 uygun aday.
- [x] 2. MCP project_coverage + sonuc/selection baglantisi, async job, kaynak kimligi ve idempotency + RED/GREEN entegrasyon testleri. Empty target normal test_start icin hala yasak. Scan sonucunda WAITING_INPUT, hic model uretimi yok; secilmis sinif mevcut pipeline'a gider.
- [x] 3. POM'da JaCoCo olmayan projelerde acik CLI coverage modu: sabit `org.jacoco:jacoco-maven-plugin:0.8.12` prepare-agent/test/report zinciri; yalniz bu iki plugin goal'u native allowlist'e ekle. Eski configured modu degismez. Baseline/candidate/final ayni mode'u kullanir; skip/argLine gibi proje uyumsuzlugu gercek typed blocker olur, POM degistirilmez.
- [x] 4. Sky kaynak/dirty dosya hash'leri korunarak gercek stdio MCP scan; proje JDK21'i process-local ortamda sec. Eksik JaCoCo CLI ile, literal skip ve dis servis bagimliligi olursa durust blocker ile raporla. Scan onerileri varsa secim oncesi worker/candidate 0; secim sozlesmesi odak testlerle dogrulanir.
- [ ] 5. Bagimsiz review, Windows full suite/typecheck/lint/build, yeni kanit checkpoint/handoff; repo-local Git kimligi/gizlilik/staged diff kontrolu, commit/push. Kullanici dosyalarina ve CI'ya dokunma.

## Kabul ve review odagi

- Baseline hedef filtresi tasimaz; her executable modulun fresh raporu gerekir, partial genel coverage full gibi sunulmaz.
- Siralama coverage orani + missed line + FQN ile deterministik; uygunluk heuristik olarak aciklanir.
- Kullanici seciminden once model/aday/test_apply yoktur. Sky root icindeki tek Maven alt kok taninabilir; belirsiz coklu kokte acik secim gerekir.
- Kaynak/rapor blob degisimi, baska projenin scan'i, olmayan/uygunsuz aday ve yeniden baslatmada kayip sonuc fail-closed.
- POM/JVM argLine/Surefire skip politikasi gizlice degistirilmez. Genel test basarisizsa stale coverage ile liste doldurulmaz.
