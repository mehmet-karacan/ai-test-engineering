# S01 Storage acilisinda DB owner fence

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`.
- Recovery worker basariyla eski generation'i kapattiktan sonra `Storage` terminal journal'i tekrar okur ve SQLite handle/pragmalarini DB owner lock altinda acar. Boylece ikinci restore, terminal kontrol ile SQLite open arasinda DB'yi tasiyamaz. Rakip restore lock'u once edinirse `Storage` fail-closed; tamamlanmissa guncel terminal journal lock altinda yeniden okunur.
- Gercek iki surecli Windows RED fixture: `Storage` child, worker sonrasi terminal journal okumasinda durduruldu; parent ayni DB owner lock'u edinebildi. Yeni kodda ayni noktada parent `MAINTENANCE_BUSY_OR_STALE` aldi (GREEN). Child yalniz owned Temp DB kullandi ve `taskkill /F` ile temizlendi.
- Constructor acilis PRAGMA hatasinda acilmis better-sqlite3 handle'ini kapatir. Fault fixture `journal_mode = WAL` hatasini enjekte edip `close()` cagrildigini dogrular.
- Ilgili 7 dosya/50 PASS, sonra iki dosya/17 PASS; typecheck/build/lint exit 0, 89 onceki lint warning. Full 15-cut bu degisiklik sonrasi koordinatorde tekrar kosulacak.
- Bu lock raw SQLite yazarin her zamanlamasini kontrol etmez; native helper mevcut hedefte aktif raw owner'i ayri kanitla bloklar. Fresh native hedef, gercek WAL sentinel, path/GC tamamlanmadan S01 VERIFIED degildir. G1/G2/G3 kapali.
