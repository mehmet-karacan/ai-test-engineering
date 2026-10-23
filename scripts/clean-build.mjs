import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// tsc does not remove outputs of deleted source files (including the retired UI).
rmSync(fileURLToPath(new URL("../dist/", import.meta.url)), { recursive: true, force: true });
