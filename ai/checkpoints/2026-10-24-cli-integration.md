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
