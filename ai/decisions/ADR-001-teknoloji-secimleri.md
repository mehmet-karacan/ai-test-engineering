# ADR-001: Teknoloji Secimleri

- Tarih: 2026-10-09
- Durum: KABUL EDILDI
- Ilgili: AKTIF_GOREV.md bolum 3.4

## Problem

Urunun uygulama dili, MCP SDK, DB, sema, Java analizi ve izolasyon teknolojileri belirlenmeli.

## Incelenen alternatifler

- Python tabanli test motoru (CoverUp tarzi): Java hedefi icin dogrudan uyumlu degil.
- Yeni genel LLM agent framework: OpenCode SDK zaten ajan motoru sunuyor; tekrar gereksiz.
- Dosya tabanli durum (JSON lock dosyalari): Transaction/lease/fence gereksinimleri icin yetersiz.
- MySQL/PostgreSQL: Tek kullanicili yerel urun icin agir ve kuruluma bagimlilik ekler.

## Secimler

| Alan | Secim | Gerekce |
| --- | --- | --- |
| Uygulama | TypeScript strict + Node.js 24 LTS ailesi | OpenCode TS SDK ve resmi MCP SDK ekosistemi. |
| MCP | Resmi TypeScript SDK, izole v1/v2 adapter | OpenCode uyumlulugu ve protokol gecisi is motorundan ayrilir. |
| DB | SQLite + better-sqlite3 | Yerel, transaction tabanli kalici durum; Windows/Linux test edilir. |
| Semalar | Zod + uretilen JSON Schema | Model ciktilari, tools, config dogrulamasi. |
| Java analizi | Urune ait JavaParser yardimci modulu | AST/semantik cozumleme; hedef POM'a eklenmez. |
| Coverage | JaCoCo XML sayaclari + ham exec/HTML | Deterministik hesap; HTML karar araci degil. |
| Izolasyon | OCI uyumlu kisitli runner; Windows'ta onayli WSL2/container | Kaynak read-only; kurulumda kabiliyet dogrulanir. |

## Riskler

- Native binary uyumlulugu (better-sqlite3): Node surumuyle lockfile'da sabitlenir, Windows/Linux'ta test edilir.
- MCP SDK v1/v2 farklari: Iki profil contract testlerinden gecer.
- OpenCode surumu degiskenligi: Kurulumda gercek surum matrisi kaydedilir.

## Kabul testleri

- P01: Gercek stdio client tool list/call; DB yeniden acilinca veri kaliciligi.
- P03: Gercek Maven/JaCoCo fixture calistirma.
