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

- Aktif gorev sozlesmesi kokteki `AKTIF_GOREV.md`'de: bulgular (F/B), duzeltme asamalari (K00-K09), zorunlu kabul senaryolari (RT01-RT28).
- Arsivdeki urun sozlesmesi: `ai/tasks/archive/` (AITE-FOUNDATION-001: R01-R20/AC01-AC70; AITE-REMEDIATION-002: RG01-RG52).
- Onceki denetimler: `ai/reviews/` (foundation-review, runtime-acceptance-review).
- Guncel durum: `ai/PROJECT_STATE.md`; is listesi: `ai/BACKLOG.md` (K00-K09).
- Gelistirme hafizasi `ai/` altindadir; runtime hafizasi ile karistirma.
- Runtime veri (DB, blob, log) bu repoya yazilmaz; `session-*.md` kullanici oturum kaydidir, public'e gitmez.
- Windows standart yol CMD + Node.js; PS1/PowerShell zorunlu degil; kurum policy'si bypass edilmez.
- CI kullanici karariyla kapalidir; kendiliginden acilmaz.
- Git kimligi: `mehmet-karacan <karacan.mehmet@hotmail.com>` (local config). Global konfigurasyona dokunma.
- Yeni commit mesajlari Turkce ASCII yazilir.
- Kesinti olursa kayitli kanitlardan devam et; model hafizasina guvenme.
