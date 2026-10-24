# Native create-only test publisher

- Gorev: AITE-MCP-GPU-009, onayli apply plani Task1. Taban aced11e.
- Plan SHA256: 08971BEB23BD3C2D2EE3B41059AA72638F3EF54A4967C8122A5517712B4E5FF4.
- Izole managed worktree: apply-publisher; branch codex/apply-publisher-20261024.
- Sahiplik: yalniz workspace-test-publisher.ts, odak native testi ve bu checkpoint.

## Davranis

WorkspaceTestPublisher({workspace,storeRoot,operationId,allowedTestRoots})
API'si prepare(files), publish(), rollback(), verify() saglar. prepare icin
dosya sekli {path,sha256,content:Buffer}; publish tum owned hedef yollarini,
rollback {removed_paths,conflicts:[{path,reason}]} dondurur.

Yeni .java testleri canonical/allowlist/Windows name kurallari ve SHA256 ile
dogrulanir. Case collision, traversal, ADS, junction, normal dosya parent'i
ve planlanan dosyanin baska dosyaya parent olmasi reddedilir. Tam dosya
paketinin hedefleri ve kaynak digest'leri ilk publish'ten once kontrol edilir.

Runtime store proje disinda ve ayni volume'da olmalidir. Immutable plan,
workspace/store/operation-directory FileId'lerini ve exact dosya paketini
baglar. Plan/source dosyalari exclusive create + fsync; journal append +
fsync kullanir. Kaynaklar runtime store'da kalir, repoya yazilmaz.

Mevcut native copy-owned yeni sibling stage olusturur. Donen FileId+SHA
receipt'i journal'a fsync edilmeden native NO_REPLACE rename cagrilmaz.
Native no-follow helper tum workspace yazma/silme islemlerinde root/FileId/
boyut/SHA ve single-link kosullarini dogrular. Native C++ degismedi.

Ayni constructor+prepare exact plana ait journal'i yukler. Native rename
sonrasi ama published journal oncesi hardkill'de FileId receipt'inden sahiplik
dogrulanir. Unknown byte-identical mevcut dosya receipt olmadan owned
sayilmaz. Rollback yalniz kendi degismemis dosyalarini siler; kullanici
duzenlemesi, FileId replacement veya belirsiz stage conflict olarak korunur.
Rollback sonrasi ayni operation id ile yeni publish reddedilir.

## Kanit

- RED: eksik publisher davranislari 4 FAIL; ardindan ilk15 GREEN.
- Ayri RED->GREEN: normal dosya parent, planlanan file-as-parent, store-root
  replacement, ikinci kaynak digest'i bozuldugunda ilk hedefe yazmama.
- Son odak: node node_modules/vitest/vitest.mjs run
  tests/integration/workspace-test-publisher.test.ts: 25/25 PASS, exit0.
- node node_modules/typescript/bin/tsc --noEmit: PASS, exit0.
- Iki owned dosyada dogrudan eslint: 0 error / 0 warning, exit0.
- Gercek child SIGKILL: native stage kopyasi sonrasi receipt oncesi ve native
  rename sonrasi published journal oncesi. Windows SIGKILL sonucunu status1 /
  signal=null olarak verir; fixture marker+bos stderr+filesystem kaniti var.
- Gercek late collision: ilk native publish sonrasi ikinci hedefe dis dosya
  eklenir; ilk owned test ve ikinci owned stage geri alinir, dis dosya kalir.
- Idempotent publish/reload/rollback, user edit, byte-identical yeni FileId,
  source tamper ve incomplete journal senaryolari PASS.

Ilk genis odak tekrarinda paylasilan host yukunde bir 30s timeout goruldu
(18 PASS/1 timeout). Native ancestor kontrolu tekrarlari kaldirildi ve mevcut
native test lock kaydedildi. Son tam odak25PASS; timeout gizlenmedi.

## Sinirlar ve devam

- copy-owned donmeden once process hardkill olursa stage icin durable
  receipt olusmamis olabilir. Bu dosya silinmez; conflict/recovery gerekir.
- Yeni bos parent dizinler korunur. Directory delete/ownership primitifi
  olmadan recursive cleanup yapilmaz; preexisting dizinler silinmez.
- Truncated/bozuk journal veya root identity mismatch exception ile fail
  closed olur; operator recovery gerekir, basari uydurulmaz.
- Node journal dosyalari private runtime store trust boundary'sindadir;
  native no-follow sahiplik kapisi workspace dosyalarina uygulanir.
