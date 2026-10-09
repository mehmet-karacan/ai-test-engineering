# Checkpoint: P06 - Dayaniklilik

- Tarih: 2026-10-09
- Asama: P06

## Yapilan is

1. **CheckpointStore** (src/orchestration/checkpoint-store.ts): atomic publish protokolu - manifest JSON -> tmp dosya -> content-addressed blob rename (Windows kilidine 3 denemeli retry); kisa DB transaction icinde lease fence + parent generation kontrolu + checkpoint/artifacts INSERT + best pointer commit; verifyCheckpoint (CHECKPOINT_YOK/BLOB_EKSIK/BLOB_BOZUK/MANIFEST_PARSE_HATASI/SCHEMA_SURUM_UYUMSUZ ayrimi); CheckpointManifest (job/konum/hedef/ACL/butce/model/toolchain/generation alanlari).
2. **LeaseManager** (src/orchestration/lease-manager.ts): acquire (monoton token; ayni owner yenileme, farkli owner takeover + STALE_FENCE zemini), renew (sahiplik degistiyse LEASE_LOST), assertFence (STALE_FENCE/LEASE_EXPIRED), release; previous_owner_alive bilgi alani.
3. **RecoveryManager** (src/orchestration/recovery-manager.ts): findResumableJob (INTERRUPTED/PAUSED/RUNNING/QUEUED, en yeni); planRecovery (lease devralma; checkpoint dogrulama; kaynak fingerprint karsilastirma -> SOURCE_CHANGED + rebaseline; bozuk checkpoint -> fresh_start + acik tani).
4. **Testler** durability.test.ts (15): lease ilk/devralma/monoton token/stale fence/LEASE_LOST; checkpoint publish/blob dogrulama/stale fence red/parent generation cakismasi/BLOB_EKSIK/best pointer; recovery (yarim is bulma, checkpoint'li resume, SOURCE_CHANGED rebaseline, owner fence devralma).

## Onemli bulgular

- checkpoints.manifest_artifact_id FK'si artifacts.id'ye bagli; sha256 yerine artifact UUID'si gonderilmeliydi (BLOB_BOZUK kontrolu artik artifacts.sha256 JOIN ile yapiliyor).
- checkpoints INSERT artifacts INSERT'ten once gelmeli (FK sirasi).
- Lease acquire farkli owner + aktif lease durumunda takeover yapar; eski token fence kontrolunde reddedilir (AC49 kaniti).
- Vitest'te lease TTL=50ms ile bekleme gerektiren senaryo guvenilmez; takeover tabanli test yazildi.

## Test sonucu

- typecheck: TEMIZ
- TypeScript test: 11 dosya, **126/126 PASSED**
  - durability.test.ts (15): AC45 (kesinti sonrasi yarim is + resume), AC47 (atomic publish, partial yok), AC48 (owner devralma, duplicate fence), AC49 (stale fence red), AC51 hazirligi (SOURCE_CHANGED rebaseline)
  - P01-P05 testleri 111/111 yerinde

## Kabul durumu guncelleme

- AC45/AC47/AC48/AC49 kanitli (unit; DB + dosya sistemi seviyesi).
- AC51 kismen: SOURCE_CHANGED rebaseline akisi kanitli.
- AC46 (Maven/JVM kill ve resume) process seviyesi fault testleri P06+ devam.
- AC52 (disk dolu/DB busy) fault testleri devam.

## Dogrulanmamis alanlar / sonraki adim

- AC46/AC52 tam fault injection: gercek process kill noktalari (analiz/generation/test sirasinda), disk dolu simulasyonu.
- P07: Cikti ve aktarim - HTML/JSON/JaCoCo/diff rapor uretimi, artifact export verification, review/onay/apply journal (test_apply).

## Devam noktasi

- Commit sonrasi P07'ye basla: Offline Report Generator (render DB'den), report.json/manifest.json, changes.patch, test_apply akisi.
