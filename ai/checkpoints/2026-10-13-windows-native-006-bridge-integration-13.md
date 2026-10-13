# 006 native bridge entegrasyon checkpoint 13

- Tarih 2026-10-13; coordinator `codex/windows-native-006`, checkpoint 12 `8f399f4` uzerine S03 WN25-WN31 gap audit `1a10806` ve S02 WN14-WN24 gap audit `a2c33b7` merge edildi. Iki dilim salt okunur; coordinator merge'leri urun kodu degistirmedi. G1/G2/G3, customer Maven/model, original checkout apply ve yayin kapali; CI kapali.
- S03 `ai/checkpoints/2026-10-13-windows-native-006-s03-gap-audit.md`: WN25/26/27/30 PARTIAL; WN28/29/31 NO_GO. Mevcut cursor index tabanli, her sayfada bastan rescan; rename/delete arada duplicate/omit yapabilir. Durable generation/per-file row/tombstone/parser reuse ve model context yetkisi yok. Ajan kayitli Windows `wn-inventory`+`wn-copy-snapshot` 2 dosya/25 PASS raporladi; S04 schema ve S05 context bagimliliklari acik.
- S02 `ai/checkpoints/2026-10-13-windows-native-006-s02-acceptance-gap-audit.md`: WN16/17/21 LOCAL_VERIFIED (dar fixture), WN14/15/18/20/22/23/24 NO_GO, WN19 tam secret→model/rapor/public artifact zinciri NOT_RUN. Denetimde yeni test kosulmadi. WN20 ENOENT/fault matrisi S02 ajanina verildi; ust Job disi WN23 ve kurulum directory membership NO_GO.
- S01 `ad9e713` sonrasi verify→COMMITTED penceresi P1; pinli terminal oturum RED-GREEN S01 ajaninda. Stage orphan, kalici blob receipt, GC DB yetkisi acik. S01 VERIFIED olmadan S04 migration yok.
- Ana checkout `main` `3b1916e` ve untracked Java testi korunuyor. Full suite/full release gate PASS iddiasi yok; full gate NO_GO.

Devam: S01 terminal blob pin; S02 WN20 fault matrisi; S03 WN25/26 envanter/required hash. G1/G2/G3 acilmaz.
