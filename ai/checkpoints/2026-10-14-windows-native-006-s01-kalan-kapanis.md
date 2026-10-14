# AITE-006 S01 kalan madde kapanis checkpoint'i

- Tarih 2026-10-14. Koordinator dali `codex/windows-native-006`, HEAD `e318e86` (taban `ce40794`).
- Onceki rapor: `ai/checkpoints/2026-10-14-windows-native-006-s01-test-limitasyon-raporu.md` (commit `4a9fcd9`).

## Bu dongude kapatilan maddeler

1. Ara parent kimlik gecmisi (commit `ccba7e0`): `scripts/probe-restore-renamed-parent.mjs`. Gercek Windows PREPARED N=2 kesitinde parent dizini rename edildi; journal kimligi yeni ad altinda korundu (`renamedParentIdentityPreserved`), ayni adli yeni dizin farkli FileId tasidigindan stale-parent GUARD_ITEM exit 2 ile fail-closed; owned blob renamed parent altinda korundu, replacement dizin bos, old DB+WAL bayt-ayni, journal PREPARED, startup bloke. Exit 0.
2. Gercek OS ENOSPC/Flush yazma hatasi yolu (commit `e318e86`): `scripts/probe-restore-enospc.mjs`. Iki duzende kanit: restore seviyesinde stale occupant guard exit 2, owned identity `.saved` adi altinda korundu; owned stage fixture'inda fault helper ile gercek WriteFile basarisizlik yolu (`PARTIAL_FAILURE\t1048576`) fail-closed status 2, delete-on-close pending alias'i sildi. Fault fixture EXE kaynak/binary SHA dogrulandi. Exit 0. Gercek FlushFileBuffers EIO / disk-dolu surucu seviyesi enjeksiyonu yine acik; bu kosular yazma-basarisizlik yolunu kapatir, surucu hatasini degil.
3. Terminal kesitleri guncel HEAD ile yeniden dogrulandi: `partial` (blocked=true, yarim JSONL parse reddi), `flush-fail` (exit 0, `redConfirmed:true`, `durableSealObserved:false` - test-only gorunurluk tanisi), `ack` (old-open, stdout EOF/no ACK). Uc kesit de exit 0.
4. Fresh hedef: `probe-restore-fresh-hardkill.mjs` 5/5 PASS (ready/moved-unreceipted/moved-receipted/verify-ready/committed-guarded); `probe-restore-fresh-native.mjs --expect-blocked` KNOWN_BLOCK (uretim fresh restore `WINDOWS_RESTORE_FRESH_TARGET_UNSUPPORTED` ile mutasyon oncesi duruyor; bilinclli engel).
5. Orphan/GC ailesi guncel HEAD ile exit 0: `probe-gc-pinned-delete` (pinli delete, replacement korunur), `probe-gc-nested-path-swap` (RED_CONFIRMED: bilinen acik, absolute unlink alias gap), `probe-gc-delete-open-reader` (open reader olcumu), `probe-gc-delete-hardkill` (disposition iki yani), `probe-restore-blob-owned-swap` (root swap copy=true/publish=false), `probe-restore-blob-verify-swap` (RED path/hash kabul, GREEN native FileId reddi), `probe-restore-blob-terminal-gap` (RED: SEALED sonrasi handle birakma; GREEN: native COMMIT oncesi nonterminal; GREEN: pinli ancestor swap reddi), `probe-restore-partial-write` (5 kesit), `probe-restore-hardkill --native` (15 journal kesiti; PREPARED..VERIFIED startup blocked, COMMITTED new generation acilir, raw owner DB/WAL/SHM unchanged), `probe-restore-root-alias` (RED_CONFIRMED: TS blob path replacement yazar; bilinen acik), `probe-restore-stage-hardkill` (3 kesit), `probe-restore-fresh-session` (READY/no-replace/identity/verify/recovery rollback).

## Test kanitlari (gercek Windows, guncel HEAD e318e86)

- S01 odak secimi 120s genel timeout: 54/55 PASS; yalniz `fin11` "backup DB snapshot + blob manifest" kendi inline 60s timeout'uyla timeout. Ayni dosya tekil kosu 7/7 PASS exit 0 (iki kez dogrulandi). Paralel kosu yuku kaynakli timeout; kod kusuru kanitlanmadi.
- `npm.cmd run typecheck` exit 0; `npm.cmd run lint` exit 0 (0 error, 89 warning); `npm.cmd run build` exit 0 (290 dosya, tree digest `c977f389d0779a1b`); `node scripts/release-verify.mjs --local` exit 0 `LOCAL_PASS` (source commit `e318e86`, scope `windows-native-v1`).

## Kalan aciklar

- `probe-gc-nested-path-swap` RED_CONFIRMED ve `probe-restore-root-alias` RED_CONFIRMED: bilinen tamir edilmemis RED kesitleri; bir sonraki paket dali.
- Gercek FlushFileBuffers EIO / disk-dolu surucu seviyesi enjeksiyonu: yetenek siniri, fixture/fault-injection gerektirir.
- 8192 cap derin-kok bilinen siniri: fail-closed yonde guvenli; derin koklu N=2 kurtarma tamamlanamaz.
- N=2 uretim terminal/ACK uzlasmasi: tasarim karari acik; uretim N=2 terminal/auto-open kapali.

## Durum

- S01 VERIFIED degil: odak paket paralel kosuda 1 timeout (tekil PASS) ve iki bilinen RED kesiti acik. S02/S03 NO_GO, S04 yalniz salt-okunur tasarim. G1/G2/G3, customer ve full gate NO_GO.
- Calisma agaci commit/push yapilmadan birakildi: HEAD `e318e86`, working tree temiz; push kullanici karari.
