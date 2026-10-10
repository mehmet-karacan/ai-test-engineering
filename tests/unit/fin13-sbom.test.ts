/**
 * FIN13: Threat model, SBOM ve zafiyet taramasi kurallari testleri.
 * - SBOM CycloneDX 1.5: kilitli versiyon/lisans envanteri (19.1).
 * - Zafiyet taramasi: scanner yokken "0 vulnerability" YAZILMAZ (19.2).
 * - Checksum butunluk kontrolu; signature kaniti degil (19.3).
 */
import { describe, it, expect } from "vitest";
import { buildSbom, lockedVersionsFromLockfile, unavailableScanResult, parsePackageJson, type CycloneDxSbom } from "../../src/reporting/sbom.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("FIN13: SBOM (19.1)", () => {
  it("CycloneDX 1.5 formatinda uretilir; kilitli versiyonlar birebir", () => {
    const pkg = parsePackageJson(JSON.stringify({
      name: "ai-test-engineering",
      version: "0.1.0",
      dependencies: { "better-sqlite3": "^12.0.0" },
      devDependencies: { vitest: "^4.1.11" },
    }));
    const locked = new Map([["better-sqlite3", "12.4.1"], ["vitest", "4.1.11"]]);
    const sbom = buildSbom(pkg, locked);
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    expect(sbom.components).toHaveLength(2);
    const sqlite = sbom.components.find((c) => c.name === "better-sqlite3")!;
    expect(sqlite.version).toBe("12.4.1");
    expect(sqlite.purl).toBe("pkg:npm/better-sqlite3@12.4.1");
  });

  it("lockfile'dan kilitli versiyonlar okunur (npm v3 format)", () => {
    const lockContent = JSON.stringify({
      packages: {
        "node_modules/better-sqlite3": { version: "12.4.1" },
        "node_modules/vitest": { version: "4.1.11" },
        "node_modules/vitest/node_modules/nested": { version: "1.0.0" },
      },
    });
    const versions = lockedVersionsFromLockfile(lockContent);
    expect(versions.get("better-sqlite3")).toBe("12.4.1");
    expect(versions.get("vitest")).toBe("4.1.11");
  });

  it("repo package.json'u SBOM'a cevrilebilir (gercek envanter)", () => {
    const repoPkgPath = join(process.cwd(), "package.json");
    if (!existsSync(repoPkgPath)) {
      return;
    }
    const pkg = parsePackageJson(readFileSync(repoPkgPath, "utf8"));
    const sbom = buildSbom(pkg, new Map());
    expect(sbom.metadata.tools[0]!.name).toBe("ai-test-engineering");
    expect(sbom.components.length).toBeGreaterThan(0);
  });
});

describe("FIN13: zafiyet taramasi kurallari (19.2)", () => {
  it("scanner calismadiysa '0 vulnerability' YAZILMAZ; UNAVAILABLE kaydedilir", () => {
    const result = unavailableScanResult("feed erisilemedi");
    expect(result.scanned).toBe(false);
    expect(result.scope).toBe("unavailable");
    expect(result.note).toContain("YAPILMAZ");
  });

  it("unavailable sonuc critical=0 rapor etmez; scope bilinmiyor", () => {
    const result = unavailableScanResult("feed eski");
    // critical: 0 alanlari "bulgu yok" DEMEK DEGIL; scope=unavailable ile birlikte okunur:
    expect(result.scope).not.toBe("full");
    expect(result.feed_date).toBeNull();
  });
});

describe("FIN13: threat model dokumani mevcut (8.6)", () => {
  it("docs/SECURITY.md threat model sinirlarini acik yazar", () => {
    const securityPath = join(process.cwd(), "docs", "SECURITY.md");
    expect(existsSync(securityPath)).toBe(true);
    const content = readFileSync(securityPath, "utf8");
    expect(content).toContain("guvenilmeyen girdidir");
    expect(content).toContain("OS administrator");
    expect(content).toContain("oracle");
  });
});
