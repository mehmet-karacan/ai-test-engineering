# CLI owned execution adapter checkpoint

Tarih 2026-10-24. BASE ceb1285ebe1a606ad3e9c8d3955c90b5dd114f49.
Branch codex/cli-executor-20261024; izole native cli-executor worktree.
Plan SHA256 58f8c3a796f4a3f4e70b23621d10050c5082df3f92ca10d966cb498f81438cc3.
Brief SHA256 48e5ccec54c8866917d9dd905905c61ce2a3d73ea19bf14fbef66bcb31913d11.

## Degisiklik

CliCandidateClient, cli_json/codex_cli icin createSession/generate/abortSession/
stopOwnedServer ve tipli TIMEOUT/CANCELLED/PROVIDER_ERROR/EMPTY_FINAL/
TRUNCATED_JSON sonucunu saglar. Prompt stdin'e private requestfile uzerinden
tasinir; CLI stdout/stderr ve Codex last-message dosyasi bounded'dir. Secret
yalniz adi explicit referans verilen env iletilir; Node injection env miras
yoktur. Kullanici/global config veya auth dosyasi yazilmaz/kopyalanmaz.
Codex ephemeral/read-only/ignore-user-config, shell_tool/multi_agent/apps
kapali, web_search disabled, mcp_servers bos; managed rules bypass edilmez.
Yalniz bilinen schema-optional null degerleri silinir, gerekli null degeri
mevcut engine validator tarafindan reddedilmek uzere korunur.

Root 2026-10-24 mesajiyla dar supervisor degisikligini yetkilendirdi:
NativeProcessPlan.invocationKind?: 'maven_cmd'|'cli'. Varsayilan ayni
Maven .cmd ve implicit .mvn/.m2 pin kapsamini korur. CLI modu absolute
Node .exe, owned absolute pinRoot ve frozen pinnedInputs gerektirir;
Maven'in kullanilmayan global dosyalarini okumaz/olusturmaz. Native C++
helper degismedi. Node/cmd/bridge/request/schema/backend dosyalari native
hash pin ile tutulur. Backend executable/statik absolute dosya argumanlari
config snapshot hash'lerini korur. Eksik CLI icin OpenCode fallback yoktur.

## Kanit

Ilk stub uygulamada 10/10 test beklenen eksik CLI uygulamasiyla RED oldu.
Son odak kosusu: cli-candidate-client + wn-toolchain-pin +
wn-install-manifest-helper: 3 dosya/26 test PASS, 0 FAIL/SKIP.
18 yeni CLI testi gercek Windows Job Object/Node alt surecleri ve yerel
C# compiler ile uretilen Codex protokol fixture'i kullandi. Gercek provider,
auth islemi, customer checkout, Maven veya model kosusu yoktur.
Timeout/session abort/AbortSignal/stopOwnedServer ve owner Node hard-kill
sonrasi gercek alt surecin kapandigi dogrulandi. Degisen frozen script,
nonzero/malformed/oversize/stderr oversize/empty sonuc reddedildi.
Final cleanup containment dahil tekrar: npm run build/typecheck exit0;
odak 3 dosya/26 test PASS, scoped ESLint exit0. Tum depo ESLint JSON
sonucu exit0, 0 error ve 89 mevcut warning. Runtime log/model/secret
dosyasi staged degildir. Local Git kimligi, staged diff, ASCII/privacy
pattern ve git diff --cached --check gecti.
Tam urun suite/model canary ve bagimsiz reviewer root entegrasyonundadir;
bu parcada tam urun kabulu veya canli CLI uyumu iddiasi yoktur.

## Devam

Root integration installer paketine scripts/cli-candidate-bridge.mjs ekler;
source/dist modul yollarinin ikisi de ayni scripts dosyasini kullanir.
Parent-kill testi build edilmis dist gerektirir (npm run build once kosuldu).
Token usage ve message_id bu protokolde null'dir; model sonucu validator ve
artifact publication root ortak yolunda kalir. Commit push yapilmayacak.
