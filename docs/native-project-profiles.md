# Proje bazli Windows native calistirma

Private runtime `config/config.json` dosyasina istege bagli `native_execution_profiles` eklenir:

```json
{
  "native_execution_profiles": [
    {
      "project_root": "C:/projects/Example/backend",
      "java_home": "C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot",
      "run_skipped_unit_tests": true
    }
  ]
}
```

Mevcut config'in diger alanlari korunur. Yol tam Maven kokunu eslestirir; ust dizin veya baska proje bu profili miras almaz. JAVA_HOME yalniz ilgili job'un Maven cocuk sureclerine aktarilir. UI ve MCP ayni application/dispatcher/runner kodunu kullanir. Config degisikliginden sonra uzun omurlu UI/MCP server'i yeniden baslatilir.

Profil job istegi/goal ve native toolchain kaydina baglanir. Resume kayitli profili kullanir; yeni server ortami veya config mevcut job'un JDK/skip kararini sessiz degistirmez. JDK/Maven dosya kimligi degisirse mevcut fail-closed gate korunur.

`run_skipped_unit_tests` varsayilan false. Acik true degeri, owned execution kopyasinin POM'undaki literal `skipTests=true` / `maven.test.skip=true` bayraklarini yalniz Maven kosusu boyunca false yapar. `skipITs` degismez. Orijinal customer checkout'a yazilmaz. Native FileId/hash bagli rename, CREATE_NEW copy, delete ve NO_REPLACE geri alma kullanilir. Unexpected degisiklikte diger moduller geri alinir, job basarisizdir; yabanci dosya ezilmez. Baslangic/aday/final ayni profille calisir.

Kosunun `target/aitest-baseline-logs/unit-test-skip-overrides.json` (aday/final icin ilgili log dizini) dosyasi once/sonra POM hash'lerini ve restore sonucunu tutar; UI preflight olayi override'i bildirir. Stage receipt hash'i dogrulanmadan final isimle yayinlanmaz. Kesintide owned kopyada yedek kalabilir; resume yeni source kopyasi kurar ve immutable toolchain kimligini yeniden dogrular.

Basarisiz baseline: immutable failure artifact'inde en fazla12 satir/400karakter, 128KiB log penceresi icinden redakte ERROR ozeti ve sonraki adim bulunur. UI metin olarak gosterir. Gercek testler basarisizsa genel coverage kabul edilmez ve model/sinif onerisi acilmaz. Eski kayitlarda diagnostic alani bulunmayabilir.
