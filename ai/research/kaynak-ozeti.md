# Arastirma Kayitlari

Kaynaklar AKTIF_GOREV.md bolum 23'te (S01-S27) kanit blob SHA'lariyla kayitli. Bu klasorde uygulamaya etkileri ozetlenir.

## Kaynak ozeti

| ID | Kaynak | Uygulamaya etki |
| --- | --- | --- |
| S01 | Hedef repo durumu (bos, public, main) | Bos repo varsayimiyla kurulum; kullanici dosyasi silme yok. |
| S02 | CoverUp | Coverage-gudumlu kucuk hedefler, basarisiz deneme hafizasi. Python motoru dogrudan alinmadi. |
| S03 | ChatUniTest | Java generate/validate/repair ayrimi; deterministik onarim. Coverage exception'inda boolean basari kabul edilmedi. |
| S04 | TestWeaver | Kalan bosluga odakli baglam, onceki yararli adayin yeniden kullanimi. |
| S05 | TestGen-LLM | Aday uretimi ile kabul kararinin ayrimi. |
| S06 | Qodo Cover | Bakim duran proje cekirdek bagimlilik secilmedi. |
| S07-S11 | OpenCode/MCP/guvenlik | Ince MCP transport adapter, OS seviyesi guven siniri, worker config izolasyonu. |
| S12-S14, S20-S23 | JaCoCo/Maven | Sayac semantigi, provenance kontrolu, cok modul olcum kurallari. |
| S15-S18 | Node/SQLite/JavaParser/container | Surum lock, storage adapter, AST cozumleme, izolasyon kabiliyeti. |
| S24-S27 | SQLite WAL/backup, LiteLLM, izinler | Backup sozlesmesi, model profili, onay kanali kurallari. |

## Kurallar

- Kaynak repolarinin aciklamasi ile olculmus sonuc ayni kanit seviyesinde degildir.
- Uygulama sirasinda installed surumler lockfile ve uyumluluk belgesine kaydedilir.
- Algoritmik fikirler yeniden uygulanir; kaynak kod kopyalanmadan.
