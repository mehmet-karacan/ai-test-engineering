# CLI backend config/domain parcasi

BASE ceb1285ebe1a606ad3e9c8d3955c90b5dd114f49.
Branch codex/cli-config-20261024, izole native worktree cli-config.
Root plan SHA256 58f8c3a796f4a3f4e70b23621d10050c5082df3f92ca10d966cb498f81438cc3;
arayuz brief SHA256 48e5ccec54c8866917d9dd905905c61ce2a3d73ea19bf14fbef66bcb31913d11.

- WorkerBackendSchema/WorkerBackend ve WorkerBindingSchema/WorkerBinding eklendi.
  Backend alanlari strict; raw secret veya ek shellargs alani kabul edilmez.
  Windows executable tam drive/UNC mutlak native exe ve regular dosya olmali.
  Generic CLI ilk executable'i ve mevcut mutlak regular argfile'lari SHA256 ile
  binding'e alinir. Hash oncesi/sonrasi handle metadata degisimi reddedilir.
- resolveWorkerBinding senkrondur. Explicit profil tam binding, CLI default
  tam binding, legacy OpenCode default undefined verir. Model provider/model
  birebir kalir; profil adi model sanilmaz. Duplicate isim/model ambiguity,
  profil/model celiskisi, eksik executable ve CLI default model celiskisi ret.
  Legacy/OpenCode default'ta eslesmeyen model eski OpenCode yolunda kalir;
  root ile secim semantigi dogrulandi. Model/binding persist ve resume root'tadir.
- WorkerProfile optional backend; TestStart/TestResume optional worker_profile;
  JobContractInput optional worker_binding eklendi. Binding contract kurulurken
  kopyalanir ve immutable kontrolune dahildir. Backend/hash degisimi conflict.
- Secret-free snapshot yalniz explicit backend'i include eder. Legacy config
  snapshot digest'i ve alansiz legacy contract JSON/digest davranisi korunur.

Kanit: ilk RED 11 testte 10 failure/1 pass (5 davranis farki ve 5 eksik yeni
module); ikinci RED duplicate secilen isim ve gizli model whitespace icin
2 failure/14 pass. Son GREEN 6 dosya/71 test PASS (16 yeni test), typecheck
PASS, lint 0 error/89 mevcut warning. Odak: cli-backend-config, domain,
fin01-contract, p05-target-resolver, p08-readiness, opencode-config-format.

Raw test/lint loglari TEMP'te; kaynak/model/session/credential verisi yok.
Son odak test log SHA256 6df614e0e88856699a4719ea86120eec3782fc4aa3b3009a2989f1abf9ec6abc.
Full suite, build, model/Maven/customer kosusu bu parcada yapilmadi; root
integration dogrulamasi ve bagimsiz reviewer sonraki devam noktasi.
Application/services/dispatcher/scripts degismedi. CI kapali, push/yayin yok.

## Integration followup

Root incelemesinin istedigi uyum ve frozen binding kenarlari RED->GREEN:

- Explicit worker_profile yok ve tum profiller legacy/OpenCode ise selector
  model/default/duplicate denetimi uygulamadan undefined doner. Eski path'in
  kendi model dogrulamasi korunur; stale veya duplicate legacy default yeni
  secici nedeniyle hata vermez. CLI-enabled config veya explicit profilde
  yeni ambiguity/mismatch kurallari surer.
- CLI binding normal dosya executable'inin normalized mutlak yoluna ait bir
  SHA256 pin kaydi gerektirir. Kayitsiz CLI, baska executable pin'i, duplicate
  normalized path ve bozuk hash reddedilir. Windows case ve slash/dot aliases
  ayni yola normalize edilir; pin'siz OpenCode binding gecerli kalir.
- Binding'e yalniz nonempty secret_reference_names eklenir ve kopyalanir.
  Referans degisimi immutable contract conflict olur. CLI config/binding'de
  normal env adi kurali uygulanir; legacy OpenCode env:KEY bicimi degismez.

Ilk followup RED'de legacy stale/duplicate ve eksik/duplicate CLI pinleri
gercekten basarisizdi; duzeltme sonrasi 22/22 PASS. Env referansi RED'de
8 failure/22 pass, son GREEN 30/30 yeni config dosyasi; 6 dosya/85 test PASS.
Bos CLI command binding'i TypeError yerine schema failure verir; bu kenar
once 1 failure/29 pass ile goruldu, duzeltme sonrasi tekrar GREEN.
Son log SHA256 b8211ff202fc300fe6f17e6f0b8723d9234804cad651918af7debd8227f239f3.
Typecheck PASS; lint 0 error/89 mevcut warning. Full suite/build/model/Maven
yine root kapsaminda; application/services/dispatcher/scripts degismedi.

Gelistirme bagimlilik kaynak worktree'si bosaldigi icin ilk test baslatma
vitest-not-found verdi. Mevcut junction'i silme otomatik approval tarafindan
engellendi, silme yapilmadi. Eski junction node_modules-d03b-junction olarak
korundu; yeni local node_modules main'in mevcut bagimliliklarina baglandi.
Global config/kurulum veya paket degisikligi yok. Korunan junction untracked
ve commit disidir; root bagimliliklari ayrica tekrar doldurdugunu dogruladi.
