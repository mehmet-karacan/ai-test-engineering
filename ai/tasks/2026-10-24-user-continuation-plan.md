# Kullanici kesinti ve proje baglami plani

> Uygulama: superpowers:executing-plans; TDD ve bagimsiz son inceleme.

## Onayli kapsam ve tasarim

Kullanici onceki 14 davranis senaryosunun test edilmesini, bulunan sorunlarin
duzeltilmesini ve repo degisince modelin dogru yonlendirilmesini istedi.
OpenCode ana modeli kullanici niyetini yorumlamaya ve projeler arasinda acikca
istenen isi yonetmeye devam eder. MCP CWD'ye kilitlenmez; acik proje/isi
dogrular, gercek durum ve kullanilabilir sonraki adimlari dondurur.

- Son guvenilir checkpoint, hedef/model ve tuketilmis butce korunur.
- Sohbeti durdurmak pause kabul edilmez; durum sorgulanir, gerekirse
  test_cancel(reason=pause), sonra test_resume kullanilir.
- Farkli repo/job eslesmesi sessiz isleme alinmaz; model kayitli proje ile
  mevcut proje arasinda kullanici niyetine gore secim yapabilir.
- Iptal/tamamlama ve sinif secimi yeni generation baslatmaz. Degisen
  kaynak/hedef/model icin acik yeni is/analiz yolu anlatilir.
- Modelin ana sohbet araclari daraltilmaz; sinirli generation worker ile ana
  sohbetin yetkileri ayridir. Yeni customer generation/Maven veya apply yok;
  salt okunur sentetik OpenCode yonlendirme denemesi ayrik yapilabilir.

## Adimlar

- [x] Resume, repeated pause/cancel, cross-project status/result/cancel/apply,
  aktif owner, yeni sohbet ve coklu is testlerinde beklenen davranisi sabitle.
  Dosyalar: tests/integration/user-continuation.test.ts, p05b-resume.test.ts.
- [x] Kirmizi testleri kaydet; application/job-tools.ts, tool-schemas.ts ve
  services.ts icinde yalniz kanitlanmis sorunlari duzelt. Job baglamini ve
  gereken sonraki eylemi typed, additive alanlarda sun; eski cagriyi koru.
- [x] Gercek stdio yeniden baglanma/yeniden baslama, source/branch degisimi,
  checkpoint ve butce koruma, stale worker ve coverage scan davranisini dene.
  Stub sinirlarini acik kaydet; model/Maven e2e diye sunma.
- [x] MCP aciklamalari ve OpenCode skill'inde durum temelli yonlendirme yap;
  ana modelin okuma/arastirma/soru sorma/alternatif onerme yetkisini koru.
- [x] Odakli testler, typecheck/build/lint, tam Windows suite ve bagimsiz review;
  ai/checkpoints ve acceptance kaydina sonuc/limitleri yaz. Kurulu dosyalarin
  guncellenmesi ve commit/push kullanicinin devam eden teslim kapsami icinde.

## Inceleme odaklari

- Eski job_id + yeni repo, farkli cwd + acik eski repo, yeni sohbet + coklu is.
- CANCELLED/COMPLETED/WAITING_INPUT, ayni anda iki resume/pause, gec model cevabi.
- Checkpoint yok/bozuk, branch/POM degismis, butce dolmus, baglanti kopmus.
- Native process ownership cozulmeden devralma yok; onarim onerisi acik olsun.
- Rapor/DB tutarliligi; tarafsiz bilgi ver, model icin tek kalip yanit zorlama.
