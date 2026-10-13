# S02 native pin ve log butcesi bagimsiz inceleme

2026-10-13. Inceleyen: S03 bagimsiz ajan. Kapsam: S02 native pin, surec kapanisi ve WN21 log siniri. S01/S03 bulgulari ve genel kabul bu incelemenin disindadir.

## P2 - Gecersiz UTF-8 ile yazili log siniri asiliyor

`BoundedOutput` her stream icin ham `Buffer` girdisini 8 MiB ile sinirliyor. `StringDecoder`, gecersiz UTF-8 baytlarini uc baytlik `U+FFFD` cikisina ceviriyor. Ardindan `MavenRunner` bu metni UTF-8 olarak loga yaziyor. Dolayisiyla 8 MiB `0xff` girdi yaklasik 24 MiB yazili log uretebiliyor. WN21 disk/artifact butcesi bu sekilde garanti edilmiyor. Gercek adversarial fixture ile yazilan bayt sayisi olculmeli, yazili cikis da sinirlanmali.

## P2 - Truncation kaniti kalici is kaydinda yok

Truncation sayaclari ve `BYTE_BUDGET_EXCEEDED` nedeni gecici `RunResult` / `AppError` uzerinde. `job-dispatcher.ts` → `InventoryRepository.writeTestRunProvenance` akisinda bu alanlar kalici kayda gecmiyor. WN21 icin tekrar acilabilir artifact/provenance kaydi gerekir. S04 sema bagimliligi nedeniyle cozum mevcut kanit manifesti veya onayli migration sirasina uymali.

Bu incelemede yeni somut P1 bulunmadi. Her iki P2 aciktir; S02 VERIFIED degildir.
