/** Explicit test-only binary. Public packagedWindowsFileHelper always resolves native/bin. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const digest = (url) => createHash("sha256").update(readFileSync(url)).digest("hex");

export function faultFixtureWindowsFileHelper() {
  const fixture = new URL("../tests/fixtures/native/windows-file-helper-fault.json", import.meta.url);
  const binary = new URL("../tests/fixtures/native/windows-file-helper.exe", import.meta.url);
  const source = new URL("../native/windows-file-helper.cpp", import.meta.url);
  const spec = JSON.parse(readFileSync(fixture, "utf8"));
  if (spec.schema_version !== 1 || spec.define !== "AITEST_FAULT_FIXTURE" ||
      !/^[a-f0-9]{64}$/u.test(spec.source_sha256) || !/^[a-f0-9]{64}$/u.test(spec.binary_sha256) ||
      digest(source) !== spec.source_sha256 || digest(binary) !== spec.binary_sha256) {
    throw new Error("Windows file helper fault fixture provenance mismatch");
  }
  return { path: fileURLToPath(binary), sha256: spec.binary_sha256 };
}
