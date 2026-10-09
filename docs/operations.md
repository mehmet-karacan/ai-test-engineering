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
- Migration once backup ve disk kontrolu yapar; yarim kalirsa mevcut DB korunur.

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
