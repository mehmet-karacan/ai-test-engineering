# S02 WN17-WN24 audit ve WN21 8 MiB log kaniti

- Dal `codex/windows-native-006-s02`, baslangic `c9bc2f0`; temiz worktree'den devam edildi. Original customer checkout/GPU Maven, S01/S03 kaynaklari, G1/G2/G3 ve yeni migration degismedi. `CustomerRunnerFactory.assertNativeCustomerReady()` ownership/customer kapisini kapali tutuyor; WN14/15/18 kurulu Maven/JDK manifest ve yok implicit config pin aciklariyla NO_GO.
- WN21 RED: gercek Windows `.cmd` -> Node child, stdout `8 MiB + 17 byte`, stderr `8 MiB + 31 byte` uretirken iki akisin 8 MiB cap'i ve tam 17/31 sayaci dogruydu; `stdoutTruncationReason`/`stderrTruncationReason` yoktu (undefined). GREEN: supervisor yalniz truncation olursa `BYTE_BUDGET_EXCEEDED` sebebini doner; Maven `RunResult` ayni bilgiyi `stdout_truncation_reason`/`stderr_truncation_reason` alanlarina tasir. Bu fixture gercek Windows akisi ve close sonrasindaki byte sayisini olcer, sentetik stub degildir. Ayri RED, timeout gibi basarisiz Maven sonucunda truncation count/reason `AppError.details` icinde yoktu; GREEN bu tanilari basarisiz sonuca da tasir.
- Iki odak dosya/18 PASS seri; son kodda typecheck/build/helper manifest/lint exit 0. Testteki `finally` throw'u lint ile yakalandi ve cleanup guard duzeltildi. Lint ve test paralel kosuda eski nonzero fixture bir kez `spawn_error` verdi (16 PASS/1 FAIL, 10 saniye); izole ayni test 1/1 ve ardindan iki dosya seri 17/17, son RED/GREEN fixture'dan sonra 18/18 PASS. Tekil hatanin nedeni kesinlestirilmedi, tam suite PASS iddiasi yok; fixture timeout'unu buyuterek gizlenmedi.

| Kabul | Mevcut kanit ve sinir |
|---|---|
| WN17 | Gercek Windows Unicode/bosluk/parantez/& path ve sentinel `wn-process-supervisor` fixture'i; unsafe arguman reddi `wn-command-contract`. Dar yerel kanit. |
| WN18 | PATH/Path, settings/toolchains/profile, parent `.mvn` identity ve native pin fixture'lari var; tum kurulu Maven/JDK dagitim baytlari ve absent config pin acik. NO_GO. |
| WN19 | Env allowlist, Maven pre/post rc disable, MAVEN_ARGS omission ve secret sentinel fixture'lari var; customer model/rapor uc uca kaniti yok. PARTIAL. |
| WN20 | Nonzero/timeout/cancel ve helper close/drain testleri var. Tum ENOENT/spawn fault matrisi bu audit ile kapanmadi. PARTIAL. |
| WN21 | Gercek iki akista 8 MiB ustu cap, exact dropped byte ve acik budget reason bu dilimde RED->GREEN. UTF-8 boundary fixture'i de mevcut. Yerel kabul kaniti, customer gate acmaz. |
| WN22 | Owned descendant timeout/cancel ve yabanci Node korunumu gercek Job Object fixture'larinda var; customer gate/bagimsiz kabul acik. NO_GO. |
| WN23 | Parent hard-kill, durable orphan fence ve PID reuse yabanci surec korunumu gercek Windows fixture'larinda var; customer late-result uc uca kabul acik. NO_GO. |
| WN24 | Legacy runner/config/job fail-closed testleri var; host_dev_only job migration tam kabul kaniti bu dilimde eklenmedi. PARTIAL. |

- Tam suite PASS veya S02 VERIFIED iddiasi yok. Sonraki adim: WN20 ENOENT/spawn fault matrisi, WN24 host_dev_only eski job ve WN22/23 customer end-to-end kanitlarini ayri kabul paketlerinde degerlendir; customer gate bugun kapali.
