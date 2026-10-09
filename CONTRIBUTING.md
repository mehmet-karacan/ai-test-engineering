# Katki Rehberi

## Gelistirme akisi

1. `AGENTS.md` ve `ai/PROJECT_STATE.md` okuyarak guncel durumu anla.
2. Isi `ai/BACKLOG.md`'den sec; yeni ise baslamadan once mevcut durumu dogrula.
3. Kapsam degisikligi gerekiyorsa once `ai/decisions/` altina ADR yaz.
4. Her mantiksal parcadan sonra test sonucu, kalan is ve devam noktasini `ai/checkpoints/` altina kaydet.

## Kod standartlari

- TypeScript strict mod kullanilir.
- Commit mesajlari Turkce ASCII yazilir; ornek: `feat: kalici test gorevi ve checkpoint altyapisi eklendi`.
- Kod identifier'lari teknik ASCII English olabilir.
- Yeni bagimliliklar minimal, versiyonlu, lisansi bilinen ve lockfile'li olmalidir.

## Test

Degisiklikler ilgili unit/integration/contract testleri olmadan push edilmez:

```bash
npm run build
npm test
```

## Guvenlik

- Sirlari, kurum ici adresleri ve gercek proje verisini repoya ekleme.
- Public repoya yalniz urunun kodu, sentetik fixture ve sanitized gelistirme bilgisi gider.
- Guvenlik aciklarini `SECURITY.md` icindeki yontemle bildir.
