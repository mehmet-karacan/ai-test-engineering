# 006 native bridge entegrasyon checkpoint 25

- Tarih 2026-10-13; coordinator `codex/windows-native-006`. Checkpoint 24 `1ed409f` uzerine S03 `3aa52bd` -> `9210fb7` cherry-pick edildi. Yalniz `tests/integration/wn-inventory.test.ts` ve RED checkpoint; urun kodu, S04 migration ve musteri checkout'u degismedi.
- Gercek Windows izole Temp fixture: pageSize 1, generation 42 ile ilk sayfa `00-a.txt`; bu dosya silindikten sonra ayni cursor ikinci sayfada `10-b.txt` yerine `20-c.txt` getiriyor. Gecici normal assertion exit1 ile RED kaydedildi. Committed `it.fails`, bug bilinirken suite'i yesil tutan tani kaydidir; herhangi bir setup/cleanup hatasini da beklenen fail sayabilir ve ileride typed `STALE_GENERATION` reddini de maskeleyebilir. Bagimsiz reviewer ayrica dist moduluyle Temp probe'da ayni omission'u gordu. Bu fixture WN28 kabul kapisi sayilmaz.
- Ajan 2 dosya/31 PASS + 1 expected fail, build PASS bildirdi. Bagimsiz inceleme yeni urun P1 bulmadi; sahte yesil riskini P2 kanit siniri olarak belirtti. Koken: her sayfada degisebilir agac yeniden taranir, cursor index eski siraya aittir. Kalici generation-scoped row seti veya typed stale-generation reject S04 data contract/owner/fence bagimliliginda. S01 VERIFIED olmadan S04 schema migration yok. WN28/29/31 NO_GO.
- Coordinator merge sonrasi `npm.cmd run build` PASS (286 source), local release gate `LOCAL_PASS`/exit0; bagimsiz reviewer'in OS Temp probe'u bu dar dilimin runtime tekraridir. Full gate/kabul calistirilmadi.
- S01 iki blob ARM RED calismasi ayri ajan dalinda suruyor. S02 immutable Maven/JDK ve ust Job disi owner_lost NO_GO. G1/G2/G3/customer/full gate ve CI kapali.

Devam: S04 baslamadan S03 fixture'i kabul PASS sayma; N=2 S01 crash uzlastirmasi kritik yol.
