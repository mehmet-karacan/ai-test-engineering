# DeductionService asil checkout uygulama kaniti

## 2026-10-23 DeductionService: asil GPU uygulamasi dogrulandi

- Kullanici G2 uygulamasini acikca onayladi. Job `5f6a657a-2187-42f3-81ea-8851b1178d65` icin son dogrulanmis 12 test dosyasi / 35 test, byte/hash ayniligi korunarak asil GPU backend src/test/java dizinine aktarildi.
- MCP test_apply halen PATCH_ONLY. Uygulama, acik kullanici onayiyla dosya aktarimi olarak yapildi; MCP DB'sine sahte APPLIED veya approval kaydi yazilmadi.
- Asil dizinde JDK21/Maven3.9.16 ile clean + JaCoCo prepare-agent + tum Maven testleri + JaCoCo report: exit 0 / BUILD SUCCESS. Sinif filtresi yok; skip/failure-ignore bayraklari false.
- Sonuc: 670 test = 659 PASS + 11 mevcut SKIP, 0 failure/error. Onceki 635 test invocation eksiksiz korundu.
- DeductionService: LINE 263/272 (%96.69), BRANCH 85/104 (%81.73); iki %80 hedefi asil checkout'ta da saglandi. update LINE47/47 BRANCH12/14; deleteLogical LINE17/17 BRANCH7/10.
- 990 mevcut kaynak/ayar dosyasi ve 153 src/test dosyasi ayni hash ile korundu; production/POM/mevcut test degisikligi yok. Maven testleri 2 runtime logunu guncelledi ve 1 arsiv logu olusturdu.
- GPU Git commit/push veya yayin yapilmadi. Ham kaynak/model/log ve hash manifestleri LOCALAPPDATA/ai-test-engineering altinda; public kayitta yalniz sonuc ve kanit digest'leri bulunur.

- Kaynak model job product commit:0e17b66; MCP kurulum commit:9668d64.
- Asil JaCoCo XML SHA256:c014deae40998bd98ec065d95443dee51e84c7180efa2144338a7d5e123d5d2c
- Maven log SHA256:359e5df6e57b5c5fe32840639a0b9d3e01e811b87b5c8ff1e30da000272c712f
- Private apply audit SHA256:42c48531dd659e1d640cee5b796b8cc86e1e0878c1ddd4b527b2273b0f47a7b8
- Yerel rapor: GPU backend target/site/jacoco/index.html ve tr.com.innova.gpu.service/DeductionService.html.
- Devam noktasi: uygulama ve dogrulama tamam. Yeni sinif/hedef, GPU commit/push veya yayin ancak kullanici istegiyle ilerler.
