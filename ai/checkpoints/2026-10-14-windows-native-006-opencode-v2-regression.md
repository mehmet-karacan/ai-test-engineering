# Windows Native 006 - OpenCode v2 ve tek isci regresyon checkpoint'i

Tarih: 2026-10-14
Branch: `codex/windows-native-006`

## Uygulanan degisiklikler

- OpenCode 2.x icin worker client `/api` prefix, Basic Auth, `{data: ...}` envelope, `prompt`, `interrupt` ve v2 mesaj normalizasyonunu destekliyor; legacy HTTP semasi geriye uyumlu tutuldu.
- Worker server yoneticisi OpenCode 2.x'te gecersiz olan `--pure` flag'ini kaldiriyor; worker'a ozel XDG config/data/cache/state kokleri ve process-local sifre korunuyor.
- Windows kurulumunda `@opencode/cli/bin/opencode.exe` ve eski `opencode-ai/bin/opencode.exe` yollarinin ikisi de aranıyor.
- Entegrasyon smoke test'i sabit port yerine bos port seciyor; test sonrasinda 24xxx araliginda yetim worker listener'i kalmadi.
- P05-B fixture'i complete Maven/JDK manifestiyle native production kapisini gevsetmeden calisiyor; immutable model degisikligi lease/native probe oncesi reddediliyor.

## Kanit

- `tests/integration/opencode-worker.test.ts`: **3/3 PASS**.
- Worker/bridge odak suite (6 dosya): **33/33 PASS**.
- `tests/integration/p05b-resume.test.ts`: **13/13 PASS**.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint -- --quiet`: PASS.
- `npm.cmd run build`: PASS.
- `npm.cmd exec -- vitest run tests/unit/p01-release-gate.test.ts --maxWorkers=1`: **40/40 PASS**.
- `node scripts/release-verify.mjs --local`: **LOCAL_PASS** (391 ID yapisal/fixture kapisi).
- `node scripts/release-verify.mjs`: **NO_GO**; `EVIDENCE_MANIFEST_EKSIK`, mandatory **391**, verified **0**, missing **391**.
- Tek isci full regression: **118 dosya, 945/950 PASS**. Kalan 5 fail: RG41/RG42 canli pilot, AC67 gercek model stdout evidence (2) ve eski kosunun build stamp kaynakli P01 testi; build sonrasi P01 40/40 PASS.

## Acik kapilar

- `ai/acceptance/evidence-manifest.json` yok; full release verifier fail-closed kalir.
- Dis readiness tekrar kontrolu: LiteLLM anahtari ortamda mevcut (degeri okunmadi/kaydedilmedi), `JAVA_HOME` mevcut ve Maven `READY/CAPABILITY_PROBED`; uygulama config'inde `worker_profiles` bos, `AITEST_WORKER_ENABLED` etkin degil (`WORKER_DISABLED`). Gercek model/pilot ve GPU Fusion G1 karari kullanici kapisidir.
- G1/G2/G3, gercek Maven/model ve musteri checkout'u bu checkpoint'te acilmadi.

Devam noktasi: evidence manifestinin gercek kanitlarla tamamlanmasi ve kullanici acik karari verilen live pilot kapilarinin ayri kosuda yurutilmesi.
