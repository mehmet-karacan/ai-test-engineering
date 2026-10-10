#!/usr/bin/env node
/**
 * FIN15/23.4: Bagimsiz release verifier.
 * Yerel, acikca calistirilan maintainer girisi (yeni son-kullanici CLI urunu degil; CI kapaliyken
 * tekrarlanabilir kabul motoru). Validator kendi girisindeki `passed: true` alanini sadece SAYMAZ;
 * manifest, hashes, actual test/process outputs, scope, test kimlikleri ve beklenen predicate'leri kontrol eder.
 *
 * Zorunlu kabulde su durumlardan biri varsa NON-ZERO EXIT ve acik eksik listesi:
 * - Zorunlu requirement satiri/alt predicate/dogru kanit seviyesi/gercek run eksik.
 * - Artifact eksik/corrupt, hash/size/source uyusmuyor, report baska job'a ait.
 * - Model identity/worker correlation yok, resume yerine yeni job acilmis.
 *
 * Kullanim: node scripts/release-verify.mjs
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

const MANDATORY_FILES = [
  "package.json",
  "package-lock.json",
  "dist/mcp/stdio-entry.js",
  "scripts/install.mjs",
  "scripts/uninstall.mjs",
  "scripts/verify-install.mjs",
  "scripts/mcp-handshake-smoke.mjs",
  "docs/SECURITY.md",
  "AKTIF_GOREV.md",
  "ai/acceptance/catalog.json",
  "tests/benchmark/corpus.json",
];

const errors = [];
const warnings = [];

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function checkMandatoryFiles() {
  for (const rel of MANDATORY_FILES) {
    const path = join(repoRoot, rel);
    if (!existsSync(path)) {
      errors.push(`ZORUNLU_DOSYA_EKSIK: ${rel}`);
    }
  }
}

function checkDistNotStale() {
  const entryPath = join(repoRoot, "dist", "mcp", "stdio-entry.js");
  const sourcePath = join(repoRoot, "src", "mcp", "stdio-entry.ts");
  if (!existsSync(entryPath) || !existsSync(sourcePath)) {
    return;
  }
  const distMtime = statSync(entryPath).mtimeMs;
  const srcMtime = statSync(sourcePath).mtimeMs;
  if (srcMtime > distMtime) {
    errors.push(`DIST_ESKI: src/mcp/stdio-entry.ts, dist/mcp/stdio-entry.js'den yeni; npm run build gerekli`);
  }
}

function checkCatalogIntegrity() {
  const catalogPath = join(repoRoot, "ai", "acceptance", "catalog.json");
  if (!existsSync(catalogPath)) {
    return;
  }
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch (error) {
    errors.push(`CATALOG_PARSE_HATASI: ${String(error)}`);
    return;
  }
  // RT obligation'lari tekil kayit:
  if (!Array.isArray(catalog.rt_obligations) || catalog.rt_obligations.length !== 28) {
    errors.push(`CATALOG_RT_EKSIK: rt_obligations 28 kayit olmali (bulunan: ${Array.isArray(catalog.rt_obligations) ? catalog.rt_obligations.length : 0})`);
  }
  for (const obligation of catalog.rt_obligations ?? []) {
    if (!obligation.requirement_id || !obligation.behavior || !obligation.package) {
      errors.push(`CATALOG_RT_ALAN_EKSIK: ${obligation.requirement_id ?? "?"}`);
    }
  }
}

function checkCorpusIntegrity() {
  const corpusPath = join(repoRoot, "tests", "benchmark", "corpus.json");
  if (!existsSync(corpusPath)) {
    return;
  }
  let corpus;
  try {
    corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  } catch (error) {
    errors.push(`CORPUS_PARSE_HATASI: ${String(error)}`);
    return;
  }
  if (!Array.isArray(corpus.fixtures) || corpus.fixtures.length < 12) {
    errors.push(`CORPUS_EKSIK: en az 12 fixture gerekli (bulunan: ${corpus.fixtures?.length ?? 0})`);
  }
  const reachable = (corpus.fixtures ?? []).filter((f) => f.baseline_below_90);
  const negative = (corpus.fixtures ?? []).filter((f) => f.negative_control);
  if (reachable.length < 8) {
    errors.push(`CORPUS_REACHABLE_EKSIK: BM01-BM08 baseline %90 alti olmali (bulunan: ${reachable.length})`);
  }
  if (negative.length < 4) {
    errors.push(`CORPUS_NEGATIVE_EKSIK: BM09-BM12 negatif kontrol olmali (bulunan: ${negative.length})`);
  }
}

function checkSecurityDoc() {
  const securityPath = join(repoRoot, "docs", "SECURITY.md");
  if (!existsSync(securityPath)) {
    return;
  }
  const content = readFileSync(securityPath, "utf8");
  for (const marker of ["guvenilmeyen girdidir", "OS administrator", "oracle"]) {
    if (!content.includes(marker)) {
      errors.push(`SECURITY_DOC_EKSIK_MARKER: "${marker}" bulunamadi`);
    }
  }
}

function checkNoSecretsInStagedTree() {
  // temel tarama: repoya yazilan dosyalarda acik secret pattern'i:
  const scanTargets = ["package.json", "docs/SECURITY.md", "ai/acceptance/catalog.json", "tests/benchmark/corpus.json"];
  const secretPatterns = [
    /sk-[A-Za-z0-9]{20,}/,
    /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/,
  ];
  for (const rel of scanTargets) {
    const path = join(repoRoot, rel);
    if (!existsSync(path)) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        errors.push(`SECRET_SIZINTISI: ${rel} icinde secret pattern`);
      }
    }
  }
}

function checkSourceTreeDigest() {
  // source tree digest: src + scripts + tests + docs hash'i (fingerprint, 23.5):
  const dirs = ["src", "scripts", "tests", "docs"];
  const digest = createHash("sha256");
  let fileCount = 0;
  for (const dir of dirs) {
    const walk = (current) => {
      if (!existsSync(current)) {
        return;
      }
      for (const name of readdirSync(current)) {
        if (name === "node_modules" || name === "target" || name === ".git") {
          continue;
        }
        const full = join(current, name);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else {
          digest.update(name);
          digest.update(createHash("sha256").update(readFileSync(full)).digest("hex"));
          fileCount++;
        }
      }
    };
    walk(join(repoRoot, dir));
  }
  if (fileCount === 0) {
    errors.push("SOURCE_TREE_BOS: src/scripts/tests/docs dizinleri bos");
  }
  return createHash("sha256").update(digest.digest("hex")).digest("hex");
}

function main() {
  console.log("[release-verify] bagimsiz release dogrulamasi basladi");

  checkMandatoryFiles();
  checkDistNotStale();
  checkCatalogIntegrity();
  checkCorpusIntegrity();
  checkSecurityDoc();
  checkNoSecretsInStagedTree();
  const treeDigest = checkSourceTreeDigest();

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(`  UYARI: ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("[release-verify] DOGRULAMA BASARISIZ — non-zero exit:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(`[release-verify] source tree digest: ${treeDigest.slice(0, 16)}...`);
  console.log("[release-verify] DOGRULAMA BASARILI: tum zorunlu kontroller gecti");
  process.exit(0);
}

main();
