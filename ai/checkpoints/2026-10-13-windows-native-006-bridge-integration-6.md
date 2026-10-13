# 006 native bridge entegrasyon checkpoint 6

- Tarih 2026-10-13. Gorev `AITE-WINDOWS-SUBAGENT-PILOT-006` v1.0, sozlesme SHA-256 `59a08a4a2d626d9aa6cfb55faed82513964aabce45528890e7aa648afe371989`. Coordinator kod HEAD `17a3457`, `codex/windows-native-006`.
- S01 `3ca41f8` Storage startup journal check + SQLite open/pragmalarini DB owner lock altina aldi. Gercek iki surec fixture RED once lock'a izin veriyordu, GREEN `MAINTENANCE_BUSY_OR_STALE`. Constructor PRAGMA fault handle cleanup testi var. Coordinator build PASS, ilgili 2 dosya/17 PASS.
- S01 `11300bc` 15-cut native probe WAL/SHM kesitlerinde gercek SQLite WAL transaction `wal-sentinel` ve coherent DB/WAL/SHM snapshot'i kullaniyor. S01 dalinda 15/15 exit0 (14 old, COMMITTED new), WAL kesitleri sentinel'i acilista okuyor. Merge oncesi coordinator eski probe 15/15 exit0; merge sonrasi yeni probe coordinator'da tekrar edilecek.
- S02 `c1270e4` native lease acquisition herhangi non-null process identity'yi reddediyor; native call site'lar legacy placeholder'i artik yazmiyor. Gercek hard-kill/bozuk JSON fixture RED→GREEN, S02 dalinda 5 dosya/38 PASS. Coordinator build PASS.
- Coordinator birlesik 6 dosya/48 PASS, 1 FAIL: `wn-job-object` parent hard-kill sonrasi owned child 120×25ms sonunda hala alive. Ayni dosya tekil tekrar 6/6 PASS. Neden ve tekrar edilebilirlik arastiriliyor; birlesik gate PASS denmiyor.
- Bagimsiz S02 inceleme `ai/reviews/2026-10-13-s02-native-pin-log-review.md`: P2 invalid UTF-8 8 MiB ham sinirdan buyuk yazili log, P2 truncation sayac/neden kalici provenance yok. S02 duzeltme suruyor. S01 fresh native hedef `WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED`, path/GC; S03 root/manifest race, scan persistence; S04 S01 VERIFIED bagimliligi acik.
- G1 GPU Fusion Maven/model, G2 original checkout apply, G3 yayin kapali. CI kapali. Main checkout `3b1916e` ve untracked Java testi korunuyor. Full gate NO_GO.

Devam: yeni WAL 15-cut probe'u coordinator'da calistir; S02 hard-kill flaky olayi ayir ve WN21 P2'leri duzelt; S01 fresh native hedef RED→GREEN; S03/S04 bagimliliklarini koru.