- Ayni operation'in paralel cagrilarini coordinator lease/fence serialize
  etmelidir. Publisher yeni checkout testlerini birlestiren mutex degildir.
- Tam Windows suite, coordinator integration ve bagimsiz final review ana
  koordinatorde kalir. Bu alt gorev kendi nihai reviewer'i degildir.
- Musteri/model/Maven kosusu, CI, yayin veya push yapilmadi. node_modules
  yalniz mevcut intact main dizinine junction; install/npm ci kullanilmadi.

## Bagimsiz review P2 containment duzeltmesi

Bagimsiz inceleme, relative.startsWith('..') kontrolunun '..runtime' adli
normal alt dizini yanlislikla disarida saydigini buldu. Native regression
RED: workspace/..runtime altina private kaynak yazildi; ayrica storeRoot
disarida olsa da hesaplanan operationRoot workspace icine dusebildi.

Kontrol artik exact '..', '..'+platform separator veya absolute relative
sonucuyla gercek parent/cross-drive cikisini ayirir. Hem storeRoot hem
operationRoot constructor'da, herhangi bir yazmadan once reddedilir.
Uc regresyon (normal child, '..runtime' child, ancestor-store operation
overlap): RED2/3 -> GREEN3/3. Son tum odak28/28PASS (23.86s), tsc --noEmit
PASS, scoped eslint0error0warningPASS. Staged diff/ASCII/gizlilik ve local
Git kimligi yeniden kontrol edildi. Tam suite/nihai review koordinatorde.

## Bagimsiz review P2 native journal sahipligi

Inceleme Node openSync('a') append'in degistirilmis hardlink leaf'i takip
ederek dis dosyaya yazabildigini buldu. Regresyon RED: mevcut bos journal
yerine disaridaki tek newline byte'i olan dosyanin hardlink'i veya normal
replacement kondugunda publish basarili oldu. File symlink denemesi EPERM
verdi; host policy/privilege degistirilmedi ve SKIP eklenmedi. Reparse
regresyonu gercek junction leaf ile native append sinirinda dogrulandi.

Native create-empty-owned artik journal'i exclusive olusturur, flush eder
ve ayni held handle'in FileId+SHA receipt'ini dondurur. Publisher immutable
plan v2 bu ilk journal kimligini kaydeder. Ilk dosya olusturma ile FileId
yakalama arasinda Node/native path adoption boslugu kalmaz. Onceki v1
publisher planlari otomatik guvenilir sayilmaz; fail closed recovery gerekir.

Native append-owned, op-root FileId'sini ve tum path komponentlerini
no-follow acar. Journal single-link, beklenen ilk FileId, onceki byte boyutu
ve SHA ile eslesmelidir. Held handle write/delete paylasmaz; JSON satirini
stdin'den aldiktan sonra snapshot'i tekrar kontrol eder, ayni handle'a
append + FlushFileBuffers yapar ve yeni FileId/size/SHA receipt'i dondurur.
Publisher Node append'i tamamen kaldirir. Reload, okunan bytes+SHA'yi ilk
journal FileId'siyle native dogrulamadan journal kayitlarini isleme almaz.

beforeMutation?:()=>void callback'i her publisher mutation sinirinda
cagrilir; callback planda serialize edilmez. Coordinator bu hook'a yalniz
lease fence kontrolu/yenileme vermelidir. Cancel kontrolu bu hook'ta olmaz;
rollback ayni fence ile cleanup yapabilir. Fence kaybi ilk native copy'den
once durdurulur; sonraki yetkili rollback regresyonu vardir.

Native Windows karakterizasyonu: held handle journal rename'i engeller,
ama yeni hardlink olusumunu engellemez. READY sonrasi eklenen hardlink
ikinci single-link snapshot'inda append yapilmadan reddedilir; journal ve
alias bos kalir. FileId leaf substitution guvencesi bu farki gizlemez;
ayni owned dosyaya snapshot/write arasinda yeni alias eklenmesini OS
sandbox garantisi olarak sunmaz. Node/native host hesabi sandbox degildir.

Production ve AITEST_FAULT_FIXTURE C++ binary'leri mevcut /W4 /WX build
komutuyla yeniden derlendi; iki provenance manifesti guncellendi. Mevcut
native komut/protokoller degismedi. Source SHA a6bfeb0b5898addb0f4a288d96f5144ea23f6d07bcecd21d0d78ab1773a91099;
production binary SHA 07fd3d36856f91659ceeab8a66107a3b3a6926528c66b46c256fb6ff5e4d1adf;
fault binary SHA d62a0e17ebef5e2514da720975359f07fc5f6616a40e3d2298eff5ca2a26f6a6.

