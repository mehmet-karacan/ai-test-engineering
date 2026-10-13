/**
 * S00 kabul testleri (WN01-WN04, WN67-WN69): windows-native-v1 scope ve legacy mapping.
 * - WN02/WN03: 320 legacy ID tekil envanter; AC70+RG52+RT28+PRO60+N64+PP46 birebir.
 * - WN02/WN68: Docker/Linux/macOS ozgul her ID acik reason + WN karsiligi tasiyor.
 * - WN67: scope gate'i default NO_GO; local/full ayrimi acik.
 * - WN68: validator duplicate/universe disi/eksik satir/eksik replacement/gecersiz WN
 *   karsiligi/gecersiz scope durumlarinda non-zero.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const scope = JSON.parse(readFileSync(join(repoRoot, "ai", "acceptance", "scope-windows-native-v1.json"), "utf8"));
const mapping = JSON.parse(readFileSync(join(repoRoot, "ai", "acceptance", "legacy-to-006.json"), "utf8"));

const families = [
  ["AC", 70],
  ["RG", 52],
  ["RT", 28],
  ["PRO", 60],
  ["N", 64],
  ["PP", 46],
];
const expectedIds = families.flatMap(([family, count]) =>
  Array.from({ length: count }, (_, i) => `${family}${String(i + 1).padStart(2, "0")}`),
);
const expectedSet = new Set(expectedIds);

// --- Validator fixture yardimcilari (WN68 negatifleri) ---
const fixtureRoot = join(repoRoot, "tests", "fixtures", "wn-scope-tmp");
function runValidator(dir) {
  try {
    const stdout = execFileSync(process.execPath, [join(repoRoot, "scripts", "validate-windows-scope.mjs"), dir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stderr: String(error.stderr ?? "") };
  }
}
function makeFixture(name, scopeOverride, mappingOverride) {
  const dir = join(fixtureRoot, name, "ai", "acceptance");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "scope-windows-native-v1.json"), JSON.stringify(scopeOverride ?? scope, null, 2));
  writeFileSync(join(dir, "legacy-to-006.json"), JSON.stringify(mappingOverride ?? mapping, null, 2));
  return join(fixtureRoot, name);
}

beforeAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});
afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("S00 windows-native-v1 scope ve legacy mapping (WN01-WN04, WN67-WN69)", () => {
  it("WN03: 320 legacy ID envanteri tekil ve universe ile birebir (AC70+RG52+RT28+PRO60+N64+PP46)", () => {
    const rows = mapping.mappings;
    expect(rows).toHaveLength(320);
    const ids = rows.map((row) => row.legacy_id);
    expect(new Set(ids).size).toBe(320);
    expect(ids).toEqual(expectedIds);
    expect(scope.legacy_ids).toEqual(expectedIds);
    expect(scope.legacy_total).toBe(320);
    expect(expectedSet.size).toBe(320);
  });

  it("WN02: her mapping gecerli status ve WN01-WN80 araliginda en az bir WN karsiligi tasiyor", () => {
    const wnPattern = /^WN(0[1-9]|[1-7][0-9]|80)$/;
    const validStatuses = new Set(["RETAINED", "REPLACED", "OUT_OF_SCOPE_BY_USER"]);
    for (const row of mapping.mappings) {
      expect(validStatuses.has(row.status), row.legacy_id).toBe(true);
      expect(Array.isArray(row.wn), row.legacy_id).toBe(true);
      expect(row.wn.length, row.legacy_id).toBeGreaterThan(0);
      for (const target of row.wn) {
        expect(target).toMatch(wnPattern);
      }
    }
  });

  it("WN02/WN68: Docker/Linux/macOS ozgul her ID acik reason ve WN karsiligi tasiyor; PP01-PP46 dahil", () => {
    const dockerish = new Set([
      "AC39", "AC40", "AC65", "RG01", "RG16", "RG17", "RG18", "RG19", "RG20", "RG34",
      "PRO11", "PRO12", "PRO15", "PRO16", "PRO29", "PRO45", "PRO58", "N18", "N19", "N20", "N37",
      "RT14", "RT27", "PP08", "PP09", "PP16", "PP17", "PP18", "PP19", "PP43",
    ]);
    let superseded = 0;
    for (const row of mapping.mappings) {
      if (row.status !== "RETAINED") {
        superseded++;
        expect(row.reason.length, row.legacy_id).toBeGreaterThanOrEqual(20);
        expect(row.wn.length, row.legacy_id).toBeGreaterThan(0);
        if (dockerish.has(row.legacy_id)) {
          expect(
            row.status === "REPLACED" || row.status === "OUT_OF_SCOPE_BY_USER",
            row.legacy_id,
          ).toBe(true);
        }
      }
    }
    // PP01-PP46 tamami eslenmis; container/capability/egress maddeleri superseded:
    const pp = mapping.mappings.filter((row) => row.legacy_id.startsWith("PP"));
    expect(pp).toHaveLength(46);
    for (const legacyId of ["PP08", "PP09", "PP16", "PP17", "PP18", "PP19"]) {
      const row = pp.find((entry) => entry.legacy_id === legacyId);
      expect(row?.status === "REPLACED" || row?.status === "OUT_OF_SCOPE_BY_USER", legacyId).toBe(true);
      expect(row?.reason).toBeDefined();
    }
    expect(superseded).toBe(34);
    // RETAINED gecerli yukumluluklarda WN karsiligi zorunlu:
    const retained = mapping.mappings.filter((row) => row.status === "RETAINED");
    expect(retained.length).toBe(286);
    for (const row of retained) {
      expect(row.wn.length, row.legacy_id).toBeGreaterThan(0);
    }
  });

  it("WN67: scope gate'i default NO_GO, local/full ayrimi acik, karar dayanaklari kayitli", () => {
    expect(scope.scope_id).toBe("windows-native-v1");
    expect(mapping.scope_id).toBe("windows-native-v1");
    expect(scope.gate.default_without_valid_scope).toBe("NO_GO");
    expect(scope.gate.full_vs_local_split_required).toBe(true);
    expect(scope.basis.length).toBeGreaterThanOrEqual(5);
    expect(scope.evidence_levels).toContain("WINDOWS_RUNTIME");
    expect(scope.evidence_levels).toContain("LIVE_PILOT");
    expect(scope.status_counts).toEqual(mapping.status_counts);
  });

  it("WN68: validator temiz dosyalarda exit 0", () => {
    const dir = makeFixture("clean");
    expect(runValidator(dir).code).toBe(0);
  });

  it("WN68: duplicate legacy_id non-zero reddedilir", () => {
    const rows = mapping.mappings.map((row) => ({ ...row }));
    rows[5] = { ...rows[4] }; // duplicate satir
    const dir = makeFixture("duplicate", scope, { ...mapping, mappings: rows });
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("Mukerrer");
  });

  it("WN68: universe disi legacy_id non-zero reddedilir", () => {
    const rows = mapping.mappings.map((row) => ({ ...row }));
    rows[0] = { ...rows[0], legacy_id: "XX01" };
    const dir = makeFixture("unknown", scope, { ...mapping, mappings: rows });
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("Universe disi");
  });

  it("WN68: eksik replacement (reason'suz superseded ID) non-zero reddedilir", () => {
    const rows = mapping.mappings.map((row) =>
      row.legacy_id === "PP17" ? { ...row, reason: "" } : row,
    );
    const dir = makeFixture("no-reason", scope, { ...mapping, mappings: rows });
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("acik reason zorunlu");
  });

  it("WN68: eksik WN karsiligi non-zero reddedilir", () => {
    const rows = mapping.mappings.map((row) =>
      row.legacy_id === "AC01" ? { ...row, wn: [] } : row,
    );
    const dir = makeFixture("no-wn", scope, { ...mapping, mappings: rows });
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("wn listesi bos");
  });

  it("WN67/WN68: eksik scope dosyasi non-zero reddedilir (gate default NO_GO)", () => {
    const dir = join(fixtureRoot, "missing-scope", "ai", "acceptance");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "legacy-to-006.json"), JSON.stringify(mapping, null, 2));
    expect(runValidator(join(fixtureRoot, "missing-scope")).code).not.toBe(0);
  });

  it("WN68: status_counts gercek dagilimla uyusmuyorsa non-zero reddedilir", () => {
    const fakeScope = { ...scope, status_counts: { ...scope.status_counts, RETAINED: 297 } };
    const dir = makeFixture("bad-counts", fakeScope, mapping);
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("status_counts.RETAINED");
  });

  it("WN68: gecerli bir ID sayaclar birlikte degistirilse bile onaysiz scope disina alinamaz", () => {
    const rows = mapping.mappings.map((row) => row.legacy_id === "RT15"
      ? { ...row, status: "OUT_OF_SCOPE_BY_USER", reason: "Onaysiz kapsam cikarma denemesi; sadece sayaclarin degismesi kabul olamaz." }
      : row);
    const counts = { ...mapping.status_counts, RETAINED: 285, OUT_OF_SCOPE_BY_USER: 10 };
    const dir = makeFixture("unauthorized-removal", { ...scope, status_counts: counts }, { ...mapping, status_counts: counts, mappings: rows });
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("Onayli per-ID scope karari hash'i uyusmuyor");
  });

  it("WN68: yanlis evidence seviyesi reddedilir", () => {
    const dir = makeFixture("wrong-evidence-level", { ...scope, evidence_levels: [...scope.evidence_levels, "FAKE_PASS"] }, mapping);
    const result = runValidator(dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr ?? "").toContain("evidence_levels");
  });
});
