# ADR-007: Windows yerel guvenlik koprusu onerisi

- Tarih: 2026-10-13
- Durum: DAR KAPSAMLI ONAY - kullanici 2026-10-13 tarihinde bu sohbet icinde "Izin veriyorum" dedi. Yerel kopru uygulamasi ve gerekli compiler/SDK veya denetlenmis bagimlilik kullanimi onaylandi. G1/G2/G3 ayri kapilardir.
- Gorev: `AITE-WINDOWS-SUBAGENT-PILOT-006 v1.0`, S02 WN22-WN23 ve S03 WN27/WN30; S01 WN12-WN13 ile temas.

## Gozlenen engel

Kurulu Node v24.14.1 `child_process` arayuzu Windows Job Object olusturma, sureci askida baslatip Job Object'e baglama ve job handle kapanisinda butun JVM agacini bitirme islemlerini sunmuyor. `taskkill /T /F` tek basina sert kapatma sonrasi sahiplik ve PID tekrar kullanimini ispatlamiyor. Windows'ta `fs.constants.O_NOFOLLOW` yok; Node `fs.open` ara dizin junction'larini handle'a baglayarak takip etmeme garantisi vermiyor. Mevcut `package-lock.json` icinde bu Win32 API'lerini saglayan bir kopru yok. `cl` normal PATH'te gorunmese de VS 2022 BuildTools MSVC 14.44.35207 ve Windows SDK 10.0.26100.0 bu makinede kurulu; user-scope kurulum gerekmiyor. WN22-WN23 ile adversarial no-follow kabulune ancak derlenmis kopru ve gercek Windows kaniti sonrasi PASSED yazilir.

## Onerilen dar kapsam

1. Sahipli process launcher: Win32 `CreateProcess` ile cmd/Maven baslangicini askida ac, yeni Job Object olustur, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` ayarla, process'i job'a bagla, sonra thread'i devam ettir. Startup/assign/stdio hatasinda child'i sonlandir ve sonucu tipli hata olarak dondur. Run/job/attempt ve generation/fence kimligi SQLite tarafinda kalir. Cancel, timeout, parent hard-kill, JVM child kapanisi ve unrelated Java/Node sureclerinin korunmasi gercek Windows testleriyle olculur.
2. Handle tabanli dosya islemleri: Kaynak ve hedefte her parent/final komponenti reparse point takip etmeden ac; handle dosya kimligini, root altinda kalmayi ve copy/yayin oncesi-sonrasi kimlik esligini dogrula. Junction swap, hard-link/case/8.3 alias, baska volume ve izin hatasi fixture'lariyla fail-closed davranisi olc. Yalniz final dosyada no-follow yeterli kabul edilmez.
3. Binary kaynagi, surumu, SHA-256, imza/provenance ve dagitim yolu kaydedilir. Yeni helper urunun normal kurulum/test akisi ile paketlenir; customer checkout'una veya genel PATH'e yazilmaz. Admin yetkisi, kurum policy bypass'i, Docker/WSL/PowerShell onkosulu eklenmez.

## Karar secenekleri

- **Dar yerel kopruye izin ver:** Gereken compiler/SDK veya denetlenmis prebuilt binary/dependency secimi ayrica somutlastirilir; implementasyon, bagimsiz review ve gercek Windows kabulunden sonra gate acilabilir. Bu karar G1 GPU Fusion Maven/model, G2 customer apply veya G3 yayin onayi vermez.
- **Kopruyu simdilik acma:** Mevcut fail-closed `NATIVE_PROCESS_OWNERSHIP_UNVERIFIED` korunur. S02/S03 ilgili maddeleri ve dolayisiyla 006 full karar NO_GO kalir; baska teknik dilimler belge/fixture seviyesinde surdurulebilir.

Resmi dayanak: [Node child_process](https://nodejs.org/api/child_process.html), [Node fs](https://nodejs.org/docs/latest-v24.x/api/fs.html), [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject), [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).
