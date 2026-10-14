# 006 resume path ve full suite checkpoint

- 2026-10-14: Windows `test_resume` kimlik karsilastirmasi path separator/case farklarini canonical identity ile esitleyecek sekilde duzeltildi. SQLite `ProjectRepository` canonical root degeri ile native toolchain kaydinin mutlak `C:\` yolu ayni fiziksel kok olarak karsilastiriliyor; scope veya root escape gevsetilmedi.
- `tests/integration/p05b-resume.test.ts` missing frozen workspace testi tek basina PASS. Test-only owned probe fixture'i artik path kapisini geciyor ve sonraki fail-closed `TOOLCHAIN_DISTRIBUTION_UNVERIFIED` kapisina ulasiyor; fixture guncel complete Maven/JDK manifest kontratini tasimiyor, bu nedenle production kapisi gevsetilmedi.

## Tam suite sonucu

- `npm.cmd test -- --reporter=dot`: 118 dosya, 883/950 PASS, 30 skipped; 37 fail.
- Failures iki sinifta toplandi: ayni Windows makinesinde paralel native helper/Maven timeout ve file/job-object yuklenmesi; gercek OpenCode/pilot fixture veya `tmp/pilot-stdout.txt` gibi kullanici/model kanitlarinin yoklugu. P05-B path farki ayrica gercek kod kusuru olarak duzeltildi.
- Odak S05/S06/S07/S09: 5 dosya / 62 PASS; typecheck/build/lint (0 error) ve local release gate PASS.
- Full release gate gercek `ai/acceptance/evidence-manifest.json` yoklugu nedeniyle NO_GO; bu sonuc korunur.

## Kalan

- Complete installed Maven/JDK manifest ve native process ownership kaniti olmadan customer Windows Maven yolu acilmaz.
- G1/G2/G3 ve GPU Fusion canli model/apply/yayin kapilari kullanici onayi ve gercek kanit ister.
