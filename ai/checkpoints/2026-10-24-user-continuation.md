# Kullanici kesinti/proje baglami kontrolu

- BASE e68286b; izole mevcut d03b worktree, branch codex/user-continuation-20261024.
- Kullanici 14 davranis senaryosunu test etme/duzeltme ve repo degisince ana
  modele bilgi verip yeteneklerini koruma talebini onayladi.
- Baseline: p05b-resume, w05-recovery, wn-agent-recovery 22/22 PASS.
- Yeni 20 registry senaryosu: ilk anlamli kosu 17 FAIL / 3 PASS. Onceki
  fixture setup hatasi (created_at eksik) duzeltildi; urun RED sayilmadi.
- Dar duzeltmeler sonrasi yeni 20 ve onceki user-flow 52: 72/72 PASS;
  typecheck PASS. Henuz tam suite/nihai kabul degil.
- Nedenler: result/cancel/apply project_root'u sessiz siliyordu; CANCELLED
  resume native preflight'a ilerliyordu; pause niyeti abort SONRASI kaydedildigi
  icin gec hata FAILED olabiliyordu; eski cleanup yeni lease sahibini expire
  edebiliyordu. Cleanup hatasina ragmen durdu mesaji yanlisti.
- Cozum: optional acik proje kontrolu, kayitli job_context/required_action,
  terminal resume guard, resume contract alanlarini sessiz yoksaymama,
  pause niyetini once yayinlama ve sadece yakalanmis owner+fence'i birakma.
- Ruling: CWD'ye gore otomatik repo kilidi yok. Kullanici isterse eski projeyi
  acik root/job ile yonetebilir; uyusmazlikta iki root ve sonraki adim sunulur.
  Ana modelin arac izinleri degismez; sinirli generation worker ayri kalir.
- Devam: gec checkpoint kabulunu, gercek stdio restart ve frozen checkpoint
  resume/butceyi test et; OpenCode skill/tool aciklamalarini duzelt; bagimsiz
  review ve tam Windows suite ile sonuclari kaydet.
- Ozel loglar TEMP/user-continuation-*.log; customer/runtime kaynak repoya yok.

## Bagimsiz review ve sinir testleri

- Ilk genis focused 8 dosya / 138 PASS; stdio child kill/reconnect gercek,
  native resume testinde owned helper + sentetik -v script gercek, dispatch
  son siniri stub. Gercek JVM/model generation e2e olarak sunulmaz.
- Bagimsiz reviewer 3 P1 buldu: pending cleanup'ta fence'in expire edilmesi,
  eski dispatch catch'inin successor'u durdurup FAILED yapmasi, resume native
  probe sirasindaki yeni pause'un kaybolmasi. Yeni sinir testleri 5 FAIL ile
  dogruladi. Bir sonraki ayni-owner/yeni-token testi de finally release
  sorununu kirmizi gosterdi. Kapsam disi iddia edilmedi.
- Fixler: pending lease tutulur; expired terminal receipt sadece proven empty
  tree ve birebir owner/token/process/attempt ile temizlenir (yeni execution
  yetkisi yok). Stop preflight resume CAS'ini row_version ile bozar. Eski
  dispatch fence kontrolunden once yeni ise event/state yazamaz; yalniz kendi
  runner/server nesnelerini durdurur, yeni global kaydi silemez. Finally de
  owner+token ve unresolved-native kaydini atomik kontrol eder.
- Ruling: modele yonlendirmeyi dogrulamak icin user-approved davranis testleri
  kapsaminda iki salt okunur sentetik OpenCode oturumu eklendi. GLM-5.3-Flash-IT
  gercek MCP'ye gitti; yeni repoda eski job uyusmazligini acikladi, acik eski
  repo seciminde status/result sorguladi. Job/event/job-count ayni, generation
  cagrisi 0. Genel skill/execute yetenekleri korundu; kullanici OpenCode config'i
  degismedi, izole XDG config ve sentetik DB kullanildi.
- Model ham kayitlari ve kanit pilot/user-continuation-20261024 altinda ozel;
  public kayda yalniz model adi, sonuc ve hash girer. Son review/full suite bekler.

## Son dogrulama

- Reviewer son kontrol: engelleyici yok; registry 27/27 PASS. Failure catch
  fence/event/state tek immediate transaction; ikinci gercek SQLite connection
  devralma denemesi SQLITE_BUSY ile durur. Cancel import sonrasi captured
  owner/token kontrolu ile successor'u durdurmaz. Ayni owner/yeni token da korunur.
- Ilk full: 1187 PASS / 1 FAIL / 1 SKIP. fin12 GC fixture'i completed job'a
  yeni checkpoint yayinliyordu. RUNNING publish -> COMPLETED -> lease release
  sirasi ve toplanabilir kontrol ile duzeltildi; focused GC22+registry27=49 PASS.
  Bir artifact_id assertion typo'su duzeltilmeden baslayan tekrar erken iptal
  edildi; logu saklandi. Production source degismedi.
- Son full: 138 dosya / 1188 test PASS, 1 dosya / 1 test SKIP, exit0.
  Typecheck/build PASS; lint0error/89eskiwarning. Kanit hashleri acceptance
  JSON'da. Gercek model routing iki oturumla sinirli; UI/JVM kill iddiasi yok.
- Devam: identity/ASCII/privacy/staged-diff kontrolu, commit; main fast-forward,
  build ve kurulu MCP smoke. Kurulu skill ancak eski hash eslesirse yedeklenip
  guncellenir; kullanici opencode.json ve ana model izinleri korunur.

## Kurulu main teslim kontrolu

- Uygulama commit 951a8d6947d5f81ccefed42cdb4d50f074aa590a main'e
  fast-forward edildi. Main build/local release gate PASS, 5 dosya / 83 test
  PASS. Source degisikligi yok; tam Windows1188PASS/1SKIP kaniti gecerlidir.
- Kurulu MCP gercek eski GPU raporunu status/result ile salt okunur sorguladi:
  9 arac, result/cancel/apply project_root semalari ve job_context mevcut.
  COMPLETED/TARGET_REACHED, 670 test =659PASS/11SKIP; manifest hash ayni.
  Yeni GPU Maven/model/apply yok.
- Kurulu OpenCode skill once eski SHA ile kontrol edilip ozel alanda yedeklendi,
  sonra main ile byte-esit guncellendi. opencode.json hash ayni; ana model
  arac izinleri degismedi. Kanit hashleri acceptance JSON'da.
- Son islem: teslim kaydi commit'i, main build stamp yenileme, son MCP smoke
  ve origin/main push; uzak HEAD eslesmesi terminal kanitiyla dogrulanir.
