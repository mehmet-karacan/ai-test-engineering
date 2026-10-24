# OpenCode-only geri alma

Kullanici son genel CLI/Codex duzenlemelerini geri alip simdilik yalniz
OpenCode kullanilmasini istedi. ceb1285..710b224 arasindaki dokuz commit
git revert --no-commit ile geri alindi; rollback staged tree'si ceb1285
ile tamamen esitti. Sonra yalniz bu hafiza kaydi ve durum notu eklendi.
Git gecmisi yeniden yazilmadi; onceki CLI kanitlari gecmisten okunabilir.

cli_json/codex_cli adapterleri, worker_profile tool parametresi/binding,
generic bridge, clientnone installer/verify, yeni CLI testleri ve rehberi
kaldirildi. Clean build dist altindaki eski derlenmis modulleri de temizledi.
Urun kodu/scripts/tests/README/docs onceki OpenCode surumuyle aynidir.

Runtime config/mcp-server.json kendi ownership SHA'siyle dogrulandi; dosya
ve onceki manifest byte yedekleri alinip aktif dosya ve yalniz ona ait
manifest girdisi kaldirildi. App config/OpenCode config hash'leri ayni.
13kurulu job_contract salt okunur kontrol edildi: CLIbinding0, CLIprofile0,
resumableCLIjob0, okunamayanartifact0. DB/schema/customer veri degismedi.
Private pilot/TEMP kanitlari silinmedi; bu surum baska kurulumlardaki CLI
profillerini veya CLI donemindeki yarim isleri desteklemez; resume etmeyin.

Yeni dogrulama:7dosya/56test PASS,0FAIL0SKIP (13.34s); build/typecheck ve
localreleasegate PASS; lint0error89mevcutwarning. OpenCode worker HTTP,
durable candidate bridge, resume ve kurulum/config regressionlari kapsandi.
Onceki1261testlik tam suite bu geri almada yeniden kosuldu iddiasi yok.
Bagimsiz readonly inceleme: staged baseline ayni, stale distmodul0, schema
degisimi yok, kalan P1/P2yok. Yeni musteri/model/Maven generation kosusu yok.

Devam noktasi: rollback commit/main FF, main fresh build/kurulu OpenCode
verify ve push/remote HEAD kontrolu. CI kapali; G3 yayin yok.

93ae03f main FF sonrasi fresh build/kurulu verify-install/localgate PASS.
Kurulu skill byte/hash ayni; model CONFIGURED,Maven CAPABILITY_PROBED.
Gercek MCP SDK9tool/list/read-only call PASS; start/resume worker_profile
parametresi yok,stale CLImodul0,generic runtime export yok. Main urun kodu
ceb1285 ile Git diff'te birebir ayni. Son kayit yalniz bu metadata'dir;
source stamp ve push/remoteHEAD karsilastirmasi kapanis komutundadir.
