# Uyumluluk

## Desteklenen ortamlar

| Bilesen | Surum | Not |
| --- | --- | --- |
| Node.js | 24 LTS ailesi (>= 24.0.0) | Uygulama basinda stabil patch lock edilir |
| TypeScript | 5.x strict | |
| JDK | 17+ (hedef projenin toolchain'i) | JavaParser helper JDK'si hedef bytecode'u degistirmez |
| Maven | 3.9.x (veya mvnw wrapper) | |
| SQLite | better-sqlite3 native binary | Windows/Linux'ta test edilir |
| OpenCode | 1.18.x (dogrulanan: 1.18.35) | Resmi MCP SDK 1.32.x ile |

## Dogrulanan surumler (2026-10-09)

| Paket | Surum |
| --- | --- |
| @modelcontextprotocol/sdk | 1.32.1 (npm latest; OpenCode 1.18.35 bagimliligi 1.29.0 ile ayni server/client export) |
| better-sqlite3 | 13.0.3 |
| zod | 4.6.5 |
| fast-xml-parser | 5.11.2 |
| vitest | 4.1.11 |
| JavaParser | 3.26.4 |
| JaCoCo | 0.8.12 (fixture POM'unda) |

## Bilinen uyum notlari

- OpenCode'un somut MCP SDK bagimliligi (1.29.0) ile en yeni SDK (1.32.x) ayni server/client export yapisini kullaniyor; ancak "en yeni SDK her OpenCode ile otomatik uyumlu" varsayimi gecersizdir. Kurulumda gercek surum matrisi kaydedilir.
- JaCoCo 0.8.12 XML raporunda `class` elementinde `classid` attribute'u YOK; class ID'ler `.exec` dosyasindadir.
- Node 20+ spawn'da `.cmd` dosyalari `shell:false` ile EINVAL verir; `cmd /c` ile cagirilir.
- npm/opencode `.ps1` sarmalayicilari execution policy engelli ortamlarda `.cmd` versiyonuyla kullanilir.
- JaCoCo agent JDK 25 ile CLDR instrument uyarisi verebilir; olcum etkilenmez.

## Desteklenmeyen / kapsam disi

- Gradle test yurutucusu: kapsam disi; `UNSUPPORTED_BUILD_SYSTEM` raporlanir.
- Python/JS/diger dillerin test uretimi: kapsam disi.
- Merkezi cok kullanicili SaaS, uzak paylasimli SQLite: kapsam disi.
- Windows'ta OCI container izolasyonu: kurulumda kabiliyet preflight ile dogrulanir; yoksa `BLOCKED_ISOLATION`.
