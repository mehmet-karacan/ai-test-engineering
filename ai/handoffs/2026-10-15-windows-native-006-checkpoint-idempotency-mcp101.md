# Handoff - checkpoint idempotency ve mcp101

## Devralma

OpenCode mcp100 DateUtils pilotu ikinci checkpoint yayininda `UNIQUE constraint failed: artifacts.sha256, artifacts.relative_store_path` hatasiyla durdu. Koken, accepted blob setinin her checkpoint'te yeni artifact satiri olarak eklenmesiydi.

## Uygulanan ve dogrulanan

- `src/orchestration/checkpoint-store.ts`: mevcut READY accepted artifact uyumluysa yeniden kullaniliyor; action/bytes/job/status uyusmazligi fail-closed.
- `tests/unit/p03-checkpoint-identity.test.ts`: duplicate accepted blob sonraki checkpoint'te yeniden kullanma regresyonu.
- P03 **31/31**, odak suite **140/140**, typecheck PASS, build PASS.
- Build tree digest: `4e92bd592a60447030f1e30e15bcb95e6f2ee067bc882b76041569c08b648138`.

## Canli mcp101

- Job `f6220ee2-667e-4509-bbc8-f29c822832b2`, target `DateUtils`, temiz owned snapshot.
- Pause/resume ayni job'da basarili.
- Dört accepted checkpoint: `d1db46c5`, `0b637ea5`, `36b9b6e7`, `5f8a1065`; generation 1-4 parent zinciri saglam.
- Maven baseline 8/8; accepted candidate kosulari 13/13 ve 18/18 (3 kez), fail/error/skip yok.
- Accepted artifact dosyalari SHA-256/byte dogrulandi; ikinci ve sonraki checkpoint'lerde onceki artifact ID'leri yeniden kullanildi.
- Kontrollu 25 dakika sonunda job `CANCELLED`, `best_checkpoint_id=5f8a1065-857e-4ac2-9cd6-de2c3075d8e8`, Report06 yok. WN73 PASS ilan edilmez.

## Siradaki hedef

WN75 kullanici Report06 review kaydi, S09 partial manifest reconciliation ve kalan WN73 terminal/Report06 karari. GPU Fusion customer checkout'una yazma, commit, push, reset veya clean yapma.

## Tek satir devam promptu

`AKTIF_GOREV.md` ve mcp101 checkpoint/handoff'u oku; checkpoint-store accepted artifact idempotency fixini ve 140/140 kaniti koru, WN75 review ve S09 reconciliation'a devam et, WN73'u Report06 olmadan PASS sayma, commit/push yapma ve usage %5 veya altina inerse checkpoint yazip duraklat.
