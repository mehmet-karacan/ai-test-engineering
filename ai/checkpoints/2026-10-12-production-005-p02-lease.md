# AITE-PRODUCTION-READINESS-005 P02 lease ve process ownership

## Uygulama

- Aktif baska owner acquire istegi DB owner/token kaydini degistirmeden typed `LEASE_HELD` ile reddedilir.
- Ayni owner healthy lease'i idempotent heartbeat ile yeniler; expired lease renew edilemez.
- Expired takeover monoton fencing token ile yeni generation alir; `assertFence` ve checkpoint publish expiry sinirini dahil eder.
- Checkpoint best pointer update'i expected parent generation ve `row_version` CAS ile korunur; stale publish pointer'i ilerletemez.
- Dispatcher lease'i normal uzun akis boyunca heartbeat ile yeniler; heartbeat lease kaybinda owned process'leri durdurur ve yeni DB/publish yazimlarini fence eder.
- Maven stdout/stderr loglari byte butcesiyle sinirlanir; Unix kill akisi SIGTERM/SIGKILL, Windows akisi yalniz Windows taskkill kullanir.
- Docker run owned CID'yi job log dizinindeki `container-id.txt` ile kaydeder; timeout/cancel yalniz bu CID'yi stop eder, platforma gore client process sonlandirir.

## Kanit

- `npm.cmd run typecheck`: exit 0.
- `npm.cmd test -- tests/unit/durability.test.ts tests/unit/w05-recovery.test.ts tests/unit/fencing.test.ts tests/security/fin00-isolated-loop.test.ts tests/contract/rt21-pilot-remediation.test.ts`: exit 0; 5 dosya, 37/37 test.
- P02 onceki odak suite'i: durability/w05/fencing 24/24.
- PP04/PP05/PP06 negatifleri: aktif owner takeover, expired renew/publish ve aktif recovery owner mutasyonu reddediliyor; stale pointer best checkpoint'i degistirmiyor.

## Sinirlar

- Docker daemon bu hostta erisilebilir degil; gercek container stop/inspect ve PP07-PP09 Linux/timeout kaniti NOT_RUN/BLOCKED olarak kalir.
- Iki ayri OS process, gercek kurum runner'i, live pilot ve provider kaniti uydurulmadi.
- Bilinmeyen sahiplikteki `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` stage edilmedi.

## Devam noktasi

- P02 kod ve yerel odak suite tamamlandi; commit/push sonrasi P03 immutable contract/source/accepted blob/resume zinciri.
