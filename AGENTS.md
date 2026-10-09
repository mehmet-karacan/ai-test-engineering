# AGENTS.md - Gelistirme Protokolu

Bu depo, AI test muhendisligi MCP urununun gelistirme deposudur. Aktif gorev sozlesmesi `AKTIF_GOREV.md` icindedir.

## Baslangic protokolu

1. `AKTIF_GOREV.md` ve `ai/PROJECT_STATE.md` oku.
2. Git branch/HEAD/status/remote'u kontrol et; uncommitted dosyalarin sahibini tahmin ederek silme.
3. Son handoff (`ai/handoffs/`), ilgili ADR (`ai/decisions/`), backlog (`ai/BACKLOG.md`) ve kabul durumunu (`ai/ACCEPTANCE_MATRIX.md`) oku.
4. Onceki "done" iddiasini ilgili commit/artifact/test kanitiyla kontrol et.
5. Siradaki onayli isi uygula; kapsam disi yeni is kendiliginden aktif goreve ekleme.
6. Anlamli parcadan sonra test sonucunu, kalan isi ve devam noktasini `ai/checkpoints/` altina kaydet.
7. Her commit/push oncesi Git kimligi, Turkce ASCII, gizlilik ve staged diff kontrolu yap.

## Kurallar

- Urun kurallari `AKTIF_GOREV.md` bolum 2 (R01-R20); kabul testleri bolum 20 (AC01-AC70).
- Uygulama asamalari bolum 19 (P00-P09); Definition of Done bolum 22.
- Gelistirme hafizasi `ai/` altindadir; runtime hafizasi ile karistirma.
- Runtime veri (DB, blob, log) bu repoya yazilmaz.
- Git kimligi: `mehmet-karacan <karacan.mehmet@hotmail.com>` (local config). Global konfigurasyona dokunma.
- Yeni commit mesajlari Turkce ASCII yazilir.
- Kesinti olursa kayitli kanitlardan devam et; model hafizasina guvenme.
