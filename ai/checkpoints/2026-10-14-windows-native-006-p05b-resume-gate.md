# Windows Native 006 - P05-B resume kapisi

Tarih: 2026-10-14
Branch: `codex/windows-native-006`

## Degisiklik

- `tests/integration/p05b-resume.test.ts` fixture'i minimal fakat tam Maven/JDK dagitim manifesti uretiyor. Testler production `TOOLCHAIN_DISTRIBUTION_UNVERIFIED` kapisini atlamiyor.
- `JobDispatcher.resumeDispatch` istenen model ile immutable job contract modelini lease veya native `-v` probe oncesi karsilastiriyor. Uyusmazlik `POLICY_VIOLATION/CONTRACT_CONFLICT` ile erken donuyor.

## Kanit

- P05-B integration: **13/13 PASS**.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint -- --quiet`: PASS (error yok).
- `git diff --check`: PASS.
- Tek isci full suite son durum: **118 dosya, 945/950 PASS**; P05-B ve OpenCode odaklari temiz, kalanlar canli pilot/model evidence kapilari. Ayrinti: `ai/checkpoints/2026-10-14-windows-native-006-opencode-v2-regression.md`.
