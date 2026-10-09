# BACKLOG - Is Listesi

Durum degerleri: TODO, IN_PROGRESS, BLOCKED, VERIFIED. "Kod var" ile "dogrulandi" ayri tutulur.

| ID | Is | Ilgili R/AC | Durum | Bagimlilik | Kanit |
| --- | --- | --- | --- | --- | --- |
| W01 | Kok dosyalari + ai/ hafiza kurulumu (P00) | AC01, AC69, AC70 | IN_PROGRESS | - | ai/checkpoints/ |
| W02 | TS proje iskeleti: package.json, tsconfig, lockfile (P01) | - | TODO | W01 | - |
| W03 | Schema/domain: Zod semalari, hata siniflari (P01) | R06, R07 | TODO | W02 | - |
| W04 | MCP tool registry + v1/v2 adapter (P01) | AC02, AC03 | TODO | W02 | - |
| W05 | SQLite storage + migration + artifact store (P01) | R10, AC52, AC53 | TODO | W02 | - |
| W06 | Config katmani: configuration schema + yukleme (P01) | R15 | TODO | W02 | - |
| W07 | P01 testleri: stdio client tool list/call, DB kalicilik (P01) | AC02 | TODO | W03-W06 | - |
