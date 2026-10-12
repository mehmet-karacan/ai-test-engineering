# Checkpoint - AITE-PRODUCTION-READINESS-005 Qwen P09/P10 (qwen-prod005-next)

## Kimlik

- Tarih: 2026-10-12
- Paket: P09 (tam regresyon + release verifier reconciliation) / P10 (teknik devir - partial)
- Branch: `codex/qwen-prod005-next` (taban `ed52a76` = `gorev: coordinator final durum ve kapanis kanitlari`)
- Kullanici dosyasi: `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` - bu worktree'de untracked degil (repoda stage edilmedi, dokunulmadi). `ai/PROJECT_STATE.md`, `ai/BACKLOG.md`, `ai/ACCEPTANCE_MATRIX.md` ve `ai/handoffs/` DOSYALARINA DOKUNULMADI; yalniz bu checkpoint eklendi.

## Oda ve kapsam

GLM baska worktree'de P07/P08 calisiyor. Bu oturum P09/P10 oda: release verifier'in local/full ayrimi, evidence manifest schema/provenance/digest ve fail-closed negatif kapilar. Mevcut uygulanabilir eksikler gercek testlerle duzeltildi.

## Uygulanan duzeltmeler (PR01/PP01-PP03/P09)

Release verifier (`scripts/release-verify.mjs`) ve evidence manifest sozlesmesinde 4 gercek, uygulanabilir kusur bulundu ve kapatildi:

1. **dist freshness mtime yerine digest (PR01 "Dosya mtime'i tek basina provenance degildir")**
   - Yeni `scripts/write-build-stamp.mjs` -> `dist/build-stamp.json` uretir (tree_digest + build_input_digest + lockfile_sha256 + dist artifact hash/bytes + source_commit). `package.json` `build` scripti `tsc && node scripts/write-build-stamp.mjs` oldu.
   - `release-verify.mjs` eski mtime tabanli `checkDistNotStale` yerine `checkBuildStamp` kullanir: stamp yoksa/parse hatasi/stale (tree/build-input/lockfile/dist-hash uyusmazligi) ise local ve full gate non-zero.
   - Full gate'te dagitilacak build zinciri kanitlanir: manifest dist hash == disk dist (mevcut) + disk dist == stamp dist + stamp kaynak kimligi == identity + identity == manifest source. Yeni kodlar: `EVIDENCE_BUILD_STAMP_EKSIK/PARSE`, `EVIDENCE_DIST_TREE_UYUSMAZ`, `EVIDENCE_DIST_BUILD_INPUT_UYUSMAZ`, `EVIDENCE_DIST_LOCKFILE_UYUSMAZ`, `EVIDENCE_DIST_STAMP_UYUSMAZ`.
   - `--print-identity` cikti `build_stamp` + `build_stamp_path` alaniyla genisletildi (manifest uretimi icin).

2. **Tanimli evidence level kumesi catalog'dan turetilir (drift giderilir)**
   - Eski elle `KNOWN_EVIDENCE_LEVELS` listesi catalog'dan yoktu (SECURITY, PERFORMANCE, VISUAL_REVIEW); N46/N50/N52/N53/N55 catalog seviyeleri `EVIDENCE_SEVIYE_GECERSIZ` ile reddediliyordu.
   - `catalogKnownLevels(catalog)`: catalog `evidence_levels` birlesimi + PLATFORM. `validateEvidenceEntry` bu kumeyle dogrular; `scope.evidence_levels` + `evidence_levels_source` makine-okunur sonuca yazilir.

3. **run.exit_code fail-closed (PP03)**
   - Kabul run'i `exit_code !== 0` ise kanit sayilmaz: `EVIDENCE_RUN_EXIT_SIFIR_DEGIL`. `exit_code` yoksa `EVIDENCE_RUN_EXIT_EKSIK`. (Onceki davranis: run.exit_code yalniz gosterim, 1 ile bile full gate geciyordu.)

4. **Kabul ledger'i (ai/acceptance) kaynak kimligina girer; manifest dairesel referans yapmaz**
   - `TREE_DIGEST_DIRS` artik `ai/acceptance` icerir: catalog/kanit ozetlerine dokunmak kayitli tree digest'i bozar (PP03). `evidence-manifest.json` tree digest'e GIRMEZ (dairesel referans); HEAD agaci + clean tree kuraliyla baglanti kurulur.

Ortak digest cekirdegi `scripts/release-digest.mjs`'e tasindi; `release-verify.mjs` ve `write-build-stamp.mjs` AYNI modulu kullaniyor (iki arac arasinda drift olusamaz). `BUILD_INPUT_FILES`'a `scripts/release-digest.mjs` + `scripts/write-build-stamp.mjs` eklendi.

## Degisen / yeni dosyalar

- Degisen: `scripts/release-verify.mjs` (build stamp provenance, catalog-turekli seviyeler, run.exit fail-closed, ledger tree digest, ortak modul)
- Degisen: `tests/unit/p01-release-gate.test.ts` (gercek repo kopyasi harness; 40 test; P09 negatif kapilari + GO pozitif kontrol)
- Degisen: `package.json` (`build` scripti `tsc && node scripts/write-build-stamp.mjs`)
- Yeni: `scripts/release-digest.mjs` (ortak kaynak/build kimligi digerleri)
- Yeni: `scripts/write-build-stamp.mjs` (dist/build-stamp.json uretici)
- Yeni (build cikti, gitignore'de `dist/`): `dist/build-stamp.json` (commit'e girmez)

