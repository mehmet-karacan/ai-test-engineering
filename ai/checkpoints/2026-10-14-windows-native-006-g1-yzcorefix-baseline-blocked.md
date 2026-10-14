# G1 pilot yz-core fix sonrasi baseline blocker checkpoint

- Gorev: `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`
- Dilim: G1 GPU Fusion kontrollu pilot, owned snapshot, normal MCP Windows native yolu
- Tarih: 2026-10-14
- Branch/HEAD: `codex/windows-native-006` / `8cd87e2d13c475cdb03025202d3a8d35d28d32e3`
- Hedef: `tr.com.innova.gpu.validation.AccumulatorFormulaValidator`
- Test: `tr.com.innova.gpu.validation.AccumulatorFormulaValidatorTest`
- Coverage hedefi: LINE/BRANCH 80%
- Model binding: `litellm/GLM-5.3-Flash-IT`

## Kullanici follow-up ve sinir

Kullanici eksik `yz-core` bagimliliginin tanimlanmasini ve MCP'nin yeniden kosulmasini onayladi. Customer checkout (`C:\innova\projeler\gpu-fusion`) korunarak yeni owned snapshot `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926-yzcorefix` olusturuldu.

Owned snapshot POM tanisal degisiklikleri:

1. `tr.com.innova.yz:yz-core:0.1.0-SNAPSHOT` dependency'si eklendi. Artefakt yerel Maven deposunda mevcut ve gereken `api`, `persistence` ve `catalog` siniflarini iceriyor.
2. JDK 25 ile kaynakta kullanilan Lombok anotasyonlarinin calismasi icin owned POM'a Lombok `1.18.46`, `maven-compiler-plugin` `<proc>full</proc>` ve annotation processor path eklendi. Bu degisiklik customer checkout'a veya urun reposuna uygulanmadi.

Customer `gpu-backend/pom.xml` SHA-256 degismedi: `5E352C0E95FC8368686DA352F409512EBD9B1C67D038E95570997C18E487F0DE`.

## Normal MCP kaniti

Runtime store: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926-runtime5-yzcorefix`

MCP sirasi `project_inspect -> project_query(modules/classes/tests) -> test_start -> test_status -> test_result` ile gerceklesti. Native preflight ve native execution toolchain kanitlari yazildi. Job:

`46b4f18d-3ea6-43f0-b930-6cd5e612ec08`

- `project_inspect`: `maven_single`, tek `gpu-backend` modulu, complete metadata scan.
- `test_start`: hedef ve coverage sozlesmesi kabul edildi; target-only selector `-Dtest=tr.com.innova.gpu.validation.AccumulatorFormulaValidatorTest` provenance'a yazildi.
- Sonuc: `FAILED / baseline / BASELINE_FAILED`.
- `test_result`: `best_checkpoint_id=null`, coverage/report yok, yalniz native toolchain artifact ref'leri var.
- Model/candidate/repair/pause/resume acilmadi; model istegi yok.

## Yeni kok neden

`yz-core` ve Lombok processor duzeltmesinden sonra 740 main source compile edildi ve `YzRapor*` kaynaklari ile `GpuReportService` arasinda 13 API uyumsuzlugu goruldu. Ornekler:

- `canAccessReport(Long,String,Kullanici)` yok.
- `projectReportParameters(Kullanici,ReportParamaterDTO)` yok.
- `findByCriteria(ReportCriteriaDto,Kullanici,boolean)` overload'i yok.
- Bes parametreli `createReport(...)` overload'i yok; cagiran kod Long beklerken mevcut method `void` donuyor.

Bu source/API butunlugu customer checkout'taki mevcut dirty degisikliklerle iliskili gorunuyor. G1 tek sinif/test-only sozlesmesi icinde production source/POM dislama veya API yamasiyla baseline basarisi uydurulmadi.

## Kanit SHA-256

| Dosya | SHA-256 |
| --- | --- |
| owned fixed `pom.xml` | `B94D9D8416822BEE13611B7E45343DF85B138D26FF84AF17494C415C205C6F01` |
| `config.json` | `27AADDE9F9BBE6CF367017F651F0627BB10CF935DCBA487E9C7973F0D6C28494` |
| `mcp-wire.ndjson` | `0931AE3A50B74404C96B40D3F9D0C8781C89607D35041FFA6A92D7EF3E43FAB7` |
| `state.db` | `5D5CCE679BBC1A0C31A8AF4F59D2C2DC05D33F0451A73F70C01F43E9571E994F` |
| `pilot-summary.json` | `00D29C47B315CE8EC4781A95B1C5E1F321D029A1CF26E3444D28CD4C3273FDF9` |
| `maven-stdout.log` | `29F5CD3503812ECE6B0C3DED5F8A81BCABCF1B6424A87F8DB0A63960DBDD21E6` |
| `maven-stderr.log` | `E0704B7893DFB0ED4CC4C3C3E6F41CF2CF5EDFA961010D52005CC4CEFF1D269` |

## Devam noktasi

Customer sahibi `GpuReportService` ile `YzRapor*` API uyumsuzlugunu gideren temiz ve tutarli bir snapshot veya upstream kaynak kapanisi saglamali. Sonra yeni owned snapshot ile ayni hedef/coverage sozlesmesi yeniden baslatilabilir. Customer checkout'a yazma, G2 apply, G3 publish, source exclusion veya sahte target success yok.
