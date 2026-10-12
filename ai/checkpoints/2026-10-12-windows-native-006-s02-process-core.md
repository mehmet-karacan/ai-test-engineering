# Checkpoint - 006 S02 Windows process core (partial)

- Tarih: 2026-10-12 (Europe/Istanbul)
- Dal: `codex/windows-native-006-s02`; baslangic `93b1290` S00. Ana checkout ve musteri GPU projesi degismedi.
- Kapsam: `native-toolchain.ts` ve `windows-process-supervisor.ts` icin ilk bagimsiz cekirdek. Normal MCP/dispatcher entegrasyonu henuz yapilmadi; S02 kabul edilmis sayilmaz.

## Uygulama ve kanit

- Installed `mvn.cmd` varsayilan secilir; `Path`/`PATH` cakismasi reddedilir; wrapper yalniz acik tercihle ve mevcut yerel jar ile secilir. PowerShell/download gerektiren wrapper reddedilir.
- Tipli Maven goal/profile/property kontrolleri, Windows `cmd` tarafinda kaniti olmayan karakterleri spawn oncesi reddeder. Bosluk, Unicode, parantez ve `&` verisi korunur.
- Merkezi `cmd.exe /d /s /v:off /c` baslatici mutlak `cmd.exe` kullanir. `close` beklenmeden sonuc yazilmaz. Nonzero, spawn error, timeout ve cancel durumlari ayri; stdout/stderr her biri 8 MiB ile sinirli ve truncation byte sayisi kayitlidir.
- Gercek Windows `.cmd` fixture'inda `&` sentinel'i komut olarak calismadi. Nonzero exit ve timeout ayri goruldu.
- `npm.cmd exec -- vitest run tests/unit/wn-command-contract.test.ts tests/unit/wn-process-supervisor.test.ts`: 2 dosya, 8 PASS; byte limitinde yarim UTF-8 karakteri basilmaz. `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint`: exit 0; lint 89 mevcut uyari.

## Acik is

- Maven `-v` ve etkin Java/toolchains/settings/profile kimliklerini okuyup gizli degerleri acmadan plan digest'ine bagla.
- Process kill sonrasi tree kapanisini/PID sahipligini kanitla; hard-kill/restart orphan ve late-result fence testleri ekle.
- `MavenRunner`, factory, dispatcher, services/config/entrypoint normal yola baglanacak. Eski runner config/job acik migration gerektirmeli.
- Native fixture entegrasyonu ve WN14-WN24 tamamlanmadan S02 LOCAL_VERIFIED/VERIFIED degildir. G1 GPU Maven/model, G2 apply, G3 yayin icin ayri onay gerekir.
