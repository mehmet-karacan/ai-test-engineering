# ADR-008: Client bagimsiz MCP ve genel CLI worker protokolu

2026-10-24, kullanici talebiyle kabul edildi. Once genel CLI adapteri;
OpenCode varsayilani korunur. CI ifadesi bu gorusmede CLI olarak netlesti;
CI pipeline kapali kalir. Onceki009/M01..M06 kabulleri korunur.

MCP stdio client'i ile inference worker'i ayri secimlerdir. Tek job,
AgentScheduler, candidate validator, artifact publisher, Maven/JaCoCo,
checkpoint ve kurumsal rapor motoru kullanilir. Yeni backend optional'dir;
legacy config/contract/digest OpenCode yolunu korur.

Genel CLI, candidate-json-v1 stdin envelope alip stdout'a tek
CandidateChangeSet JSON yazar. Operator CLI veya API'yi bu protokole
uyarlayan wrapper saglar. Modelin persona/meslek etiketiyle yetkinligi
kisitlanmaz; gorev, teslim semasi, bounded context ve kabul kurallari verilir.
Engine-only test acceptance ve test-only kaynak korumasi devam eder.

worker_profile veya exact provider/model secimi frozen WorkerBinding
uretir. Backend/model, komut girdisi gercek yolu/SHA256 ve secret reference
isimleri immutable'dir. Resume degisimi native probe/lease/RUNNING oncesi
reddeder; eski is bugunku CLI varsayilanina tasinmaz. Eksik CLI icin baska
backend'e fallback yoktur. CLI upgrade yeni is gerektirebilir.

Windows owned Node bridge, shell:false stdin, bounded output/deadline ve
mevcut JobObject/NativeProcessRegistry ile process sahipligini korur.
Genel CLI'nin Windows hesabi yetkileri vardir; bu OS sandbox iddiasi degil.
Codex ek adapter'i mevcut login+explicit model/read-only/ephemeral ve
personal tools/MCP kapali sekilde calisir; managed policy bypass yoktur.

--client none OpenCode config/skill okumadan generic MCP stdio tanimi
uretir. Default kurulum OpenCode'dur. HTTP/REST, yeni provider hesabi/API
key, customer apply ve yayin eklenmez. Kurulum rehberi docs/cli-backends.md.

Kanit: ai/acceptance/cli-backends.json. Genel CLI gercek wrapper kosusu,
Codex native ve legacy OpenCode ayri canary'lerle dogrulandi. Baska vendor
CLI'lari tek tek dogrulandi iddiasi verilmez.
