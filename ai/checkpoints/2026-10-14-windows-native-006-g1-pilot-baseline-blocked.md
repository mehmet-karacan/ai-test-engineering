# G1 pilot baseline blocker checkpoint

- Gorev: `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`
- Dilim: G1 GPU Fusion kontrollu pilot, normal MCP Windows native yolu
- Tarih: 2026-10-14
- Branch: `codex/windows-native-006`
- HEAD: `354845fa6065f6f553f887c560d7f1856bff833f`
- Urun degisiklikleri: commit edilmedi; G2 apply ve G3 publish yapilmadi
- Git kimligi: `mehmet-karacan <karacan.mehmet@hotmail.com>`

## Onayli kapsam

- Hedef: `tr.com.innova.gpu.validation.AccumulatorFormulaValidator`
- Modul: `gpu-backend` (root module, Maven `jar`)
- Kaynak: `src/main/java/tr/com/innova/gpu/validation/AccumulatorFormulaValidator.java`
- Coverage hedefi: LINE 80%, BRANCH 80%
- Test kapsam secimi: mevcut `tr.com.innova.gpu.validation.AccumulatorFormulaValidatorTest`
- Model binding: `litellm/GLM-5.3-Flash-IT`
- Butce: 3 aday, aday basina 1 repair, toplam model istegi 10, en fazla 2 model eszamanli, en fazla 1 Maven, toplam 30 dakika
- Maven/Java: Maven 3.9.16 wrapper dagitimi, Maven probe Java 25.0.3; POM release 17

Kullanici onayi 2026-10-14 tarihinde bu tek hedef ve coverage esigi icin verildi. Baslangic metadata envanteri read-only yapildi. Customer checkout `C:\innova\projeler\gpu-fusion` degistirilmedi; pilot owned snapshot uzerinde calisti.

## Normal MCP kaniti

- Owned snapshot: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926`
- Runtime: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926-runtime4`
- Job: `16910a74-677e-4608-88ba-0551f237e146`
- Sira: `project_inspect` -> `project_query` (modules/classes/tests) -> `test_start` -> `test_status` -> `test_result`
- `project_inspect`: complete metadata scan, 1118 entry, 1 Maven module
- `test_start`: hedef exact FQCN/path ile 1 eslesme; source-set `main`
- Native process/toolchain preflight: PASS; native execution toolchain artifacti yazildi
- Baseline Maven komutu DB provenance icinde kayitli:
  `mvn.cmd test jacoco:report -DskipTests=false -Dmaven.test.skip=false -DskipITs=false -DtestFailureIgnore=false -Dmaven.test.failure.ignore=false -Djacoco.skip=false -DfailIfNoTests=true -Dtest=tr.com.innova.gpu.validation.AccumulatorFormulaValidatorTest -B -ntp`
- Son durum: `FAILED / baseline / BASELINE_FAILED`
- `test_run_provenance`: 1 baseline run, exit code 1, 0 test, timeout yok
- Worker/model attempt: 0; model istegi gonderilmedi
- Pause/resume: baseline generation/verification asamasina ulasilmadigi icin calistirilmadi

## Kok neden

Maven hedef test filtresini kabul etti ve `-Dtest=...AccumulatorFormulaValidatorTest` komut provenance'inda goruluyor. Derleme 740 main kaynak dosyasini derlerken hedef siniftan bagimsiz `tr.com.innova.yz.*` siniflarinin `tr.com.innova.yz.api`, `tr.com.innova.yz.persistence.entity` ve `tr.com.innova.yz.persistence.repository` paketlerini bulamadi. Maven stdout'ta `COMPILATION ERROR` ve `BUILD FAILURE` var; stderr bos.

Bu eksik upstream/harici build girdisi snapshot POM'unda ilan edilmiyor. G1 sozlesmesi tek Java sinifi ve test-only kapsaminda POM veya production kaynak degisikligine izin vermedigi icin eksik paketi elle ekleyip basari uydurulmadi. Gercek baseline kaniti bu nedenle `BASELINE_FAILED` olarak korundu.

## Kanit dosyalari ve SHA-256

Runtime4 `state.db`, `mcp-wire.ndjson`, baseline Maven loglari, POM ve hedef/test kaynaklari kanit olarak korunuyor.

| Dosya | SHA-256 |
| --- | --- |
| baseline/pom.xml | `5E352C0E95FC8368686DA352F409512EBD9B1C67D038E95570997C18E487F0DE` |
| baseline hedef kaynak | `2AF343B2A5331210C324C445A67D8D2D35DD6BA5E7160C1D8AB3207C6C9E4CE5` |
| baseline hedef test | `8C619041076A44F7DFF40911D314F0364CAB4AB3D5B00157C60B6241191AA220` |
| maven-stdout.log | `A7F0E0BC7ACFD289A6FD043C9B6274F410321B4F24D955D10C8C4F067E8055F0` |
| maven-stderr.log | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` |
| mcp-wire.ndjson | `F8AC9EC2742EE49A2BF51600AE25DCA4EA0E7BA4408AF0CB2293443D2D42F6B8` |
| state.db | `04B6143C12BB9C3BDC7AE6ACFDA8D6121032CFFA48063388DF7C2E78DED7C895` |

## Bu dilimde urun degisiklikleri

- Windows native customer runner, verified process helper manifesti gecerliyse normal native yolu aciyor; helper yoksa fail-closed kaliyor.
- Maven native pin manifestinde snapshotta bulunmayan opsiyonel resolver girdileri sahte `-` hash olarak tasinmiyor.
- Effective Maven parent cozumlemesi, mevcut external parent POM'u okumadan Maven repository fallback'ini destekliyor; frozen root disinda mevcut POM okunmaya devam etmiyor.
- Spring Boot `starter-test` gibi transitif JUnit 5 paketleri framework yok olarak siniflandirilmiyor.
- Hedefe karsilik gelen mevcut `*Test` sinifi baseline, candidate ve final replay boyunca ayni `-Dtest` secicisiyle korunuyor.

Kanit: S06 effective model + baseline odagi 28/28 PASS, native odak suite 35/35 PASS, typecheck PASS, build PASS, lint exit 0 (89 mevcut warning), `git diff --check` PASS.

## Devam noktasi

Customer snapshotta `yz-core`/ilgili POM upstream closure'i gercekten ilan edilmeden ayni G1 job'u resume edilmez. Yeni bir owned snapshot, kaynak/POM butunlugu ve kullanici karari ile yeniden `project_inspect -> test_start` akisi baslatilabilir. Bu blocker cozulmeden model uretimi, candidate patch, accepted checkpoint, Report06 finali veya G1 target success iddiasi yoktur.
