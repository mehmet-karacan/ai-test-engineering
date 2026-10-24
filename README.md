# ai-test-engineering

Kalici hafizali ve yalniz test gelistiren Windows native MCP urunu. OpenCode varsayilandir; Codex CLI ve protokole uyumlu diger CLI worker'lari da secilebilir. Maven/JUnit/JaCoCo sonucunu private execution kopyasinda olcer; rapor ve checkpoint'leri kullanici runtime dizininde saklar.

## Baslangic

Windows'ta Node.js 24+, OpenCode ve proje ile uyumlu yerel JDK/Maven kurulumundan sonra repo kokunde:

```cmd
node scripts/install.mjs
```

[Kurulum](docs/installation.md), [model ve proje ayarlari](docs/configuration.md), [kullanim](docs/usage.md) ve [backup/isletim](docs/operations.md) adimlarini izleyin. Ilk kurulum worker'i kendiliginden acmaz. Model/Maven/MCP readiness ve production kabul kapilari ayri kanitlardir.

OpenCode disinda MCP stdio kaydi ve CLI worker secimi icin [client ve backend rehberini](docs/cli-backends.md) izleyin. `node scripts/install.mjs --client none` OpenCode ayarlarina dokunmadan stdio baglanti dosyasini olusturur.

OpenCode'da genel coverage raporu isteyin; olculmus onerilerden sinifi secince generation baslatilir. Production kaynak/POM degistirilmez; asil projeye test uygulanmasi ayri acik onay gerektirir. Yerel yonetim UI'i yoktur; kurumsal HTML sonuc raporu vardir.

## Gelistirme ve kabul

Aktif gorev `AKTIF_GOREV.md`, gelistirme protokolu `AGENTS.md`, guncel durum `ai/PROJECT_STATE.md` ve kabul kayitlari `ai/ACCEPTANCE_MATRIX.md` icindedir. Tarihsel kabul mevcut kaynak/build icin otomatik production onayi degildir. GitHub CI kullanici karariyla kapalidir.

```cmd
npm ci
npm run typecheck
npm run build
npm test
```

Runtime DB/blob/log ve session kayitlari kaynak deposuna eklenmez. Lisans: `package.json` icinde `UNLICENSED`, paket private'dir; yayin ayri kullanici kararidir.
