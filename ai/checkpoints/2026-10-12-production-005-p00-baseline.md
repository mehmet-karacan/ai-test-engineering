# AITE-PRODUCTION-READINESS-005 P00 baseline

## Gorev ve kaynak

- Gorev: AITE-PRODUCTION-READINESS-005 v1.0.
- Branch: main.
- Baslangic HEAD: ac931821f8b9488b264c85d4f616c2ab74383613.
- Remote: origin/main.
- Node: v24.14.1.
- npm: 11.11.0.
- Repo-local Git kimligi: mehmet-karacan <karacan.mehmet@hotmail.com>.

## Aktif sozlesme devri

- Eski root AKTIF_GOREV.md byte uzunlugu: 81862.
- Eski root dosya SHA-256: 7426734dcbd9e6766fd4212cf0dd43c2eb7f7b2dc3d51b177bf7608c5d3742e8.
- Arsiv: ai/tasks/archive/AITE-REPORT06-INTEGRATION-004-v1.0.md.
- Arsiv SHA-256: 7426734dcbd9e6766fd4212cf0dd43c2eb7f7b2dc3d51b177bf7608c5d3742e8.
- Yeni root AKTIF_GOREV.md SHA-256: cc741769116cee3b2cd921256406a58560b0d65ad0a476c3471bb01ac378336f.
- Arsiv kaydi: ai/tasks/archive/ARSIV-REPORT06-KAYDI.md.

## Gercek baseline

- `npm.cmd ci`: exit 0; 236 paket eklendi; npm audit sonucunda 0 vulnerability.
- `npm.cmd test`: exit 1; 56 test dosyasi, 467/473 test gecti.
- Baseline failures: 6 Docker izolasyon testi.
- Kok neden: Docker Desktop Linux daemon pipe erisilemedi; `docker info` npipe hatasi.
- Bu sonuc Docker/PR04 platform kaniti degildir; ilgili kabul BLOCKED/NOT_RUN olarak kalir.
- Baseline testleri root aktif sozlesme degistirilmeden once alindi; sonraki sozlesme devri sonrasi eski W10 N60 assertion'i ayrica guncellendi ve `tests/unit/w10-ledger.test.ts` odakli kosu 7/7 gecti.

## Korunan sinirlar

- `java-support/src/test/java/com/aitest/support/JavaMetadataScannerCoverageTest.java` bilinmeyen sahiplikte untracked dosyadir; okunmadi, degistirilmedi, stage edilmedi.
- Canli kurum modeli/provider/pilot baslatilmadi.
- CI, global Git ayari, force push ve customer checkout degisikligi yapilmadi.

## Devam noktasi

- P00: tamamlandi; aktif sozlesme devri ve baseline kayda alindi.
- P01: release gate local/full ayrimi ve fail-closed evidence verifier.
- P02: lease, fencing, heartbeat ve owned process guvenligi.