Ilk held-READY testinde CRLF yanlis eslesmesi 30s timeout verdi; fixture
duzeltildi. Sonraki yeni-hardlink olusmasini engellenmis sayan test varsayimi
RED oldu; yukaridaki gercek Windows davranisiyla duzeltildi. Bu test
kosulari ve ara kaynak degisimi anindaki provenance mismatch son kanit
yerine kullanilmadi. Tam suite kullanici/root kapsami nedeniyle kosulmadi.

Son verification: ayni kaynakta 5 dosya/71 test PASS, exit0 (37 publisher,
34 mevcut native bridge/restore; 48.77s). Typecheck PASS, scoped lint
0error/0warning PASS, production helper verifier PASS ve fault fixture
provenance PASS. Native source/binary/manifest ve yalniz izinli test/build
artifact'leri staged kontrolunden gecti; local Git kimligi, ASCII ve secret
taramasi tekrarlandi. Publish/push veya customer/model/Maven kosusu yok.

## 2026-10-25 Bagimsiz review P2 initialization root swap

Inceleme, journal olusturulduktan sonra operation root'un junction ile
degistirilmesinin Node plan/source create'i yabanci dizine yonlendirdigini
buldu. RED: beforeMutation #4 ve #5'te yabanci plan/source yazimi goruldu.
Root'un dar ek yetkisiyle kalan recursive mkdir noktasi da incelendi:
RED mutation #2 storeRoot swap'i yabanci apply-publisher dizini olusturdu.

Native create-content-owned, beklenen operation root FileId'sini tutar;
exclusive create, write, FlushFileBuffers ve exact bytes/SHA receipt ayni
no-follow handle zinciri altindadir. Bounded hex stdin CRLF/Ctrl-Z/binary
byte'larini CRT text donusumunden korur. Tek source file limiti16MiB;
buyuk icerik ilk batch dogrulamasinda reddedilir. CRLF, Ctrl-Z, NUL ve
0xff iceren600005byte fixture aynen korunur; ikinci create overwrite yapmaz.

Native ensure-directory-owned, var olan ancestor/storeRoot FileId'sini
once yakalar; yeni tum komponentleri held relative no-follow handle ile
olusturur veya acar. Mutation #1/#2 storeRoot ve #4/#5 operationRoot swap
regresyonlarinda yabanci dosya/dizin olusmaz. Publisher initialization'da
Node dosya/dizin mutation'i kalmadi. Bu genel OS sandbox iddiasi degildir.

Mevcut C++ /W4 /WX komutuyla production ve fault fixture yeniden derlendi.
Source SHA1422fabd1cf4217622dd89c32f70f2bf30607a107ab085dd99bc4f768615cb44;
production SHA6432c44eafaab326c6df28b9382fe5374235ae04e88ac58a0d1a14e149bb6f26;
fault SHA145917c3c3c57066b3ad509c13188e55c83485c6b2bc4050271a46e3c765745a.

## Gercek OpenCode initialize kapasite kaniti

Kurulu CLI --version gercek2.1.4 dondurdu. mcp list --standalone desteklenmez;
yerel api --help ve private OpenAPI'den api --standalone yolu dogrulandi.
Yalniz private standalone runtime'a noop MCP sunucusu eklendi. Initialize
istemci kimligi opencode2.1.4 ve elicitation.form kapasitesi goruldu.
Private kanit SHA2568103D4BDFC061A5E1E71DAD12FA37AC67E02697819B6FAF8D53F3E2BADFBF434.
Ham private icerik bu checkpoint'e alinmadi. Child-only HOME/XDG/APPDATA
izolasyonu kullanildi; global/user/managed config ve provider degismedi,
mevcut servis sonlandirilmadi, probe process'i kalmadi. Model/Maven0;
actual human UI click kaniti iddiasi yoktur.

Son initialization duzeltmesi: 5 dosya76/76PASS (42 publisher+34 mevcut
native bridge/restore),72.36s; typecheck/scoped lint0error0warning/native
production verifier/fault fixture provenance PASS. Tam suite koordinatorde;
bagimsiz native reviewer source'u yeniden okur. Commit oncesi local Git
kimligi, staged diff, ASCII ve gizlilik taramasi tekrarlandi.
