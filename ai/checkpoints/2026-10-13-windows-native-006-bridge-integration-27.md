# 006 native bridge entegrasyon checkpoint 27

- Tarih 2026-10-13; coordinator `codex/windows-native-006`. Checkpoint 26 `d130c45` uzerine S01 `da6d3c5` -> `1163812` cherry-pick edildi. Iki dosya: secili two-blob probe ve receipt RED checkpoint. Ana checkout `main` ve kullanici untracked Java testi korunuyor.
- Test-only partial ARM sonrasi first ve reverse second kesitlerde yeni production recover-session GUARD_READY'e ulasir. Probe, gercek journal FileId/bytes/SHA'dan uretilen gecerli ROLLED_BACK line ve `ROLLBACK_COMMIT` komutunu gonderir; helper exit2 verir. Journal byte-for-byte degismez, phase PREPARED kalir, stage identity receipt 2, move/recovery receipt yok, old DB hash ayni, startup RESTORE_RECOVERY_REQUIRED olur. Bu, journal'da disposition receipt olmadan terminal rollback yazilmamasini kanitlar.
- Bagimsiz reviewer uc secili Windows probe'u tekrar calistirdi, P1/P2 bulmadi. Kendi ajan build/provenance/node check/staged kontrollerini PASS bildirdi. Terminal fsync, ACK kaybi, absent dosyanin tarihsel sahiplik makbuzu ve 8192 valid GUARD_ITEM boundary henuz kanitlanmadi. GLM icin opencode PATH'de yoktu; GLM kullanildi iddiasi yok.
- S01 genel NO_GO: N=2 disposition receipt/terminal uzlasma, partial ARM recovery authority, WAL/SHM, foreign/alias, fresh hedef, gerçek OS ENOSPC/Flush ve GC acik. S02 immutable Maven/JDK ve ust Job disi owner_lost, S03 durable generation cursor acik. S04 migration S01 VERIFIED sonrasi.

Devam: N=2 disposition'lar icin durable receipt semasi ve terminal fsync/ACK kaybi RED/GREEN; receipt yoksa mevcut fail-closed davranis korunacak.
