# S01 terminal gunluk / native guard sirasi

- Tarih: 2026-10-13; dal: `codex/windows-native-006-s01`.
- `COMMITTED` kaydi artik native VERIFY read guard canliyken fsync edilir; sonra CLOSE yapilir. CLOSE ACK belirsizse terminal COMMITTED generation'a geri alma uygulanmaz ve API `RESTORE_COMMITTED_CLOSE_UNCERTAIN` verir.
- Normal hata geri almasinda native ters MOVE'lar bitince `ROLLED_BACK` native guard canliyken fsync edilir; sonra CLOSE yapilir. Hata sonucu eski generation kalir.
- Gercek Windows `taskkill /F` fixture'i: COMMITTED fsync aninda ayri raw better-sqlite3 INSERT, onceki CLOSE->fsync sirasinda basarili oldu (RED). Yeni sirada reddedildi; yeni `artifacts.new` acildi. Ayrica bilerek yayinlanmis blob okuma hatasi ile rollback tetiklendi: ROLLED_BACK fsync aninda ayni raw writer onceki sirada basariliydi (RED), yeni sirada reddedildi; eski `test_jobs.old` acildi. Her iki probe exit 0. Hedef disinda fixture yolu kullanilmadi.
- Odak native restore/recovery testleri 2 dosya/7 PASS; typecheck, build, lint exit 0 (89 eski warning). Terminal CLOSE ACK belirsizligi icin fault injection ve tum 15 kesitin yeni sirayla tekrar kosusu sonraki dogrulamadir.
- Bu siralama normal restore cagrilarinda nativeHelper opsiyonel olmasini veya `Storage` startup worker lock->SQLite handle acilisi arasindaki dis-yazar araligini kapatmaz. WN11/12/13 ve S01 VERIFIED halen NO_GO; G1/G2/G3 kapali.
