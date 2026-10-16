# Kapsam ve test temizligi checkpoint'i

- Tarih: 2026-10-16.
- Kullanici karari: Windows kapsaminda acik isaretlenen eski P07-B/P10/W11 kayitlari kapatilsin; macOS kapsamindaki testler aktif suite'ten cikarilsin.
- Guncel durum belgeleri (`ai/BACKLOG.md`, `ai/PROJECT_STATE.md`, `ai/ACCEPTANCE_MATRIX.md`) Windows-native-006 r16 kapanisini kaynak alacak sekilde uzlastirildi.
- Silinen macOS test yuzeyi: `tests/unit/p08-runtime-paths.test.ts` icindeki darwin assertion'lari ve `tests/integration/p07b-browser-e2e.test.ts` icindeki `/Applications/.../Google Chrome` adayi.
- Windows/Linux ortak testleri ve urun runtime'indaki darwin resolver dali korunmustur.
- Tarihsel checkpoint/handoff dosyalari silinmedi veya geriye donuk degistirilmedi.
- Dogrulama: `npm.cmd test -- --run tests/unit/p08-runtime-paths.test.ts tests/unit/p08-lifecycle-escape.test.ts --maxWorkers=1` -> 2 dosya / 7 test PASS; `npm.cmd run typecheck` -> PASS; hedefli ESLint -> 0 error / 1 mevcut unused-import warning.
- Kullaniciya ait untracked dosyalar stage edilmeyecektir.
