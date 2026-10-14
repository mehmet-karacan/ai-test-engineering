import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJacocoXml } from "../../src/coverage/jacoco-parser.js";
import { AppError } from "../../src/domain/errors.js";

describe("S06 JaCoCo evidence validation", () => {
  it("non-numeric counter attributes are invalid evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-s06-jacoco-invalid-"));
    const path = join(dir, "jacoco.xml");
    try {
      writeFileSync(path, `<report><package name="p"><class name="p.Service" sourcefilename="Service.java"><counter type="LINE" missed="NaN" covered="4"/></class></package></report>`, "utf8");
      expect(() => parseJacocoXml(path)).toThrowError(AppError);
      try {
        parseJacocoXml(path);
      } catch (error) {
        expect((error as AppError).code).toBe("INVALID_COVERAGE_EVIDENCE");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("negative or duplicate counters are invalid evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-s06-jacoco-duplicate-"));
    const path = join(dir, "jacoco.xml");
    try {
      writeFileSync(path, `<report><package name="p"><class name="p.Service" sourcefilename="Service.java"><counter type="LINE" missed="-1" covered="4"/><counter type="LINE" missed="0" covered="4"/></class></package></report>`, "utf8");
      expect(() => parseJacocoXml(path)).toThrowError(/sayaci/);
      writeFileSync(path, `<report><package name="p"><class name="p.Service" sourcefilename="Service.java"><counter type="LINE" missed="0" covered="4"/><counter type="LINE" missed="0" covered="4"/></class></package></report>`, "utf8");
      expect(() => parseJacocoXml(path)).toThrowError(/tekrari/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
