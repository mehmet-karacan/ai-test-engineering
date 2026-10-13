# 006 native bridge entegrasyon ara kaydi

- Tarih: 2026-10-13. Koordinator dalinda S03 native dosya oturumu `23cab61` ve S02 kalici surec kaydi `cdd223e` merge edildi. Build, her iki native yardimcinin kaynak/binary manifest SHA denetimini calistiriyor. HEAD `0632495`.
- Birlesik dalda `npm.cmd run build` PASS; Windows dosya bridge testi 1 dosya/13 PASS; native process/resume odak testi 6 dosya/38 PASS. `node scripts/release-verify.mjs --local` LOCAL_PASS, `run_manifest.present=false`, `full_acceptance_pending=true`.
- S03 helper READY/MOVE/VERIFY/CLOSE boyunca DB ve mevcut WAL/SHM dosyalarini handle ile tutuyor; ara CLOSE basari degil, yeni DB SQLite readonly kontrolu icin no-gap read guard gecisi var. Bu sadece native protokol dilimidir; restore journal entegrasyonu ve WN11-13 kaniti S01 dalinda devam ediyor.
- S02 normal dispatcher sentetik Maven fixture'inda owned frozen baseline'a yoneliyor ve kaynak checkout byte digest'i korunuyor. Gercek customer readiness `NATIVE_PROCESS_OWNERSHIP_UNVERIFIED` ile kapali. Frozen workspace'e bagli toolchain pin/compare ve gercek Surefire raporlu sentetik baseline sonraki dilimdir.
- S01 adapter/native fixture calisiyor, lifecycle/journal baglantisi ve hard-kill kesitlerinin yeniden kaniti bekleniyor. Fresh hedefte oldDb olmamasi native oturumca fail-closed; destek karari ve WN kapsami acik tutuluyor.
- S01/S02/S03 VERIFIED degil; full gate NO_GO. G1 gercek GPU Fusion Maven/model, G2 ozgun checkout apply, G3 yayin kapali. Ana `main` checkout'taki onceki untracked test dosyasina dokunulmadi.
