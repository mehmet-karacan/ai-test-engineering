# Kabul Matrisi - AC01-AC70

Durum degerleri: NOT_RUN, BLOCKED, FAILED, PASSED. Her PASSED icin kanit dosyasi/commit referansi zorunludur.

Guncelleme: 2026-10-09 (ilk kurulum; tum satirlar NOT_RUN).

## 20.1 Entegrasyon, proje ve kapsam

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC01 | Bos repo kurulum ve ikinci modelle devam | NOT_RUN | - |
| AC02 | OpenCode-uyumlu MCP profili | NOT_RUN | - |
| AC03 | Yeni MCP protokol profili | NOT_RUN | - |
| AC04 | Tek cumleli talep | NOT_RUN | - |
| AC05 | Cok modullu reactor | NOT_RUN | - |
| AC06 | Ayni isim/farkli FQCN veya modul | NOT_RUN | - |
| AC07 | Custom test root / parent profil | NOT_RUN | - |
| AC08 | Paket/modul veya cok hedef | NOT_RUN | - |
| AC09 | Git'siz lokal proje / iki checkout | NOT_RUN | - |
| AC10 | Dirty/untracked kaynak | NOT_RUN | - |
| AC11 | Windows bosluk/Unicode/case/path | NOT_RUN | - |
| AC12 | Envanter stale/silinmis kaynak | NOT_RUN | - |

## 20.2 Gercek test ve coverage

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC13 | Java8/JUnit4 fixture | NOT_RUN | - |
| AC14 | Java17/JUnit5+Mockito fixture | NOT_RUN | - |
| AC15 | Java21/cok modul fixture | NOT_RUN | - |
| AC16 | Mevcut testi olmayan sinif | NOT_RUN | - |
| AC17 | Bozuk/unstable baseline | NOT_RUN | - |
| AC18 | JaCoCo argLine ve existing agent | NOT_RUN | - |
| AC19 | Eski exec/XML veya class ID uyusmazligi | NOT_RUN | - |
| AC20 | Aggregate/child tekrar sayimi | NOT_RUN | - |
| AC21 | %89.96 sonucu, %90 hedef | NOT_RUN | - |
| AC22 | Branch 0 / line debug yok / report eksik | NOT_RUN | - |
| AC23 | Cok hedefte %100 ve %80 | NOT_RUN | - |
| AC24 | Surefire tarafindan kesfedilmeyen yeni test | NOT_RUN | - |
| AC25 | Exception testi coverage artirmiyor | NOT_RUN | - |
| AC26 | Tam final regresyon | NOT_RUN | - |
| AC27 | Erisilebilir %90 hedefi | NOT_RUN | - |
| AC28 | Sinirli test-only hedefe ulasamiyor | NOT_RUN | - |
| AC29 | Model uydurma coverage/sonuc donuyor | NOT_RUN | - |
| AC30 | POM degistirmeden olcum mumkun degil | NOT_RUN | - |

## 20.3 Kalite ve guvenlik

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC31 | Production/POM/config yazan patch | NOT_RUN | - |
| AC32 | Test silme/ignore/skip/assertion gevsetme | NOT_RUN | - |
| AC33 | Bos/tautolojik/duplicate/mock-SUT test | NOT_RUN | - |
| AC34 | Anlamli existing assertion helper | NOT_RUN | - |
| AC35 | Private reflection/public API degisikligi | NOT_RUN | - |
| AC36 | Test source ile production FQCN shadow | NOT_RUN | - |
| AC37 | Test kaynaklarindaki prompt injection | NOT_RUN | - |
| AC38 | Symlink/junction/traversal/komut enjeksiyonu | NOT_RUN | - |
| AC39 | Runner host source/home/secrets erisimi | NOT_RUN | - |
| AC40 | Test process network/process/disk kotasi | NOT_RUN | - |
| AC41 | Sahte/bozuk XML, DTD/XXE ve XSS | NOT_RUN | - |
| AC42 | Global OpenCode config/plugin mirasi | NOT_RUN | - |
| AC43 | Model secret ve ic endpoint redaction | NOT_RUN | - |
| AC44 | Sandbox/provider eksik | NOT_RUN | - |

## 20.4 Kesinti, storage ve uygulama

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC45 | Analiz/generation sirasinda hard kill | NOT_RUN | - |
| AC46 | Maven/JVM sirasinda kill ve resume | NOT_RUN | - |
| AC47 | Artifact publish ile DB commit arasinda kill | NOT_RUN | - |
| AC48 | Ayni job'a iki resume/start | NOT_RUN | - |
| AC49 | Lease'i dusmus worker sonradan cevapliyor | NOT_RUN | - |
| AC50 | Yeni modele gecis | NOT_RUN | - |
| AC51 | Kaynak/POM/dirty dosya arada degisiyor | NOT_RUN | - |
| AC52 | Disk dolu/DB busy/DB schema uyumsuz | NOT_RUN | - |
| AC53 | Migration + WAL backup/restore | NOT_RUN | - |
| AC54 | Retention/kota | NOT_RUN | - |
| AC55 | Cancel/pause/time budget | NOT_RUN | - |
| AC56 | Basarisiz ayni strateji tekrar ediyor | NOT_RUN | - |
| AC57 | Apply onayi yok/auto-approve belirsiz | NOT_RUN | - |
| AC58 | Apply onayi + sonradan dosya degisimi | NOT_RUN | - |
| AC59 | Multi-file apply sirasinda kesinti | NOT_RUN | - |
| AC60 | Tekrar apply | NOT_RUN | - |

## 20.5 Rapor, dagitim ve tam kullanici deneyimi

| AC | Senaryo | Durum | Kanit |
| --- | --- | --- | --- |
| AC61 | HTML/JSON/DB tutarliligi | NOT_RUN | - |
| AC62 | Offline HTML ve baglantilar | NOT_RUN | - |
| AC63 | Basarisiz/blocked job raporu | NOT_RUN | - |
| AC64 | Envanter/gecmis sorgulari | NOT_RUN | - |
| AC65 | Windows/Linux temiz kurulum/tekrar/uninstall | NOT_RUN | - |
| AC66 | Model auth/429/timeout/context/schema hatasi | NOT_RUN | - |
| AC67 | Gercek yetkili OpenCode+LiteLLM pilotu | NOT_RUN | - |
| AC68 | Model veya OpenCode kapatilip ertesi oturum resume | NOT_RUN | - |
| AC69 | Urun gelistirmesinde model handoff | NOT_RUN | - |
| AC70 | Git teslimati | NOT_RUN | - |
