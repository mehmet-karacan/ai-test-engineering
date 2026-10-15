# 2026-10-16 Windows Native 006 - final suite failure checkpoint

## Kosu kimligi ve sonucu

- Onceki gelistirme/kanit dilimi `b7dd353` commit'iyle push edildi: `origin/codex/windows-native-006`.
- Final komut: `$env:AITEST_AC67_MODEL_OUTPUT=%LOCALAPPDATA%\ai-test-engineering\pilot\ac67-real-model-20261015\model-response.txt; npm.cmd test -- --maxWorkers=2`.
- Vitest session: `39304`; baslangic `01:37:48`; sure `868.64s`; exit `1`.
- Sonuc: **120 test dosyasi; 976/978 test PASS; 2 failure**. Bu sonuc WN76/final release PASS degildir.
- Test sonucu su an icin failure checkpoint'idir; test tekrar kosusu ve release verifier sonucu henuz alinmadi.

## Iki failure

1. `tests/integration/wn-job-object.test.ts` / `S02 Job Object ownership` / `parent pipe EOF makes the helper reap its Job and write owner_lost`: owned child PID markeri testin bounded bekleme penceresinde olusmadi (`Missing owned child PID`).
2. `tests/integration/wn-restore-atomicity.test.ts` / `WN restore atomikligi` / `rollback cannot delete a blob newly referenced by a concurrent normal publish`: test 30 saniyelik test timeout'una girdi.

Bu iki failure ayri kok neden olarak incelenecek; preflight icindeki typed BLOCKED loglari bu iki test failure'iyle birlestirilmeyecek. Test kodu gevsetilmeyecek, failure silinmeyecek ve sonucu gormeden PASS ilan edilmeyecek.

## Korunan sinirlar

- Customer checkout'a yazim/apply/commit/push/reset/clean yapilmadi.
- Son public urun commit'i push edilmis durumda; yeni duzeltmeler failure bazinda ayri commit/push ile ilerleyecek.
- Private model cevabi, ham Vitest/Maven loglari ve runtime store repo disinda kalir.

## Devam sirasi

1. Job Object failure'ini testin owned child baslatma/PID marker akisi ve Windows process supervisor ile izole et; bounded, deterministik kok neden duzeltmesini yap.
2. Restore atomicity timeout'unu concurrent publish/rollback transaction ve cleanup fence akisi uzerinden izole et; timeout'u artirarak gizleme.
3. Her duzeltme icin ilgili odak testini calistir, sonucunu kaydet, Turkish ASCII commit ile push et.
4. Iki duzeltme tamamlaninca ayni private AC67 artifact ile final full suite'i yeniden calistir; sonra private manifest yeni revision, full verifier ve WN77-WN80 final review'u guncelle.

## Devam promptu

`AGENTS.md`, `AKTIF_GOREV.md` ve bu checkpoint'i oku. Final suite 120 dosya/978 testte 976 PASS, 2 failure verdi. Once Job Object PID-marker failure'ini, sonra restore/publish concurrency timeout'unu sistematik olarak duzelt; test timeout'unu artirma veya failure'i skip etme. Her duzeltme sonrasi ilgili odak testini calistir, ayri Turkish ASCII commit ve push yap. Iki kok neden kapandiktan sonra final full suite'i ayni private AC67 artifact ile yeniden calistir; manifest/verifier/WN77-WN80 kararini yalniz gercek kanitla guncelle; customer checkout'a yazma.