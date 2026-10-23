# Dependency types MCP checkpoint

- Base93a1b73, izole dal codex/dependency-context-20261023. Kullanici DTO/enum/metot tipleri duzeltmesi ve80LINE+BRANCH tekrarini onayladi.
- TDD once modulemissing/FAIL, sonra gercek javac/javap testi PASS. API max48tip/64KiB; javap yalniz public signature ve enum adlari; source/binary hash ve source-baseline esitligi, path containment, sensitivepath dislama ve explicit omissions. AgentTask scope deps dosyalari ve minimal line_ranges ile genisledi; manifestdigest raw sourcehashmanifest+prompt'a bagli,128KiB korundu.
- GPU onceki baselineprobe45API/65400bytes; BigDecimal setters, UnitType.PERCENTAGE/AMOUNT, Oncelik.ONCELIK_1..5 gercek binaryden dogrulandi. Dump private kalir.
- Gercek stdio MCP joba82a3465-64b8-4f52-9850-a0afdaff454c ayni scan8eb1ff08... FQN DeductionService, GLM-5.3-Flash-IT,80/80 ile baslatildi. Baseline/generation sonucu henuz yok; M04 tamamlandi sayilmaz. GPUapply yok.
