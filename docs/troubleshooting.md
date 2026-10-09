# Sorun Giderme

## Kurulum

| Belirti | Neden | Cozum |
| --- | --- | --- |
| `BLOCKED: prerequisite'leri kurun` | Node/Git/JDK/Maven eksik | Gerekli araclari kurun; Node 24+ zorunlu |
| npm install basarisiz | Ag/proxy | npm mirror veya offline cache kullanin |
| OpenCode config merge edilemedi | Mevcut config JSON hatasi | Elle `mcp.ai-test-engineering` ekleyin; ornek `integrations/opencode/config.example.json` |

## Calisma zamani

| Belirti | Neden | Cozum |
| --- | --- | --- |
| Arac listesi bos | dist uretilmemis | `npm run build` |
| `BLOCKED_ISOLATION` | Maven bulunamadi | `mvn.cmd` PATH'te olmali veya mvnw wrapper kullanin |
| `BASELINE_FAILED` | Mevcut testler basarisiz | Once mevcut testleri duzeltin; disable etmeyin |
| `AMBIGUOUS_TARGET` | Hedef sinif birden fazla yerde | Tam paket adi ile hedef verin |
| DB `SQLITE_BUSY` | Ikinci process ayni workspace'te | Lease devralinir veya diger process'i kapat |
| Checkpoint `BLOB_EKSIK` | Blob dosyasi silinmis/disk sorunu | Onceki guvenilir checkpoint'ten devam; RecoveryManager tani verir |
| Coverage `INVALID_COVERAGE_EVIDENCE` | XML bozuk/eski run'dan | Taze run yapin; eski exec/XML kullanmayin |
| JaCoCo `BLOCKED_COVERAGE_CONFIGURATION` | POM'da olcum yapilandirmasi yok | JaCoCo plugin'i projeye ekleyin (elle; urun POM degistirmez) |

## Loglar

- Urun loglari: `<runtime>/logs/`
- Maven ciktilari: `<proje>/target/aitest-*-logs/`
- MCP protokolu STDOUT kullanir; Maven cikti karismaz.
