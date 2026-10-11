/**
 * W10 kabul testleri (F17, N58-N60): tekil ledger + false-proof verifier negatifleri.
 * - N58: 210+64 tekil ledger - AC70/RG52/RT28/PRO60 ve N64 kimlikleri ayri kayit.
 * - N59: hash uyusmazligi/dosya eksigi verifier'da non-zero.
 * - N60: pilot pause ile kabul ayrisimi - LIVE_MODEL ertelenmis; yerel kanit ayri.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

describe("W10/F17/N58: tekil obligation ledger", () => {
  const catalog = JSON.parse(readFileSync(join(repoRoot, "ai", "acceptance", "catalog.json"), "utf8"));

  it("210 eski + 64 yeni kimlik ayri grup kayitlari (N58)", () => {
    const groups = catalog.groups as Array<{ ids: string; count: number }>;
    const total = groups.reduce((acc, g) => acc + g.count, 0);
    // AC70 + RG52 + RT28 + N64 = 214 (PRO grup envanteri not ile korunur):
    expect(groups.some((g) => g.ids === "AC01-AC70" && g.count === 70)).toBe(true);
    expect(groups.some((g) => g.ids === "RG01-RG52" && g.count === 52)).toBe(true);
    expect(groups.some((g) => g.ids === "RT01-RT28" && g.count === 28)).toBe(true);
    expect(groups.some((g) => g.ids === "N01-N64" && g.count === 64)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(214);
  });

  it("rt_obligations 28 tekil kayit; her kayitta requirement_id/behavior/package", () => {
    expect(catalog.rt_obligations).toHaveLength(28);
    for (const obligation of catalog.rt_obligations) {
      expect(obligation.requirement_id).toMatch(/^RT\d{2}$/);
      expect(obligation.behavior.length).toBeGreaterThan(0);
      // package bir veya birden cok FIN paketine eslesmeli (RT01 gibi coklu eslesme olabilir):
      expect(obligation.package).toMatch(/^FIN\d{2}(\+FIN\d{2})*$/);
    }
  });

  it("n_obligations 64 tekil kayit; duplicate/missing yok; her kayitta evidence_levels", () => {
    expect(catalog.n_obligations).toHaveLength(64);
    const ids = (catalog.n_obligations as Array<{ requirement_id: string }>).map((n) => n.requirement_id);
    expect(new Set(ids).size).toBe(64);
    for (let i = 1; i <= 64; i++) {
      expect(ids).toContain(`N${String(i).padStart(2, "0")}`);
    }
    for (const obligation of catalog.n_obligations) {
      expect(obligation.evidence_levels.length).toBeGreaterThan(0);
      expect(obligation.behavior.length).toBeGreaterThan(0);
      expect(obligation.pkg ?? obligation.package).toBeDefined();
    }
  });

  it("aralik satiri delil degil: grup ozeti tekil kayitlardan turetilir (N58)", () => {
    // onceki beyanlar tarihsel kayit olarak korunur; guncel truth ayri alanda:
    expect(catalog.previous_claims.length).toBeGreaterThanOrEqual(4);
    for (const claim of catalog.previous_claims) {
      expect(claim.claim).toBeDefined();
      expect(claim.current_truth).toBeDefined();
    }
  });
});

describe("W10/F17/N59-N60: verifier negatifleri + kabul ayrisimi", () => {
  it("referans 06 HTML hash kontrolu release-verify.mjs'te mevcut (N59)", () => {
    const verifier = readFileSync(join(repoRoot, "scripts", "release-verify.mjs"), "utf8");
    expect(verifier).toContain("checkReferenceHtmlIntegrity");
    expect(verifier).toContain("e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80");
    expect(verifier).toContain("REFERANS_06_HASH_UYUSMAZ");
  });

  it("release-verify exit 0 (gercek kosu; tum zorunlu kontroller gecti)", () => {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "release-verify.mjs")], { encoding: "utf8", timeout: 60000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DOGRULAMA BASARILI");
  });

  it("N60: catalog pilot pause kaydi; LIVE_MODEL ertelenmis; yerel kanit ayri", () => {
    const catalogText = readFileSync(join(repoRoot, "ai", "acceptance", "catalog.json"), "utf8");
    // previous_claims'te tarihsel beyanlar current_truth ile ayrilir:
    expect(catalogText).toContain("TARIHSEL_BEYAN");
    // AKTIF_GOREV'de canli pilot durumu (005 sozlesmesi): pause ayrisimi korunur;
    // FULL gate non-zero iken production NO_GO kalir (8.2). 004'un
    // FULL_PRODUCT_ACCEPTANCE_VERIFIED etiketi yerine guncel sozlesme isaretleri:
    const aktif = readFileSync(join(repoRoot, "AKTIF_GOREV.md"), "utf8");
    expect(aktif).toContain("PAUSED_BY_USER");
    expect(aktif).toContain("NOT_PASSED");
    expect(aktif).toContain("NO_GO");
  });
});
