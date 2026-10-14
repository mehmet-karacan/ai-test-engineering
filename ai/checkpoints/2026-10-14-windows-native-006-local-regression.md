# 006 yerel regresyon ve native tek isci kaniti

- 2026-10-14 Windows worktree'de paralel tam suite yuku ayrica tek isci kosularla ayrildi.
- S03-S07 local suite: 19 dosya / 92 PASS.
- S02 native Job Object + install manifest: 2 dosya / 10 PASS.
- S02 native runner/process supervisor/file bridge/copy snapshot: 5 dosya / 76 PASS.
- S01/P08 backup authority, upgrade/restore, stale WAL: 4 dosya / 26 PASS.
- `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint -- --quiet` ve `git diff --check` PASS.
- Full suite paralel sonucu 118 dosya / 883 PASS / 37 FAIL / 30 SKIP idi; tek isci native gruplar temiz geciyor. OpenCode gercek server/pilot fixture'i ve kullanici modeli kaniti bu worktree'de yoktur.

## Kalan gercek kapilar

- Customer native runner ownership ve complete installed Maven/JDK manifesti uretim gate'inde fail-closed kalir.
- S08 G1/G2 ve live GPU Fusion modeli/apply islemi baslatilmadi.
- S09 391-ID evidence manifesti, full pilot/platform kaniti ve final review yoktur; full gate NO_GO dogrudur.
