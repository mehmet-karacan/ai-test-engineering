# Configuration

## Config dosyasi

Windows native yer: `%LOCALAPPDATA%/ai-test-engineering/config/config.json`. Runtime root yoksa `%USERPROFILE%/AppData/Local` kullanilir. Linux/macOS bu teslim kapsaminda degildir.

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
| `AITEST_WORKER_ENABLED` | Yalniz `1` degeri test uretim worker'ini acar; varsayilan kapalidir |
| `OPENCODE_SERVER_PASSWORD` | OpenCode server basic auth (worker) |

## Model profilleri

Model secimi: job'a acik verilen profil > proje profili > kullanici varsayilani. Dis saglayiciya sessiz fallback yapilmaz. Model kimlikleri harf/space dahil birebir dogrulanir; otomatik trim/rename yok.

Ilk kurulum `worker_profiles: []` birakir; model profili veya worker flag'i kendiliginden eklenmez. Profilin `provider_id`/`model_id` degerleri mevcut OpenCode provider/model kaydiyla eslesmelidir. Ornegin yukaridaki profil icin OpenCode `model` alani `litellm/kurum/model-1` olur. `READY/CONFIGURED` yalniz yerel kimlik bagini dogrular; canli provider yetkisini veya cevap basarisini kanitlamaz.

Worker'i kullanici acikca etkinlestirecekse CMD'de, kurulumdan once:

```cmd
set AITEST_WORKER_ENABLED=1
node scripts/install.mjs
node scripts/verify-install.mjs
```

Kurulum explicit flag'i OpenCode MCP girdisinin `environment` alanina kaydeder; OpenCode'u yeniden acin. Flag olmadan kurulum generation'i acmaz. Worker'i kapatmak icin `set AITEST_WORKER_ENABLED=0` ile yeniden kurun veya kayitli MCP environment degerini `0` yapin. Yeniden kurulum kayitli environment'i kurulum terminalinin explicit degerlerinden yeniden kurar; onceden acik worker'in korunmasi isteniyorsa flag'i tekrar verin.

`AITEST_CONFIG` runtime MCP icin config override'idir; kurulum/dogrulayici standart kullanici config yolunu yonetir. Ozel config/DB kullanan kayitlarda environment bagini elle dogrulayin. Secret degerlerini komuta veya repodaki ornek config'e koymayin. Projeye ozel JDK secimi icin [native-project-profiles.md](native-project-profiles.md) belgesini kullanin.
