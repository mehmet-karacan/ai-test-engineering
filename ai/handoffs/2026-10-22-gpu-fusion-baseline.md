# GPU Fusion baseline handoff

GPU Fusion icin yerel genel JaCoCo akisi denendi. Exact Maven root `C:/innova/projeler/gpu-fusion/gpu-backend` ve JDK21/Maven3.9.16 profili kullanildi. Ust checkout'in dirty/untracked dosyalari korunarak owned runtime workspace kullanildi.

Ilk snapshot blocker'i 372009724 baytlik `logs/archived` logu idi. `SourceSnapshot` icinde `logs` runtime dizini ignore edildi; discovery testi 24/24, typecheck/build PASS. Sonraki gercek job `f98c90f4-ab7e-4409-8012-1856269c82b4` native preflight'i ve derlemeyi gecti ancak baseline testleri 635/3 failure/0 error/11 skipped ile durdu.

Failure'lar `GpuReportDuplicateControllerTest` icinde 409/400 yerine 200 donmesi ve regeneration service cagrisinin beklenmedik olmasidir. JaCoCo coverage, dusuk sinif onerisi ve model kosusu yoktur. Bu sonucu bypass etmek icin testler skip edilmedi.

Kaynak kimligi ve POM SHA ilk job kosu oncesi/sonrasi aynidir. Owned baseline kopyasinda controller duzeltmesi ile ikinci job `e6e14f15-8be2-4a18-bff8-82082990a479` coverage analizi tamamlandi: 635/0/0/11 test sonucu, LINE %19.64, BRANCH %21.97, 921 sinif, 20 uygun öneri. Job `WAITING_INPUT`; `test_start` icin tek bir öneri sinifi secimi bekliyor.

Bu ikinci sonuc GPU customer checkout'i icin baseline PASS iddiasi degildir; controller duzeltmesi checkout'a uygulanmadi. Ilk job'un 3 failure'i ve onerilen patch customer sahibi tarafindan gozden gecirilip uygulanmadan production checkout'a yazim yoktur. Sky bu oturumda duraklatildi ve yeniden kosulmadi.
