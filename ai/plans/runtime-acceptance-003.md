# Uygulama Plani: AITE-RUNTIME-ACCEPTANCE-003

- Tarih: 2026-10-10
- Gorev: kokteki AKTIF_GOREV.md (v1.0)
- Bulgular: ai/reviews/2026-10-10-runtime-acceptance-review.md (B01-B12)

## Asamalar (K00-K09)

| ID | Is | Ilgili B/RT | Durum | Kanit |
| --- | --- | --- | --- | --- |
| K00 | Kaniti yeniden kur; arsiv + review + B01-B12 teyit | tumu | IN_PROGRESS | ai/reviews/2026-10-10-runtime-acceptance-review.md |
| K01 | Once guvenli normal calistirma yolu (runner factory, fail-closed) | B01, RT01-RT03 | TODO | - |
| K02 | Tek kalici job motoru ve dogru contract | B02, B05; RT12, RT15 | TODO | - |
| K03 | OpenCode worker: kodu anlayan zincir | B02, B08; RT04-RT06 | TODO | - |
| K04 | Coverage ve accepted set tek gercegi | B03, B04; RT07-RT11 | TODO | - |
| K05 | Gercek kesinti/devam/iptal ve fencing | B05; RT12-RT17 | TODO | - |
| K06 | Discovery ve test kalitesi | B09, B10; RT18-RT20 | TODO | - |
| K07 | Gercek rapor, patch-only sonuc, guvenli apply | B06, B11; RT23-RT26 | TODO | - |
| K08 | Temiz PS1'siz kurulum + gercek protocol adapterleri | B07, B12; RT27-RT28 | TODO | - |
| K09 | Bagimsiz son kabul ve dogru teslim | tumu | TODO | - |

## Siradaki somut is

K00 sonrasi: RT01/RT02 ile normal customer yolundaki host fallback'i kirmizi testle goster (B01), K01 ile kapat. Paralel olarak RT27'de temiz bootstrap sorunu (B07) yeniden uret.
