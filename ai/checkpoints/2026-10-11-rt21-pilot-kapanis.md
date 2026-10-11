# Checkpoint: 2026-10-11 - RT21 pilot kapanis (BLOCKED_PROVIDER kaydi)

## Gorev

- AITE-RUNTIME-ACCEPTANCE-003 v2.0; RT21/PRO56 sky_backend pilotu
- Onceki kayit: 2026-10-10-rt21-pilot-devam3.md (worker izolasyon teshisi)
- Kullanici karari: pilot bolgesi cok uzadi; kapsam disi notu ekleyip sonraki adimlarla BITIR

## Bu devirde tamamlanan ve push edilen isler

1. `76b429c`: worker prompt baglamina hedef sinifin gercek govdesi (10.2). generateCandidateFromWorker
   hedef dosyayi readFileSync ile okuyup WorkerPromptContext.class_body'ye ekliyor; buildWorkerPrompt
   govdeyi (12000 karakter sinirli) imza bolumunden once prompt'a giriyor.
   tests/contract/rt21-prompt-context.test.ts (5 test).
2. `f6e494a`: worker prompt'una cikti bicimi JSON zorlamasi (10.3). 'Cikti bicimi (zorunlu)' bolumu:
   yalnizca JSON; aciklama/markdown/kod blogu YAZMA; beklenen yapis + new_content tam java icerigi.
3. Test kaniti: 375/375 PASSED (44 dosya); release-verify exit 0; typecheck/build TEMIZ.

## Teshis zinciri (kanitli; diag-* Temp\opencode altinda)

1. spawn EINVAL: opencode.cmd shell:false ile spawn edilemez (Node v24 CVE-2024-27980) -> a4bd45d
2. MCP mirasi: --pure flag'i kullanici MCP config'i silmiyor; XDG_CONFIG_HOME/XDG_DATA_HOME worker'a
   ozel izole dizinle mcp keys [] -> 4884e99
3. MODEL_TIMEOUT (interaktif): model 'question' tool'u ile soru soruyor (state:running), session bitmiyor
   -> question DEFAULT_DISABLED_TOOLS'a eklendi -> 4884e99
4. INVALID_MODEL_OUTPUT: govdesiz prompt'ta model kaynak kodu isteyen aciklama yaziyor -> class_body
   eklendi -> 76b429c
5. Markdown cikti: JSON zorlanmazsa model markdown java kodu yaziyor -> cikti bicimi zorlamasi -> f6e494a

## Pilot kosulari (son durum)

- Baseline: ARTIK GECIYOR (baseline_ok; runBaseline NO_TESTS => exit 0; DockerMavenRunner provisioning'li)
- generation: degisken provider davranisi. Kanit: ayni prompt'ta 4 diag kosusundan 1'inde CHANGESET
  geldi (154s; changes:1; action:create; src/test/java altinda; 10929 chars; CandidateChangeSetSchema
  parse OK). Digerlerinde provider bos yanit + finish="length" (out=0) veya 300s cevapsiz.
- MCP pilot kosulari (e2e1a5da, 60f16968, 8e5dd5c0, 01b785f1, f3841d4b): MODEL_TIMEOUT (phase:generation)
- Pilot girdisi kanit: sky_backend (Spring Boot 3.0.13, Java 21, junit5+mockito, surefire skipTests=true,
  jacoco YOK) + HakedisHesaplaJobService + coverage %90 hedefi

## BLOCKED_PROVIDER kaydi (kullanici karariyla kapsam disi birakildi)

- Gercek proje pilotu (20.5/RT21) tamamlanamadi: kurum model provider'i (aihub-api.turktelekom.com.tr,
  GLM-5.3-Flash-IT) uzun cikti isteklerinde degisken davraniyor (bos yanit/finish=length/timeout).
- Urun tarafi hazir: worker izolasyonu, tool policy, prompt baglami (10.2/10.3), candidate loop,
  PATCH_ONLY kabul siniri kanitli; CandidateChangeSetSchema.parse basarili (diag-verify2 kosusu).
- Kullanici karari: pilot bolgesi kapatildi; sonraki adimlarla is bitirildi.
- Yeniden acilis kosulu: provider istikrarli yanit verdiginde veya baska yetkili model
  (litellm/Qwen3.8-27B-IT) denendiginde rt21-pilot2.mjs ile ayni komutlar surer.

## Kabul matrisi/PROJECT_STATE guncellemeleri

- ACCEPTANCE_MATRIX: gercek proje pilotu (20.5): BLOCKED_PROVIDER (provider degisken davranisi;
  kullanici karariyla kapatildi; urun tarafi hazir)
- PROJECT_STATE: acik blocker + sonraki somut is guncellendi

## Devam noktasi (yeni oturumda)

- Canli model benchmark (FIN14 trial plani): BLOCKED_KAYITLI; altyapi hazir
- Pilot yeniden acilis: yukaridaki kosulda; kanit zinciri bu kayitta
- Repoda bana ait olmayan untracked dosya: java-support/.../JavaMetadataScannerCoverageTest.java (dokunma)
- Lint'teki 1 error (release-verify.mjs sha256File unused) onceki devirlerden; kapsam disi

## Sinirlar (degismedi)

- Production/POM degisikligi YASAK; yalniz sky_backend src/test/java (PATCH_ONLY)
- Runtime veri (DB, blob, log) bu repoya yazilmaz; pilot script Temp\opencode altinda
- CI kapali; secret degerleri repoya yazilmaz ({env:...} referansi)
- Git kimligi: mehmet-karacan <karacan.mehmet@hotmail.com> (repo-local)
