# AITE-006 S01 dongu kapanis checkpoint'i

- Tarih 2026-10-14. Koordinator dali `codex/windows-native-006`, HEAD `219966f`.
- Onceki rapor: `ai/checkpoints/2026-10-14-windows-native-006-s01-kalan-kapanis.md` (commit `1b901fe`).

## Bu dongude kapatilan maddeler

1. GC silme kimligi (commit `645c4d1`): `src/storage/retention-gc.ts` + `tests/unit/fin12-diagnostics-gc.test.ts`. gcSweep opsiyonel `nativeHelper` parametresi; helper varsa root identity maintenance lock altinda aliniyor, aday basina silmeden hemen once `inspectWindowsPath` + `deleteWindowsOwnedFile` (root+FileId+bytes+sha256 helper icinde yeniden dogrulamali); helper'siz yol byte-ayni rmSync. fin12 22/22 PASS.
2. GC nested swap GREEN kapanis (commit `cef38d8`, `219966f`): `scripts/probe-gc-nested-path-swap.mjs`. RED tanisi korundu; yeni gercek `gcSweep` + packaged helper kesiti: fiziksel dosya swap edildiginde helper delete-owned-session revalidasyonu exit 2 ile reddediyor (`WINDOWS_OWNED_DELETE_UNCERTAIN`), replacement user data korunur, eski blob orphan kalir, DELETED marker commit'li kalir, legacy lock path recreate edilmez. Exit 0, 3x kararli.
3. `probe-restore-root-alias` RED tanisi tanimlandi (kod degisikligi yok): RED dali lifecycle-ops.ts:745'teki non-native TS-copy yolunu simule ediyor; production Windows'ta erisilemez (satir 453 native helper zorunlu). `--expect-guard` dali guncel HEAD'de PASS_GUARD (replaced root blob/DB publish oncesi reddedildi). Bilinen acik degil; non-native dal tanisi olarak dokumante.
4. Terminal kesitleri dogru bayraklarla guncel HEAD'de: `--cut=PUBLISH_1 --guard-after-cut --arm-cut=first` ile `partial` (blocked=true, yarim JSONL parse reddi), `flush-fail` (redConfirmed=true, durableSealObserved=false), `ack` (stdout EOF/no ACK). Uc kesit exit 0.
5. Probe ailesi guncel HEAD'de tamamen exit 0: gc-pinned-delete, gc-delete-open-reader, gc-delete-hardkill, gc-nested-path-swap (RED+GREEN), restore-blob-owned-swap, blob-verify-swap, blob-terminal-gap, partial-write, hardkill --native (15 journal kesiti), stage-hardkill, fresh-session, renamed-parent, enospc, fresh-hardkill, two-blob-layout, valid-item-boundary, foreign-alias, fresh-native --expect-blocked (KNOWN_BLOCK), root-alias (+ --expect-guard PASS_GUARD).

## Test kanitlari (gercek Windows, HEAD 219966f)

- Odak suite (AKTIF_GOREV komutu): 55 testten 54 PASS; yalniz fin11 "backup DB snapshot + blob manifest" kendi inline 60s timeout'uyla batch'te timeout. Ayni dosya tekil kosu 7/7 PASS exit 0 (bu dongude 3. kez dogrulandi). Paralel kosu yuku kaynakli timeout deseni; kod kusuru kanitlanmadi.
- `npm.cmd run typecheck` exit 0; `npm.cmd run lint` exit 0; `npm.cmd run build` exit 0 (290 dosya, tree digest `d219119e93c5a01d...`); `node scripts/release-verify.mjs --local` exit 0 `LOCAL_PASS` (source commit `219966f`, dirty false, reasons bos).
- Bagimsiz inceleme (cef38d8 uzerinde): P1/P2 yok; P3 notlari (olcu dali guard, DELETED assert) `219966f` ile kapatildi.

## Kalan aciklar (tasarim karari/yetenek siniri; kod gap'i degil)

- Gercek FlushFileBuffers EIO / disk-dolu surucu seviyesi enjeksiyonu: driver/admin gerektirir; yazma-basarisizlik yolu fault fixture ile kapali.
- 8192 cap derin-kok bilinen siniri: fail-closed yonde guvenli.
- N=2 uretim terminal/ACK uzlasmasi: tasarim karari acik; uretim N=2 terminal/auto-open kapali.
- Ortam notu: `aitest-wn-sealed-clone-4uoD0M` eski bootstrap kosusundan CodexSandboxUsers ACL muhurlu klon; bu dongunun fixture'i degil, ACL/admin mudahalesi belgelenmis sinir.
- Katalog WN05-WN13 isaretlemesi S02 acilis yuzeyi (`ai/acceptance/catalog.json` S02 Degistir listesi); WN kayitlari full gate'e kadar NOT_RUN kalir (S00 LOCAL_VERIFIED pratigiyle uyumlu).

## Durum

- S01 kapanis kanitlari tamam: zorunlu fail/skip yok (batch inline timeout tekil 3x PASS ile makine-yuku; iki RED kesiti kapatildi veya production-ulasilamaz olarak tanimlandi). S01 VERIFIED beyani ve katalog isaretlemesi kullanici kapanis onayi ile S02 acilisinda.
- Push kullanici karari: dal `origin/codex/windows-native-006` uzerinde ~26 commit ileride.
- S02/S03 NO_GO, S04 yalniz salt-okunur tasarim; G1/G2/G3, customer ve full gate NO_GO.
