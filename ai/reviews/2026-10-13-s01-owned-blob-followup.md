# S01 WN13 blob rollback ve verify takip incelemesi

- Tarih 2026-10-13. Salt okunur subagent review; commit `ad9e713`. Reviewer kodu okudu, dosya degistirmedi. Coordinator merge sonrasi build PASS (270 source), blob/bridge/restore 3 dosya/30 PASS, journal/recovery 4 dosya/34 PASS, local release gate LOCAL_PASS (source dirty=false).
- Onceki erken `ROLLED_BACK` P1 dar anlamda kapandi: `cleanupOwnedBlobs` captured FileId silmesini terminal fsync oncesi yapar; delete fail nonterminal journal/startup blocker verir. Native path mkdir mutasyonu kaldirildi; root onceden mevcut olmalidir.
- Skip ve final verify ayni FileId'yi iki ayri helper oturumunda dogrular. Kalan P1: `src/storage/lifecycle-ops.ts:736-746` final verify helper'i kapandiktan sonra `:756` COMMITTED fsync'e kadar blob/ancestor handle'i tutulmuyor. Bu aralikta nested `blobs` dizini farkli baytli replacement ile degistirilirse artifact root FileId sabit kalir ve DB yanlis generation'a referansla COMMITTED olabilir. Kontrollu verify→COMMITTED swap RED fixture'i ve terminal fsync'e dek pinli oturum gerekir.
- Stage CREATE_NEW→OK kill orphan'i ve kalici blob sahiplik receipt'i acik. S01 VERIFIED degil; takip ajana atandi.
