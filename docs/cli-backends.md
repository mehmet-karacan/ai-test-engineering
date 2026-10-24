# MCP client ve CLI worker secimi

MCP client ile worker backend ayri secimlerdir. Ayni stdio MCP motoru,
Maven/JaCoCo ve rapor akisi kullanilir. Varsayilan kurulum OpenCode'dur:

```bat
node scripts/install.mjs
node scripts/verify-install.mjs
```

`--client opencode` ayni secimi acikca belirtir. OpenCode MCP kaydi minimal
merge edilir; mevcut ust alanlar korunur, degisiklikten once backup alinir.
Paketin test-engineering skill'i kurulur; ozel skill ezilmez.

Baska bir MCP client icin:

```bat
node scripts/install.mjs --client none
node scripts/verify-install.mjs --client none
```

Bu secim OpenCode config veya skill dosyalarini okumaz/yazmaz. Kurulum
runtime kokunun `config/mcp-server.json` dosyasina su stdio tanimini yazar:

```json
{
  "schema_version": 1,
  "transport": "stdio",
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["C:\\approved-checkout\\dist\\mcp\\stdio-entry.js"],
  "env": {
    "AITEST_CONFIG": "C:\\runtime\\config\\config.json",
    "AITEST_DB_PATH": "C:\\runtime\\state.db",
    "AITEST_WORKER_ENABLED": "1"
  }
}
```

Yollar ornektir; kendi uretilen dosyanizdaki `command`, `args` ve `env`
alanlarini client'inizin MCP stdio ayarina aktariniz. Bazi client'lar `env`
alanini `environment`, komutu ise executable+args yerine tek dizi olarak
ister. HTTP/REST sunucusu acilmaz. Checkout/Node yolu degisirse kurulum ve
client kaydi yenilenmelidir.

Tanim installer ownership manifestine hash ile kaydedilir. Ayni tanimla
ikinci kurulum dosyayi degistirmez. Sahip olunan eski tanim guncellenmeden
once byte backup alinir. Onceden var olan veya elle degistirilmis tanim
backup ile korunur; kurulum `NOT_READY` dondurur. Korunan dosyayi ve
backup'i inceleyip gerekli degisikligi kendiniz birlestirin.

Worker profilleri runtime `config/config.json` icinde secilir. `backend`
alani olmayan eski profil OpenCode olarak devam eder. CLI icin
`default_worker_profile` veya bir MCP istegindeki `worker_profile` acikca
secilmelidir; CLI bulunamazsa OpenCode'a otomatik gecis yapilmaz.

Ornek profil alanlari (diger config alanlarinizi koruyun):

```json
{
  "default_worker_profile": "codex-worker",
  "worker_profiles": [
    {
      "profile_name": "codex-worker",
      "provider_id": "codex",
      "model_id": "your-explicit-model",
      "backend": {
        "kind": "codex_cli",
        "executable": "C:\\approved-cli\\codex.exe"
      }
    }
  ]
}
```

Generic wrapper icin backend bicimi
`{"kind":"cli_json","command":["C:\\approved-cli\\worker.exe"]}` olur.
Native Windows executable yolu mutlak `.exe` olmalidir. Wrapper
`candidate-json-v1` protokolunde stdin JSON alip stdout'a tek aday JSON
yazmalidir; her genel amacli CLI bu protokolu dogrudan desteklemez.
Codex kendi mevcut CLI oturumunu kullanir; yeni API key olusturulmaz.

Worker ilk kurulumda varsayilan olarak kapalidir. Acmak icin kurulumdan
once CMD'de `set AITEST_WORKER_ENABLED=1` kullanin. Upgrade kayitli flag ve
ortam degerlerini korur; kurulum shell'indeki acik flag bunlarin ustune
yazilir. Verify sirasinda kayitli flag shell flag'inden once gelir.

Verify, dosyadaki gercek executable/argv/env ile SDK initialize,
tools/list ve salt okunur tools/call yapar. MCP, worker ve Maven readiness
ayri sonuclardir. CLI icin `READY / CONFIGURED`, secili profil ve yerel
executable baglamasinin bulundugunu belirtir; canli login, yetki veya model
cevabi kaniti degildir. CLI modelinin OpenCode sohbet varsayilaniyla ayni
olmasi gerekmez. Canli yetki ancak gercek istekte dogrulanir.

Windows native/JDK/Maven gereklilikleri ve proje root izinleri devam eder.
Docker/WSL/PS1 zorunlu degildir; native calisma OS sandbox degildir.
CI kapalidir. Musteri testlerini asil checkout'a uygulama ve yayin ayri
kullanici kararidir. Bkz. `configuration.md` ve `production-readiness.md`.
