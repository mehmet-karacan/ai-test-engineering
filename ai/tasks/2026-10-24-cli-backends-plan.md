# Secilebilir CLI backend tasarim ve uygulama plani

BASE ceb1285ebe1a606ad3e9c8d3955c90b5dd114f49. Izole d03b worktree,
branch codex/cli-backends-20261024. Kullanici OpenCode korunarak baska
CLI'larin eklenmesini istedi. Konusmadaki CI ifadesi CLI olarak yorumlandi;
CI pipeline kapali. Tercih sorusu opsiyonel; kuruluCodex ilk gercekadapter
secimi uygulayicinin karari. Yeni API key veya provider hesabi kurulmaz;
Codex kendi mevcut ChatGPT CLI auth'unu kullanir. Global config degismez.

## Kararlar

- Tek MCPstdio/motor/scheduler/candidate loop/Maven/JaCoCo/report korunur.
  Tek core'u kopyalamak veya tumgeneration'i yeniden yazmak secenekleri
  regresyonu buyuttugu icin alinmadi. Secilebilir inference adapter eklenir.
- Legacy worker_profiles backend olmadan OpenCode'dur. Yeni profile optional
  backend: opencode | cli_json | codex_cli. Yeni worker_profile toolparami
  explicit profili secer; model_profile eski provider/model bicimini korur.
  Default profile ve exact binding, ambiguity/fallback davranisi acik olur.
- CLI backend secimi executable/argv/protocol/env-reference isimleri ve
  backend/model binding olarak request/config/immutable jobcontract'a girer.
  Legacy alan yoksa OpenCode sayilir; digest eski kontratta degistirilmez.
  Resume ayni backend/binding'i korur; CLI yoksa OpenCode'a fallback yapilmaz.
- GenericCLI protocol candidate-json-v1: stdin'de bounded prompt/model/schema
  iceren JSON, stdout'ta tek typed CandidateChangeSet JSON. Stderr/size/time
  sinirli, bozuk/partial/huge/nonzero/timeout/cancel kabul edilmez.
- Codex adapter exe+explicit model ile exec/json/output-schema/output-last-
  message/stdin kullanir. Ephemeral, read-only, interactiveapproval yok;
  personalconfig/MCP/tools mirasi acilmaz, managed policy/rules bypass yok.
  Kurulu CLI0.163.0 ve ChatGPT login goruldu; defaultmodel gpt-6.1-sol.
- Her CLI invocation engine-owned bosruntimecwd'de. Node bridge requestfile
  okuyup backend'e shell:false stdin verir; prompt commandline'a girmez.
  Mevcut Windows JobObject supervisor+NativeProcessRegistry tumprocess
  agaci ve parentkill/cancel/timeout fence'ini korur. OSsandbox iddiasi yok.
- CliCandidateAgentSessionAdapter AgentScheduler kontratini kullanir. Aday
  validation/artifactpublication tek ortakhelper, ayni task/butce/lease/policy
  ve late-result ret semantigiyle. Kaynak/prod/POM/mevcuttest degismez.
- Installer defaultOpenCode davranisi ayni; --client none runtimeMCP tanimini
  uretip OpenCode config/skill'ine dokunmaz. Verify/client/modelreadiness secili
  backend'e gore; CLI backend OpenCode dosyasi/exe'sine ihtiyac duymaz. Baska
  MCP client ayni stdio kaydini kullanir; HTTP/REST bu gorevde eklenmez.

## Isler (TDD/plan, native execution; bagimsiz finalreview)

- [ ] Backend schema/selection/secretfree snapshot ve eski config uyumu;
  explicit profile/model uyumsuzlugu ve ambiguity RED->GREEN.
- [ ] Owned CLI runner/Node bridge/protocol/Codex adapter, time/output bound,
  secret-env ve cancellation/process cleanup regressionlari RED->GREEN.
- [ ] Dispatcher/durablecandidate integration, immutable request+resumebinding,
  cancel/no-fallback ve shared artifactpublisher regresyonlari RED->GREEN.
- [ ] Kurulum --client none ve backendreadiness, OpenCode legacy regressions;
  docs/state/checkpoint/acceptance kalici guncelleme.
- [ ] Sentetikproject genelcoverage/model0/selection/Codexgeneration/80hedef
  gercekMaven/JaCoCo/finalreport; OpenCode regresyonu; bagimsizreview/fullsuite.
- [ ] Gitidentity/ASCII/privacy/stageddiff; commit/main/push/kurulumsmoke.

## Sinirlar

Windowsnative, Docker/macOS/CIyok. Customerrepo/model kaynak/log/session ve
secret public'e girmez. G3deploy userkarari. GenelCLI bridge uyumlulugu
Codex/Operatorwrapper testi kadar kanitlanir; Claude Code vb realrun olmadan
uyumlu diye ilan edilmez. Onceki production1261test sonucu tarihselbase'dir.
