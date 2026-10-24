# Genel CLI adapteri teslimi

Kullanici OpenCode korunarak baska CLI'lar istedi; son tercihi once genel
CLI adapteri oldu. cli_json protokolu ve clientnone kurulum asil kullanim
yoludur; codex_cli ek hazir adapter'dir. OpenCode default/config/skill'i
korunur. Backend secimi kayitli binding'e sabitlenir; fallback yoktur.

3118a2b executable kodunda154dosya/1345test PASS,0FAIL0SKIP; typecheck/build,
lint0error89mevcutwarning/localgate PASS. Bagimsiz kalan P1/P2=0.
GenelCLI/Codex/OpenCode canary'lerinin her biri: scan model0, secim sonrasi
1modelcall,6/6PASS,LINE11/11BRANCH10/10, asil kaynak ayni, uygulanmisdosya0,
unresolvedprocess0, reportmissing0/hashmismatch0. Genel CLI frozen backend
gercekten cli_json; private wrapper Codex CLI'yi JSON protokolune uyarlar.
Genel uyumluluk baska her vendor CLI ile canli kanit anlamina gelmez.

Clientnone temiz clone install/verify PASS; gecersiz OpenCode sentinel'i
ayni,skill0,SDKinitialize/list/call PASS. Kanitlar private TEMP/pilot;
public kabul ai/acceptance/cli-backends.json. README/docs genel CLI oncelikli.

Son adimlar: metadata commit, main FF/build/yerel gate/gercek kurulu OpenCode
verify ve generic MCP tanimi export, remoteHEAD dogrulamasi. Kullanici
runtime worker profile/default'u kendiliginden degistirilmez; operator
genel wrapper'i kurup docs/cli-backends.md ile yeni profil ekler. Mevcut
OpenCode baglantisi calisan eski process ise MCP yeniden baglaninca yeni
arac semasini alir. CI kapali,G3 yayin kullanicida.

Main b13ad6c FF/build/localgate/kurulu verify-install PASS; kurulu OpenCode
skill byte/hash ayni,model CONFIGURED/Maven CAPABILITY_PROBED. Generic stdio
tanimi mevcut runtime'a ownership helper ile export edildi; app config,
OpenCode config ve default worker byte/semantik ayni. Generic definition
ile actual SDK9tool/startresume worker_profile schema/read-only call PASS.
Executable370filedigest ayni. Kapanis metadata sonrasi build ve pushremote
HEAD eslesmesi son adimdir. Kullanici MCP baglantisini yenileyebilir.
