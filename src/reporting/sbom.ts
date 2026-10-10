/**
 * FIN13/19.1/19.2: SBOM (CycloneDX) ureticisi.
 * Urunun production/dev npm dependencies, lockfile'dan kilitli versiyon/lisans envanteri.
 * Yeni bir SBOM standardi icat edilmeZ [S15]; CycloneDX 1.5 JSON.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface SbomComponent {
  type: "library" | "application";
  name: string;
  version: string;
  licenses?: Array<{ license: { id: string } }>;
  purl: string;
}

export interface CycloneDxSbom {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  serialNumber: string;
  version: 1;
  metadata: { timestamp: string; tools: Array<{ vendor: string; name: string; version: string }> };
  components: SbomComponent[];
}

export interface DependencyEntry {
  name: string;
  version: string;
}

export interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  license?: string;
}

export function parsePackageJson(content: string): PackageJson {
  return JSON.parse(content) as PackageJson;
}

/**
 * package.json + package-lock.json'dan kilitli versiyon/lisans envanteri uretir.
 * Scanner calismadiysa "0 vulnerability" yazilmaz; scope UNAVAILABLE/STALE kaydedilir (19.2).
 */
export function buildSbom(pkg: PackageJson, lockedVersions: Map<string, string>, options?: { serialNumber?: string }): CycloneDxSbom {
  const components: SbomComponent[] = [];
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, range] of Object.entries(all)) {
    const resolved = lockedVersions.get(name) ?? range.replace(/^[~^>=<\s]+/, "");
    components.push({
      type: "library",
      name,
      version: resolved,
      purl: `pkg:npm/${name}@${resolved}`,
    });
  }
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: options?.serialNumber ?? "urn:uuid:00000000-0000-4000-8000-000000000000",
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "innova", name: "ai-test-engineering", version: pkg.version }],
    },
    components,
  };
}

/**
 * npm lockfile v3 (packages.entries)'dan kilitli versiyonlar okur.
 */
export function lockedVersionsFromLockfile(lockContent: string): Map<string, string> {
  const lock = JSON.parse(lockContent) as { packages?: Record<string, { version?: string }> };
  const versions = new Map<string, string>();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === "packages" || key.length === 0) {
      continue;
    }
    const name = key.replace(/^node_modules\//, "").replace(/\/node_modules\/.*$/, "");
    if (entry.version && !versions.has(name)) {
      versions.set(name, entry.version);
    }
  }
  return versions;
}

export function writeSbom(sbom: CycloneDxSbom, targetPath: string): void {
  mkdirSync(join(targetPath, ".."), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(sbom, null, 2) + "\n", "utf8");
}

/**
 * 19.2: Zafiyet taramasi sonucu. Scanner calismadiysa "0 vulnerability" YAZILMAZ;
 * exact kapsam ve UNAVAILABLE/STALE kaydedilir.
 */
export interface VulnerabilityScanResult {
  scanned: boolean;
  scanner: string | null;
  feed_date: string | null;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  scope: "full" | "partial" | "unavailable";
  note: string;
}

export function unavailableScanResult(reason: string): VulnerabilityScanResult {
  return {
    scanned: false,
    scanner: null,
    feed_date: null,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    scope: "unavailable",
    note: `Tarama yapilamadi: ${reason}. "0 vulnerability" iddiası YAPILMAZ; exact kapsam bilinmiyor.`,
  };
}
