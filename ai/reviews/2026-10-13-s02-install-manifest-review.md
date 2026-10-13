# S02 WN15 kurulu arac manifesti bagimsiz inceleme

- Tarih 2026-10-13. Salt okunur subagent review; commit `5c6d24f`. Reviewer kodu okudu, test calistirmadi ve dosya degistirmedi. Coordinator merge sonrasi `npm.cmd run build` exit0 ve odak 3 dosya/17 PASS.
- P1: `src/runners/native-toolchain.ts:260-275` yalniz mevcut dosyalari enumerate eder. Native helper pinli handle'lari tutsa da Maven/JDK dizinine sonradan jar/class eklenmesini engellemez; Maven child listelenmemis yeni girdiyi gorebilir. Customer NO_GO.
- P1: `src/runners/native-toolchain.ts:355-366` standart disi veya eksik JAVA_HOME durumunda `distributionManifestComplete=false` plan dondurebilir; `-v`/goal bu biti customer preflight olarak zorunlu reddetmiyor. Bugunku `CustomerRunnerFactory.assertNativeCustomerReady` ayri kapali oldugu icin aktif customer run yok.
- P2: `src/runners/native-toolchain.ts:110-115` ve `src/runners/maven-runner.ts:108-113` resolver expected pin listesini lifecycle varken tasir. Lifecycle yoksa yeni supervisor snapshot'i alinabilir. Customer acilisinda lifecycle zorunlu olmali.
- Manifest transport icin ayrica swap acigi bulunmadi: `wx` manifest yazimi sonrasi helper no-follow handle + expected SHA ile pinler ve ayni handle'dan okur; byte degisimi CreateProcess oncesi `pin_mismatch` sonucudur. Bu, kurulum dizinine yeni dosya ekleme riskini kapatmaz.
- S02/WN14-WN18 VERIFIED degil ve customer gate NO_GO kalir; takip S02 ajanina atandi.
