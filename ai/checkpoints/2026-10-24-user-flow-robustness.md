# Kullanici akis saglamlik kaydi

- Kullanici netlestirmesi: penetrasyon degil; farkli/eksik/problemli kullanici veya OpenCode istekleri ve hata sonrasi davranislar test edilecek. Guvenlik taramasi baslatilmadi; session dosyasi okunmadi.
- Base main9668d64; mevcut temiz d03b worktree yeniden kullanildi, branch codex/user-flow-robustness-20261024. Ana checkout'taki onceki kullanici/teslim dosyalarina dokunulmadi.
- Baseline 3dosya20testPASS. Ilk31senaryo17RED/14PASS: root bosluklari, bos/tekrarli metrik, sessizce ignore edilen branchgoal, blankselector,6cursorvaryanti,job/root veprojectid/root celiskisi,globalprojelistesi ve coveragehistory.
- Sema duzeltmesi sonrasinda yalniz5beklenencontext/historytestiRED; sonra bu5GREEN. Ek9senaryo7RED:6eksikprojesorgusu ve BRANCH-onlyistekteistenmeyenLINEhedefi. Dar duzeltme sonrasi5dosya68testPASS.
- Metrik sirasini degistiren tekrar istegi ikinci is baslatiyordu:1RED/2PASS; metrikler canonical siraya normalize edilerek duzeltildi.
- Gercek registry/use-case/SQLite ile51yeni senaryoPASS. MCP SDK InMemoryTransport ile tools/list ve normal test_status roundtripPASS. Yeni model veya customer kosusu yok; tam paket sentetik Maven fixture'larini kullanir.
- typecheckPASS; lint0error/89mevcutwarning. Odak6dosya82testPASS (son11eksenaryo once).
- Ruling: terminal report.json runtime yayin ani RUNNING snapshot'i mevcut bilinen bir rapor siniri. DB/disk terminalpublication atomikligi kapsamli farkli duzeltme gerektirdigi icin bu dar kullanici-girdi/coverage-query degisikligine karistirilmaz; onceki backlog kaydi korunur. Son raporda kapsam ve bu sinir acik belirtilir.
- Sonraki: executable fark sabitken build/localgate ve tum aktif Windows suite; bagimsiz review, kanit ve devir.

- Bagimsiz review P2: ayni fiziksel root altinda birden fazla project_id bulunursa, explicit project_id kontrolu yalniz uyeligi dogruluyor; sorgu diger kimligin location kayitlarini da aliyordu. Tam suite bitince RED testi ve dar filtre uygulanacak.
- Test siniri: generation hedef testi gercek handler/contract/SQLite kullanir; dis Maven/model dispatch siniri stub'dir. Sonuc canli modelin dogal dilde her ifadeyi anlayacagini kanitlamaz.

## Son inceleme ve tam paket bulgulari

- Ilk tam aktif Windows komutu: 135 dosya; 133 PASS, 1 FAIL, 1 SKIP. Testler:1128 PASS,1 FAIL,1 SKIP. Tek hata p07b-browser-e2e CLI PDF testi: Edge launcher exit0 dondu, dosya olusmadi.
- Izole tekrar 1 FAIL/3 PASS. Mevcut CDP oturumu ile Page.printToPDF da Edge uzerinde Printing is not available hatasi verdi. Kurulu Chrome'da ayni gercek CDP yazdirma basarili. Test mevcut Chrome'u oncelikli secer; kurulum veya policy degisikligi yok. Test gercek print CSS'te print-view block/screen none, PDF magic ve >2000byte kontrolunu korur. Son browser 4/4 PASS; Edge PDF basarisi iddia edilmez.
- P2 ortak root/project_id sorunu kalici fixture testinde RED ile gosterildi. Location listesi explicit project_id ile filtrelendi; 52/52 yeni kullanici akisi testi PASS. Coverage history validity ve null branch kontrolu eklendi.
- Son executable farki icin fresh build ve dogru private AC67 girdisiyle son tam paket yeniden kosuluyor. Ilk basarisiz log korunur; atlama veya sahte PASS uretilmez.

## 2026-10-24 Kullanici akis saglamligi

- Kullanici farkli/eksik/problemli istekleri test edip duzeltmeyi istedi; bu bir penetrasyon taramasi degildir.
- Kopyalanan root/hedef bosluklari, bos/tekrarli metrikler, sessizce ignore edilen branch hedefi, BRANCH-only istekte gereksiz LINE hedefi, metrik sirasiyla ikinci is acilmasi ve bozuk cursor davranisi duzeltildi.
- Job/root ve project_id/root celiskileri reddedilir; ayni root altindaki eski proje kimlikleri explicit project_id sorgusuna karismaz. Proje listesi ve gercek coverage gecmisi calisir; baglamsiz sinif/gecmis sorgusu proje bilgisi ister.
- 52 yeni kullanici akisi senaryosu gercek MCP registry/use-case/SQLite ile dogrulandi. MCP SDK uzerinden tools/list ve normal istek roundtrip'i de gecti. Canli dogal dil/model kapsam garantisi verilmez.
- Tam aktif Windows paketi: 134 dosya / 1130 test PASS, 1 dosya / 1 test SKIP, exit0. Typecheck/build/localgate PASS, lint0error/89mevcutwarning, bagimsiz review engelleyicisiz.
- Browser: kurulu Chrome'da DOM/gercek print CSS/PDF/offline/link 4/4 PASS. Edge PDF bu ortamda Printing is not available dondu; Edge PDF PASS iddiasi yok, kurulum veya policy degisikligi yok.
- Ilk tam paketteki tek PDF hatasi ve onarim kaniti korundu. GPU/Sky/customer/model kosusu, CI veya bekletilen session dosyasi degisikligi yok.
- Bilinen rapor yayin-ani runtime snapshot sorunu onceki backlogda ayri kalir; full391 GO/yayin iddiasi yok. Kanit: ai/acceptance/user-flow-robustness.json.
