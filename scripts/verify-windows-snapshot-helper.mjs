import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../native/windows-snapshot-helper.manifest.json", import.meta.url), "utf8"));
const sha256 = (relative) => createHash("sha256").update(readFileSync(new URL(relative, import.meta.url))).digest("hex");
if (manifest.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.source_sha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.binary_sha256) ||
    sha256("../native/windows-snapshot-helper.cpp") !== manifest.source_sha256 ||
    sha256("../native/bin/windows-snapshot-helper.exe") !== manifest.binary_sha256) {
  throw new Error("Windows snapshot helper provenance mismatch");
}
