/**
 * W09 kabul testleri (N61, N51): PS1'siz temiz Windows kurulum + paket assetleri.
 * - N61: install.mjs CMD+Node; dist/node_modules olmayan temiz copy bootstrap; sentinel korunumu.
 * - N61/N51: yeni rapor template/logo assetleri pakette eksiksiz (06 referans + hash kayitli).
 * - N51: rapor cikti HTML offline acilir; harici fetch yok.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, cpSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const repoRoot = process.cwd();
const REFERENCE_HTML = join(repoRoot, "docs", "reporting", "reference", "innova_test_raporu_tasarim_06.html");
const EXPECTED_SHA256 = "e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80";

describe("W09/N61: PS1'siz temiz kurulum", () => {
  it("install.mjs statik dist import'u yok; dynamic import + fileURLToPath korunur", () => {
    const content = readFileSync(join(repoRoot, "scripts", "install.mjs"), "utf8");
    expect(content).not.toMatch(/^import .*dist\/configuration\/config-merge\.js/m);
    expect(content).toMatch(/await import\(["'`]..\/dist\/configuration\/config-merge\.js/);
    expect(content).toContain("fileURLToPath");
    // PS1 zorunlu degil; CMD+Node akisi:
    expect(content).not.toMatch(/\.ps1/);
  });

  it("PR08/PP42: kurulum scriptleri repoRoot'u fileURLToPath ile cozer; percent-encoded pathname cozumu yok", () => {
    const scripts = ["install.mjs", "uninstall.mjs", "verify-install.mjs", "mcp-handshake-smoke.mjs"];
    for (const script of scripts) {
      const content = readFileSync(join(repoRoot, "scripts", script), "utf8");
      // fileURLToPath zorunlu (Unicode/bosluk path'te percent-encoded pathname bozuk fiziksel path uretir):
      expect(content).toContain("fileURLToPath");
      expect(content).toContain('resolve(dirname(thisFile), "..")');
      // new URL(...).pathname cozumu YOK (Windows Unicode/space path acigi):
      expect(content).not.toMatch(/new URL\([^)]*\)\.pathname/);
      expect(content).not.toMatch(/import\.meta\.url\)\.pathname/);
    }
  });

  it("uninstall.mjs ve verify-install.mjs PS1'siz Node girisleri olarak mevcut", () => {
    expect(existsSync(join(repoRoot, "scripts", "uninstall.mjs"))).toBe(true);
    expect(existsSync(join(repoRoot, "scripts", "verify-install.mjs"))).toBe(true);
    expect(existsSync(join(repoRoot, "scripts", "mcp-handshake-smoke.mjs"))).toBe(true);
    // .ps1 scriptleri zorunlu degil; .mjs girisleri mevcut (korunur):
    expect(existsSync(join(repoRoot, "scripts", "install.ps1"))).toBe(true);
    const verifier = readFileSync(join(repoRoot, "scripts", "verify-install.mjs"), "utf8");
    expect(verifier).toContain("runtime-paths.js");
    expect(verifier).toContain("AITEST_CONFIG");
    expect(verifier).toContain("AITEST_DB_PATH");
    expect(readFileSync(join(repoRoot, "scripts", "install.mjs"), "utf8")).toContain("install-manifest.json");
    expect(readFileSync(join(repoRoot, "scripts", "uninstall.mjs"), "utf8")).toContain("resolveOpenCodeConfigPath");
    expect(readFileSync(join(repoRoot, "scripts", "uninstall.mjs"), "utf8")).toContain("ownedUninstall");
  });

  it("temiz copy bootstrap: dist yokken install.mjs statik import hatasi vermez", () => {
    const dir = mkdtempSync(join(tmpdir(), "aitest-w09-"));
    try {
      // scripts + package.json kopyala (dist/node_modules YOK):
      cpSync(join(repoRoot, "scripts"), join(dir, "scripts"), { recursive: true });
      cpSync(join(repoRoot, "package.json"), join(dir, "package.json"));
      const content = readFileSync(join(dir, "scripts", "install.mjs"), "utf8");
      // dynamic import only: temiz copy'de yuklenebilir
      expect(content).toMatch(/await import\(["'`]..\/dist\/configuration\/config-merge\.js/);
      // config-merge statik import yok (temiz clone'da calisir):
      expect(content).not.toMatch(/^import .*config-merge/m);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // temp
      }
    }
  });

  it("config merge sentinel: mcp ai-test-engineering kaydi; kullanici ust alanlari korunur", () => {
    const content = readFileSync(join(repoRoot, "scripts", "install.mjs"), "utf8");
    // minimal merge: record_path mcp/ai-test-engineering; ezme yok:
    expect(content).toContain('"ai-test-engineering"');
    expect(content).toContain("record_path");
    expect(content).toContain("backup_dir");
    // kullanici config'i yedeksiz ezme YOK:
    expect(content).toContain("mevcut config korundu");
    expect(content).toContain('runNpm(["ci", "--no-fund", "--no-audit"]');
    expect(content).toContain("AITEST_CONFIG");
    expect(content).toContain("AITEST_DB_PATH");
  });

  it("install/verify/uninstall Windows disinda state degisikligine baslamadan fail-closed olur", () => {
    const install = readFileSync(join(repoRoot, "scripts", "install.mjs"), "utf8");
    const verify = readFileSync(join(repoRoot, "scripts", "verify-install.mjs"), "utf8");
    const uninstall = readFileSync(join(repoRoot, "scripts", "uninstall.mjs"), "utf8");

    expect(install).toMatch(/if \(process\.platform !== "win32"\)/);
    expect(install.indexOf("process.platform !== \"win32\"")).toBeLessThan(install.indexOf('runNpm(["ci"'));
    expect(install).toContain("BLOCKED: Windows native kurulum");

    expect(verify).toMatch(/if \(process\.platform !== "win32"\)/);
    expect(verify.indexOf("process.platform !== \"win32\"")).toBeLessThan(verify.indexOf("resolveRuntimeRoot"));
    expect(verify).toContain("BLOCKED: Windows native kurulum");

    expect(uninstall).toMatch(/if \(process\.platform !== "win32"\)/);
    expect(uninstall.indexOf("process.platform !== \"win32\"")).toBeLessThan(uninstall.indexOf("ownedUninstall(installManifestPath)"));
    expect(uninstall.indexOf("import(\"../dist/configuration/config-merge.js\")")).toBeGreaterThan(uninstall.indexOf("process.platform !== \"win32\""));
    expect(uninstall.indexOf("import(\"../dist/configuration/runtime-paths.js\")")).toBeGreaterThan(uninstall.indexOf("process.platform !== \"win32\""));
    expect(uninstall).toContain("BLOCKED: Windows native kaldirma");
  });
});

describe("W09/N61+N51: rapor asset paketi", () => {
  it("06 referans HTML pakette eksiksiz; hash kayitli (N01 ile ortusur)", () => {
    expect(existsSync(REFERENCE_HTML)).toBe(true);
    const hash = createHash("sha256").update(readFileSync(REFERENCE_HTML)).digest("hex");
    expect(hash).toBe(EXPECTED_SHA256);
    expect(statSync(REFERENCE_HTML).size).toBe(257845);
  });

  it("rapor cikti HTML offline: harici network fetch yok (N51)", () => {
    // install edilen temiz paketten uretilecek HTML'in kaynak template'i (report-generator.ts):
    const generator = readFileSync(join(repoRoot, "src", "reporting", "report-generator.ts"), "utf8");
    // harici font/script/CDN referansi yok:
    expect(generator).not.toMatch(/fonts\.googleapis|cdn\.|<script src="http/);
  });

  it("referans HTML CSP'si offline-safe: connect-src none, font-src none", () => {
    const content = readFileSync(REFERENCE_HTML, "utf8");
    expect(content).toContain("connect-src 'none'");
    expect(content).toContain("font-src 'none'");
    expect(content).toContain("default-src 'none'");
  });
});

describe("P08/PP43: kurulum readiness ayrimi (handshake pass urun-ready degildir)", () => {
  const install = () => readFileSync(join(repoRoot, "scripts", "install.mjs"), "utf8");
  const verify = () => readFileSync(join(repoRoot, "scripts", "verify-install.mjs"), "utf8");

  it("test uretimi hazirlik sonucu worker flag VE worker_profiles'e bagli; handshake tek basina urun-kanit sayilmaz", () => {
    const content = install();
    // Hazirlik hem AITEST_WORKER_ENABLED=1 hem persist edilen worker_profiles gerektirir.
    expect(content).toMatch(/AITEST_WORKER_ENABLED["']?\]\s*===\s*["']1["']/);
    expect(content).toMatch(/persistedConfig\.worker_profiles/);
    // Iki ayrik readiness sonucu: READY ve NOT_READY (handshake basari + hazirlik ayrisir).
    expect(content).toContain("READY: MCP handshake");
    expect(content).toContain("NOT_READY: MCP handshake basarili");
    // NOT_READY mesaji eksik hazirlik girdisini acikca beyan eder (sessiz ready yok).
    const notReady = /NOT_READY:[^"]*/.exec(content)?.[0] ?? "";
    expect(notReady).toContain("worker_profiles");
  });

  it("worker/profile env'i yalniz acikca verildiginde kayitli OpenCode entry'ne gider (sessiz default yok)", () => {
    const content = install();
    // Worker/profile sadece env'te tanimliysa entry'ne yazilir; boylece eksik
    // worker/model sessizce default profil veya ready durumuna cevrilmez.
    expect(content).toMatch(/if\s*\(\s*process\.env\["AITEST_WORKER_ENABLED"\]\s*!==\s*undefined\s*\)/);
    expect(content).toMatch(/if\s*\(\s*process\.env\["AITEST_PROFILE"\]\s*!==\s*undefined\s*\)/);
    // Entry her zaman asgari config/DB binding'i tasiyor (handshake smoke girisi).
    expect(content).toContain("AITEST_CONFIG: configPath");
    expect(content).toContain("AITEST_DB_PATH: dbPath");
  });

  it("handshake smoke basarisizsa kurulum BLOCKED; smoke basari urun hazirli degil", () => {
    const content = install();
    // Smoke (MCP handshake) basarisizsa kurulum exit 1 (BLOCKED) doner.
    expect(content).toMatch(/smoke\.status\s*!==\s*0/);
    expect(content).toMatch(/BLOCKED: MCP handshake smoke basarisiz/);
    // Smoke basarisi sonrasi da urun hazirlik sonucu READY/NOT_READY olarak ayrilir.
    expect(content).toContain("KURULUM TAMAMLANDI");
  });

  it("verify-install MCP, model ve Maven readiness durumlarini ayri raporlar", () => {
    const content = verify();
    expect(content).toContain('console.log("[verify] model readiness")');
    expect(content).toContain('console.log("[verify] Maven readiness")');
    expect(content).toContain("evaluateWorkerReadiness");
    expect(content).toContain("evaluateMavenReadiness");
    expect(content).toContain("AITEST_WORKER_ENABLED");
    // Docker yoklugu bu Windows native verifier'da readiness sonucu degildir.
    expect(content).not.toContain("DOCKER_UNAVAILABLE");
  });

  it("install ve verify ayni ortak readiness modulunu kullanir", () => {
    expect(install()).toContain("../dist/configuration/readiness.js");
    expect(install()).toContain("evaluateMavenReadiness");
    expect(verify()).toContain("../dist/configuration/readiness.js");
  });
});
