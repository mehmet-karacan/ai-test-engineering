# GPU Fusion baseline handoff

GPU Fusion icin yerel genel JaCoCo akisi denendi. Exact Maven root `C:/innova/projeler/gpu-fusion/gpu-backend` ve JDK21/Maven3.9.16 profili kullanildi. Ust checkout'in dirty/untracked dosyalari korunarak owned runtime workspace kullanildi.

Ilk snapshot blocker'i 372009724 baytlik `logs/archived` logu idi. `SourceSnapshot` icinde `logs` runtime dizini ignore edildi; discovery testi 24/24, typecheck/build PASS. Sonraki gercek job `f98c90f4-ab7e-4409-8012-1856269c82b4` native preflight'i ve derlemeyi gecti ancak baseline testleri 635/3 failure/0 error/11 skipped ile durdu.

Failure'lar `GpuReportDuplicateControllerTest` icinde 409/400 yerine 200 donmesi ve regeneration service cagrisinin beklenmedik olmasidir. JaCoCo coverage, dusuk sinif onerisi ve model kosusu yoktur. Bu sonucu bypass etmek icin testler skip edilmedi.

Kaynak kimligi ve POM SHA kosu oncesi/sonrasi aynidir. Sky bu oturumda duraklatildi ve yeniden kosulmadi. Sonraki yetkili adim GPU checkout'inin sahibi tarafindan bu uc mevcut test failure'ini duzeltmek, sonra ayni job akisini yeni source snapshot ile tekrar calistirmaktir.
