# Kullanici kesinti/proje baglami devir kaydi

## 2026-10-24 Kullanici kesinti ve repo baglami

Kullanici kesinti/devam ve repo degisimi davranislarinin test edilmesini istedi.
38 yeni regresyon senaryosu eklendi. Son Windows matrisi 1188 PASS / 1 SKIP;
138 dosya PASS / 1 dosya SKIP. Typecheck/build ve local release gate PASS;
lint 0 hata / 89 mevcut uyari. Bagimsiz review engelleyicisiz.

MCP artik kayitli proje/hedef/checkpoint, tuketilmis deneme, lease/cleanup
bilgisi ve duruma uygun sonraki eylemi sunar. Acik eski repo secimi farkli
CWD'den kullanilabilir; yanlis job/root birlesimi reddedilir. Iptal edilen is
diriltilemez; yeni pause resume preflight CAS'ini bozar; gec dispatch/kabul
yeni owner'i etkileyemez. Pending cleanup kalici ve tekrar denenebilirdir.

Ana OpenCode modelinin genel arac izinleri degismedi. Iki gercek GLM-5.3-Flash-IT
sohbeti sentetik repolarda MCP status/result/query ile yonlendirmeyi dogruladi;
yeni generation 0, job/event/count ayni. Aktif JVM/provider kesintisi veya
manuel UI Stop e2e iddiasi yok. Gercek MCP hard-kill/reconnect ve native
helper fixture resume kaniti vardir; customer generation/Maven/apply yok.
Kabul: ai/acceptance/user-continuation.json. CI kapali, G3 yayin yok.

Degisen odak: src/application/job-context.ts, job-tools/services, typed MCP
semalari/aciklamalari, dispatcher/checkpoint/native terminal cleanup ve
OpenCode skill. Yeni38test + mevcut GC fixture duzeltmesi. Runtime log/model/
provider bilgileri public'e alinmadi. Son main build/smoke, kurulu skill ve
remote HEAD eslesmesi teslim adiminda kontrol edilir.

Kurulu main kontrolu tamam: 951a8d6 uygulama commit'i, build/local gate PASS,
83 focused test PASS. Eski GPU raporunun manifest ve test sayilari ayni.
OpenCode skill yedekli guncel, ana config/model izinleri ayni. Son teslim
kaydi sonrasi build stamp ve uzak HEAD eslesmesi dogrulanir.
