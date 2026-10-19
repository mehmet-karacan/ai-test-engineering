# Checkpoint - Kalite kapisi ve zor sinif pilotu denetimi

- Tarih: 2026-10-19
- Dal: `codex/glm-quality-gate-fix`; taban `bd3db182`; onceki OpenCode commitleri `cf4a8a9`, `10927e8`, `78714f7`, `8e4e062`.
- Kapsam: mevcut pilot sonucunu DB ve manifest kanitlariyla denetlemek, bulunan kod hatalarini duzeltmek, bu dali commit/push ile teslim etmek.

## Dogrulanan bulgular ve duzeltmeler

1. `hasMeaningfulAssertion` ayri bir Java ifadesindeki fluent terminali yarim `assertThat(...)` cagrisi icin de sayiyordu. Terminal aramasi her `assertThat` ifadesinin noktalivirgule kadarki kismiyla sinirlandi. Ayrik ifade regresyon testi once RED, sonra GREEN.
2. `SELF_COMPARISON` ikinci eslesmeyi maskelenmemis kaynaga uyguluyordu; yorumdaki `assertEquals(x,x)` gecerli testi reddedebiliyordu. Ikinci eslesme de maskeli kaynaga alindi. Regresyon testi once RED, sonra GREEN.
3. PAUSED job icin farkli `model_profile` ile `test_resume` onceden lease/lifecycle degisiminden sonra reddediliyordu. Model sozlesmesi `handleTestResume` girisinde native probe ve lease oncesi denetleniyor. Uyusmazlik `CONTRACT_CONFLICT` ile reddedilir; job PAUSED, row version, event ve lease degismez. Entegrasyon testi once RED, sonra GREEN. Eski pilotta olusan RUNNING/POLICY_VIOLATION kaydi tarihsel kanit olarak tutuldu; duzeltme sonrasi canli pilot yapilmadi.
4. PIT alan adlari yanilticiydi: `mutation_score_bps` kapsanan mutantlardan hesaplanan test strength idi. Simdi `mutation_score_bps` tum raporlanan mutantlarin paydasini, `test_strength_bps` yalniz killed+survived paydasini kullanir. `score_percent` genel skordur. Sayaclar safe integer olmalidir; toplam tasmasi reddedilir. PIT calistirilmadi, mutation sonucu NOT_RUN.

## Pilot sayimi ve karar

- Runtime `state.db` dosyalarinda 12 kalici job var: 7 planli hedef isi (T01 3, T03 2, T02 1, T04 1), 1 negatif resume isi, 4 FAILED/BLOCKED_ISOLATION preflight isi. Ilk stack-overflow preflight'i kalici job olarak yazilmadi.
- Plan 12 hedef isiydi; 5'i kosulmadi. T01 uc is de TARGET_NOT_MET_PLATEAU, en iyi LINE %35.09 ve BRANCH %56.36. T03 iki is INVALID_COVERAGE_EVIDENCE (hedef sinif BRANCH sayaci yok). T02/T04 BASELINE_FAILED (musteri modulunde onceden kirik 3 test). Negatif resume isi CANCELLED/POLICY_VIOLATION ile kapatildi. Basarisiz ve BLOCKED isler baslatilan is paydasinda kalir.
- Yeni dal/pilot karari **NO_GO**: eksik planli isler ve hedef/coverage/baseline engelleri var. Musteri checkout'u read-only tutuldu; oradaki kirik testler bu gorevde duzeltilmedi. Yeni binary icin release manifesti ve canli tekrar kaniti yok.
- Ayri tarihsel kanit: dagitilan r16 worktree'sinde `release-verify --manifest ...windows-native-006-evidence-manifest-r16.json --scope windows-native-v1` exit 0, full GO 391/391, live pilot PASSED, platform PASSED; kaynak commit `bd3db182`. Bu karar yeni dalin GO karari degildir.

## Yerel testler ve sinirlar

- Odak suite: 5 dosya, 81/81 PASS (quality gate, resume, PIT ve ilgili kabul testleri).
- `npm.cmd run typecheck`: PASS; `npm.cmd run build`: PASS; `npm.cmd run lint`: 0 error, 89 warning.
- Tam suite varsayilan paralellikte baslatildi, ancak Windows native testleri asili kaldi ve sonuc uretmeden durduruldu (`INTERRUPTED_BEFORE_RESULT`, exit 1); tum paket icin PASS iddiasi yok. Ara logda 2 AC67 ozel model girdisi yoklugu, browser print, Windows native timeout/bridge/job-object ve UTF-8 supervisor basarisizliklari goruldu. Bu arada odak suite 81/81 PASS kaldi. Ara log repo disinda `C:\Users\mkaracan\AppData\Local\Temp\opencode\qfix-audit-full-suite.log`, SHA-256 `28498ED934E0786983149C116E59BC814FAC3ED23785BDA4BDD131EDB65C7B90`.
- Runtime DB/blob/log dosyalari repo disinda kaldi. Dagitilan r16 worktree ve ana checkout degismedi.
