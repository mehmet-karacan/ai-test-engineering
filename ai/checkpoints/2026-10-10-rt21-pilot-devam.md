# Checkpoint: 2026-10-10 - RT21 pilot (sky_backend) - hazirlama asamasi devri

## Gorev

- AITE-RUNTIME-ACCEPTANCE-003 v2.0; RT21/PRO56 gercek proje pilotu (sky-microservis)
- FIN00-FIN15 tamamlandi (356/356 test, release-verify exit 0, commitler 60c0cda..1717e45, push edildi)

## Pilot durum

- Hedef proje: `C:\innova\projeler\sky-microservis\sky_backend` (Spring Boot 3.0.13, Java 21, junit5+mockito spring-boot-starter-test, surefire **skipTests=true**, jacoco YOK, mvnw wrapper var, surefire 3.0.0-M5)
- Hedef sinif: `SKY.report.services.quartzService.HakedisHesaplaJobService` (tekil cozumlu; execute()/executeAllActiveGoals()/executeOneGoal; SPCaller + HedefTipiBirimTipiRepository mock'lanabilir)
- Yetkili modeller: `litellm/GLM-5.3-Flash-IT` + `litellm/Qwen3.8-27B-IT` (C:\Users\mkaracan\.config\opencode\opencode.json; LITELLM_API_KEY tanimli, aihub-api.turktelekom.com.tr)
- Kurum Nexus mirror: `http://10.10.10.45/nexus/repository/maven-public/` (~/.m2/settings.xml credential'siz)

## Yapilan duzeltmeler (push edildi)

1. `f321024`: DockerRunOptions.readonly_mounts + DockerMavenRunner.maven_settings (-s /settings/settings.xml); kok neden: container'da /root yazilamadigi icin mirror config yuklenemiyordu
2. `1717e45`: AppConfig.dependency_provisioning (enabled + allowed_mirrors + timeout) + DockerMavenRunner.provisionDependencies (mvn dependency:go-offline, bridge network, izinli mirror; basarisizsa BLOCKED_DEPENDENCIES)
3. Kullanici config'i ($env:LOCALAPPDATA\ai-test-engineering\config\config.json) dependency_provisioning ile guncellendi (enabled:true, Nexus mirror); loadConfig dogrulandi

## Kalan sorun (devam noktasi)

- Pilot script `rt21-pilot2.mjs` (C:\Users\mkaracan\AppData\Local\Temp\opencode\) son kosuda hata verdirdi: `start_ok:false, job_id:null, error:null` ve 900s timeout'ta tamamlandi; JOB 10c8e4b3 yine BASELINE_FAILED (phase:baseline).
- Muhtemel nedenler (sirayla kontrol et):
  1. Eski FAILED job'lar idempotency digest'iyle mi donuyor (yeni job olusmuyor mu) — rt21-pilot2.mjs idempotency_key kullanmali (kullaniyor: "rt21-pilot-XXXXXXXX"); test_start'in findJobByRequestDigest idempotency'yi digest'e bagladigi icin AYNI payload + FARKLI key => yeni job olusuyor mu kontrol et (idempotency_key digest'e dahil degilse eski FAILED job donuyor!)
  2. services.ts:317-331 sirasi: parsed.targets.length > 5 kontrolu SONRA job olusturuyor; findJobByRequestDigest location.id + digest ile eski job'u donduruyor olabilir (digest idempotency_key icermiyor olabilir — kontrol: services.ts requestDigest parcalari)
  3. Baseline yine FAILED ise docker-stdout.log'a bak: provisioning asamasi tetiklendi mi (aitest-docker-baseline-logs/provisioning dizini yok su an — hazirlama loopRunner'da, baseline dogrudan dockerRunner.run ile: baseline'a provisioning BAGLANMAMIS olabilir — bu farki kontrol et)

## KRITIK BILINEN BULGU (ilk duzeltilecek is)

- job-dispatcher.ts baseline asamasi `dockerRunner.run` dogrudan cagiriyor (mvn test, network:none, readonly settings mount VAR ama **provisioning YOK**); loopRunner (DockerMavenRunner) provisioning'li ama baseline o yolu KULLANMIYOR. Baseline'i da DockerMavenRunner uzerinden calistir (provisioning + izinli mirror devri) veya baseline oncesi ayri hazirlama asamasi ekle.
- Ayni zamanda services.ts requestDigest'e idempotency_key dahil mi kontrol et; ayni istek eski FAILED job'u donduruyorsa yeni job acilmiyor (9.1: kaynak degistigi halde onceki tamamlanmisi sonsuza kadar dondurme kurali).

## Komutlar (kanitli)

- `npm.cmd test` -> 356/356 PASSED (42 dosya)
- `node scripts/release-verify.mjs` -> exit 0
- `node rt21-pilot2.mjs` (Temp\opencode) -> job baslatir; status-check.mjs/resume-check.mjs/watch.mjs ayni dizinde
- Kok repo: C:\innova\projeler\ai-test-engineering (branch main, HEAD 1717e45 sonrasi; temiz tree)

## Devam

- Yukaridaki KRITIK BULGU'yu duzelt -> test yaz -> npm test -> commit (Turkce ASCII) + push -> rt21-pilot2.mjs ile pilotu yeniden kos -> baseline PASSED sonrasi worker ile candidate uretimi (gercek model litellm/GLM-5.3-Flash-IT) -> coverage >= %90 -> final replay + rapor kanitlari -> kabul matrisi/PROJECT_STATE guncelle.
- Production/POM degisikligi YASAK; yalniz sky_backend src/test/java altina yeni test dosyasi eklenebilir (pilot PATCH_ONLY; apply onayli kanal yok).
