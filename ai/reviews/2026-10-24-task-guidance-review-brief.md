# Gorev odakli yonlendirme bagimsiz inceleme

BASE b57e15c4ccff729ee6921124c89b95ced3759854, branch
codex/task-guidance-20261024, workspace d03b. Kullanici sabit meslek/persona
rollerinin modelin capraz becerilerini daraltmamasi icin talimatlari oku/duzelt
dedi. Yeni yetki/multi-agent/role mimarisi veya customer kosusu istenmedi.

Plan ai/tasks/2026-10-24-task-guidance-plan.md ve current diff/new files'i oku.
Ana degisiklikler: domain optional TaskAssignmentSchema (objective,
deliverables, acceptance_criteria;8KiB UTF8), renderTaskBrief ve legacy defaults;
genel HTTP adapter brief'i role/ID'den once gonderir; production candidate
prompt'u ve kalici AgentTaskContract ayni acik coverage/repair brief'ini tasir.

WorkerPromptContext.delivery_kind explicit ise role'u gecersiz kilan teslim
secimidir. Role enum'lari ve lineage korunur; role fallback eski caller icindir.
Candidate/AnalysisArtifact/ReviewArtifact/GapAnalysis mevcut semalari kullanilir;
analiz/review'e degisiklik-seti/path/@Test zorlamasi gitmez. Ornek JSON'lar
gercek semalarla parse edilir. Role'u degistirip explicit brief+delivery'yi
ayni tutan prompt'lar yalniz metadata etiketinde farklidir.

Imza listesi tek API sayilmaz; kaynak ve javap bilgisi birlikte kullanilir.
ODAK onceligi, bagli public metot/fixture analizi ve root-cause repair serbest;
gecerli test/asertion korunur. Worker tool deny/test-only/JSON/butce ve review
bagimsizligi ayni. Ana OpenCode model izinlerine dokunulmadi.

RED ilk19/25; explicit delivery ek testi1FAIL/12PASS. Odakli9dosya92PASS,
son7dosya84PASS; kalici assignment testi eklendi; typecheck/build PASS;
lint0error89eskiwarning. Guncel20yeni test, full suite baslatilacak.
Eski KOD YAZMA beklentileri gorev teslimine uyarlandi; FIN05'te as never ile
gecersiz WorkerRole fixture'i canonical test_designer yapildi.

Salt okunur: source/index/branch/runtime/customer yazma, subagent acma veya
model/customer/full suite kosma. Istersen yalniz task-guidance.test.ts ve
wn-agent-adapter.test.ts kos. Somut severity/path/line, geriye uyumluluk,
celisen/yetenegi daraltan talimat, yanlis basari ve teslim/kanit riskini bildir.
