# S02 WN19 normal MCP gizlilik siniri

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s02`.

## Gercek Windows fixture

- `tests/integration/wn19-mcp-secret-boundary.test.ts` gercek `dist/mcp/stdio-entry.js` surecini MCP SDK stdio client ile baslatir. Benzersiz Temp USERPROFILE altindaki `.m2/settings.xml` yalniz sentetik credential icerir; fake `mvn.cmd` calisirsa ayri sentinel yazar. Musteri/GPU dizini veya gercek kullanici settings'i okunmaz/degistirilmez.
- `test_start` gercek sample Maven projesi/hedefi icin job ID dondurur. `test_status` terminal `FAILED` ve `NATIVE_PROCESS_OWNERSHIP_UNVERIFIED` sinirini gorur. `test_result` icinde `report_facts` ve `report_path` null; Maven sentinel yoktur. Kalici DB'de o job icin `test_run_provenance=0`, `checkpoints=0`; MCP metin yanitlari, stderr, DB (varsa WAL/SHM yan dosyalari dahil) ve owned artifact dosyalarinda sentetik credential bayti yoktur; `PUBLISHED` raporu yoktur.
- Ilk test kosusu `TARGET_NOT_FOUND` verdi; fixture hedefi gercek sample projesindeki `PaymentService` ile duzeltildi. Bu urun kusuru RED'i degildi. Final fixture gercek Windows'ta 1/1 PASS. Mevcut fail-closed urun davranisi dogru oldugundan kaynak kodu degistirilmedi.

## Kabul siniri

- Bu test WN19'un tam zincirini calistirmaz: `CustomerRunnerFactory.assertNativeCustomerReady` su an kosulsuz ownership blocker atar; dispatcher Maven baseline/probe oncesi durur. WN15/18 kurulum-dizini uyeligi ve absent config pin eksikleri de aciktir. Sentetik settings'in Maven tarafindan kullanildigi, run artifact/facts/report'a secret sizmadigi hakkinda pozitif kabul kaniti yoktur. WN19 `NOT_RUN`, WN14/15/18 ve customer readiness `NO_GO` kalir.
- Sozlesme 5.1.6 native Maven'in onayli credential'li settings'ini desteklemeyi ister. Docker'in credential'li settings reddini native yola kopyalamak sozlesmeye aykiri olur. Bu fixture yalniz kapali customer yolunun negatif gizlilik sinirini kanitlar; `host_dev_only` WN19 yerine gecmez. G1/G2/G3 kapali.
