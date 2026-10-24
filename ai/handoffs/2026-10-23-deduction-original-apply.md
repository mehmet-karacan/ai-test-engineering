# DeductionService asil uygulama devir kaydi

## 2026-10-23 DeductionService: asil GPU uygulamasi dogrulandi

- Kullanici G2 uygulamasini acikca onayladi. Job `5f6a657a-2187-42f3-81ea-8851b1178d65` icin son dogrulanmis 12 test dosyasi / 35 test, byte/hash ayniligi korunarak asil GPU backend src/test/java dizinine aktarildi.
- MCP test_apply halen PATCH_ONLY. Uygulama, acik kullanici onayiyla dosya aktarimi olarak yapildi; MCP DB'sine sahte APPLIED veya approval kaydi yazilmadi.
- Asil dizinde JDK21/Maven3.9.16 ile clean + JaCoCo prepare-agent + tum Maven testleri + JaCoCo report: exit 0 / BUILD SUCCESS. Sinif filtresi yok; skip/failure-ignore bayraklari false.
- Sonuc: 670 test = 659 PASS + 11 mevcut SKIP, 0 failure/error. Onceki 635 test invocation eksiksiz korundu.
- DeductionService: LINE 263/272 (%96.69), BRANCH 85/104 (%81.73); iki %80 hedefi asil checkout'ta da saglandi. update LINE47/47 BRANCH12/14; deleteLogical LINE17/17 BRANCH7/10.
- 990 mevcut kaynak/ayar dosyasi ve 153 src/test dosyasi ayni hash ile korundu; production/POM/mevcut test degisikligi yok. Maven testleri 2 runtime logunu guncelledi ve 1 arsiv logu olusturdu.
- GPU Git commit/push veya yayin yapilmadi. Ham kaynak/model/log ve hash manifestleri LOCALAPPDATA/ai-test-engineering altinda; public kayitta yalniz sonuc ve kanit digest'leri bulunur.

Kanit: ai/checkpoints/2026-10-23-deduction-original-apply.md.
