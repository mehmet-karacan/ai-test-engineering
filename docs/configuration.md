# Configuration

## Config dosyasi

Yer: `<USER_APP_DATA>/ai-test-engineering/config/config.json` (Windows: `%LOCALAPPDATA%`, Linux: `$XDG_DATA_HOME` veya `~/.local/share`).

```json
{
  "schema_version": 1,
  "storage": { "root": "<runtime dizini>" },
  "coverage_defaults": { "metrics": ["LINE", "BRANCH"] },
  "budgets": {
    "max_candidate_iterations": 20,
    "max_repairs_per_candidate": 2,
    "no_progress_window": 3,
    "total_job_minutes": 120
  },
  "worker_profiles": [
    {
      "profile_name": "kurum-ici-1",
      "provider_id": "litellm",
      "model_id": "kurum/model-1",
      "secret_reference_names": ["KURUM_API_KEY_REF"]
    }
  ],
  "default_worker_profile": "kurum-ici-1",
  "allowed_project_roots": ["C:/work/authorized-project"]
}
```

## Alanlar

| Alan | Anlam |
| --- | --- |
| storage.root | Runtime veri dizini (state.db, blobs, jobs) |
| coverage_defaults.metrics | Yuzde verildiginde varsayilan metrikler |
| budgets.max_candidate_iterations | Aday iterasyon ust siniri |
| budgets.max_repairs_per_candidate | Aday basina onarim ust siniri |
| budgets.no_progress_window | Plateau karari icin no-progress penceresi |
| budgets.total_job_minutes | Toplam is suresi butcesi (dakika) |
| worker_profiles | Yetkili model profilleri; secret degeri tasimaz |
| default_worker_profile | Varsayilan profil adi |
| allowed_project_roots | Yetkili proje kokleri; bos ise sinir yok |

## Kurallar

- Secret degerleri config'de tasimaz; `secret_reference_names` ile referanslanir.
- `allowed_project_roots` bos ise her kok kabul edilir; guvenli kurulumda doldurun.
- Config degisikligi schema dogrulamasindan gecer; gecersiz alan reddedilir.
- Kurulum scriptleri mevcut config'i ezmez; once yedek alir.

## Ortam degiskenleri

| Degisken | Anlam |
| --- | --- |
| `AITEST_CONFIG` | Config dosyasi yolu override |
| `AITEST_DB_PATH` | DB yolu override (test amacli) |
| `OPENCODE_SERVER_PASSWORD` | OpenCode server basic auth (worker) |

## Model profilleri

Model secimi: job'a acik verilen profil > proje profili > kullanici varsayilani. Dis saglayiciya sessiz fallback yapilmaz. Model kimlikleri harf/space dahil birebir dogrulanir; otomatik trim/rename yok.
