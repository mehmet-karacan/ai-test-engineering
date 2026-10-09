# Veri Sozlugu (Data Dictionary)

SQLite tablo/kolon anlamlari. Tablo/kolon adlari ASCII snake_case; tarihler UTC epoch ms; entity ID'ler UUID TEXT; SHA-256 64 hex.

## projects

| Kolon | Tip | Anlam | Null | Not |
| --- | --- | --- | --- | --- |
| id | TEXT | UUID | hayir | PK, CHECK length=36 |
| name | TEXT | Proje adi (kok dizin adi) | hayir | |
| normalized_remote | TEXT | Kimlik bilgisinden arindirilmis git remote | evet | Remote'suz projede NULL |
| identity_kind | TEXT | `git_remote` / `local_only` | hayir | CHECK |
| latest_snapshot_id | TEXT | En guncel snapshot | evet | FK yok (gecici) |
| created_at | INTEGER | Olusturma (UTC epoch ms) | hayir | |
| updated_at | INTEGER | Guncelleme | hayir | |
| row_version | INTEGER | Optimistic locking | hayir | >= 0 |

## project_locations

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| project_id | TEXT | FK -> projects.id | |
| canonical_root | TEXT | Canonical mutlak yol | project_id + root UNIQUE |
| platform | TEXT | win32/linux/darwin | |
| last_seen_at | INTEGER | Son gorulme | |

## project_snapshots

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| location_id | TEXT | FK -> project_locations.id | |
| parent_snapshot_id | TEXT | Onceki snapshot | |
| head_commit | TEXT | Git HEAD SHA | |
| dirty_digest | TEXT | Dirty kaynak hash ozeti | |
| parser_version | TEXT | Envanter parser surumu | |

## modules

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| snapshot_id | TEXT | FK -> project_snapshots.id | |
| relative_path | TEXT | Reactor kokune gore | snapshot + path UNIQUE |
| group_id / artifact_id / version | TEXT | Maven koordinatlar | |
| packaging | TEXT | jar/pom/... | |

## java_packages

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| module_id | TEXT | FK -> modules.id | |
| qualified_name | TEXT | Java package adi | module+source_set+package UNIQUE |
| source_set | TEXT | main/test | |

## code_symbols

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| package_id | TEXT | FK -> java_packages.id | |
| kind | TEXT | class/interface/enum/record/method/field/nested | CHECK |
| fqn | TEXT | Tam Java adi | nested/overload ayrimi korunur |
| relative_path | TEXT | Kaynak dosya | |
| source_sha256 | TEXT | Dosya hash | |
| line_start / line_end | INTEGER | Satir araligi | |

## test_cases

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| module_id | TEXT | FK -> modules.id | |
| symbol_id | TEXT | FK -> code_symbols.id | |
| test_kind | TEXT | junit4/junit5/parameterized/dynamic/unknown | CHECK |
| logical_key | TEXT | Normalizasyonlu test kimligi | module+key+path UNIQUE |
| source_sha256 | TEXT | Dosya hash | |

## test_jobs

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| location_id | TEXT | FK -> project_locations.id | |
| lifecycle | TEXT | QUEUED/RUNNING/WAITING_INPUT/PAUSED/INTERRUPTED/COMPLETED/FAILED/CANCELLED | CHECK |
| phase | TEXT | discovery/preflight/baseline/analysis/planning/generation/repair/verification/gap_review/final_validation/reporting | |
| outcome | TEXT | TARGET_REACHED/.../SOURCE_CHANGED | NULL olabilir |
| verification_level | TEXT | UNVERIFIED/TARGET_ONLY/AFFECTED_SCOPE/FULL_DECLARED_SCOPE | CHECK |
| apply_state | TEXT | NOT_REQUESTED/READY_FOR_REVIEW/APPLYING/APPLIED/CONFLICT/REJECTED | CHECK |
| request_digest | TEXT | Idempotency fingerprint | |

## job_events

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | INTEGER | AUTOINCREMENT | PK |
| job_id | TEXT | FK -> test_jobs.id | job+sequence UNIQUE |
| sequence | INTEGER | Append-only sira | |
| event_type | TEXT | job_created/test_start_accepted/... | |
| occurred_at | INTEGER | UTC epoch ms | |

## artifacts

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| job_id | TEXT | FK -> test_jobs.id | |
| kind | TEXT | checkpoint_manifest/report_html/... | |
| relative_store_path | TEXT | Blob deposuna goreli yol | sha256+path UNIQUE |
| sha256 | TEXT | Icerik hash | CHECK length=64 |
| bytes | INTEGER | Boyut | >= 0 |
| sensitivity | TEXT | public/internal/sensitive | CHECK |
| status | TEXT | PENDING/READY/QUARANTINED/DELETED | CHECK |
| pin_reason | TEXT | Neden silinmez | resume/best/pending_apply |

## checkpoints

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| job_id | TEXT | FK -> test_jobs.id | |
| parent_checkpoint_id | TEXT | FK -> checkpoints.id | |
| manifest_artifact_id | TEXT | FK -> artifacts.id | Manifest blob UUID |
| source_digest | TEXT | Kaynak fingerprint | |
| generation | INTEGER | Monoton zincir | >= 0 |
| kind | TEXT | best/tested/partial | CHECK |

## job_leases

| Kolon | Tip | Anlam | Not |
| --- | --- | --- | --- |
| id | TEXT | UUID | PK |
| job_id | TEXT | FK -> test_jobs.id | |
| owner_id | TEXT | Sahip kimligi | |
| fencing_token | INTEGER | Monoton artan | >= 0 |
| expires_at / heartbeat_at | INTEGER | UTC epoch ms | |
| process_identity | TEXT | PID + instance | |

## schema_migrations

| Kolon | Tip | Anlam |
| --- | --- | --- |
| version | INTEGER | Tek sirali migration |
| checksum | TEXT | SQL checksum (uyum kontrolu) |
| applied_at | INTEGER | UTC epoch ms |

## Retention

- Best/tested checkpoint blob'lari, uygulanmamis onayli patch'ler ve resume icin zorunlu blob'lar otomatik silinmez.
- Rejected candidate dosyalari staging alaninda; orijinal projeye veya best set'e karismaz.
- Kullanici verisi silme acik kapsam/onay gerektirir.
