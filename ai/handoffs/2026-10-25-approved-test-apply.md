# Kullanici onayli test uygulama

BASE8349de7 OpenCode-only. Kullanici bu akisi acikca istedi. Yeni frontend,
generic CLI/provider, customer kaynak degisikligi, CI veya G3 yayin yok.

Engine/native/MCP/report tamamlandi. Preview ve actual MCP form onayi;
kalici plan/operation + lease/fence; create-only FileId/SHA journal;
post-apply original'in verified owned kopyasinda filtre olmadan tum Maven
testleri/JaCoCo; tam kanit sonrasi APPLIED. Failure/cancel rollback yalniz
sahipli degismemis dosya; bilinmeyen/kullanici edit'i RECOVERY_REQUIRED.
Recover eski journal'i temizler; yeni apply icin yeni onay gerekir.
Mevcut test/source/POM dosyasi overwrite edilmez. Source/test envanteri
ilk baseline ve kabul edilen finalin module-qualified invocation kimligidir.
Rapor generation sonucunu degistirmeden uygulamayi ekran/print/JSON'da sunar.

Kaniti ai/acceptance/approved-test-apply.json. 6303f15 tam156dosya1403PASS,
0FAIL0SKIP. Son3f98656 hash metadata deltasi 3dosya33ilgilitestPASS,5yeni;
bu deltanin ardindan ikinci tam suite iddiasi yok. Gercek yeni canary
1GLM/1dosya/3yeni test,6/6tumtestPASS,80/80TARGET_REACHED,APPLIED; kendi
DB/artifact strictbackup'i de PASS. Yeni/onceki tum kaynak hash'leri korundu.
Chrome offline/screen/print/afterprint/PDF PASS; SDK form roundtrip actual,
onay sentetik testharness'tir. KuruluOpenCode2.1.4 initialize formcapacity
ayrica dogrulandi; actual human UI click iddiasi yok.

Bagimsiz coordinator/native/hash review P1P2=0. Review'da kapananlar:
store yol containment/junction swap; yabanci journal hardlink; init Node
mutation'lari native pinnedroot'a tasindi; baseline-only modul/tekrarli
testkimligi/eskiskip; APPLIED atomik invariant; source-change sonuc sayaci;
Windows allowedroot case/separator; job_contract semantic hash yerine
gercek dosya SHA metadata. Sonuncu13eski runtime kaydi semantic/canonical/
jobbinding/byteproof ile atomicCAS+audit olarak onarildi, dosyalar ayni.
Once onlineDB+397referansdosya/16reportset korundu, sonra strict oldschema9
backupPASS. Gelecek write sadece actualbyteSHA kullanir; legacy otomatik
guvenilir hale getirilmez veya overwrite edilmez.

Raw kanit/log/model/provider/DB public degildir. Runtime/private TEMP'te.
Deneme sirasinda olusan yarim bulkbackup'i silme istegi automatic policy
tarafindan reddedildi; kopya korundu. Asil runtime silinmedi; dogrulanmis
backup ayridir. Bu cleanup yayinlanmis feature'in isleyisini engellemez.

Devam: metadata commit, main FF/build/owned skill upgrade/verify-install,
schema10+eski verinin korunmasi/9tool smoke, final localgate ve remoteHEAD.
Asil proje testlerini calistirma kapsami FULL_PROJECT_SNAPSHOT'tir. Runtime
ve asil proje ayni Windowsvolume olmalidir. Bos yeni dizinler kalabilir.
99.99 veya tum projelerde %80 garantisi yok; CI kapali/G3 kullanicida.

## Teslim kontrolu

Maina420ef6 FF/build/native provenance/localgate/verify-install PASS.
Actual registered MCP9tool, test_apply defaultpreview/recover schema PASS.
Primary schema10; backup ile job/project/location/artifact/event/approval
satirlari birebir ayni, integrityok/FK0. Kullanici config ve OpenCode config
byte-ayni. Kurulu eski skill'in8349paketine BYTEEXACT oldugu kanitlandi;
missing/stale ownership once backup ve manifestCAS ile duzeltildi, standart
skill upgrade tamamlandi. Installer'in custom-skill korumasi gevsetilmedi.
Maina420ef6 remoteHEAD ile ayni olarak pushlandi. Son metadata kaydi yeni
urun kodu eklemez; build/localgate/stdio ve final remoteHEAD teslim turn'unde
tekrar dogrulanir. Feature kapsaminda bekleyen is yok.
