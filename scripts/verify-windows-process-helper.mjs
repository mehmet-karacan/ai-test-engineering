import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../native/windows-process-helper.manifest.json", import.meta.url), "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex");
if (manifest.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.source_sha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.binary_sha256) ||
    sha256("../native/windows-process-helper.cpp") !== manifest.source_sha256 ||
    sha256("../native/bin/windows-process-helper.exe") !== manifest.binary_sha256) {
  throw new Error(`Windows process helper provenance mismatch in ${root}`);
}
