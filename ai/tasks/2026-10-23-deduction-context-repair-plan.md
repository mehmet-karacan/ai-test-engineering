# Deduction context repair implementation plan

Goal: modelin test fixture/onarim baglamini ve coverage yonlendirmesini genel MCP motorunda duzelt; GPU testlerini yalniz OpenCode yazsin.

- [x] Sentetik regresyonlarla rejected candidate kodunun repair'a tasinmadigini, dependency davranisinin ve trusted method gap bilgilerinin eksikligini goster.
- [x] dependency-context: baseline hash esitligi sonrasi kucuk dogrudan bagimlilik kaynaklarini bounded/redacted davranis baglami olarak ekle; enum/DTO onceligi ve exact line scope koru.
- [x] candidate-loop: onceki adayin kodunu repair feedback'e bounded aktar; dispatcher son trusted coverage raporundan method gap ve accepted test senaryo isimlerini tasir. Istem: calisan fixture'i koru, getter/enum/null-save sonucunu gercek sozlesmeye gore hazirla, coverage aciklarini hedefle.
- [x] Surefire diagnostic XML entity'lerini safe decode edip net stack/message ver; sinirlar/redaksiyon ayni.
- [x] Odak test/typecheck/build/lint ve bagimsiz review; gercek GPU root'tan sifir eski/manual test ile yeni80LINE/BRANCH MCP kosusu. Model ayni; dogrulama butcesi asagidaki kanita dayali profil ile genisletildi; customer apply yok.
- [x] Raw XML/Surefire/model artifact hash ve asil source/build kimligi dogrula; acceptance/checkpoint/handoff, ASCII/privacy/staged kontrollerinden sonra commit/push.

## Kanita dayali dogrulama uyarlamasi

Uc karsilastirmali temiz kosuda ilk20physicalcall siniri korundu. V2 %99.63/%76.92, v3 sonaday %99.63/%78.84; ilerleme surerken budget doldu. Hedefi tamamlamak icin kullaniciya aciklanarak v4/v5 yalniz private validation config'inde max_candidate_iterations32 yapilir; global/default config20 kalir. Model/low,120dakika,2repair/noProgress3,80LINE80BRANCH ve kalite kapilari ayni. V4/V5 yine gercek originalroot'tan sifir onceki/manualtestaktarimi ile baslar. Bu ayar farki nihai kabulde saklanmaz;20call kosulari80PASS sayilmaz.

- V5'te baglam korunurken model ardisik EntityManager importu ve checkedthrows eksigi uretti;2repair/3noprogress limiti soncompilehatasi onarilamadan durdu. V6 yalniz private validationprofilinde32physicalcall/4repair/noProgress6;120min/GLMlow/80LINE80BRANCH/kalitekapilari ayni. Default20/2/3 degismez. Bu bir retrybutcesi uyarlamasidir; defaultkosuherzaman80garantisi verilmez.
