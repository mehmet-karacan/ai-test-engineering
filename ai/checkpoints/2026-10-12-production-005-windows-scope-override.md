# AITE-PRODUCTION-READINESS-005 Windows scope override

Tarih: 2026-10-12
Kaynak: kullanici acik talimati

## Karar

MacOS bu gorev icin kapsam disidir. MacOS makine kaniti uretilmeyecek ve macOS NOT_RUN durumu kalan is, P08 blocker'i veya release blocker'i olarak sayilmayacaktir.

Windows standard akis kapsamda kalir: CMD + Node.js + Git, kurulum/verify/uninstall, path guvenligi, upgrade/backup/restore ve OpenCode entry/runtime kanitlari.

## Etki

- P08, Windows kapsaminda RUNTIME_VERIFIED olarak izlenir.
- P07-B egress enforcement blocker'i ve P10 evidence manifest/release karari devam eder.
- Live pilot PAUSED_BY_USER olarak kalir; bu scope override canli pilotu baslatma izni degildir.
- Tarihsel checkpoint ve denetim kayitlari degistirilmez; guncel durum dosyalari bu scope kararini ustune ekler.

## Git

Bu kayit koordinasyon durumunu belgeler. Kullaniciya ait untracked Java dosyasi stage edilmez.
