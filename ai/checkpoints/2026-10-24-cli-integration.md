# CLI backend integration

BASE ceb1285, root codex/cli-backends-20261024. OpenCode legacy yolu korunur;
CLI backend/config/runtime degisken degerleri public kayda alinmaz.

Ortak CandidateInferenceClient, mevcut CandidateAgentSessionAdapter'in ayni
validator/artifactpublisher/scheduler fence'ini kullanir. Dort yeni durable
bridge testi RED4/1 -> GREEN5/5. CLI backend+model+command input hash+secret
reference isimleri request/JobContract/GoalContract'a sabitlenir. Resume
native probe/lease/lifecycle mutation oncesi birebir binding kontrol eder.
Legacy contract CLI default'tan etkilenmez. CLI fallback OpenCode'a donmez.

Yeni flow testleri ilk RED5/1, sonra envref duzeltmesiyle GREEN6/6.
Birlikte 3dosya/41test PASS; typecheck/build PASS. CLI yeni native supervisor
modunda ayni JobObject/NativeProcessRegistry kullanir. Config/executor ayri
izole worktree commit'lerinden alindi. Tam suite/modelcanary/review bekliyor.

Kurulum testinde agent'in unguarded install entry import'u dependency npmci
asamasini yanlislikla baslatti; config/runtime/OpenCode asamasina ulasmadi.
Guard ve pure options parser eklendi. D03b dependencies ana checkout'tan
dosya kopyasi ile onarildi; SQLite ve moduller dogrulandi. Ana dependencies
ayni kaldi. Config agent eski junction'i korudu; runtime/global configte
mutasyon yok. Tekrar install entry import'u testlerde kullanilmaz.

Devam: gercek sentetik Codex generation+Maven/JaCoCo, OpenCode regresyonu,
clientnone kurulum, bagimsiz review ve tam Windows suite. CI kapali.

Canli ilk Codex denemesi model0/TARGET_NOT_MET_PLATEAU: kurulu CLI'nin
surum junction'i constructor'da reddediliyordu. Gercek executable ve file
argumanlarini selection'da canonical path+hash ile dondurme eklendi;
RED1FAIL30PASS -> GREEN37PASS. Ikinci canary: scan model0, secim sonrasi
1Codex call, TARGET_REACHED,6/6PASS, asil kaynak ayni. Son kod kaniti yeniden
alinacak. Bagimsiz review'daki directory-argv pin hatasi RED->GREEN;
UNC config/native pin uyusmazligi erken schema RED->GREEN; tekrarli CLI
profilinin yanlisREADY sonucu RED->GREEN. Iki config/readiness dosyasi45PASS.
Bagimsiz config/integration review3dosya42PASS/P1P2yok; executor/install
review4dosya40PASS, uc bulgu yukarida kapatildi. Final recheck bekliyor.

Mixed config'te unrelated CLI varken tekrarli legacydefault readiness'i
gercek seciciyle uyumsuzdu; RED1FAIL14PASS -> GREEN15PASS. Purelegacy
readiness davranisi korundu. Final suite onceki kaynakta basladigi icin
bu ek duzeltme sonrasi build+tam suite yeni kaynakta yeniden kosulacak.
