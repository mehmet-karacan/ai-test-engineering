# G1 devri - baseline blocker

- Branch: `codex/windows-native-006`
- HEAD: `354845fa6065f6f553f887c560d7f1856bff833f`
- Hedef: `tr.com.innova.gpu.validation.AccumulatorFormulaValidator`
- Onayli coverage: LINE/BRANCH 80%
- Job: `16910a74-677e-4608-88ba-0551f237e146`
- Runtime: `C:\Users\mkaracan\AppData\Local\ai-test-engineering\pilot\g1-accumulator-validator-20261014-221926-runtime4`
- Outcome: `BASELINE_FAILED` (Maven exit 1, 0 test, timeout yok)

## Tamamlananlar

1. Native helper/process ownership gate normal customer runner'a baglandi; native preflight ve execution toolchain kaniti alindi.
2. Effective Maven parent fallback ve Spring Boot starter-test JUnit tespiti duzeltildi.
3. WN54 target-only test secimi baseline/candidate/final replay komutlarina baglandi.
4. S06/baseline 28/28, native 35/35, typecheck/build/lint ve diff-check PASS.
5. Normal MCP sirasi `project_inspect/query -> test_start -> status -> result` kullanildi.

## Kalan blocker

Frozen GPU snapshotin POM'u `tr.com.innova.yz.*` source paketlerini/`yz-core` upstream closure'ini ilan etmiyor. Main compile bu paketlerde duruyor. G1 kapsaminda POM veya production source degisikligi yapilamaz; model/candidate/accepted checkpoint/final Report06 uydurulmayacak.

## Sonraki somut is

Customer sahibi upstream dependency/POM closure'i hazirladiginda yeni owned snapshot olusturup ayni hedef ve coverage ile yeni normal MCP job baslat. Customer checkout'a yazma, G2 apply veya G3 publish yapma. Kanit ve hash listesi `ai/checkpoints/2026-10-14-windows-native-006-g1-pilot-baseline-blocked.md` icinde.
