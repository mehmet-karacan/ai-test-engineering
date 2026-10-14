# 006 coordinator S05-S09 checkpoint

- Gorev: `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`; dal `codex/windows-native-006`; coordinator dilimi.
- S05 production bridge: `JobDispatcher` CandidateLoop aday uretimini durable `AgentTaskRepository` + fenced `AgentScheduler` + bounded `FileSystemContextProvider` + `CandidateAgentSessionAdapter` akisina baglar. CandidateChangeSet schema dogrulanir, content-addressed artifact READY kaydi job ile iliskilendirilir; ayni job/snapshot/hedef/iteration/repair/model icin deterministic task id ve idempotency key kullanilir. Tamamlanmis artifact varsa yeni OpenCode session acilmaz.
- S06 effective Maven model: parent/profile/pluginManagement, custom source/test root, JUnit/Mockito/Surefire/JaCoCo, settings/toolchains byte digestleri ve normalized model digest frozen `BuildPlan` icine baglandi. Replay input/model degisince fail-closed assertion var. Bu dilim static POM provenance'tir; gercek `help:effective-pom` ve customer Maven kaniti yoktur.
- S07 readiness: worker model/provider binding ile Windows Maven/Java version probe ayri `READY/NOT_READY` ve evidence level olarak raporlanir. Install/verify handshake'i model veya Maven hazirligi yerine koymaz; secret degeri rapora tasinmaz.
- S09 release verifier: scope/mapping contract kendi obligation evrenine baglandi. Evren `WN01-WN80` + legacy `RETAINED/REPLACED` 311 satir = 391 zorunlu ID. Manifest task ve scope kimligi kontrol edilir; `passed:true`, exit 0, artifact hash/bytes ve identity zinciri fail-closed kalir. Legacy-only 274 fixture, OUT_OF_SCOPE 7 satir nedeniyle 267 verified + 124 missing + 7 invalid ile NO_GO olarak test edilir.

## Kanit

- `npm.cmd run build`: PASS; native helper verification PASS; build stamp yenilendi.
- Focused suite: 5 dosya / 62 PASS (S05 bridge, S06 effective model, S07 readiness/install, S09 release gate).
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: 0 error; mevcut repository lint uyarilari korunuyor.
- `git diff --check`: PASS.
- `node scripts/release-verify.mjs --local`: LOCAL_PASS; scope obligation universe 391.
- `node scripts/release-verify.mjs`: NO_GO, `EVIDENCE_MANIFEST_EKSIK`; gercek pilot/platform kaniti uydurulmadi.

## Kalan kapilar

- S02 native runner WN14-WN24, S03 WN25-WN31, S04 WN32-WN42 ve S07 WN61-WN66 icin full native/runtime evidence ve bagimsiz review hala acik olan satirlardir.
- S05 WN43-WN52 icin production bridge local contract seviyesinde; gercek onayli model session, independent reviewer ve runtime acceptance henuz yoktur.
- S06 WN53-WN60 icin static model slice tamamlandi; gercek native Maven/JaCoCo/final replay kaniti ve full matrix aciktir.
- S08 WN70-WN75 G1 kullanici onayi olmadan baslatilmaz; G2 original GPU Fusion checkout'unda yazma/apply yetkisi ayrica gerektirir.
- S09 WN67-WN69/WN76-WN80 gercek evidence manifest, full regression ve final review olmadan GO vermez.
- Customer checkout `C:\innova\projeler\gpu-fusion` degistirilmedi; push yapilmadi.
