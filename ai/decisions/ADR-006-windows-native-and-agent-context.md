# ADR-006: Windows native test calistirma ve sinirli agent context'i

- Tarih: 2026-10-12
- Durum: KABUL EDILDI (AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0, K01-K12)
- Kaynak: `AKTIF_GOREV.md` bolum 1, 3, 4, 5, 9 ve 10

## Karar

- Musteri testlerinin normal yolu yalniz Windows'ta yerel JDK/Maven/JUnit/JaCoCo kullanir. Docker, WSL ve PowerShell kurulum veya run onkosulu degildir. `windows_native` acik profil olarak uygulanir; eski `docker` ve `host_dev_only` job'lari sessiz donusturulmez.
- Urunun MCP job yoneticisi tek yurutme ve kabul otoritesidir. OpenCode'un ayri gercek session'lari sinirli Explorer, Architect, Developer ve Reviewer gorevleri icin kullanilir; kalici task/attempt/job kimligi SQLite'ta tutulur. Ilk surumde delegation depth 1, en cok iki model istegi ve bir Maven run vardir.
- Ilk envanter metadata bakimindan tum dosyalari kapsar. Calistirilacak kaynak snapshot'i ve modele verilecek context ayri kapsamlardir. Secret/binary ve tum envanter prompt'a tasinmaz.
- Windows native calisma OS sandbox degildir. Maven/JVM ve eklentiler calistiklari Windows hesabinin dosya ve ag yetkilerini tasir. Ayri owned workspace, test-only patch kontrolu ve sinirli ortam aktarimi bu gercegi gizlemez.
- S00 yeni Windows scope mapping'ini ve eski sozlesmelerin tarihsel NO_GO kaydini ayri tutar. Kanitsiz kabul PASSED olmaz. Raporu model yazmaz; Report06 yalniz dogrulanmis olgulari gosterir.

## Yetki kapilari

- G0: Bu dosyanin uygulanmasi urun kodu ve sentetik fixture testlerini acar.
- G1: GPU Fusion'da ilk Maven/model kosusu icin somut hedef, model, toolchain, butce ve workspace kullanici onayi gerekir. G1 oncesi yalniz salt okunur envanter ve sinirli kaynak incelemesi yapilir.
- G2: Testlerin ozgun musteri checkout'una uygulanmasi ayri onay ister. Musteri Git islemi yetkisi vermez.
- G3: Tag, imza, yayin ve deploy ayri karardir.

## Sonuclar

- Eski Docker/macOS/Linux ozgul kabuller Windows GO kararini otomatik bloke etmez; her eski ID acik `RETAINED`, `REPLACED` veya `OUT_OF_SCOPE_BY_USER` mapping'i tasir. Gecerli veri ve surec korumalari kapsam disina atilmaz.
- CI kapali kalir. Yeni UI, dagitik kuyruk, container/proxy altyapisi veya ayri son-kullanici CLI'i eklenmez.
- Runtime DB/blob/log ve musteri kaynaklari public repository disinda kalir; gelistirme checkpoint'leri redakte, hashli referans tasir.
