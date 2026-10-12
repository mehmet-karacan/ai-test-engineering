# Checkpoint - AITE-PRODUCTION-READINESS-005 P07-B/PP17 egress enforcement uygulanabilirlik karari

## Kimlik

- Tarih: 2026-10-12 (UTC)
- Gorev: AITE-PRODUCTION-READINESS-005 v1.0 / P07-B (PP17) egress enforcement odak
- Branch: `codex/glm-prod005-p07b-audit` (taban HEAD `c824c43`, onceki checkpoint tabani main `10f3f4f`'in ilerisi)
- Koordinasyon: GLM-5.3-Flash-IT xhigh; denetim sonrasi tekil odak dogrulamasi
- Kullanici sinirlari: canli pilot `PAUSED_BY_USER` baslatilmadi; CI acilmadi; kurum ic adres/secret dokumana yazilmadi; Java/protected dosyalar stage edilmedi; macOS'e dokunulmadi; tam suite calistirilmadi; global git config degistirilmedi; repo-local kimlik `mehmet-karacan <karacan.mehmet@hotmail.com>`.

## Uygulanabilirlik karari (bu oturumun ana cikti)

**PP17 egress enforcement, repo icinde MEVCUT bir mekanizma ile uygulanamaz; urun kodu degisikligi YAPILMADI.** Zorunlu mekanizma host/VM seviyesinde Docker network policy veya enforce edilen proxy gerektirir; bu depoda ve bu hostta YOK. AKTIF_GOREV PR04 duzeltme maddesi bu durumu ongorur: "Kurum ag kurali kendiliginden degistirilmesin; zorunlu mekanizma yoksa typed blocker verilsin." Mevcut fail-closed typed blocker ONGORULEN dogru davranistir; yerine sahte/sizma tekil enforcement adapter'i eklenmedi.

## Kararin kanit dayanaklari (c824c43 agacinda kaynak duzeyinde)

1. `src/runners/docker-runner.ts` (provisionDependencies): provisioning settings.xml YALNIZ izinli mirror'lari iceren sekilde uretiliyor (mirrorOf external:*), ardindan kosulsuz `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` firlatiliyor. Settings uretiminden sonraki `network: "bridge"` hazirlama kod yolu erisilemez (olucta); serbest bridge egress'i hicbir yoldan acilmiyor.
2. Depoda enforcement mekanizmasi YOK: iptables/DOCKER-USER manipulasyonu, proxy sidecar, Docker network policy adapter veya firewall cagrisi yok (grep: proxy|iptables|network policy|dns|DOCKER-USER -> yalniz mirror config ve blocker kodu).
3. Maven settings `mirrorOf external:*` tek basina zorlayici degil: guvenilmeyen POM/plugin/extension kodu Maven'in kendi cozumlemesini bypass edip dogrudan DNS/socket acabilir. PP17 "yetkisiz egress/DNS/redirect gercek container'da reddedilir" kosulunu bu yolla karsilamaz.
4. Docker'in bildirimsel per-container egress allowlist'i yok: `--network none` onayli mirror dahil her seyi keser; `--internal` ayni sekilde mirror erisimini de keser; default bridge NAT tum egress'e aciktir. Allowlist icin host/VM seviyesinde firewall veya onayli proxy zorunlu; ikisi de bu hostta kurulu/yapilandirilmis degil.
5. Onceki `ai/checkpoints/2026-10-12-production-005-p07b-next2-blocked.md` karari (yeni altyapi yazmama; BLOCKED_KAYITLI) c824c43 agacinda kaynak duzeyinde yeniden dogrulandi; kararda degisiklik yok.
6. `src/orchestration/job-dispatcher.ts` (hata kodu esleme) yalniz `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` icin typed outcome eslemesi yapiyor; akis fail-closed.

## Kanit (bu oturum, gercek kosu)

- Ortam: Node v24.14.1, npm 11.11.0, vitest 4.1.11, Docker 29.8.2 (linux/amd64); `maven:3.9-eclipse-temurin-21` imaji mevcut (sha256:99e61abcff91...).
- `npm.cmd ci`: exit 0 (0 vulnerabilities).
- `npm.cmd run build`: exit 0 (build-stamp tree_digest `961654ce71a56842...`, 190 dosya; onceki checkpoint ile ayni tree).
- Odak test: `npm.cmd test -- --run tests/integration/p07b-dispatch-egress.test.ts` -> **1 test dosyasi, 1 test, 1 PASS, 0 FAIL, exit 0** (34.28 sn; Docker preflight GERCEK gecildi, skip yok).
  - `p07b-dispatch-egress.test.ts`: gercek stdio-entry + Docker; provisioning ACIK + izinli mirror DOLU ama enforcement mekanizmasi yok -> terminal FAILED + typed `BLOCKED_EGRESS_ENFORCEMENT_UNAVAILABLE` (fail-closed wire kanidi yeniden dogrulandi; sahte COMPLETED/READY/PASS yok).
- Tam suite calistirilmadi (kullanici siniri); typecheck/lint bu oturumda tekrar edilmedi (kod degisikligi yok; onceki oturumda c824c43-öncesi agac icin PASS kayitli).

## Durum ledger degisimi

- P07-B/PP17: uygulanabilirlik karari kesinlesti - **repo icinde mevcut mekanizma ile uygulanamaz; host-disi zorunlu blocker**. Fail-closed typed blocker gercek Docker wire kosuyla yeniden dogrulandi. Urun kodu degisikligi YOK; yeni network altyapisi/kurum policy UYDURULMADI.

## Kalan tek engel

- **Enforcement altyapisi yoklugu**: Docker egress enforcement (network policy/proxy) bu host/kurum tarafinda saglanmali. P07-B gercek customer dispatcher `COMPLETED` + Report06 export runtime kosusu ve PP17 positive/negative container kaniti ancak bununla acilir. Depo icinde bu engeli kaldiracak guvenli kapsam-ici acik YOK.

## Sonraki tek somut is

- Kullanici onayli enforcement altyapisi saglanirsa: PP17 negative (yetkisiz egress reddi) + positive (onayli mirror erisimi) gercek container testleri ve P07-B customer dispatcher COMPLETED + export kosusu; aksi halde P10 teknik devir/release karari (full gate NO_GO kalir).

## Dokunulmayan sinirlar

- Korunan Java dosyalari, live pilot, secret, CI workflow ve macOS kanitlari degistirilmedi; tam suite calistirilmadi; urun kodu (`src/`) degisikligi YAPILMADI.
