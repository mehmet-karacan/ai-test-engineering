# Checkpoint - 006 S01 Windows named pipe lock tasarim incelemesi

- Tarih: 2026-10-12 (Europe/Istanbul). Dal: `codex/windows-native-006-s01`.
- Kapsam: `wx` restore/maintenance lock dosyalarinin hard-kill sonrasi stale kalmasina karsi Node built-in Windows named pipe sahipligi. Urun kodu, GPU checkout ve runtime verisi degistirilmedi.

## Dogrulanan teknik temel

- Resmi Node `net` dokumani Windows named pipe'in son referans kapandiginda kalktigini ve owning process cikinca OS tarafindan kaldirildigini, `listen` cakismasinin `EADDRINUSE` verdigini belirtiyor: https://nodejs.org/docs/latest-v24.x/api/net.html#identifying-paths-for-ipc-connections ve https://nodejs.org/docs/latest-v24.x/api/net.html#serverlisten . Koordinatorun bu makinedeki ayri probe'u ilk bind basarili, ikinci bind `EADDRINUSE`, ilk sahip Ctrl-C sonrasi tekrar bind basarili sonucunu verdi.
- Kurulu `node --version`: `v24.14.1`. `net.BoundSocket` ve `net.createBoundSocket` burada `undefined`. Resmi Node dokumaninda `BoundSocket` ile pipe path'ini senkron rezerve etme destegi v24.20.0'da eklenmis: https://nodejs.org/docs/latest-v24.x/api/net.html#class-netboundsocket . `package.json` engine `>=24.0.0`, installer Node 24+ ister; mevcut urun bu yeni API'yi asgari surum olarak kabul edemez.
- Mevcut `net.Server.listen(path)` asenkrondur; `listening` olayi gelmeden ana thread `Atomics.wait` ile bloklanirsa bind sonucu ana event loop'ta islenemez. Worker thread `listen` yapip `SharedArrayBuffer` uzerinden sonucu senkron bildirebilir, ancak worker beklenmedik bicimde olurse pipe serbest kalirken ana thread senkron restore'a devam edebilir. Ana thread'in worker `exit/error` olaylari bloklu oldugu surece calismaz. Resmi worker dokumani `net.Server` transferini sadece TCP icin listeler; named pipe handle'i ana thread'e devredilemez: https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#portpostmessagevalue-transferlist . Bu nedenle worker-backed sync lock veri koruma icin tek basina yeterli degil.

## Guvenli aday ve uyumluluk maliyeti

- Ana event loop'ta `await listen({ path, exclusive: true, readableAll: false, writableAll: false })`; yalniz `listening` sonrasinda restore'un senkron mutasyon bolumune gir; `finally` icinde acik baglantilari kapatip `await server.close` tamamlanmadan basarili sonuc dondurme. Pipe adi, normalize edilmis ve gercek yol kimligi kontrol edilmis DB/artifact root ile kurulum/kullanici sinirini hash'lemeli. `EADDRINUSE`, permission ve timeout fail-closed typed sonuc olmali. Kritik bolumde worker owner bulunmaz; owning process hard-kill ile pipe kalkar.
- Bu aday mevcut `restoreBackup(): RestoreResult` API'sini `Promise<RestoreResult>` yapar. S01 gorev girdisi mevcut BackupResult/RestoreResult API'sini korumayi bekler; mevcut testlerin cagrilari ve tum yeni entegrasyonlar `await` uyumuna tasinmalidir. Ayrica `ArtifactStore.publish`, `deleteOrphan`, `gcSweep` senkron maintenance lock kullanir. Yalniz DB lock'u pipe'a tasimak, crash sonrasi artifact root'ta stale `wx` dosyasini birakir ve normal yazma/GC'yi bloklar. Tum maintenance sahipligi icin tek protokol ve API gecis plani gerekir; iki farkli lock sistemi bir arada kalirsa race tekrar dogar.
- Named pipe sadece owner yasamini cozer; journal'in planlanan/gercek yayinlanan blob ayrimi, eski DB baslangic varligi, immutable yeni snapshot kaniti ve yari tasinmis DB/WAL/SHM durumlari hala aciktir. Bunlar olmadan otomatik recovery GO degildir.

## Uygulama oncesi native fixture plani

1. Iki ayri Node process ayni kanonik DB/artifact kimligine pipe bind denesin: ilk owner varken ikincisi fail-closed `EADDRINUSE`; farkli lexical alias/junction veya farkli artifact root ayni DB'yi bolmesin.
2. Owner'i gercek Windows process hard-kill ile bitir; yeni process ayni pipe'i alabilsin. Worker-thread owner kasitli oldurulup ana restore thread'i yasarken ikinci process pipe'i alabiliyor mu ayrica goster; worker tasarimi kabul edilmemeli.
3. `listen` hatasi, `close` gecikmesi, bagli client, timeout, process kill, stdout/stderr ve Node 24.14.1 capability testleri. Pipe owner hatasinda tek bir byte DB/blob mutasyonu olmamali.
4. Journal'in her kritik fazinda hard-kill sonrasi yalniz eski veya butun zinciri dogrulanmis yeni generation acilmali; ownership belirsizse veri korunarak `RESTORE_RECOVERY_REQUIRED` devam etmeli.

Karar: su an kod degisikligi yok. Worker-backed senkron lock guvenli replacement olarak kabul edilmedi; asenkron ana-thread protokolu veya asgari Node surumu/artifact API uyumlulugu planlanmadan WN11 ve S01 NO_GO.
