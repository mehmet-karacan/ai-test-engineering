# Immutable job contract artifact byte hash

BASE 6303f154b0fa434f736679235ccc18bdf71c4ea2.
Branch codex/contract-artifact-20261025. Dar bagimli backup engeli:
persistJobContract artifact SHA'si dosya byte'lari yerine semantic contract
hash'ini kaydediyordu. Dosya schema_version/contract_hash eklenmis pretty
JSON oldugu icin strict backup hakli olarak hash uyusmazligi veriyordu.

## Duzeltme

Semantic contractHash, dosya adi ve body.contract_hash ayni kalir. Artifact
sha256 gercek UTF-8 dosya byte'larindan, bytes Buffer.length'den hesaplanir.
Mevcut dosya regular/non-symlink ve beklenen byte'larla tam esit olmadan
kabul edilmez. Exclusive wx var olan veya yarisla yaratilan dosyayi ezmez.
Yarim/degismis private dosya otomatik onarilmaz; okunur kayit olmaz ve sonraki
persist fail-closed davranir. Bu kesinti halinde fail-closed bir tercihtir.

Ayni path'in eski artifact kaydi varsa job/kind/hash/size/READY kimligi
dogrulanir. Tutarsizlikta UPDATE veya duplicate kayitla otomatik legacy
onarimi yapilmaz. Urun kodu yalniz gelecekteki persist'i duzeltir.

## RED -> GREEN

Yeni test ilk kosuda 4 FAIL / 1 PASS: artifact SHA byte hash ile eslesmedi;
degismis kayitli/kayitsiz dosyalar guvenilir sayildi; eski semantic metadata
yeniden kabul edildi. Duzeltme sonrasi 5/5 PASS. Test mevcut byte/mtime/id
idempotence, UTF-8 size ve mantiksal hash/path korunmasini da dogrular.

Son odakli komut:
node node_modules/vitest/vitest.mjs run tests/unit/job-contract-artifact.test.ts
tests/unit/p08-backup-authority.test.ts tests/unit/fin01-contract.test.ts

Sonuc 3 dosya / 39 test PASS, exit0. Typecheck tsc --noEmit exit0.
Scoped eslint exit0 / 0 error / 2 mevcut dispatcher unused-import warning.
git diff --check exit0. Public kayitta runtime/customer byte veya secret yok.

## Operator legacy metadata onarimi incelemesi

Bu dal runtime yazmadi. Ana koordinatorun tek seferlik operator kosulu icin:
schema1 + canonical exact prettyJSON; body.contract_hash==oldDBsha==basename;
SHA(JSON.stringify(body minus schema_version/contract_hash))==oldDBsha;
body.job_id==row.job_id; exact jobs/<job>/contract/<semanticHash> containment;
regular/no-link file; DB size==actual size gereklidir. Onarim yalniz actual
byteSHA metadata'sini degistirmeli, kaynak byte'lari ayni kalmalidir. Eski
DB/ref-file snapshot'i korunmali; tum satirlar tek immediate transaction ve
per-row compare-and-swap changes1 ile onarilmali, audit kaydi tutulmali,
sonrasinda strict backup gecmelidir. Bu kosullar bug'i tanir; genel
hash uyusmazligi icin otomatik guven/onarim izni degildir.

## Devam

Bagimsiz reviewer approval agent. Root cherry-pick sonrasi delta test ve
canli backup/apply akislarini kosar. Bu izole dalda full suite/build,
musteri/model/Maven/browser, runtime metadata UPDATE veya push yapilmadi.
