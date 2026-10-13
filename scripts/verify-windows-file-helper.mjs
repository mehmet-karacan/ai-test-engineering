import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../native/windows-file-helper.manifest.json", import.meta.url), "utf8"));
const sha256 = (relative) => createHash("sha256").update(readFileSync(new URL(relative, import.meta.url))).digest("hex");
const binary = readFileSync(new URL("../native/bin/windows-file-helper.exe", import.meta.url));
const faultMarker = "AITEST_NATIVE_";
const markerUtf16 = Buffer.from(faultMarker, "utf16le");
const markerAscii = Buffer.from(faultMarker, "ascii");
if (manifest.schema_version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.source_sha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.binary_sha256) ||
    sha256("../native/windows-file-helper.cpp") !== manifest.source_sha256 ||
    sha256("../native/bin/windows-file-helper.exe") !== manifest.binary_sha256 ||
    binary.includes(markerUtf16) || binary.includes(markerAscii)) {
  throw new Error("Windows file helper provenance mismatch");
}
