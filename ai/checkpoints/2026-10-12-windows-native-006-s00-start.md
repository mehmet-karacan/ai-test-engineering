# Checkpoint - AITE-WINDOWS-SUBAGENT-PILOT-006 S00 baslangic

- Tarih: 2026-10-12 (Europe/Istanbul)
- Gorev: `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`
- Aktif belge SHA-256: `59a08a4a2d626d9aa6cfb55faed82513964aabce45528890e7aa648afe371989`
- Taban: `main` / `3b1916ed6f35f0c674cc459b30ca9f5614af9b94`; calisma dali: `codex/windows-native-006` (ayri worktree)
- G0: kullanici dosyayi uygulama talimatiyla verdi; urun kodu/sentetik Windows testleri acik. G1 GPU Maven/model, G2 original checkout apply ve G3 yayin ayri karar bekler.
- Korunan kullanici dosyasi: ana checkout'taki untracked `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java`; worktree'ye tasinmadi, silinmedi, stage edilmedi.

## S00 ilerleme

- Onceki `AKTIF_GOREV.md`, `ai/tasks/archive/AITE-PRODUCTION-READINESS-005-v1.0.md` altina byte/hash korunarak kopyalandi: SHA-256 `cc741769116cee3b2cd921256406a58560b0d65ad0a476c3471bb01ac378336f`; Git blob `8906d07080f8726831dbd8e3ea54fb46c533aae6`.
- Downloads'daki 006 belgesi kok `AKTIF_GOREV.md` olarak byte-exact kopyalandi; hash yukaridaki degerle dogrulandi. WN01-WN80 metninde 80 satir, 80 tekil ID, eksik ID yok. Report06 referans SHA-256 `e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80` eslesti.
- OpenCode GLM ayri oturumda kaynak tablo auditi yapti: AC70 + RG52 + RT28 + PRO60 + N64 + PP46 = 320 eski tekil ID. Eski katalog 274 setinde PP yok, AC/RG/PRO tekil satirlari da yok. 320 kabul sonucu degil, mapping envanteridir. Ayrica GLM scope mapping implementasyonu `codex/windows-native-006-scope` dalinda; Qwen suite uzlastirmasi `codex/windows-native-006-suite` dalinda calisiyor. Her iki uygulama coordinator review/entegrasyonu bekler.
- `AGENTS.md`, durum/backlog/kabul girisleri ve ADR-006 yeni kapsam icin guncellendi; tarihsel 005 kayitlari korundu.

## Windows baslangic kaniti

| Komut / gozlem | Exit / sonuc |
| --- | --- |
| `node --version` | `v24.14.1` |
| `npm.cmd --version` | `11.11.0` |
| `npm.cmd ci` | 0; 236 paket |
| `npm.cmd run typecheck` | 0 |
| `npm.cmd run build` | 0; ilk build tree digest `a2a1aa33ccebb980c87193da9e59ccf350df6f19ce5c4959fbaddd85f613d5ea`; 192 dosya |
| `npm.cmd run lint` | 0; 0 error, 89 uyari |
| `mvn -v` | 0; Maven 3.9.16, Maven runtime Java 25.0.3 |
| `java -version` | 0; PATH Java 21.0.11 (Maven runtime ile fark var, S02/S06 toolchain identity icin onemli) |
| `opencode --version` | 0; v2.0.27 |
| `npm.cmd exec -- vitest run tests/unit tests/contract tests/benchmark` | 1; 58 dosya, 582 PASS / 2 FAIL; private log SHA-256 `b84a12de09358b318823a58d0acc389cedf031e590c4c750d395beb36f427ea1` |
| `node scripts/release-verify.mjs --local` (eski gate) | 0 LOCAL_PASS; 006 full kabul degil |
| `node scripts/release-verify.mjs` (eski gate) | 1 NO_GO; `EVIDENCE_MANIFEST_EKSIK`, 274/274 missing; private log SHA-256 `4648815d8d147e87d4f47db78ac6ce304558319a912ecd61e2c5e0f86135f80b` |

Guvenli baseline logu `%LOCALAPPDATA%\Temp\aitest-006-s00\baseline-safe-vitest.log` altindadir; ham log public repo'ya eklenmedi. Iki basarisiz test: `tests/unit/p01-release-gate.test.ts` icindeki "katalog ve aktif gorev pause ayrisimini tasir" ve `tests/unit/w10-ledger.test.ts` icindeki "N60: catalog pilot pause kaydi". Ikisi de yeni 006 aktif belgesinde eski 005'in birebir `PAUSED_BY_USER` metnini ariyor; tarihsel kontrol yeni arsive yoneltilmeli. Qwen bu dar test uzlastirmasini ele aliyor. Testleri gecmis gibi sayma.

Tam `npm.cmd test` henuz calistirilmadi: suite manifestinde gercek Docker, Maven, browser ve OpenCode server kosulari var. S00 mapping/aktif suite karari olmadan pilot/dis bagimli testleri topluca baslatmama siniri korundu.

## Devam

1. GLM scope mapping ve Qwen suite degisikliklerini ayri commit/diff/test kanitiyla incele; birbirlerinin nihai reviewer'i olmalarini sagla.
2. Coordinator `ai/acceptance/catalog.json` ve yeni scope gate kayitlarini tek yazar olarak uzlastirsin; S00 negatif mapping testlerini ve baseline'i yeniden calistirsin.
3. S00 kapanis kanitindan sonra S01/S02 bagimlilik ve dosya sahipligini ayir. GPU Fusion G1 oncesi yalniz salt okunur envanter icin ele alinabilir.

Karar: S00 IN_PROGRESS; 006 full karar NO_GO; G1/G2/G3 verilmedi.
