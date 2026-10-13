# S02 WN22/WN23 dis Job parent hard-kill topology probe: NO_GO

Tarih: 2026-10-13. Dal: `codex/windows-native-006-s02`. Gercek musteri Maven/model, GPU, G1/G2/G3 acilmadi.

## Soru ve fixture

Mevcut `wn-job-object` parent hard-kill testi ust Windows Job'un helper'i da oldurmus olmasini dislamiyor. Bagimsiz parent hard-kill/owner reaper kaniti icin fixture parent'ini ust Job disina cikarabilir miyiz?

`tests/fixtures/windows-job-topology.cpp` yalniz mevcut process ve `CREATE_BREAKAWAY_FROM_JOB` ile olusturdugu kisa yasamli cocugun `IsProcessInJob` durumunu okur. `tests/fixtures/build-windows-job-topology.cmd` mevcut MSVC Build Tools/SDK ile Temp'e derler; admin, WMI, scheduler veya global policy degisikligi yoktur. Kaynak SHA-256 `f73faa6ddd54522bdcbba4d0db53c7c288410e8410b068193c524e0015e29bfd`; uretilen exe SHA-256 `a01ba7117902cc31405abffb3923b11c9a87b091ed7b038a9a32ada7366feb55`. Derleme `/W4 /WX` exit 0.

Gercek Windows ciktisi:

```
parent_in_job=1 limits_query=1 flags=0x00002800
breakaway_create=1 child_in_job=1
probe_exit=0
```

`0x2800` anlik sorgulanan Job'da `BREAKAWAY_OK` ve `KILL_ON_JOB_CLOSE` bitleriyle uyumlu; basarili `CREATE_BREAKAWAY_FROM_JOB` bile cocugu tum Job zincirinden cikarmadi. [Microsoft Nested Jobs](https://learn.microsoft.com/en-us/windows/win32/procthread/nested-jobs) belgesine gore immediate Job breakaway izni versin, ust zincirde izin vermeyen bir Job varsa cocuk zincirden tamamen ayrilmaz. Bunun bu hosttaki nedeni ust Job olabilir; fixture ust zincirin tam kimligini ispatlamaz. [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) ve [IsProcessInJob](https://learn.microsoft.com/en-us/windows/win32/api/jobapi/nf-jobapi-isprocessinjob) API sozlesmeleri sonucu yorumlamak icin kullanildi.

## Kabul siniri

Bu hosttan ust Job disinda parent yaratma kaniti yok. WMI/scheduler gibi ust Job/policy bypass yollarina girilmedi. Dolayisiyla ust Job disinda gercek parent hard-kill -> helper stdin EOF -> owned tree drain zinciri WN23 icin NOT_VERIFIED/NO_GO. Onceki bagimsiz stdin EOF ve ust Job icindeki parent hard-kill testleri kendi dar sinirlarinda gecerli; birlikte ayni nedensel zinciri kanitlamaz.

Fixture derleme cikti klasoru `C:\Users\mkaracan\AppData\Local\Temp\aitest-wn-job-topology-acc220a188e54fceb99c2380ea9d2811` icin mutlak Temp/prefix guard'li `Remove-Item -Recurse` otomatik policy tarafindan `blocked by policy` olarak reddedildi. Alternatif silme/bypass denenmedi; klasor yalniz probe exe/obj icerir. Onceki ACL spike fixture'ina dokunulmadi.
