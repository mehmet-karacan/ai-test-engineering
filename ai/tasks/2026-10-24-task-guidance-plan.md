# Gorev odakli model yonlendirmesi

Kullanici rol metinlerini okuyup gereksiz meslek/rol kisitlarini duzeltmeyi
istedi. Kabul edilen ilke: net hedef, baglam, teslim ve kabul olcutu; model
gereken analiz/tasarim/gelistirme/inceleme bilgisini gorev icinde kullanir.

## Tasarim ve kapsam

- Kalici WorkerRole/AgentRole degerleri ve session lineage korunur; bunlar
  kimlik/kabiliyet sinifi degil gorev asamasi ve sorumluluk etiketidir.
- Candidate changeset ile analysis/review teslimleri birbirine karismaz.
  Acik delivery_kind rol etiketinden once gelir; eski cagri rol-default uyumludur.
- AgentTaskContract optional assignment (objective/deliverables/acceptance)
  tasiyabilir; eski kontratlar acik gorev varsayilani ile uyumludur.
- Production candidate kontrati acik hedef/coverage/onarim ve gercek Maven
  kabul olcutunu task brief olarak tasir. Genel adapter ayni brief'i iletir.
- Kismi imza listesi tek bilgi kaynagi ilan edilmez. ODAK bir onceliktir;
  bagli metotlari inceleme/kullanma ve hatali fixture'i yeniden duzenleme yasagi
  olmaz. Gecerli testler ve assertion'lar korunur.
- JSON tasima, test-only, onay, kaynak/secret/byte butcesi ve worker arac
  izinleri gorev siniridir; bu tur bunlar kaldirilmaz. Ana model izinleri ayni.
- Yeni UI, rol/multi-agent mimarisi, customer Maven/model/apply veya CI yok.

## Uygulama (executing-plans, systematic-debugging, TDD)

- [x] Mevcut prompt/adapter/contract testlerini baseline calistir.
- [x] Role gore teslimin tutarliligi, assignment aktarimi/legacy fallback ve
  gorev icinde capraz beceri kullanimi icin anlamli RED testleri yaz.
- [x] Prompt'lari ve optional brief aktarimini dar degisiklikle duzelt.
- [x] Odakli test, typecheck/build/lint, tam Windows suite; bagimsiz son review.
- [x] Checkpoint/kabul/devir kaydi; onceden yetkili main commit/push teslimi.

Inceleme odagi: analysis'e changeset zorlamama; explicit gorevin rolden once
gelmesi; kanit olmadan COMPLETED/coverage uydurmama; eski JSON kontratlarin
okunmasi; bagimsiz inceleme ve model/tools politikasinin korunmasi.
