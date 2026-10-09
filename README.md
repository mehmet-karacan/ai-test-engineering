# ai-test-engineering

OpenCode uzerinden kullanilan, kalici hafizali, yalniz test calisan bagimsiz test muhendisligi MCP urunu.

## Amac

Kullanici yetkilendirilmis bir Java projesinde OpenCode'u acar ve dogal dille hedefini soyler (ornegin: "PaymentService icin coverage %90 olsun"). Sistem:

1. Projeyi ve hedef sinifi dogru bulur (multi-module Maven destekli).
2. Yalniz test olusturur veya gelistirir; production koduna dokunmaz.
3. Maven/JUnit/JaCoCo ile sonucu gercekten olcer.
4. Hedefe kadar kontrollu iterasyon yapar (checkpoint'li).
5. Kesilirse ayni gorevden kalici durumla devam eder.
6. Sonunda gercek sonucu ve kanitlarini sunar.

## Mevcut durum

Gelistirme su an P01 (calisan dikey cekirdek) asamasinda. Ilerleme ve kararlari icin:

- `AKTIF_GOREV.md` - gorev sozlesmesi (kimlik, kurallar, kabul matrisi)
- `AGENTS.md` - gelistirme protokolu
- `ai/PROJECT_STATE.md` - guncel durum
- `ai/BACKLOG.md` - is listesi
- `docs/architecture.md` - mimari (P01 ile birlikte gelisir)

## Temel prensipler

- **Test-only:** Production kaynaklari, POM/build ve coverage politikalari degismez.
- **Gercek olcum:** Coverage, modelin beyanindan degil guvenilir runner ciktilarindan hesaplanir.
- **Kalici durum:** SQLite + hash'li artifact deposu; kesintiden checkpoint ile devam.
- **Model-bagimsiz:** Ayni gorev baska yetkili modelle devralinabilir.
- **Onayli uygulama:** Test degisiklikleri yalniz acik onayla kullanici projesine uygulanir.

## Gelistirme

```bash
npm install
npm run build
npm test
```

## Lisans

Henuz belirlenmedi; karar alindiginda burada ve `LICENSE` dosyasinda belirtilecek.
