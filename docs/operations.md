# Islemler (Operations)

## Runtime veri yerlesimi

```text
<USER_APP_DATA>/ai-test-engineering/
  state.db                  # SQLite (WAL)
  config/config.json        # Profil
  blobs/sha256/...          # Immutable artifact'ler
  backups/                  # Config yedekleri
  logs/                     # Urun loglari
```

Runtime veri hedef kaynak reposuna veya bu gelistirme deposunun `ai/` klasorune yazilmaz.

## Backup / restore

- SQLite WAL modunda; backup icin desteklenen yontem: `sqlite3 state.db ".backup 'backup.db'"` (DB kapaliyken veya online backup API).
- Blob deposu content-addressed; backup'ta DB + blobs birlikte alinir.
- Baslatma migration'lari checksum ve transaction ile uygular; otomatik upgrade backup'i veya bos disk kontrolu yapmaz. Upgrade oncesi operator asagidaki adimlari tamamlar.

### Upgrade oncesi operator proseduru

1. Calisan isleri `test_status` ile kontrol edin; devam eden isleri duraklatin. OpenCode ve bu urunun MCP sureclerini kapatin. Acik DB/native modul varken `npm ci`, build veya dosya geri yukleme yapmayin.
2. Runtime DB, `blobs/`, `jobs/` (rapor ve kanitlar), config ve install manifestini ayni backup setine alin. DB aciksa yalniz state.db'yi kopyalamak WAL verisini kaybedebilir; SQLite online backup API/`.backup` kullanin. Kapali DB'de de kalan WAL/SHM dosyalarini silmeyin.
3. Backup hedefindeki bos disk alanini ve dosya hash'lerini kontrol edin. DB kopyasinda `PRAGMA integrity_check;` ve `PRAGMA foreign_key_check;` calistirin; ilk sonuc `ok`, ikinci sonuc bos olmali. Blob/rapor dosyalarini da backup setiyle birlikte koruyun.
4. `node scripts/install.mjs`, sonra `node scripts/verify-install.mjs` calistirin. Schema/checksum hatasinda tablo/migration kaydini elle degistirmeyin; MCP'yi kapatip dogrulanmis backup ve onceki kaynak/build ile geri donun. Daha yeni DB eski uygulamayla acilamaz.

Restore sirasinda acik DB uzerine state.db kopyalamayin veya eski WAL/SHM ile yeni DB'yi birlestirmeyin. Urunun `restoreBackup` API'si DB/blob dogrulamasi, maintenance lock ve restore journal kullanir; bu API icin kullaniciya acik CLI yoktur. Manuel restore yerine bu API'yi kullanan kontrollu operator proseduru ve hedefe uygun dogrulama gerekir. Backup alinmasi tek basina restore'un dogrulandigi anlamina gelmez.

## Retention

- Best/tested checkpoint blob'lari otomatik silinmez (pin_reason).
- Rejected candidate'ler staging'de; best set'e karismaz.
- Kullanici verisi silme acik onay + referans kontrolu gerektirir.

## Sorun giderme

| Belirti | Kontrol |
| --- | --- |
| MCP araclari gorunmuyor | OpenCode config'inde `mcp.ai-test-engineering` var mi; `node dist/mcp/stdio-entry.js` elle calisiyor mu |
| `BLOCKED_ISOLATION` | Maven/runner kabiliyeti; mvn.cmd PATH'te mi |
| `BASELINE_FAILED` | Mevcut testler zaten basarisiz; once onlari duzelt |
| DB kilidi | Ayni workspace'te ikinci MCP process'i var mi (lease kontrolu) |
| Blob eksik | `verifyCheckpoint` tani sonu; onceki guvenilir checkpoint'ten devam |
