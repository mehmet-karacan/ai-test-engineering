# AITE-006 S01 test ve limitasyon raporu

- Tarih 2026-10-14. Koordinator dali `codex/windows-native-006`, HEAD `056d53b` (taban `ce40794`).
- Iki duraklatilmis alt is (8192-byte gecerli ITEM boundary fixture'i ve N=2 foreign/alias fixture'i) paralel yurutuldu, iki Turkce ASCII commit ile kaydedildi (`a47488d`, `56fe9e1`), iki bagimsiz inceleme sonrasi koordinator dalina merge edildi (`056d53b`).

## Yurutulen alt isler

1. 8192-byte gecerli ITEM siniri (commit `a47488d`): `scripts/probe-restore-valid-item-boundary.mjs` ve `probe-restore-two-blob-layout.mjs`'e `--valid-item-boundary` dali. Gercek PUBLISH_1 duzeninde 27 seviyeli derin kok ile 8810 baytlik gecerli GUARD_ITEM uretildi; helper satir 609 cap kontrolu ile acknowledge'siz kapandi, exit 2 fail-closed; journal/old DB bayt-ayni, startup `RESTORE_RECOVERY_REQUIRED` ile bloke. Ayni oturumda under-cap kabul (control) ve over-cap reddin ayri kosularda olculmesi bilinen sinirdir; helper root-path ordinal tutarlilik kontrolu farkli kok string'ini reddettiginden tek oturumda under-cap+over-cap zinciri uygulanamaz. Tam 8192/8193 sinir noktasi test edilmedi; tek `line.size() <= 8192` karsilastirmasi ara aralik riski tasimiyor.
2. N=2 foreign/alias negatifleri (commit `56fe9e1`): `scripts/probe-restore-two-blob-foreign-alias.mjs`. Yabanci FileId (ayni baytlar, farkli FileId) ve hardlink alias (linkCount 2) occupant'lar ikinci GUARD_ITEM'da exit 2 ile reddedildi; old DB+WAL hash'i korundu, journal PREPARED, startup bloke.

## Bagimsiz inceleme

- Inceleme 1 (iki commit): P1 yok, P2 yok; P3 notlari oturum-ici olcek kapsami ve hardcode boolean'lar; kabul 1-4 PASSED.
- Inceleme 2 (koordinator dali N=1 kisiti): P1 yok, P2 yok; P3 notlari: 8192 cap derin koklerde gecerli ITEM'leri reddeder (fail-closed, kanitli bilinen sinir) ve moveReceipts'siz PREPARED kaydi predicate'i gecemez (muhafazakar, uretim etkisi yok). N=1 auto-open kisitinin N=2'yi fail-closed tuttugu dogrulandi; uretim N=2 terminal/auto-open etkinlestirilmedi.

## Test kanitlari (gercek Windows)

- `node scripts/probe-restore-valid-item-boundary.mjs`: exit 0 (itemBytes 8810, itemRejected, blocked) - s01 worktree'si ve merge sonrasi koordinator dalinda tekrar.
- `node scripts/probe-restore-two-blob-foreign-alias.mjs`: exit 0 (foreign+alias, secondGuardExit 2, startupBlocked) - iki konumda tekrar.
- `npm.cmd run build`: exit 0 (288 dosya; s01'de 290), tree digest `43e9199c4aaddf4c`.
- S01 odak secimi (`p08-backup-authority`, `p08-lifecycle-escape`, `p08-restore-stale-wal`, `p08-upgrade-restore`, `fin11-lifecycle-ops`, `wn-restore-atomicity`): varsayilan 30s timeout'ta 8 test timeout (2 yerine yuklu makine); 120s genel timeout'ta 54/55 PASS, yalniz `fin11` "backup DB snapshot + blob manifest" kendi inline 60s timeout'uyla timeout. Ayni dosya tekil kosu 7/7 PASS, exit 0. Sonuc: paket icinde paralel kosu yuku kaynakli timeout deseni; kod kusuru kanitlanmadi, tekil tekrar kaydi tutuldu.

## Kalan S01 aciklari

- Ara parent kimlik gecmisi: rename ile degisen parent'in geri yuklemede dogrulanmasi senaryosu; iki farkli parent altyapisi `probe-restore-two-blob-layout.mjs`'te hazir, ayri probe yok.
- Gercek OS ENOSPC/Flush: disk-dolu veya FlushFileBuffers EIO probe'u kod tabaninda yok; `--terminal-cut=flush-fail` kesiti checkpoint'te "gercek EIO degil" diye isaretli.
- 8192 cap derin-kok bilinen siniri: fail-closed yonde guvenli; derin koklu N=2 kurtarma su an tamamlanamaz.

## Durum

- S01 VERIFIED degil; S02/S03 NO_GO, S04 yalniz salt-okunur tasarim. G1/G2/G3, customer ve full gate NO_GO.
- Calisma agaci commit/push yapilmadan birakildi: HEAD `056d53b`, working tree temiz, dal origin'den 19 commit oneerde (push kullanici karari).
