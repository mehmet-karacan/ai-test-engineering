# AITE-PRODUCTION-READINESS-005 P03 - Immutable contract/source/accepted blob + atomic checkpoint

## Uygulama (PR03 / R03, R04, R06; PP10, PP11, PP12, PP13, PP15)

- **Source identity (PP11/PP12):** `source-snapshot.ts` artik gercek `git rev-parse HEAD` ile okur (`.git/HEAD` byte taramasi degildi); `git status --porcelain` hata verirse `dirty=true` fail-closed (false-clean yok). Canonical `source_digest` (tum dosyalarin sirali relative path + sha256) ve `build_digest` (yalniz build_config dosyalar) uretildi. `computeSourceChange` null/bos recorded identity'yi "degismeyen kaynak" saymaz (R04).
- **Accepted content-addressed blob (PP10/R03):** `checkpoint-store.ts` `publishAcceptedBlobs(jobId, files)` content-addressed blob'i job'a ozel `blobs/accepted/<job_id>/<xx>/<xx>/<hash>` konumuna atomic rename ile yayinlar; manifest `accepted_changes` ile birebir eslesme zorunlu (eksik/fazla/uyusmaz = RED). `verifyCheckpoint` artik accepted blob varligi/hash/boyutunu dogrulamadan `valid` donmez (sebepler: ACCEPTED_BLOB_EKSIK/BOZUK/HASH/BYTES/UNKNOWN). `restoreAcceptedFiles` blob'lardan geri yukler (hash dogrulamali).
- **Best pointer CAS (PP13/R06):** `publishCheckpoint` expected generation'i GERCEK best pointer'in generation'ina karsilastirir; parent gercek best pointer olmak zorunda (stale parent RED: STALE_PARENT), baska job'a ait parent RED (PARENT_FOREIGN_JOB), generation monotone (best'ten gerizekalim RED: GENERATION_CONFLICT), row_version CAS korunur.
- **Migration v3:** `checkpoint_blobs` (checkpoint<->accepted blob baglanti) + `source_identities` (snapshot bazli tam identity) tablolar. Checkpoint blob kaydi manifest ile ayni transaction'da (crash'de partial referans DB'de kalmaz).
- **Recovery (PP11):** `planRecovery` recorded identity'yi 1) trusted checkpoint manifest, 2) source_identities, 3) legacy project_snapshots (source_digest bilinmez -> fail-closed) sirasinda cozumler. `RecoveryContext` artik `current_identity` (SourceIdentity) tasir.
- **Resume (PP15):** `resumeDispatch` butce/tursu/yol YALNIZ dogrulanmis checkpoint manifest'inden (`resumeBudgetFromManifest`); global config butceyi sifirlamaz. Accepted set mutable klasor degil immutable blob'dan geri yuklenir. `total_job_minutes` deadline `created_at + total_job_minutes` ile kalicidir (resume'da sifirlanmaz).
- **Dispatcher contract/manifest:** `dispatch` source identity + tam contract'i kalici saklar (persistJobContract -> job_contract artifact + source_identities). `on_accepted` manifest'i DOLU yazar (source_snapshot_id, head_commit, source_digest, build_digest, policy_digest, toolchain, model) ve accepted blob'lar yayinlanir; expected generation null olarak gonderilir (store GERCEK best'i dogrular). `candidate-loop.ts` adopted `on_decision` kaydi artik `on_accepted` (checkpoint publish) basarisindan SONRA yazilir; publish hatasi rollback + throw (fail-closed).
- **services.ts:** `handleTestStart`/`handleProjectInspect` snapshot'lari `computeSourceIdentity` ile DOLU identity yazilir (onceki null/null).

## Degisen path'ler

- src/discovery/source-snapshot.ts (SourceIdentity, gitHeadCommit, sourceDigestFromManifest, buildDigestFromManifest, computeSourceIdentity, computeSourceChange)
- src/orchestration/checkpoint-store.ts (publishAcceptedBlobs, verifyCheckpoint accepted blob, restoreAcceptedFiles, resumeBudgetFromManifest, CAS; schema +source_digest)
- src/orchestration/recovery-manager.ts (identity tabanli source change, recorded identity tier)
- src/orchestration/candidate-loop.ts (adopted on_decision -> on_accepted sonrasi, fail-closed)
- src/orchestration/job-dispatcher.ts (persistJobContract, persistSourceIdentity, dolu manifest, resume identity/butce/contract, deadline)
- src/storage/migrations.ts (v3: checkpoint_blobs, source_identities)
- src/storage/inventory-repository.ts (writeSnapshot source/build digest parametreleri)
- src/application/services.ts (DOLU snapshot identity)
- tests/unit/p03-checkpoint-identity.test.ts (YENI, 29 test: PP10/PP11/PP12/PP13/PP15 + loop fail-closed)
- tests/unit/{durability, w05-recovery, fin03-relations, fin07-lifecycle, fin12-diagnostics-gc, storage, w03-baseline}.test.ts (yeni davranisa uyarlandi; gevsetilmedi)

## Kanit (2026-10-12, P02 son commit sonrasi calisma agaci)

- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run build`: exit 0.
- `npm.cmd test -- tests/unit/p03-checkpoint-identity.test.ts`: 29/29 PASSED (PP10 missing/corrupt/wrong-job blob, PP11 null/legacy identity, PP12 HEAD/dirty/rename/POM, PP13 stale-parent/CAS/gerizekalim/foreign-parent, PP15 butce/contract/blob restore/deadline, loop fail-closed).
- `npm.cmd test --` kod-komsusu odak set (p03, storage, candidate-acceptance, durability, w05-recovery, fin03, fin07, fin12, fin01-contract, w03): 130/130 PASSED.
- `npm.cmd test -- tests/unit tests/contract tests/security`: 488 PASSED / 9 FAILED (497).

## Acik kalan (pre-existing / environmental)

- `tests/unit/fin15-release-verifier.test.ts` (2) + `tests/unit/w10-ledger.test.ts` (1): PR01 release-verifier kapsamli; TEMIZ (stashed) agacta da FAIL (P01'de birakilan mevcut durdur); P03 ile iliskisiz.
- `tests/security/docker-isolation.test.ts` (6): Docker daemon bu hostta erisilemez (P02'de NOT_RUN/BLOCKED olarak kayitli); P04/Docker kabulunun konusu.
- P03 gercek hard-kill/iki-process kaniti (PP14, PP17, PP07) Docker/izole ortam ve iki OS process gerektirir; bu hostta NOT_RUN olarak kalir. Kod seviyesi crash noktasi (blob/manifest/DB transaction) deterministik testlerle kapatildi.

## Sinirlar

- Bilinmeyen sahiplikteki `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` stage edilmedi, degistirilmedi.
- Coordinator commit/push adimi sonrasi SHA ve uzak HEAD ayni commit kaydinda ayrica dogrulanir. Runtime DB/blob calisma agaci disinda; repo disindaki store'da.
- PR06 (model/profile, tek resolver), PR05 (frozen baseline/effective Maven), PR07 (Report06 facts), PR08 (kurulum) P03 disinda; dokunulmedi.

## Devam noktasi

- P03 kod + yerel odak suite tamamlandi. Sonraki: P04 (zorunlu izolasyon/controlled provisioning/cache-secret siniri) veya kullanici onayli commit/push.
- PR03 kalan live kanit: iki OS process + gercek hard-kill + Docker/izole ortam (NOT_RUN/BLOCKED); local fail-closed davranis dogrulandi.
