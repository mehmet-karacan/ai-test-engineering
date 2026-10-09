# Mimari

## Genel bakis

Tek urun deposu ve yerel uygulama: moduler monolit. Gereksiz mikroservis, Redis, mesaj broker'i veya ikinci DB yoktur.

```text
OpenCode CLI/TUI veya baska MCP istemcisi
    |
    | Kisa, typed MCP tool cagrilari
    v
MCP Adapter (resmi SDK v1 uyumlu profil)
    |
    v
Application Services + Durable Job Orchestrator
    |-- Project Discovery / Java Inventory
    |-- Test Plan / Gap Prioritizer / Plateau Analyzer
    |-- Policy Guard / Patch Applier / Kalite Kapilari
    |-- SQLite Repository / Artifact Store / Recovery Manager
    |-- Offline Report Generator
    |
    |-- OpenCode Worker Adapter
    |      -> Sinirli worker session (bash/edit/task/web kapali)
    |
    `-- MavenRunner (process supervisor)
           -> Build / JUnit / Surefire / JaCoCo
           -> Dogrulanabilir run evidence
```

## Katmanlar

| Katman | Konum | Sorumluluk |
| --- | --- | --- |
| MCP | `src/mcp/` | Tek typed tool registry, stdio entry, server kurulumu |
| Application | `src/application/` | Use-case'ler: inspect, start, status, query, patch apply |
| Domain | `src/domain/` | Job state, hata siniflari, tool semalari |
| Discovery | `src/discovery/` | Snapshot, POM kesfi, Java envanteri |
| Orchestration | `src/orchestration/` | Build plan, baseline, candidate loop, plateau, checkpoint, lease, recovery |
| Workers | `src/workers/opencode/` | Guvenli worker config, rol prompts, model cikti semalari, OpenCode HTTP client |
| Runners | `src/runners/` | MavenRunner + process supervisor |
| Policies | `src/policies/` | PolicyGuard (allowlist), kalite kapilari |
| Coverage | `src/coverage/` | JaCoCo XML parser, coverage hesabi |
| Storage | `src/storage/` | SQLite migration, repository'ler, artifact store |
| Reporting | `src/reporting/` | Offline rapor uretimi, test_apply |
| Configuration | `src/configuration/` | Config schema + yukleme |

## Is mantigi kurallari

- MCP request handler'lari is mantigi icermez; application service cagirilari yapar.
- Is motoru transport, model ve storage adapter'lerinden bagimsizdir.
- DB transaction'i boyunca model veya process sonucu beklenmez.
- Uzun isler (Maven run) async olarak yurutulur; event loop'u bloke etmez.

## Durum yonetimi

- `lifecycle`, `phase`, `outcome`, `verification_level`, `apply_state` ayri alanlardir (src/domain/job-state.ts).
- Checkpoint'ler atomic publish protokoluyle uretilir: tmp dosya -> content-addressed blob rename -> kisa DB transaction.
- Lease/fence: ayni job'u iki process yonetemez; token monoton artar.
- Kesinti sonrasi: RecoveryManager ayni job'dan devam plani uretir (resume/rebaseline/fresh_start).
