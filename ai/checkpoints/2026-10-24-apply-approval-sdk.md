# Apply onayi MCP SDK siniri

- Plan: ai/tasks/2026-10-24-approved-apply-plan.md, SHA256
  08971BEB23BD3C2D2EE3B41059AA72638F3EF54A4967C8122A5517712B4E5FF4.
- BASE: aced11e; izole dal: codex/apply-approval-20261024.
- Kapsam: Task2 giris semasi, request-scoped MCP insan onayi ve SDK testleri.
  Application govdesi degismedi; yalniz ucuncu ApplyCallContext parametresi
  eklendi. Koordinator entegrasyonu ve bagimsiz son inceleme root'a aittir.
- test_apply job_id ile default preview; apply/recover modlari ve eski
  root/checkpoint/digest/reference ipuclari optional. SHA256 hex zorunlu.
  Modelden approved/approval_text gibi ekstra alanlar reddedilir.
- Form yetenegi getClientCapabilities().elicitation.form ile dogrulanir.
  Callback yalniz test_apply cagrisina, JSON-RPC requestId'ye ve server/client
  oturumuna baglidir. Server-global callback veya approve araci yoktur.
- Form proje, job, checkpoint, patch/source/build hash'leri ve yeni test
  yollarini/byte/hash'lerini gosterir; FULL_PROJECT_SNAPSHOT ile ayri kaynak
  kopyasinda tum testlerin calisacagini aciklar. approved boolean default
  false; yalniz action=accept ve approved=true onaydir.
- Sure 120 saniye ile sinirli; progress uzatmaz. Tool request ve coordinator
  signal'leri birlestirilir; iptal, timeout, gec yanit ve hatalar onay vermez.
  Bir istek bir form acabilir; bitmis istegin callback'i kullanilamaz.
- Ruling: Kurulu SDK1.32.1 legacy elicitation:{} yetenegini form:{} olarak
  normalize ediyor. getClientCapabilities() sonucu kullanildi; bu resmi SDK
  uyumudur. URL-only ve elicitation olmayan client callback alamaz. Yanlis
  olmasinin maliyeti legacy client davranisidir; protokol testi kayitlidir.
- RED: Ilk 20 senaryoda eksik sema/callback nedeniyle 13 FAIL / 7 PASS.
- GREEN: 27 yeni test + mevcut user-flow-robustness: 2 dosya / 79 PASS.
  Gercek in-memory SDK: accept/decline/cancel/unsupported/legacy/timeout,
  request cancellation/late acceptance, iki client ve requestId baglantisi,
  model onay spoof girisleri. Gercek stdio child process: accept ve decline.
- typecheck PASS; build ve uc native helper verifier PASS; lint --quiet PASS
  (0 error).
- Bare npm test, ozel AC67/browser girdileri olmadan varsayilan paralellikle
  baslatildi. Koordinator karariyla sahip shell+child process agaci durduruldu;
  tam paket PASS veya kabul iddiasi yok. Gorulen iki pilot.test.ts hatasi
  AITEST_AC67_MODEL_OUTPUT bulunmamasindandir. Private log SHA256:
  A446FE9F900F515B5BAB599AC24518C8C54E067410ABF96E265128F56C9A47A1.
- Salt okunur kurulu CLI surum kontrolu: opencode v2.1.4.
- Gercek OpenCode insan UI onayi kaniti degildir. Customer checkout/model/
  Maven kosusu, config/account degisikligi, yayin/CI acma veya push yoktur.
- Devam: root koordinator bu requestApplyApproval callback'ini tuketir;
  callback yoksa APPROVAL_REQUIRED doner. Entegre tam Windows suite ve
  bagimsiz son inceleme root tarafindan tekrar dogrulanacak.
