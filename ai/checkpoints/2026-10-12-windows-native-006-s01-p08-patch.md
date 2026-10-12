# Checkpoint - 006 S01 P08 patch native on kontrol

- Gorev: AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0; aktif belge SHA-256 `59a08a4a2d626d9aa6cfb55faed82513964aabce45528890e7aa648afe371989`.
- Urun dali: `codex/windows-native-006`; uygulama worktree dali `codex/windows-native-006-s01`, patch ara commit'i `0eed065`. Bu commit coordinator dalina henuz alinmadi. Ana checkout ve korunan untracked Java testi degismedi.
- G0 acik; G1/G2/G3 verilmedi. Gercek GPU Fusion/Maven/model calistirilmadi.

## P08 gercek Windows/Vitest kaniti

- Private girdi patch SHA-256 `7cdf39c38da7046cf51122785b1830ea169e9c57b22f07e1714b15fb3160d68c`; kaynak `src/storage/lifecycle-ops.ts` ilk blob'u `5f81be7a696516f48d1de0ef8c34c9dc32be1bfc`; `git apply --check --whitespace=error-all` exit 0.
- Patch'in yeni `p08-backup-authority.test.ts` testi once eski kodda gercek Windows/Node 24/better-sqlite3/Vitest ile kosuldu: 18 testten 4 PASS, 14 FAIL. Bu, eski Linux/Node22 adapter 5/19 sonucunun kopyasi degildir.
- Patch'in uc hedef dosyasi uygulandi; her dosyanin SHA-256'si private kanit ZIP'indeki `work/` baytlariyla eslesti. `p08-backup-authority`, `p08-lifecycle-escape`, `p08-restore-stale-wal`, `p08-upgrade-restore`, `fin11-lifecycle-ops` odak suite'i 5 dosya/31 PASS, exit 0. Typecheck/build/lint exit 0; lint 89 baseline uyari.
- Patch yalniz backup snapshot authority, manifest/marker ve FK/integrity dogrulamasi icindir. Restore'un DB'yi blob kopyasindan once yayinlama kusuru bu committe acik kalir; S01 VERIFIED degildir.
- Duzeltme ve kanit ZIP'i private temp'te tutuldu, repo/public'e eklenmedi. Salt okunur ajan oturumunun yanlislikla degistirdigi temp patch kopyasi orijinal ZIP baytlariyla geri yuklendi; paketteki yedi dosya yeniden manifestle eslesti.

## Devam

GLM, ayni S01 worktree'sinde EEXIST kirmizi testiyle hata atomik restore, journal/recovery, maintenance, GC ve gercek child-process hard-kill sinirlarini uyguluyor. Qwen ayri S02 worktree'sinde Windows native toolchain/process cekirdegini hazirliyor. Her iki diff coordinator tarafindan incelenmeden ve bagimsiz review/test olmadan ana urun dalina alinmaz. S01 WN05-WN13 kaniti ve tam Windows suite henuz yok; full gate NO_GO.
