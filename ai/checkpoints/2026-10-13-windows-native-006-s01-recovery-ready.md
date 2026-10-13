# S01 RECOVERY_READY read-only gate

- Native `recover-session` emits a pinned layout before it accepts any mutation. The TS gate now requires exact generation, slot order, original FileId/volume/bytes/SHA, canonical names and a physical forward prefix equal to the durable receipt count or exactly one move ahead. PREPARED cannot report a moved file. It constructs an ACCEPT echo only after these checks.
- RED unit fixture first failed because the gate did not exist; the two cases now pass, including rejection for changed FileId, two unjournaled moves and nonprefix names. Typecheck passes.
- This is a parser only. No production ACCEPT or reverse MOVE is issued yet. Journal reverse receipts/fence, native count-zero CLOSE, sync startup worker and committed-generation seal remain open; WN11/12/13 stay NO_GO.