## Kanit (gercek kosu; Windows CMD + npm.cmd)

- `npm.cmd ci`: 236 paket, 0 vulnerability.
- `npm.cmd run typecheck` (tsc --noEmit): exit 0.
- `npm.cmd run build` (tsc && write-build-stamp): exit 0; `dist/build-stamp.json` yazildi (tree_digest `03f680f3b84f346a...`, 188 dosya, 2 dist artifact).
- `npm.cmd run lint`: exit 0; 0 error, 89 warning (hepsi mevcut).
- `node scripts/release-verify.mjs --local`: exit 0, `LOCAL_PASS` (full kabul bekliyor; production onayi DEGIL).
- `node scripts/release-verify.mjs` (bare FULL): exit 1, `NO_GO`; tek neden `EVIDENCE_MANIFEST_EKSIK`; 274 zorunlu obligation 0 dogrulanmis. YAPISAL kontrollerin tamamindan (build stamp dahil) gecildi.
- `node scripts/release-verify.mjs --print-identity`: exit 0; kaynak/build kimligi + build stamp uyumlu (source_commit `ed52a76...`, tree_digest `03f680f3...`, build_stamp ayni tree/build-input/lockfile).
- `npm.cmd test -- tests/unit/p01-release-gate.test.ts`: exit 0; **1 dosya, 40/40 PASS** (15 mevcut + 25 yeni: build stamp provenance negatifleri, run.exit fail-closed, catalog seviye turetimi, ledger tree digest, dairesel-referans yoklugu, 274-id GO pozitif kontrolu).
- `npm.cmd test -- --run` (tam suite): 72 dosya, **638 PASS, 2 FAIL** (304.77 sn). 2 FAIL `tests/security/pilot.test.ts` (AC67, canli model pilotu): `tmp/pilot-stdout.txt` (gitignored yerel pilot calisma urunu, main checkout'ta mevcut, bu taze worktree'de yok) ENOENT ile okunamadi. Canli pilot `PAUSED_BY_USER`/`NOT_PASSED` oldugu icin bu artifact bu worktree'de yok; degisiklikle ilisiz, ortam kaynakli.
- Log SHA256 (repo disi): tam suite `a22581e2f46349d72fc614f48b1e01feca1d8342d5c2eb121d802f229e550138`, P01 odak `9fbc3bd4be3bb3c1c7fb14e598360a2dcdb1aea4eed7f30244b9300016f55605`, full gate `2872a29b81e6da3612ec258711f8bcb3fd5f7e2f851d2446e7433907f74ddb20`, local gate `8c1b073dc28552cce310335115338e89c6f9aee1847c8ee6ead4b03b78cdaec0`.

## Sinirlar ve kanit seviyeleri

- **Evidence manifesti YAZILMADI** (gercek kabul kaniti yok). Full gate `NO_GO` (exit 1) olarak kanitlandi; bu, fail-closed dogru davranistir. Gercek kosu kanitlari olmadan manifest uydurulmadi, full gate YES/GO yapilmadi.
- Canli pilot `PAUSED_BY_USER`/`NOT_PASSED`, platform kanitleri NOT_RUN/BLOCKED olarak korunur; full release onayi VERILMEZ.
- GO pozitif kontrolu (274 id, sentetik tutarli kimlik zinciri) YALNIZCA gate'in makine-okunur sozlesmesini/schemasini dogrular; gercek kabul iddiasi DEGIL (kopya agac uzerinde sentetik tutarli zincir, live pilot/platform uydurulmaz).
- Gercek customer dispatcher COMPLETED/export, gercek binary surum-atlayi upgrade/rollback, Linux/macOS platform kanitleri: NOT_RUN/BLOCKED (P07-B/P08, baska worktree/ortam).
- Secret/ic adres repo'ya konulmadi; secret taramasi (release envanteri) mevcut kaldirildi.

## Kalan / sonraki somut is

- P07-B customer dispatcher COMPLETED + Report06 export (Docker egress enforcement mekanizmasi gerektirir; yoksa typed blocker) - P07/P08 worktree.
- P08 gercek binary surum-atlayi upgrade/rollback e2e + macOS - P08 worktree.
- P10 full handoff + release karari: ancak gercek kabul evidence manifesti (canli pilot kullanici onayi + platform kanitleri) hazir oldugunda. Kanit yoksa NO_GO korunur.
- Canli pilot/benchmark yalniz kullanici acik onayi ile ayri kosuda acilir; bu gorev kendiliginden baslatmaz.

## Sonraki somut adim

GLM P07/P08 bitince: (1) bu branch'teki release verifier + build stamp degisiklikleri ana dala birlestirilir; (2) gercek Docker egress + canli pilot kanitlari alindiktan sonra `ai/acceptance/evidence-manifest.json` gercek kosu kanitlariyla uretilir ve `node scripts/release-verify.mjs` (bare FULL) GO/NO_GO yeniden degerlendirilir. Kanit eksik oldugu surece full gate NO_GO.
