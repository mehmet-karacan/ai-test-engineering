# G1 devri - yz-core fix sonrasi source/API baseline blocker

- Branch/HEAD: `codex/windows-native-006` / `8cd87e2d13c475cdb03025202d3a8d35d28d32e3`
- Job: `46b4f18d-3ea6-43f0-b930-6cd5e612ec08`
- Fixed owned snapshot: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926-yzcorefix`
- Runtime evidence: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926-runtime5-yzcorefix`

## Yapilan

1. Kullanici onayi ile owned POM'a `tr.com.innova.yz:yz-core:0.1.0-SNAPSHOT` eklendi.
2. JDK 25 annotation processing icin owned snapshot'ta Lombok `1.18.46`, `proc=full` ve processor path tanimlandi.
3. Normal MCP `project_inspect/query -> test_start -> status -> result` akisi calistirildi.
4. Native toolchain/preflight kaniti alindi; Maven baseline 740 source compile sonrasinda 13 API uyumsuzlugunda durdu.

## Kalan blocker

`YzRaporIslemController`, `YzRaporAramaServisi`, `YzRaporMukerrerServisi`, `YzRaporEylemController`, `YzRaporYenidenOnizlemeController`, `YzRaporHazirController`, `YzRaporOzetController` ve `YzRaporSureController` mevcut `GpuReportService` imzalarinda olmayan method/overload'lari cagiriyor. Bu customer source tutarsizligi G1 test-only sinirinda yamalanamaz.

MCP sonucu `BASELINE_FAILED`; model/candidate/pause-resume/report yok. Customer checkout degismedi; POM SHA-256 `5E352C0E95FC8368686DA352F409512EBD9B1C67D038E95570997C18E487F0DE` olarak korundu.

## Sonraki somut is

Customer sahibi tutarli `GpuReportService`/`YzRapor*` kaynak snapshot'i veya upstream closure sagladiginda yeni owned snapshot olustur ve ayni G1 hedefiyle yeniden baslat. Source exclusion, production API yamasini sessizce ekleme, G2 apply veya G3 publish yapma.
