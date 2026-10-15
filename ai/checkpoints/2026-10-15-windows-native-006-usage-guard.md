# 2026-10-15 Windows Native 006 - usage guard checkpoint

## Durum

- Kullanici talimati: is bitmezse ve Codex kalan kullanim yuzdesi %5 veya altina inerse taze checkpoint yaz, devam promptunu kaydet, hedefi paused yap ve calismayi durdur.
- Son kullanim kontrolu: usedPercent=94, kalan yaklasik %6. Esik henuz asilmadi.
- Product worktree: `C:\Users\mkaracan\.codex\worktrees\windows-native-006\ai-test-engineering`.
- Customer checkout: `C:\innova\projeler\gpu-fusion`; HEAD `485a544bc87754f4d3c7181ec291d6389798ace5`; customer commit/push/reset/clean yapilmayacak.

## Son kanit

- WN72 / mcp95u job `cbe48d92-dca9-4768-9efe-d73bb86f9f61`: COMPLETED, TARGET_ALREADY_MET, AFFECTED_SCOPE, 49/49 PASS, Report06 PUBLISHED, production degisikligi 0.
- WN73 / mcp95s job `ce3c7b13-63e6-425f-a473-ab220af69728`: gercek PAUSED -> RUNNING resume kanitli; worker bounded timeout ve lease expiry sonrasi terminal sonuc yok; NOT_PASSED.
- WN73 / mcp95v job `3c725559-ec07-4237-970a-4826e1d77607`: JDK17, PAUSED -> RUNNING ve lease-grace kanitli; harness deadline'inda worker terminal cevabi yok; NOT_PASSED.
- WN73 / mcp95x job `0959815f-5e3c-4813-a439-8f12bd70e519`: yeni `pinRoot` duzeltmesiyle eski parent `.mvn` pin blocker'i kalkti; preflight/baseline ve pause/resume generation'a ulasti; 5 dakikalik harness deadline'inda lifecycle RUNNING/generation, candidate/Report06 yok; NOT_PASSED.
- `pinRoot` native process/toolchain/MavenRunner akisine eklendi; implicit `.mvn` pin taramasi owned workspace kokunde sinirli, eksik pin helper tarafinda fail-closed.
- Build `npm.cmd run build`: PASS; tree digest `569f360007bc5b2a...`.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: exit 0, 0 hata, 89 warning.
- `node scripts/release-verify.mjs --local`: LOCAL_PASS; full acceptance pending. Full suite son kanit 118 dosya, 957/959 PASS, 2 dosya fail; izole tekrarlar temiz. Full gate evidence manifest yoklugu nedeniyle NO_GO.

## Acik kalanlar

1. WN73 worker akisinin terminal aday cevabina ulasacagi kontrollu, yeterli harness suresiyle bir live kosu yapmak veya provider/endpoint blocker'ini typed fail-closed olarak kaydetmek.
2. Terminal candidate olursa final replay, test/coverage facts ve Report06 kanitini uretmek; yoksa WN73'u PASSED yapmamak.
3. WN75 Report06 kullanici inceleme kaydini ve S09 partial/full manifest review kapisini tamamlamak; full verifier NO_GO iken production GO vermemek.
4. Customer checkout'a commit, push, reset veya clean yapmamak.

## Devretme promptu

`AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, bu checkpoint ve `ai/handoffs/2026-10-15-windows-native-006-usage-guard.md` dosyalarini oku. Uncommitted product degisikliklerini koru; customer `C:\innova\projeler\gpu-fusion` checkout'una commit/push/reset/clean yapma. WN72 job `cbe48d92-dca9-4768-9efe-d73bb86f9f61` PASS kanitini koru. WN73 icin mcp95s `ce3c7b13-63e6-425f-a473-ab220af69728`, mcp95v `3c725559-ec07-4237-970a-4826e1d77607` ve mcp95x `0959815f-5e3c-4813-a439-8f12bd70e519` kanitlerini incele; `pinRoot` duzeltmesi ve `569f3600...` build digest'ini dogrula. Worker terminal candidate/Report06 sonucu alinmadan WN73 PASS deme. Sonraki kosuda yeterli harness ile worker'i dene; sonra final replay, Report06, WN75/S09 review ve release verifier reconciliation yap. Her uzun adimdan once kullanim limitini kontrol et; kalan yuzde %5 veya altina inerse yeni checkpoint/handoff yaz, `update_goal(status=paused)` cagir, donen durumu raporla ve hemen dur.

## mcp95x kapanis duzeltmesi

- Harness deadline aninda `test_result` lifecycle `RUNNING/generation` ve outcome null gorundu; ardindan kontrollu server kapanisi stderr'e su terminal kaydi yazdi: `FAILED ... POLICY_VIOLATION: Lease suresi bitti`.
- Bu kapanis da candidate/Report06 uretmedi; WN73 sonucu `NOT_PASSED` olarak kalir. Yeni kosuda lease grace ve worker terminal cevabi birlikte dogrulanmadan basari ilan edilmez.

## 2026-10-15 taze kapanis kaydi (kullanim esigi)

- Son kullanim kontrolu `usedPercent=95`; kalan kullanim yaklasik %5. Kullanici talimatina gore bu noktada calisma duraklatildi.
- OpenCode v2 worker koprusundeki hata tespit edilip duzeltildi: `/api/session/:id/message` assistant cevabini kok `text` yerine `content` dizisinde dondu­ruyordu. `src/workers/opencode/worker-client.ts` artik content parcalarini text/tool olarak normalize ediyor ve text parcasini final cevaba tasiyor.
- Regression testi eklendi: `tests/contract/worker-response.test.ts` icinde v2 `reasoning + text` cevabi icin final metin kontrolu. Test sonucu `7/7 PASS`.
- Bu degisiklikten sonra `npm.cmd run typecheck` PASS, `npm.cmd run build` PASS; yeni build digest `906cea1ba6566609...`.
- Izole worker tanisi: eski kopru ile `EMPTY_FINAL`, duzeltme sonrasi ayni tip istek `FINAL_TEXT`, elapsed yaklasik 5083 ms, change_count=1.
- Temiz customer snapshot'i ile mcp95z job `c7038955-3da2-4e06-9f47-f1dc1f5463ad` pause/resume ve generation asamasina ulasti; 5 dakikalik harness sonunda terminal candidate/Report06 yok, stderr `POLICY_VIOLATION: Lease suresi bitti`, sonuc `NOT_PASSED`.
- mcp95z OpenCode oturumunda modelin read tool-calls ile pom ve testleri inceleyip final JSON'a ulasmadan uzun sure harcadigi goruldu. V2 request body su anda tools/permission ayarlarini tasimiyor; sonraki model once izole OpenCode config semasini dogrulayip v2 worker'i read/write/bash/task/webfetch gibi araclara karsi fail-closed kisitlamali, sonra hizli direct diagnostic ve kontrollu WN73 kosusu yapmali.
- Gecici tanilama scriptleri (`query-mcp95y.mjs`, `query-opencode.mjs`, `query-opencode-session.mjs`, `inspect-opencode-session.mjs`) urun deposunda birakilmamali; sonraki model bunlari silmeli.

## Sonraki model icin tam devam promptu

`AKTIF_GOREV.md`, `ai/PROJECT_STATE.md`, bu checkpoint ve `ai/handoffs/2026-10-15-windows-native-006-usage-guard.md` dosyalarini oku. Product worktree'deki mevcut uncommitted degisiklikleri koru; customer `C:\innova\projeler\gpu-fusion` checkout'una commit/push/reset/clean yapma. Once `get_usage_limits` ile kullanim durumunu kontrol et; kullanilan oran %95 veya ustuyse yeni bir checkpoint/handoff yaz, hedefi paused yap ve baska is yapmadan dur. Oran uygunsa: (1) `src/workers/opencode/worker-client.ts` content-normalizasyonu ve `tests/contract/worker-response.test.ts` 7/7 PASS kanitini dogrula; (2) OpenCode 2.0.29 yerel config semasini inceleyerek v2 API yolunda worker araclarini fail-closed kisitla, write/edit/bash/task/webfetch yetkilerini acma ve mevcut promptun dosya govdesi saglama akisini bozma; (3) typecheck, ilgili contract test ve build calistir; (4) temiz owned source ile mcp95z benzeri WN73 pilotunu yeterli ama bounded harness suresiyle tekrarla; (5) candidate ve Report06 uretilmeden WN73 PASS deme; basarili olursa final replay, test/coverage facts, WN75 review ve S09 manifest reconciliation yap; (6) gecici tanilama scriptlerini sil. Her uzun adimdan once kullanim limitini tekrar kontrol et; kalan %5 veya altina inerse ayni durdurma prosedurunu uygula. Commit/push yapma.
