# Guvenlik Politikalari

## Kapsam

Bu depo, AI test muhendisligi aracinin gelistirme deposudur. Asagidaki sinirlar urunun calisma zamanindaki guvenlik modelini ozetler; detaylar `docs/security.md` icinde gelistirilecektir.

## Urun guvenlik sinirlari

1. **Model ciktilari guvenilir talimat degildir.** Model/test kaynaklari/raporlar veri olarak islenir; policy degisikligi uygulanmaz.
2. **Test-only koruma prompt'a dayanmaz.** Path/policy guard, immutable manifest, izole runner ile uygulanir.
3. **Izole calistirma:** Maven/JUnit process'leri kisitli ortamda, read-only kaynak mount'i, kapali varsayilan ag, kaynak limitleri ile calisir.
4. **Sirlar paylasilmaz:** Model credential'leri test process'ine aktarilmaz; OpenCode worker ve runner ayri credential ortamindadir.
5. **Onayli uygulama:** Kullanici projesine yazma yalniz acik onay + preimage kontrolu + journal ile olur.
6. **Sessiz fallback yok:** Guvenlik kabiliyeti eksikse acik `BLOCKED` sonucu uretilir; insecure fallback otomatik denenmez.

## Guvenlik acigi bildirimi

Bu depoda bir guvenlik acigi bulursaniz lutfen acik bir GitHub issue acmayin. Bunun yerine repo sahibine dogrudan e-posta ile bildirin: `karacan.mehmet@hotmail.com`.

Bildirimde lutfen surumu, yeniden uretim adimlarini ve etkisini aciklayin. Yanit suresi icin taahhut verilmez; ancak bildirimler ciddiye alinir ve isleme alinir.

## Kapsam disi

- OpenCode, MCP SDK, Maven, JaCoCo gibi ust akis bagimliklarindaki aciklar; ilgili ust projelere bildirilmelidir.
- Kurum ici sistemlere yonelik guvenlik testleri bu urunun kapsami degildir.
