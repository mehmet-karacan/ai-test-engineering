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

- Aktif gorev `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`: kokteki `AKTIF_GOREV.md`; paketler S00-S09 ve zorunlu Windows kabulleri WN01-WN80.
- Onceki `AITE-PRODUCTION-READINESS-005 v1.0` byte-korunmus arsivi `ai/tasks/archive/AITE-PRODUCTION-READINESS-005-v1.0.md` altindadir. Eski kabul iddialari yeni Windows kapsamina otomatik PASSED tasinmaz.
- G0 urun kodu ve sentetik Windows testlerini acar. GPU Fusion'da ilk Maven/model kosusu G1, ozgun checkout'a test uygulamasi G2, yayin G3 ayri kullanici kararidir.
- Arsivdeki urun sozlesmesi: `ai/tasks/archive/` (AITE-FOUNDATION-001: R01-R20/AC01-AC70; AITE-REMEDIATION-002: RG01-RG52).
- Onceki denetimler: `ai/reviews/` (foundation-review, runtime-acceptance-review).
- Guncel durum: `ai/PROJECT_STATE.md`; is listesi: `ai/BACKLOG.md` (S00-S09); kabul: `ai/ACCEPTANCE_MATRIX.md` ve `ai/acceptance/`.
- Gelistirme hafizasi `ai/` altindadir; runtime hafizasi ile karistirma.
- Runtime veri (DB, blob, log) bu repoya yazilmaz; `session-*.md` kullanici oturum kaydidir, public'e gitmez.
- Windows standart yol CMD + Node.js + yerel JDK/Maven'dir; Docker/WSL/PS1 zorunlu degil; kurum policy'si bypass edilmez. Native calisma OS sandbox degildir.
- Gelistirme subagent'lari izole branch/worktree ve kisa hashli brief kullanir; ayni dosyada eszamanli yazar olmaz. Gelistiren kendi nihai reviewer'i olamaz.
- CI kullanici karariyla kapalidir; kendiliginden acilmaz.
- Git kimligi: `mehmet-karacan <karacan.mehmet@hotmail.com>` (local config). Global konfigurasyona dokunma.
- Yeni commit mesajlari Turkce ASCII yazilir.
- Kesinti olursa kayitli kanitlardan devam et; model hafizasina guvenme.
