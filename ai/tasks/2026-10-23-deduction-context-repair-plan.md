# Deduction context repair implementation plan

Goal: modelin test fixture/onarim baglamini ve coverage yonlendirmesini genel MCP motorunda duzelt; GPU testlerini yalniz OpenCode yazsin.

- [ ] Sentetik regresyonlarla rejected candidate kodunun repair'a tasinmadigini, dependency davranisinin ve trusted method gap bilgilerinin eksikligini goster.
- [ ] dependency-context: baseline hash esitligi sonrasi kucuk dogrudan bagimlilik kaynaklarini bounded/redacted davranis baglami olarak ekle; enum/DTO onceligi ve exact line scope koru.
- [ ] candidate-loop: onceki adayin kodunu repair feedback'e bounded aktar; dispatcher son trusted coverage raporundan method gap ve accepted test senaryo isimlerini tasir. Istem: calisan fixture'i koru, getter/enum/null-save sonucunu gercek sozlesmeye gore hazirla, coverage aciklarini hedefle.
- [ ] Surefire diagnostic XML entity'lerini safe decode edip net stack/message ver; sinirlar/redaksiyon ayni.
- [ ] Odak test/typecheck/build/lint ve bagimsiz review; gercek GPU root'tan sifir eski/manual test ile yeni80LINE/BRANCH MCP kosusu. Model, ayar, butce degismez; customer apply yok.
- [ ] Raw XML/Surefire/model artifact hash ve asil source/build kimligi dogrula; acceptance/checkpoint/handoff, ASCII/privacy/staged kontrollerinden sonra commit/push.
