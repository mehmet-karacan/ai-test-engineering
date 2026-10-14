# AITE-006 S02 native process registry atomicity

- Tarih: 2026-10-14. Dal: `codex/windows-native-006`; musteri checkout, S03/S04 kaynaklari ve korunan Java testi degistirilmedi.
- Degisiklik: `NativeProcessRegistry.afterSpawn` ve `afterTerminal` lease ile `owned_processes` guncellemelerini tek SQLite transaction icine alir. Her iki tabloda da tam bir satir guncellenmediginde typed `NATIVE_PROCESS_UNRESOLVED` hatasi verilir; ilk guncelleme commit edilmeden rollback olur.
- RED nedeni: owned process UPDATE tetikleyiciyle reddedildiginde lease process_identity eski degeriyle kalmiyor, yeni owner icin yanlis acik fence olusabiliyordu.
- Kanit: `tests/unit/wn-native-registry.test.ts` 8/8 PASS; yeni testler spawn transition ve terminal close rollback'ini, lease ve owned kaydinin birlikte eski durumda kaldigini denetler. `npm.cmd run typecheck` exit 0; hedef ESLint exit 0; `git diff --check` temiz.
- Genis S02 suite'inde `tests/unit/wn-process-supervisor.test.ts` ampersand senaryosu timeout verdi; tekil `-t "passes ampersand"` kosusu 1/1 PASS oldu. Bu supervisor fixture kararsizligi bu registry degisikligiyle iliskilendirilmedi.
- Kalan S02 boslugu: WN14-WN24 customer readiness kapisi, WN19 tam native settings gizlilik zinciri, WN22/WN23 customer end-to-end ve WN21 fiziksel orphan blob GC kaniti acik kalir.
