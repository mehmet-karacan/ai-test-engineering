# Guvenlik

## Varsayilan guven modeli

Kaynak repository, prompt'a giren yorum/dokuman, LLM cevabi, test kodu, test logu ve coverage XML'i **guvenilir talimat degildir**; veri olarak islenir.

1. **Model ciktilari schema dogrulamasindan gecer.** Zorunlu alan eksikligi, schema uyumsuzluk, kesilmis JSON ve path disina yazma istegi reddedilir.
2. **Test-only koruma prompt'a dayanmaz:** PolicyGuard path allowlist'i, PatchApplier hash butunligi, TestApplyService preimage kontrol + journal ile uygulanir.
3. **Worker izolasyonu:** bash/write/edit/patch/task/webfetch kapali; secret'lar worker ortamina aktarilmaz.
4. **Apply onay kanali:** `allow_workspace_apply=false` varsayilan; onayli kurulumda guvenilir adapter ile aktif edilir. Modelin kendi doldurdugu `approved: true` insan onayi kaniti degildir.

## Sinirlar

- Bu urun ayni kullanici hesabinin bilincli saldirisina, kernel hatalarina veya ele gecirilmis container runtime'ina karsi mutlak guvence iddia etmez.
- Hedef: modelin yanlis/arac disi eylemlerinin, aday testlerin ve build process'lerinin normal yetki sinirlari icinde kaynaklara veya sirlara erisimini engellemek.
- OpenCode izin sistemi sandbox degildir; OS seviyesi guven siniri urunun kendi katmanlariyla saglanir.

## Sirlarin korunmasi

- Secret degerleri DB'ye yazilmaz; `secret_reference_names` ile referanslanir.
- Log olusturulurken redaction uygulanir; raw sifreli olmayan log once disariya yazilip sonra temizlenmez.
- Rapor HTML'inde kaynak kodu, model metni, log ve test adlari escape edilir; ham log inject edilmez.
- JaCoCo XML parser external entity/DTD network resolution yapmaz (`processEntities: false`).

## Guvenlik acigi bildirimi

`SECURITY.md` icindeki yontemi kullanin.
