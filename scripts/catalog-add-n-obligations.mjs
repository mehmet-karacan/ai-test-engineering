/**
 * W10/F17/N58: catalog.json'a 004 gorevinin N01-N64 kabul kayitlarini ekler.
 * Tekil ledger: her N kimligi ayri kayit (duplicate/missing yok); grup ozeti yalniz bunlardan turetilir.
 * Bu script maintainer Node girisi; CI degil.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");
const catalogPath = join(repoRoot, "ai", "acceptance", "catalog.json");

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

/** N01-N64: paket, davranis, asgari kanit seviyesi (AKTIF_GOREV.md bolum 13 tablolari) */
const N_OBLIGATIONS = [
  { id: "N01", pkg: "W00/W08", behavior: "Referans dosyasi ve logo: 06 HTML hash/bayt dogru; renderer sade gorunum; referans farkliysa durur", levels: ["CONTRACT"] },
  { id: "N02", pkg: "W06", behavior: "Model yorumu negatif enjeksiyonu: narrative alanlar tum yuzeylerde YOK; kirpilan yol kayitli", levels: ["CONTRACT"] },
  { id: "N03", pkg: "W06", behavior: "Test adi/DisplayName/kaynak kodu yalniz source/run kaydindan; uydurma aciklama yok", levels: ["CONTRACT"] },
  { id: "N04", pkg: "W06", behavior: "Bilinmeyen/sifir/uygulanamaz ayri; eksik veri %0 veya PASSED ile ortulmez", levels: ["CONTRACT"] },
  { id: "N05", pkg: "W03", behavior: "Yalniz baslangic raporu: modelsiz mevcut test/coverage olcumu ve HTML; worker cagrisi 0", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N06", pkg: "W03/W06", behavior: "Raporun generation oncesi yayini; worker hata verirse baseline okunabilir kalir", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N07", pkg: "W03/W06", behavior: "Olculemeyen/basarisiz baseline: ayri reason/status ve rapor; sentetik exit0 yok", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N08", pkg: "W06/W08", behavior: "Asama verisi bulunmamasi: yalniz baseline job'da progress/final uretilmez", levels: ["CONTRACT"] },
  { id: "N09", pkg: "W01", behavior: "204 ve nihai mesaj korelasyonu; bos HTTP govdesine JSON parse yok", levels: ["CONTRACT_HTTP"] },
  { id: "N10", pkg: "W01", behavior: "tool-calls ara adimi; tools-denied ayri policy hatasi; ara mesaj nihai degil", levels: ["CONTRACT_HTTP"] },
  { id: "N11", pkg: "W01", behavior: "Erken bos final EMPTY_FINAL; gercek zaman dolmadan TIMEOUT yok; cleanup kayitli", levels: ["CONTRACT_HTTP"] },
  { id: "N12", pkg: "W01", behavior: "length/kesik JSON/fence-only/reasoning-only ayri kodlarla red", levels: ["CONTRACT_HTTP"] },
  { id: "N13", pkg: "W01", behavior: "HTTP/izin/timeout/cancel typed sonuc + bounded bekleme + owned abort", levels: ["CONTRACT_HTTP"] },
  { id: "N14", pkg: "W01/W05", behavior: "Attempt gecmisi ve bounded retry; crash'te butce sifirlamaz", levels: ["INTEGRATION_LOCAL"] },
  { id: "N15", pkg: "W01", behavior: "12K sonrasi acik truncation; ayni basename farkli paket; eksik parca kayitli", levels: ["CONTRACT", "INTEGRATION_LOCAL"] },
  { id: "N16", pkg: "W01", behavior: "Owned worker ve frozen profile; yabanci baglanma/user config yazma yok", levels: ["CONTRACT_HTTP", "OPERATIONAL"] },
  { id: "N17", pkg: "W02", behavior: "Orijinal checkout butunlugu: aday yalniz ayri workspace'te; before/after FS snapshot", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N18", pkg: "W02/W07", behavior: "Platform ve path sinirlari: traversal/symlink/ADS/UNC; containment disi yazim yok", levels: ["CONTRACT", "OPERATIONAL"] },
  { id: "N19", pkg: "W02", behavior: "Gercek capability probe: probe yok/NO_CGROUP/onceki dosya ile false PASS alinmaz", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N20", pkg: "W02", behavior: "Egress/settings/cache siniri: izinsiz endpoint reddi; enforcement yoksa typed BLOCKED", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N21", pkg: "W03/W04", behavior: "Gercek hedef listesi: ayni simple name iki modul; package boundary; frozen concrete hedefler", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N22", pkg: "W03", behavior: "Inherited framework: parent POM effective plan; static none fake uretmez", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N23", pkg: "W03", behavior: "Skip/kesif/bozuk XML/exit0: bilinen test varken sessiz no-tests basarisi yok", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N24", pkg: "W03", behavior: "Cok modullu taze JaCoCo: gercek agent + yeni run raporu; eski XML denemesi", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N25", pkg: "W04/W06", behavior: "Iki metrik birlikte: tum yuzeylerde ayni TARGET_NOT_MET; sadece LINE ile basari yok", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N26", pkg: "W04", behavior: "Branch-only kazanc kabul; gerileyen aday koruma kuralina takilir (gercek loop yolu)", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N27", pkg: "W04/W06", behavior: "Gecerli total0 N/A; kayip veri UNAVAILABLE/INVALID; otomatik basari yok", levels: ["CONTRACT", "INTEGRATION_ISOLATED"] },
  { id: "N28", pkg: "W04/W06", behavior: "Kesin esik: %89.96 hedef90'da ulasmamis; raw counter agirlikli toplama", levels: ["CONTRACT"] },
  { id: "N29", pkg: "W04", behavior: "A+B kabul, C red, final A+B; patch/checkpoint/report ayni accepted baytlari", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N30", pkg: "W04/W01", behavior: "Gercek feedback ile repair: compile/assertion ayri; tekrarlar sinirli; budget kalici", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N31", pkg: "W04", behavior: "Mevcut testlerin korunmasi: silme/disabled/shadowing reddedilir", levels: ["CONTRACT", "INTEGRATION_ISOLATED"] },
  { id: "N32", pkg: "W04/W06", behavior: "Final replay ve durma nedeni: BUDGET/PLATEAU/FAILED/BLOCKED/ALREADY_MET farkli ve kanitli", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N33", pkg: "W05", behavior: "Normal yolda checkpoint yayini: immutable manifest/blob + DB pointer; yarim artifact kabul edilmez", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N34", pkg: "W05", behavior: "Hard-kill ve ayni jobdan devam: butce/accepted checkpoint'ten yuklenir", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N35", pkg: "W05", behavior: "Kaynak degisiminde resume: SOURCE_CHANGED acik; eski coverage yeni kaynaga atanmaz", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N36", pkg: "W05", behavior: "Iki resume, tek owner: fence eski worker'in DB/checkpoint/report yazmasini engeller", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N37", pkg: "W05/W02", behavior: "Cancel gercek processleri bitirir: owned kimlikler; late output CANCELLED'i overwrite edemez", levels: ["INTEGRATION_ISOLATED", "OPERATIONAL"] },
  { id: "N38", pkg: "W05", behavior: "Pause ve tekrar devam: son accepted checkpoint + remaining budget korunur", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N39", pkg: "W05/W01", behavior: "Contract ve job handle: restartta okunur; hata halinde job_id korunur", levels: ["CONTRACT", "INTEGRATION_LOCAL"] },
  { id: "N40", pkg: "W03/W05/W06", behavior: "Generation hatasinda kullanilabilir sonuc: baseline rapor durur; typed attempt kaydi", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N41", pkg: "W03/W06", behavior: "Gercek test invocation kayitlari: logical metot ile calistirilma karismaz", levels: ["CONTRACT", "INTEGRATION_ISOLATED"] },
  { id: "N42", pkg: "W06", behavior: "Tek veri kaynagi: tum yuzeyler ayni report revision/digest; checkout XML degisimi eski raporu bozmaz", levels: ["INTEGRATION_ISOLATED"] },
  { id: "N43", pkg: "W06/W08", behavior: "Tam liste/dogru sayfalama: filtre o kaydin testlerini gosterir; export tum uygun kayitlari kapsar", levels: ["BROWSER"] },
  { id: "N44", pkg: "W07", behavior: "Binary ve nested export: .exec/nested html byte birebir; asset linkleri offline", levels: ["CONTRACT", "BROWSER"] },
  { id: "N45", pkg: "W07", behavior: "Hash bozulmasi verification_passed false; parametresiz verify canonical manifest okur", levels: ["CONTRACT"] },
  { id: "N46", pkg: "W07", behavior: "Foreign-job ve export path korumasi: traversal/symlink/extraFiles ezme reddedilir", levels: ["SECURITY", "INTEGRATION_LOCAL"] },
  { id: "N47", pkg: "W05/W07", behavior: "Atomik yayin ve partial failure: crash failpoint'inde onceki complete snapshot", levels: ["INTEGRATION_LOCAL"] },
  { id: "N48", pkg: "W07", behavior: "Gercek accepted patch ve apply siniri: before/after bytes; onaysiz apply reddedilir", levels: ["CONTRACT", "INTEGRATION_ISOLATED"] },
  { id: "N49", pkg: "W08", behavior: "06 gezinme ve detay davranislari: expand/tab/dialog/copy/pagination/scrollspy/keyboard", levels: ["BROWSER"] },
  { id: "N50", pkg: "W08", behavior: "Mobil/masaustu yerlesim: 320-1920 genislik; uzun adlar; sticky nav; kutu-icinde-kutu yok", levels: ["BROWSER", "VISUAL_REVIEW"] },
  { id: "N51", pkg: "W08/W09", behavior: "Cevrimdisi ve paket assetleri: network bloklu file:// rapor calisir; CDN/model fetch yok", levels: ["BROWSER", "OPERATIONAL"] },
  { id: "N52", pkg: "W08", behavior: "HTML/JSON injection: script/SVG onerror/Unicode control; JavaScript tetiklenmez", levels: ["SECURITY", "BROWSER"] },
  { id: "N53", pkg: "W06/W07", behavior: "Narrative ve secret tum cikti yuzeylerinde: allowlist/typed metadata; reasoning sizmaz", levels: ["SECURITY", "CONTRACT"] },
  { id: "N54", pkg: "W06", behavior: "Gercek raporda ornek veri bulunmamasi: DEMO/GIVEN/synthetic renderer'dan cikarilir", levels: ["CONTRACT", "BROWSER"] },
  { id: "N55", pkg: "W08", behavior: "Buyuk rapor: 10.000+ test kaydinda bounded DOM/search/page; olculen sure kayitli", levels: ["BROWSER", "PERFORMANCE"] },
  { id: "N56", pkg: "W06", behavior: "Metot ve test iliskisi sinirlari: class/method/raw sayaclari source kimligiyle", levels: ["CONTRACT", "BROWSER"] },
  { id: "N57", pkg: "W00/W10", behavior: "Son kaynakla gercek suite: lint/typecheck/build + tam suite actual exit/digest ile kayitli", levels: ["OPERATIONAL"] },
  { id: "N58", pkg: "W00/W10", behavior: "210+64 tekil ledger: AC/RG/RT/PRO ve N64 kimlikleri ayri kayit; duplicate/missing yakalanir", levels: ["CONTRACT"] },
  { id: "N59", pkg: "W10", behavior: "False-proof verifier negatifleri: marker/passed:true JSON/degismis digest ile full gate non-zero", levels: ["CONTRACT", "OPERATIONAL"] },
  { id: "N60", pkg: "W10", behavior: "Pilot pause ile kabul ayrimi: local IMPLEMENTATION_VERIFIED; LIVE_MODEL ertelenmisken full non-zero", levels: ["CONTRACT", "OPERATIONAL"] },
  { id: "N61", pkg: "W09", behavior: "PS1 olmadan temiz Windows kurulum: CMD+Node; sentinel degismez; assetler eksiksiz", levels: ["OPERATIONAL"] },
  { id: "N62", pkg: "W09", behavior: "Mevcut veri ile upgrade ve geri donus: migration/backup/restore/GC normal yolda", levels: ["OPERATIONAL", "INTEGRATION_LOCAL"] },
  { id: "N63", pkg: "W09/W06", behavior: "Diger araclarin gercek durumu: PIT/SCA/static kayitli; arac yoklugu 0/PASSED olmaz", levels: ["CONTRACT", "OPERATIONAL"] },
  { id: "N64", pkg: "W11", behavior: "Teslim tutarliligi: task/ledger/README/state ayni kapsam; exact06 hash; pilot durumu acik", levels: ["OPERATIONAL", "REVIEW"] },
];

if (!catalog.n_obligations) {
  catalog.n_obligations = N_OBLIGATIONS.map((n) => ({
    requirement_id: n.id,
    section: "13",
    behavior: n.behavior,
    package: n.pkg,
    evidence_levels: n.levels,
    status: "NOT_RUN",
    proof: null,
  }));
  catalog.n_obligations_note = "AITE-REPORT06-INTEGRATION-004 v1.0 bolum 13: 64 davranis kabulu (N01-N64); tekil kayit; grup ozeti yalniz bunlardan turetilir";
  // W10/F17/N58: grup envanterine 004 ekle:
  catalog.groups.push({
    source: "AITE-REPORT06-INTEGRATION-004",
    archive: "AKTIF_GOREV.md#13-zorunlu-yeni-normal-yol-regresyonlari-n01-n64",
    ids: "N01-N64",
    count: 64,
    status_default: "NOT_RUN",
  });
  catalog.status_counts.n_obligations = 64;
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(`[catalog] N01-N64 eklendi (${catalog.n_obligations.length} kayit); groups: ${catalog.groups.length}`);
} else {
  console.log(`[catalog] n_obligations zaten mevcut (${catalog.n_obligations.length}); degisiklik yok`);
}
