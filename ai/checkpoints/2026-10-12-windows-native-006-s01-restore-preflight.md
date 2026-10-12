# Checkpoint - 006 S01 restore preflight ve senkron rollback (partial)

- Tarih: 2026-10-12 (Europe/Istanbul)
- Dal: `codex/windows-native-006-s01`; baslangic P08 patch commit `0eed065`.
- G0 urun gelistirme acik. G1 gercek GPU Maven/model, G2 original checkout apply ve G3 yayin onayi verilmedi; bunlar calistirilmadi.

## Kirmizi -> yesil kanit

- GLM'nin gercek Windows/better-sqlite3 fixture'i, farkli baytli mevcut blob icin EEXIST benzeri hatada aktif DB'nin degistigini yakaladi: 1 FAIL, beklenen hash assertion.
- Koordinator iki ek fault senaryosu ekledi: blob staging kopyasi ENOSPC oldugunda DB byte hash'i degisiyordu; DB publish rename EACCES oldugunda hedef DB tamamen kayboluyordu. Ikisi de once RED goruldu.
- Blob hedefleri DB degismeden once cozulup hash ile kontrol ediliyor; esit hash'li hedef yeniden kullaniliyor. Butun blob staging kopyalari DB yayinindan once bitiyor. Eski DB/-wal/-shm ayni volume'de gecici adlara tasinip yeni DB yayini basarisizsa geri konuyor.
- `npm.cmd exec -- vitest run tests/integration/wn-restore-atomicity.test.ts tests/unit/p08-backup-authority.test.ts tests/unit/p08-lifecycle-escape.test.ts tests/unit/p08-restore-stale-wal.test.ts tests/unit/p08-upgrade-restore.test.ts tests/unit/fin11-lifecycle-ops.test.ts`: 6 dosya, 34 PASS. `npm.cmd run typecheck`: exit 0.

## Acik sinir

- Bu senkron hata korumasidir; durable journal, startup recovery, hard-kill her faz, open-DB/aktif job kilidi, GC pin ve symlink/junction/cross-drive preflight henuz yok. DB ve blob yayini tek bir atomik rename degildir. Crash araliginda gecici eski DB ve yeni orphan blob kalabilir. Bu nedenle S01 ve full 006 gate NO_GO; VERIFIED iddiasi yok.
- Sonraki is: journal fazlari PREPARED/BLOBS_READY/OLD_DB_PRESERVED/NEW_DB_PUBLISHED/VERIFIED/COMMITTED; startup'ta Storage acilmadan recovery, native hard-kill ve GC testleri. Bagimsiz review zorunlu.
