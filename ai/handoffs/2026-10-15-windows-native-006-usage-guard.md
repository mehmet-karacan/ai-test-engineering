# 2026-10-15 Windows Native 006 - usage guard handoff

## Devralma promptu

`AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, `ai/checkpoints/2026-10-15-windows-native-006-usage-guard.md` ve bu dosyayi oku. Uncommitted product degisikliklerini koru; customer `C:\innova\projeler\gpu-fusion` checkout'una commit/push/reset/clean yapma. WN72 PASS kanitini ve WN73 mcp95s/mcp95v/mcp95x negatif veya eksik terminal kanitlerini incele. `pinRoot` native `.mvn` kapsam duzeltmesini, build digest `569f360007bc5b2a...`, typecheck/build/lint ve local verifier kanitini dogrula. WN73 terminal candidate ve Report06 olmadan PASS ilan etme. Kalan adimlar: yeterli sureli worker kosusu veya typed blocker kaydi, final replay/Report06, WN75 kullanici review, S09 manifest/full gate reconciliation. Kullanim kalan yuzde %5 veya altina indiginde hemen yeni checkpoint yaz, hedefi `paused` yap, donen statusu raporla ve dur.

Ek kanit: mcp95x stderr kapanisinda POLICY_VIOLATION: Lease suresi bitti yazdi; candidate/Report06 yok, WN73 NOT_PASSED.

## 2026-10-15 devralma guncellemesi

Kullanim kontrolunde `usedPercent=95` goruldu ve kullanici kosulu geregi gorev paused durumuna alinacak. Son teknik durum:

- OpenCode v2 mesajlarinin `content` dizisindeki text parcasini okumayan worker koprusu duzeltildi (`src/workers/opencode/worker-client.ts`).
- `tests/contract/worker-response.test.ts`: 7/7 PASS; `npm.cmd run typecheck`: PASS; `npm.cmd run build`: PASS; yeni digest `906cea1ba6566609...`.
- Izole direct diagnostic duzeltme sonrasi `FINAL_TEXT`, yaklasik 5083 ms, `change_count=1`.
- Temiz owned source ile mcp95z `c7038955-3da2-4e06-9f47-f1dc1f5463ad` pause/resume ve generation'a ulasti ancak terminal candidate/Report06 yok; lease suresi bitisi nedeniyle `NOT_PASSED`.
- OpenCode v2 oturumunda model read tool-call dongusune girdi. V2 API body tools/permission ayarlarini tasimadigi icin sonraki adim yerel OpenCode config semasini dogrulamak ve worker'i gerekli araclara fail-closed kilitlemek.
- `query-mcp95y.mjs`, `query-opencode.mjs`, `query-opencode-session.mjs`, `inspect-opencode-session.mjs` gecici dosyalari temizlenmeli.

### Devralan modele gonderilecek prompt

`AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, `ai/checkpoints/2026-10-15-windows-native-006-usage-guard.md` ve bu handoff'u oku. Mevcut product uncommitted degisikliklerini koru; `C:\innova\projeler\gpu-fusion` customer checkout'una commit/push/reset/clean yapma. Ilk is olarak kullanim limitini kontrol et; usedPercent >=95 ise yeni checkpoint ekle, hedefi paused yap ve dur. Aksi halde content-normalizasyonu ve 7/7 test/build kanitini dogrula; OpenCode 2.0.29 yerel config semasini inceleyip v2 worker request yolunda read/write/edit/bash/task/webfetch gibi araclari fail-closed kisitla; typecheck, ilgili contract test ve build calistir; sonra temiz owned source ile bounded ama yeterli sureli WN73 pilotunu tekrarla. Candidate ve Report06 yoksa WN73 PASS deme. Basarili terminal cevapta final replay, Report06, WN75 user review ve S09 manifest reconciliation yap. Gecici tanilama scriptlerini sil. Her uzun adimdan once kullanim limitini yeniden kontrol et; kalan %5 veya altinda ayni checkpoint + paused prosedurunu uygula. Commit/push yapma.
