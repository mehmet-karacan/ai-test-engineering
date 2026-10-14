# 2026-10-14 Windows Native 006 Coordinator Integration

## Yapilanlar

- `file_inventory` satirlarina native identity makbuzlari eklendi: volume serial, FileId, link count ve bytes.
- Migration v9 mevcut v8 DB'lerini fail-closed checksum zinciriyle yukseltiyor; metadata-only scan'de alanlar nullable kaliyor.
- Inventory page retry ayni FileId makbuzunu zorunlu olarak eslestiriyor.
- Rename/delete reconciliation tombstone'a onceki satirin native identity alanlarini kopyaliyor.
- Inventory digest native identity alanlarini kapsiyor; identity degisimi sessizce ayni scan sayilmiyor.
- S03 persistence regression testi eklenerek row, retry ve tombstone makbuzlari dogrulandi.
- AgentTask parent/dependency referanslari create asamasinda ayni job/project/location kimligine baglandi; bilinmeyen veya foreign referans fail-closed reddediliyor.

## Kanit

- `npm.cmd run typecheck`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run lint -- --quiet`: PASS
- `git diff --check`: PASS
- `tests/unit/s04-inventory-persistence.test.ts`: PASS (identity row/retry/tombstone dahil)
- `tests/unit/fin03-relations.test.ts`, `tests/unit/storage.test.ts`: PASS (schema v9)
- `tests/unit/p08-skip-upgrade.test.ts --testTimeout=90000`: PASS (3/3; Windows restore testi tek basina 29.6 s)
- S03 service/inventory: 2 dosya, 13/13 PASS
- S04 task + S05 orchestration: 2 dosya, 12/12 PASS

## Aciklar

- WN25-WN31 tam Windows runtime matrisi ve S03 bounded context kaniti halen acik.
- S04 checkpoint/recovery ve JobDispatcher -> durable AgentTaskScheduler wiring tamamlanmadi.
- S05-S07 icin kod dilimleri var; full runtime OpenCode, Maven, report/browser ve clean install kaniti yok.
- S08 G1/G2 kullanici kapilari ve gercek `gpu-fusion` checkout'u bu checkpoint'te calistirilmadi.
- S09 full evidence manifesti hazir degil; `release-verify --local` yerel kapidir, full gate degildir.

## Devam noktasi

1. S05 dispatcher wiring veya S07 clean-install lifecycle icin izole kod/test dilimi sec.
2. Her degisiklikten sonra typecheck, ilgili suite, diff-check ve manifest durumunu guncelle.
3. G1/G2/G3 olmadan musteri checkout'una veya gercek modele yazma/Calistirma yapma.
