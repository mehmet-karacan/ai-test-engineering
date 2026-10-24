# Onayli test uygulama - koordinasyon checkpoint

Plan: ai/tasks/2026-10-24-approved-apply-plan.md.
Kullanici somut onay sonrasi test uygulama/tum test dogrulamasini istedi.
OpenCode-only; customer checkout bu gelistirme turunda degistirilmedi.

MCP insan formu disindaki approval_reference/metin yetki degildir. Somut
checkpoint/patch/source/build/native profil/butce/envanter onaya sabitlenir.
Onay sonrasi yeniden kontrol, kalici operation+lease/fence, native create-only
publisher, verified owned tam proje Maven/JaCoCo kosusu eklendi. Mevcut dosya
overwrite yok. Basarisizlik/iptal yalniz sahipli degismemis yeni dosyalari
geri alir; belirsiz sahiplik/kullanici degisikligi RECOVERY_REQUIRED olur.
Crash sonrasi recover eski journal'i geri alir, yeniden Maven/apply baslatmaz.
Generation sonucu ayri kalir; status/result/HTML/print uygulamayi ayri sunar.

Bagimsiz review: ilk baseline envanterinin final hedef envanterine eklenmesi,
module-qualified ve tekrarli invocation kimligi, atomik APPLIED kanit
dogrulamasi eksikleri kapatildi. Negatif baseline regresyonu once 2FAIL/1PASS,
duzeltme sonrasi workflow25PASS. En son build/helper provenance PASS;
workflow25+repository7+getter27 = 3dosya/59test PASS. Onceki SDK27 ve rapor
testleri scoped kosularda PASS; guncel tam suite henuz kosulmadi.
Lint0error/89mevcutwarning. Runtime loglari TEMP'te, public degil.

Devam: publisher initialization junction review fix, bagimsiz son review,
gercek sentetik model+Maven canary, tam Windows suite, kabul/handoff,
primary runtime yedegi, main FF/build/installed verify ve commit/push.
Actual OpenCode UI insan tiklamasi bu checkpoint'te kanitlanmadi; SDK form
roundtrip testleri vardir. %99.99 veya her projede hedef garantisi yok.
