# Sky Maven/JaCoCo hazirlik plani

Kullanici onayi: once onerilen oncelikli parcayi yap. Taban 6eda6a4; izole d03b worktree, codex/sky-readiness-20261022.

1. Kok neden: Sky java.version21, ortam25. JDK21 gercek kosusu 78e38b5f derlendi; NO_DISCOVERED_TESTS, literal skipTests=true. Ozgun checkout degistirilmedi.
2. Config proje bazli native_execution_profiles: exact Maven root, java_home, explicit run_skipped_unit_tests. Secim immutable goal/native record icinde; resume config degisikliklerinden etkilenmez. Global ortam degismez.
3. MavenRunner sadece job'un owned kokunde literal unit-test skip bayraklarini run boyunca false yapar; once/sonra SHA ve degisiklik kaydi log dizinine yazilir, finally byte restore. Tum baslangic/aday/final ayni runner. Ozgun checkout yolu reddedilir. XML disindaki kod/test degismez.
4. Basarisiz baseline icin sinirli/redakte Maven error ozeti + eylemli aciklama immutable failure artifact'ine; UI textContent ile gosterir. Eski kayitlar uyumlu.
5. RED/GREEN: profil exact-match ve ortam izolasyonu, override restore/hata/yabanci kok/tamper, failure redaksiyon; varolan native resume ve coverage/UI testleri.
6. Gercek Sky: profil JDK21+override ile genel scan, test ve taze JaCoCo kaniti; source/POM once-sonra SHA eslesir. Veri private. Yeni model yok.
7. Bagimsiz review, gerekli regresyon, checkpoint/kabul/handoff, kimlik/gizlilik/staged diff kontrolu, commit/push ve UI yenileme.
