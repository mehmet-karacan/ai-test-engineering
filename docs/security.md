# SECURITY - Tehdit Modeli ve Guvenlik Sinirlari (FIN13/8.6)

## 1. Tehdit modeli siniri (8.6)

- Generated test/kaynak/prompt/Maven konfigurasyonu ve output dosyalari **guvenilmeyen girdidir**.
- OS administrator'u veya trusted engine ile ayni kullanici haklarina sahip bir saldirgan karsisinda
  mutlak izolasyon iddia edilmez. Dosya hash'i butunluk/provenance aracidir; ayni hakli kotu niyetli
  actor'a karsi sihirli imza degildir.
- Modelin cevap vermesi dogru is davranisi oracle'i degildir.
- Bu sinirlar yerel, tek kullaniciya ozel dagitim icin gecerlidir; cok kullanicili platform degildir.

## 2. Guven sinirlari

| Sinir | Uygulama |
| --- | --- |
| Test-only yazma | PolicyGuard canonical containment + FORBIDDEN_PATTERNS (src/main, pom.xml, .git, coverage*.xml) |
| Egress | Test-yurutme egress `none`; dependency hazirlama ayri onayli asama; P04: provisioning settings YALNIZ izinli mirror'lari icerir (host settings devre disi) |
| Runner izolasyonu | Docker: non-root, read-only rootfs source, writable target mount, no-new-privileges, pids/memory/cpu limitleri |
| Capability probe | Sadece `docker info` degil; gercek run ile source yazma reddi + host secret + network + limit probe'lari (FIN02); P04: probe fail-closed (bos/eksik cikti capability uretmez), normal customer job probe'suz baslamaz (PP16) |
| Cache izolasyonu | P04: Maven cache job'a ozel volume (`aitest-m2-cache-<job_id>`); paylasilan cache cross-job bozulamaz (PP19) |
| Maven settings | P04: mount ONCESI secret taramasi (`scanMavenSettingsForSecrets`); credential'li/bos/eksik settings container'a girmez (PP19) |
| Worker izinleri | bash/edit/write/task/web/grep/glob kapali (allowlist bos) |
| Secret | Config'te secret degeri tasimaz; `{env:...}` referansi; profil secret scan (assertNoSecretValue) |
| Apply | Varsayilan preview; somut MCP insan onayi + kaynak/hash + native sahiplik journal'i + tam proje dogrulamasi; cakismada kullanici dosyasi korunur |
| Rapor XSS | escapeHtml tum untrusted metinler; harici CDN/script yok |

## 3. Yerel sentetik saldiri fixture seti (19.4)

Asagidaki saldiri denemeleri yerel fixture'larla isletilir; gercek kurum servislerine saldiri yapilmaz:

1. Kaynak yorumunda/README'de talimat injection (fin05-worker-chain.test.ts)
2. Modelin secret/host file okuma istegi (worker allowlist kapali; fin02/fin05)
3. Path traversal/junction (`../disari/`, canonical containment; policy-guard testleri)
4. SUT shadowing (quality-gate isSutShadowing; candidate zincirinde)
5. Coverage forgery/stale evidence (jacoco parser validity; RT10 stale XML reddi)
6. Test disable/filter oyunu (assertNoDisabled; FORBIDDEN_PATTERNS COVERAGE_REPORT)
7. HTML XSS (fin09-patch-export.test.ts)
8. Unauthorized apply (model metni onay degildir; somut batch icin MCP insan formu accept+approved:true gerekir; SDK/negatif onay testleri)
9. Late worker writes (stale fence red; fin07)
10. Cache poisoning (job'a ozel writable overlay; paylasilan trusted cache'e test kodu yazamaz — 8.3)

## 4. Zafiyet taramasi (19.2)

- Release adayi dependency envanteri dated advisory feed ile taranir (osv-scanner offline modu kurumca onayli ise).
- Scanner calismadiysa/feed eskiyse "0 vulnerability" YAZILMAZ; exact kapsam ve STALE/UNAVAILABLE kaydedilir.
- Model kendi kendine waiver veremez; dusuk/orta bulgular kanitli triage edilir.
- Tarama **urun** tedarik zincirini dogrular; customer dependency'lerini degistirm EZ.

## 5. Imza/checksum (19.3)

- Checksum butunluk kontroludur; kimden geldigini kanitlamaz.
- Kurum signing key yoksa paket `UNSIGNED/NOT_PUBLISHED` etiketi dogrudur; imzali kurumsal yayin iddiasi edilmez.
- Signing key/private certificate/secret'lar repoya YAZILMAZ.

## 6. Disclosure

Guvenlik bulgulari kendiliginden public issue/email gonderilmez; yerel kayit + yetkili review.
