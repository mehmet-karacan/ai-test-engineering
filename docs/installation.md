# Kurulum

## One-time kurulum

### Windows (PowerShell)

```powershell
.\scripts\install.ps1
```

### Linux (bash)

```bash
./scripts/install.sh
```

Kurulum su adimlari yapar:

1. Prerequisite kontrolu (Node 24+, Git, JDK, Maven/mvnw). Eksik varsa `BLOCKED` cikar.
2. Urun yukleme (`npm install` + `npm run build`).
3. Runtime dizinleri (`<USER_APP_DATA>/ai-test-engineering/`).
4. Config dosyasi (yoksa olustur; varsa koru).
5. OpenCode MCP baglantisi (mevcut config'i ezmeden merge; once yedek).
6. Smoke dogrulama (test suite).

## Dogrulama

```powershell
.\scripts\verify.ps1
```
```bash
./scripts/verify.sh
```

## Kaldirma

```powershell
.\scripts\uninstall.ps1
```
```bash
./scripts/uninstall.sh
```

Uninstall yalniz urunun sahipligi bilinen girdilerini kaldirir:

- OpenCode config'indeki `mcp.ai-test-engineering` girdisi (diger ayarlar korunur).
- Repo icindeki `dist/`.
- Runtime veri dizini otomatik silinmez; silmek icin komut ekranda gosterilir.

## Sirlar

API key bu kurulumla yazilmaz. Model erisimi mevcut OpenCode provider ayarlarindan gelir. Secret'lar `OPENCODE_SERVER_PASSWORD` gibi ortam degiskenleriyle referanslanir; config dosyalarinda deger tasimaz.

## Offline kurulum

Internet kapali ortamda: npm cache/mirror ve Maven mirror profilinden yararlanin. `npm ci --offline` ve `mvn -o` desteklenir. Detaylar `configuration.md` icinde.
