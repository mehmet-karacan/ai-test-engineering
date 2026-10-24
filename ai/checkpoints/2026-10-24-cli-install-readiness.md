# CLI client-neutral kurulum ve readiness parcasi

BASE ceb1285; izole branch codex/cli-install-20261024. Root plan SHA256
58f8c3a796f4a3f4e70b23621d10050c5082df3f92ca10d966cb498f81438cc3;
arayuz SHA256 48e5ccec54c8866917d9dd905905c61ce2a3d73ea19bf14fbef66bcb31913d11
okunup dogrulandi. Runtime/customer veri bu kayda alinmadi.

## Degisiklik

- Installer/verify varsayilani OpenCode; yalniz `--client opencode|none`
  kabul edilir. Arguman hatasi bootstrap, runtime veya client erisiminden
  once kesilir. Parser saf ayri modulde; installer main'i importta calismaz.
- Her kurulum runtime config/mcp-server.json stdio tanimini uretir:
  gercek Node executable, MCP entry argv'si, canonical config/DB env'i.
  Kayitli worker/custom env upgrade'de korunur; installer shell'indeki
  explicit flag onceliklidir, verify'de kayitli flag onceliklidir.
- Tanim hash ownership ile guncellenir; eski owned baytlar backup edilir.
  Ozel/edited/malformed tanim backup ile korunur, sessiz sahiplenilmez.
  Ayni baytlarda yazma/backup yok. Diger ownership kayitlari korunur.
- Client none OpenCode path/config/skill'ini okumaz/yazmaz; verify SDK'ya
  gercek tanimin executable/argv/env'ini aktarir, yabanci komutta yerel
  server'a fallback yok. OpenCode client skill/entry denetimi devam eder.
- Secili CLI profili OpenCode model/provider bagindan bagimsizdir.
  Mutlak normal executable dosyasi gereklidir. READY/CONFIGURED yerel
  baglamadir; canli auth/model kaniti degildir. Explicit CLI default yoksa
  ilk CLI profilini sessizce secmez. Legacy OpenCode readiness korunur.

## Kanit

- RED: yeni readiness testleri mevcut OpenCode model-mismatch yolunda
  beklenen sekilde fail oldu; tanim helper'i henuz yoktu. GREEN: yeni
  parser/readiness/ownership ve mevcut OpenCode testleri birlikte PASS.
- Son odak seti 7 dosya / 58 test PASS (22 yeni test, skip/fail 0):
  cli-install-readiness, mcp-server-definition,
  p08-readiness, w09-install, opencode-skill-install,
  client-neutral-verify, production-install-smoke.
- Gercek SDK integration: malformed OpenCode sentinel korunarak client none
  initialize/tools-list/read-only-tools-call PASS. Worker0 ambient worker1'i
  ezer. Projects envanteri 0. Foreign executable reddedilir, DB olusmaz.
  Maven fixture env'i effectiveMavenEnvironment tarafindan probe oncesi
  reddedildi; Maven/model/customer kosusu yapilmadi.
- TSC emit/noEmit ve degisen TS/MJS dosyalarinda ESLint 0 error/0 warning.
  Node syntax ve git diff whitespace kontrolu PASS.
- Windows root-relative var olan executable'in yanlis READY sonucu ayri
  RED testiyle goruldu; tam drive/UNC zorunlulugu sonrasi GREEN oldu.
- Ilk test harness hatasi: o anda guardsiz eski install girisi dynamic
  import edilince npm ci spawnSync istemeden basladi. Kilitli rolldown
  dosyasinda EPERM ile exit 4294963248 oldu; runtime/config asamalarina
  ulasmadi. Parent derhal bilgilendirildi. Ilgili npm process'i senkron
  cikti; arka process kalmadi. Paylasilan dependency tree parent tarafinda
  toparlandi. Test entry import'u kaldirildi; parser saf module tasindi,
  installer main guard eklendi. Sonraki dogrulamalar npm kullanmadan
  mevcut yerel Vitest/TSC/ESLint girisleriyle dogrudan Node'da yapildi.

## Devam noktasi ve sinir

Root backend schema commit'iyle parcayi birlestirir; CLI profilli gercek
izole install/verify canary ve birlesik test paketi root'tadir. Bu parca
yalniz worker backend'in yapisal seklini okur; baska agent dosyalarina
dokunmadi. Bagimsiz final reviewer ayri olacak. Fullsuite, real CLI auth,
model generation, Maven, customer apply veya yayin kabulu iddia edilmez.
CI/global config/GPU kaynak degisikligi yok; push yapilmadi.
