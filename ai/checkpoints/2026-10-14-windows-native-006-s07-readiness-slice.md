# S07 readiness ayristirma dilimi

- Kapsam: WN65/P08 PP43 kurulum dogrulamasinda MCP handshake, model ve Maven readiness yuzeylerini birbirinden ayirmak.
- `src/configuration/readiness.ts` ortak siniflandirici olarak eklendi. Worker sonucu `worker_enabled + worker_profiles + secili OpenCode provider/model` eslesmesini, Maven sonucu Windows `mvn.cmd -v` probe'unu ayri status/reason/evidence_level ile donuyor. Secret degeri okunmuyor veya loglanmiyor.
- `scripts/install.mjs` model readiness'i handshake sonrasinda ayri raporluyor. `scripts/verify-install.mjs` config/provider/model ve native Maven/Java probe'larini ayri raporluyor; Docker durumu bu verifier'i READY yapmiyor ve Windows disinda mevcut guard korunuyor.
- `src/index.ts` readiness tiplerini disari aktariyor; `tests/unit/p08-readiness.test.ts` ve W09 contract assertion'lari eklendi.

## Kanit

- `npm.cmd exec -- vitest run tests/unit/p08-readiness.test.ts tests/unit/w09-install.test.ts --maxWorkers=1`: 2 dosya / 18 PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint -- --quiet`: PASS.
- `git diff --check`: PASS.
- Windows worktree'de `node scripts/verify-install.mjs` readiness ayri cikti: Maven `READY/CAPABILITY_PROBED`, model mevcut shell worker flag'i olmadan `NOT_READY/WORKER_DISABLED`; final exit 1, mevcut kullanici runtime DB'sinde `Migration checksum uyusmazligi: version 3` nedeniyle MCP smoke acilmadi. Bu probe config/DB dosyalarini degistirmedi.

## Sinir

- Bu dilim gercek kullanici OpenCode config'ine, runtime dizinine veya musteri checkout'una dokunmadi.
- Model `READY` sonucu yerel provider/model baglama kanitidir; canli API yetkilendirmesi degildir. Maven `READY` sonucu `-v` capability probe'udur; customer native process ownership ve tam toolchain immutable gate'i S02 kapsaminda ayri kalir.
- Gercek temiz Windows install/upgrade/restore/uninstall ve browser runtime kaniti bu dilimde calistirilmadi; mevcut browser/Maven testleri bunlari kendi runtime kapilarinda truthful olarak kosar.
