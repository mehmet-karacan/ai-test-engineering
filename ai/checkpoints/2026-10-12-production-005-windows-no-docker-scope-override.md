# AITE-PRODUCTION-READINESS-005 Windows no-Docker scope override

Tarih: 2026-10-12
Kaynak: kullanici acik talimati

## Guncel teslim kapsami

- Windows standard akis kapsamda: CMD + Node.js + Git, kurulum/verify/uninstall, path guvenligi, upgrade/backup/restore ve OpenCode entry/runtime kanitlari.
- MacOS bu gorevde kapsam disidir.
- Docker, Docker tabanli customer execution, Docker capability probe, Docker network/egress policy ve PP17 Docker negative/positive kaniti bu gorevde kapsam disidir.
- Docker egress enforcement icin repo/host kaniti uydurulmayacak; bu kapsamda kosu veya PASS uretilmeyecek.

## Durum ve sinir

- P08 Windows kapsaminda RUNTIME_VERIFIED olarak kalir.
- P07-B/PP17 Docker runtime/egress kosusu bu teslimin kalan isi degildir; Docker'a bagli blocker sonraki aktif goreve devredilir.
- P10 teknik devir kaydi kalir. Orijinal AITE-PRODUCTION-READINESS-005 sozlesmesindeki 274 obligation, live pilot ve platform evidence kosullari bu dosya ile silinmez veya PASS yapilmaz. Bu nedenle original full verifier sonucu kanit yokken `NO_GO` olarak kalir.
- Live pilot/benchmark PAUSED_BY_USER olarak kalir. Bu scope karari canli kosu izni degildir.

## Sonraki aktif gorev icin not

Bu checkpoint sonraki web sohbetine devredilecek giris kanitidir. Docker/egress enforcement ve full evidence manifest karari, kullanici yeni aktif gorev verdiginde yeniden ele alinmalidir.

## Git

Kullaniciya ait untracked Java dosyasi stage edilmez. Bu checkpoint Turkce ASCII ile commit edilip origin'e pushlanir.
