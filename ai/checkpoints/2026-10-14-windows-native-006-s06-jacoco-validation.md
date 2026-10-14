# S06 JaCoCo validation checkpoint

- Kapsam: WN57 malformed/inconsistent JaCoCo counter kanitini fail-closed reddetme.
- Degisen urun dosyasi: `src/coverage/jacoco-parser.ts`.
- Yeni regresyon: `tests/unit/s06-jacoco-validation.test.ts`.
- Eksik, sayisal olmayan, negatif veya guvenli integer araligi disindaki `missed`/`covered` degerleri `INVALID_COVERAGE_EVIDENCE` olur.
- Ayni XML elementinde desteklenen counter type tekrar ederse `JACOCO_COUNTER_DUPLICATE` olur; degerler sessizce sifira donusturulmaz.

## Kanit

- RED: mevcut parser `NaN`, negatif ve duplicate counter'lari kabul etti.
- Kod sonrasi ilk GREEN denemesi ortam bagimlilik hatasiyla baslamadi: `node_modules/chai/index.js` ve ardindan `vitest/config` paralel calisma sirasinda eksik bulundu.
- Kaynak degisikligi customer checkout'a, S02/S03 inventory'ye veya S05 scheduler'a dokunmaz.

## Kalan

- Node modules yeniden hazir oldugunda `tests/unit/s06-jacoco-validation.test.ts` ve S06 odak suite tekrar kosulmali.
- Session freshness, source/class identity ve final replay provenance WN57-WN60 dilimleri bu checkpoint'in disindadir.
