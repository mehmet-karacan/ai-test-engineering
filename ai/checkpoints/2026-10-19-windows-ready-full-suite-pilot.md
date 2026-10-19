# Checkpoint - Windows hazirlik tam suite ve gercek MCP kanarisi

- Tarih: 2026-10-19
- Dal: `codex/windows-ready-20261019`; test edilen kod HEAD `4392c8b4e554a9f1c3706ec3153b1ba56b983e45`, clean, tree digest `4c8d307233ed11b3b7e96e95a5a052ade9d89556cc619c583ba5bcc4d865b9c2`.
- Kapsam: yalniz Windows native; Docker/macOS/GitHub CI kapali. Ana worktree'deki uc kullanici dosyasi ve musteri checkout'u korunur.

## Tam Windows regresyonu

- Komut: ozel AC67 model artifact'i `AITEST_AC67_MODEL_OUTPUT` ile, `npm.cmd test -- --maxWorkers=2`; exit 0, **121/121 dosya, 1000/1000 test PASS**, 0 failure, 326.32 s. Retry/timeout override kullanilmadi.
- Log repo disinda `%LOCALAPPDATA%\Temp\windows-ready-4392c8b-full-suite.log`; SHA-256 `9497B6C2E575C902558527A68788DD22C5C8A7BA250FED20F598F0D832E9E388`.
- `npm.cmd run typecheck` PASS; `npm.cmd run build` PASS; `npm.cmd run lint` exit 0 (0 error, 89 warning); `release-verify --local` exit 0 LOCAL_PASS. Bu son komut full GO degildir.
- Buyuk proje koku salt-okunur iterative `SourceSnapshot.walk()` ile 134800 dosya/15294 ms tarandi. Kopyalama ve tum dosyalari hashleyen tam manifest bu kokte calistirilmadi; 64 MiB tek-dosya/snapshot sinirlari ayrica korunur.

## Yeni binary gercek MCP kanarisi

- Job `0b4d0120-15d6-4295-9f0d-ff6914fb7f10`, target `tr.com.innova.gpu.utils.GpuFileUtils`, model `litellm/GLM-5.3-Flash-IT`, TEST_ONLY, LINE/BRANCH %100. Ayrik private store `%LOCALAPPDATA%\ai-test-engineering\pilot\windows-ready-4392c8b-canary`; eski sahipli 983 dosyali gpu-backend kopyasi salt-okunur kaynak olarak kullanildi. Kaynak sinif SHA-256 `5CBA9D50FF652095A006108EFD20D816DEFFEE902A284EEF55E1D7C1A5D85BA5`; musteri checkout'undaki ayni dosya hash'iyle eslesir.
- Gercek stdio MCP: initialize, tools/list, project_inspect, test_start, status, test_cancel(reason=pause), test_resume, result. PAUSED -> farkli model resume `CONTRACT_CONFLICT`, job halen PAUSED -> dogru model resume `RUNNING` ayni job. Native baseline 2/2 PASS; 1 aday ADOPTED, aday Maven 7/7 PASS, final replay 7/7 PASS.
- Terminal `COMPLETED/TARGET_REACHED`, verification `AFFECTED_SCOPE`, LINE 9/9 ve BRANCH 2/2 (%100), tests_added=1, tests_modified=0, production_changed_files=0, test_only_policy=PASSED, apply_state=NOT_REQUESTED.
- Report06 `PUBLISHED`, private `jobs/0b4d0120-15d6-4295-9f0d-ff6914fb7f10/reports/index.html`; SHA-256 `91491088C3F7C51131BD52666AC98FECA0CFE723DA129D93EFC7589C37E80606`, 1308914 bayt. Ham DB/model/Maven log/HTML ve musteri kaynak kodu Git'e alinmadi.
- Musteri checkout'unda secili production/test dosyalarinin `git status --short` ciktisi bos; kaynak production SHA degismedi. Geçici X: subst pilot bitince kaldirildi.

## Karar ve devam

- Bu kanari urun davranisi icin olumlu kanittir; 2026-10-19 dort zor siniflik arastirma pilotunun 7/12 durumunu geriye donuk PASS yapmaz. T01/T03/T02/T04 engelleri ayri kayitta korunur.
- WN75 yeni rapor icin kullanici inceleme/kabul kaydi bekler. Son dokuman commitinden sonra build/source identity yenilenmeli, o temiz HEAD icin Windows suite ve private manifest/full verifier kontrol edilmeli. Kullanici incelemesi ve full gate tamamlanmadan yeni dal GO degildir; G2 customer apply ve G3 yayin otomatik acilmaz.
