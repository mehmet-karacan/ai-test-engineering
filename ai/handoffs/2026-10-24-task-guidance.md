# Gorev odakli yonlendirme devir kaydi

## 2026-10-24 Gorev odakli model yonlendirmesi

Sabit meslek/persona yerine objective, deliverables ve acceptance_criteria
aktarilir. Explicit teslim turu rol/asama etiketinden once gelir; eski role
varsayilanlari ve assignment olmayan kontratlar okunur. Analiz/review/gap'e
changeset zorlamasi kaldirildi; mevcut validator'lerin JSON Schema'si verilir.
Worker/ana model izinleri, test-only, kanit ve bagimsiz inceleme korunur.

23 yeni test; Windows1211PASS/1SKIP (139dosyaPASS/1SKIP). Typecheck/build/local
gate PASS, lint0error89mevcutwarning; bagimsiz review2dosya19PASS/engelleyici0.
Ayni GLM-5.3-Flash-IT ile dort sentetik teslim semasi dogrulandi (ilk4 oturumun
analysis/gap tip hatasi duzeltildi,3 oturum tekrarlandi; toplam7). Bu bir Java
execution veya model performans artisi kaniti degildir. Customer kosusu yok.
Kabul: ai/acceptance/task-guidance.json. CI kapali, G3 yayin yok.

Degisen odak: agent-contracts optional brief, worker task-brief/role-prompts,
genel HTTP adapter, production candidate brief aktarimi, OpenCode talimatlari
ve23regresyon. Kalici rol enum/sessionlineage degismedi. Yeni customer/Maven/
apply yok. Main teslim/build/kurulu skill ve remote HEAD son adimda kontrol
edilir. Ozel kanitlar runtime'da, hashleri acceptance JSON'da.
