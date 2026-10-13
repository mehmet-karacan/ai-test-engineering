# S02 WN21 basarisiz baseline kesinti kaniti - customer gate kapali

- Bagimsiz review P1: baseline FAILED/UNSTABLE/NO_TESTS erken return, mevcut `writeTestRunProvenance` noktasindan onceydi. Gercek run sonucu olan basarisiz baseline'in bounded log kaybi DB'de gorunmuyordu.
- RED gercek Windows sentetik host_dev_only fixture: `mvn.cmd` 9 MiB stdout yazip exit 7 dondu; job `BASELINE_FAILED` oldu, `test_run_provenance` satiri bulunmadi. Bu fixture yalniz test composition'dir; customer Maven/model calistirilmadi.
- GREEN: basarisiz baseline'in gercek run/zaman kaniti varsa erken return oncesinde run provenance ve WN21 pinned truncation artifact'i yazilir. Run yapilmayan `NO_TESTS` icin sentetik kanit uretilmez. Lease/fence kontrolu korunur; artifact yazma hatasi sessiz `BASELINE_FAILED` donusune indirgenmez.
- Ayni fixture exit 7, diskte 8 MiB stdout log, run id ve artifact JSON'da 1 MiB ham dusen byte + `BYTE_BUDGET_EXCEEDED` dogruladi. Timeout/cancel/spawn-error exception yolu ve ayni pin altinda coklu celiskili artifact P2 ayridir. Orphan blob GC, WN14/15/18 ve customer readiness NO_GO kalir.
