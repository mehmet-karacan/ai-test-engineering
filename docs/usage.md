# Kullanim

## Normal test gorevi

1. Yetkilendirilmis Java projesinde OpenCode'u acin.
2. Hedefinizi dogal dille soyleyin: "PaymentService icin coverage %90 olsun".
3. OpenCode, `test-engineering` skill yardimiyla typed tool'lari cagirir:
   - `project_inspect`: proje envanteri
   - `test_start`: kalici job baslatir, `job_id` doner
   - `test_status`: durumu sorgular
4. Sonuc `READY_FOR_REVIEW` olarak sunulur: rapor yolu, before/after sayaclari, kalan gap'ler.

## Devam ve inceleme

| Talep | Davranis |
| --- | --- |
| "Kaldigin yerden devam et" | Ayni `job_id` ile kesilen yerden devam |
| "Durdur" | Yeni aday baslatmaz; durumu kaydeder |
| "Sonucu goster" | Son dogrulanmis ozeti getirir |
| "Bu projede ne yaptik" | Envanter ve run gecmisini sorgular |

## Arac ozeti

| Arac | Yazi | Idempotent | Aciklama |
| --- | --- | --- | --- |
| `project_inspect` | yok | evet | Envanter + preflight |
| `project_query` | yok | evet | Sinirli sorgu (view + cursor) |
| `test_start` | job kaydi | evet | Kalici job; idempotency key destekli |
| `test_status` | yok | evet | Durum + event'ler |
| `test_apply` | kullanici projesi | evet | Onayli degisiklik aktarimi (varsayilan kapali) |

## Ciktilar

- Rapor: `<runtime>/jobs/<job-id>/reports/` (index.html, report.json, summary.txt, manifest.json)
- Blob'lar: `<runtime>/blobs/sha256/...`
- DB: `<runtime>/state.db`

Rapor dosyalari hedef kaynak reposuna yazilmaz.
