# Kabul Testleri

AC01-AC70 matrisinin guncel durumu `ai/ACCEPTANCE_MATRIX.md` icindedir.

## Durum degerleri

- `NOT_RUN`: henuz calistirilmadi
- `BLOCKED`: ortam kabiliyeti eksik
- `FAILED`: calistirildi, beklenti saglanmadi
- `PASSED`: kanit dosyasi/commit referansiyla dogrulandi

## Yontem

- Kodun mock testten gecmesi gercek Maven/OpenCode entegrasyon testi yerine yazilamaz.
- Deterministik orkestrasyon testlerinde scripted/fake worker serbest; gercek entegrasyon diye etiketlenmez.
- Security fixture'leri kontrollu, yerel ve sentetik tutulur.
- Flaky test "retry until green" ile gizlenmez; nedeni bulunur ve kanitlanir.
