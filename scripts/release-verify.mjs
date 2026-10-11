#!/usr/bin/env node
/**
 * P01/PR01: Bagimsiz release gate - iki acik mod, makine-okunur sonuc.
 *
 * BARE/DEFAULT (argumansiz): FULL mod, fail-closed. Yapisal kontroller + gercek kabul
 * evidence manifesti dogrulamasi. Evidence manifesti yoksa/eksikse/bozuksa, zorunlu
 * obligation kapsami eksik/mukerrerse, yanlis evidence level/predicate/job/run varsa,
 * canli pilot PAUSED_BY_USER/NOT_PASSED veya platform kaniti NOT_RUN ise NON-ZERO exit
 * (NO_GO). Yerel fixture yesil mesaji production onayi olarak yazilmaz.
 *
 * --local: yalniz yapisal/fixture kontrolleri (maintainer girisi). Local basari exit 0
 * verebilir ama cikti "FULL kabul bekliyor; production onayi degil" olarak acik
 * isaretlenir. Local pass'ten full pass uretilmez; full gate evidence'i bagimsiz dogrular.
 *
 * --manifest <path>: evidence manifest yolu (varsayilan: ai/acceptance/evidence-manifest.json).
 * --print-identity: kaynak/build kimlik digeslerini JSON olarak yazar (manifest uretimi icin).
 *
 * Makine-okunur sonuc stdout'ta RESULT_JSON isaretinden sonra yazilir: scope, source
 * commit/tree/lockfile/build digest, run manifest kimligi, obligation bazinda durum,
 * eksik/gecersiz/bloke kanitlar, nihai karar ve non-zero gerekce kodlari.
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

const args = process.argv.slice(2);
const printIdentity = args.includes("--print-identity");
const localMode = args.includes("--local");
const mode = localMode ? "local" : "full";
const manifestIdx = args.indexOf("--manifest");
const manifestPathArg = manifestIdx >= 0 && typeof args[manifestIdx + 1] === "string" ? args[manifestIdx + 1] : undefined;
const EVIDENCE_MANIFEST_REL = "ai/acceptance/evidence-manifest.json";
const evidenceManifestPath = manifestPathArg ? resolve(manifestPathArg) : join(repoRoot, EVIDENCE_MANIFEST_REL);

const MANDATORY_FILES = [
  "package.json",
  "package-lock.json",
  "dist/mcp/stdio-entry.js",
  "scripts/install.mjs",
  "scripts/uninstall.mjs",
  "scripts/verify-install.mjs",
  "scripts/mcp-handshake-smoke.mjs",
  "docs/security.md",
  "AKTIF_GOREV.md",
  "ai/acceptance/catalog.json",
  "tests/benchmark/corpus.json",
];

// PR01: kaynak/paket/lockfile/config/build input digest'i deterministik relative path +
// baytlarla uretilir; dosya mtime'i tek basina provenance degildir.
const TREE_DIGEST_DIRS = ["src", "scripts", "tests", "docs"];
const TREE_DIGEST_ROOT_FILES = ["package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "eslint.config.mjs"];
const BUILD_INPUT_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vitest.config.ts",
  "eslint.config.mjs",
  "scripts/release-verify.mjs",
  "scripts/install.mjs",
  "scripts/uninstall.mjs",
  "scripts/verify-install.mjs",
  "scripts/mcp-handshake-smoke.mjs",
];
const DIST_ARTIFACTS = ["dist/mcp/stdio-entry.js", "dist/index.js"];
const WALK_SKIP = new Set(["node_modules", ".git", "target", "dist", "build", ".mvn", "coverage"]);

// PR01: secret kontrolu calisma kapsamiyla dogru isimlendirilir; yayinlanacak Git/paket
// artifact envanterini kapsar. Iki dosya kapsam disidir: bu script (kendi pattern
// literalleri) ve sentetik fixture anahtari iceren bilinen test dosyasi.
const SECRET_SCAN_DIRS = ["src", "scripts", "docs", "tests", "dist", "ai/acceptance"];
const SECRET_SCAN_ROOT_FILES = ["package.json", "package-lock.json", "README.md", "tsconfig.json", "vitest.config.ts", "eslint.config.mjs"];
const SECRET_SCAN_SKIP_FILES = new Set([resolve(__filename_placeholder())]);
const SECRET_SCAN_ALLOW_FILES = new Set([join(repoRoot, "tests", "unit", "fin09-patch-export.test.ts")]);

function __filename_placeholder() {
  return fileURLToPath(import.meta.url);
}

// Urunun mevcut VerificationLevel semantigi (src/domain/job-state.ts) ile ayni payda:
const VERIFICATION_SCOPES = ["UNVERIFIED", "TARGET_ONLY", "AFFECTED_SCOPE", "FULL_DECLARED_SCOPE"];
const KNOWN_EVIDENCE_LEVELS = ["UNIT", "CONTRACT", "CONTRACT_HTTP", "INTEGRATION_LOCAL", "INTEGRATION_ISOLATED", "OPERATIONAL", "REVIEW", "BROWSER", "LIVE_MODEL", "PLATFORM"];
const LIVE_PILOT_STATUSES = ["PASSED", "NOT_PASSED", "PAUSED_BY_USER", "NOT_RUN"];

const reasons = [];
const warnings = [];

function addReason(code, detail) {
  reasons.push({ code, detail });
}
function addWarning(detail) {
  warnings.push(detail);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function checkMandatoryFiles() {
  for (const rel of MANDATORY_FILES) {
    const path = join(repoRoot, rel);
    if (!existsSync(path)) {
      addReason("ZORUNLU_DOSYA_EKSIK", rel);
    }
  }
}

// W10/F17/N01: referans/arsiv hash butunlugu - onayli 06 HTML referansi beklenen hash ile eslesmeli;
// farkliysa verifier non-zero doner (sessiz ezme/ikame yok).
const REFERENCE_HTML_EXPECTED_SHA256 = "e3c8fd2da77000a0fd39ed88a00b3159e1100e4cf35146b0bbb83969eaef8c80";

function checkReferenceHtmlIntegrity() {
  const referencePath = join(repoRoot, "docs", "reporting", "reference", "innova_test_raporu_tasarim_06.html");
  if (!existsSync(referencePath)) {
    addReason("REFERANS_06_EKSIK", "docs/reporting/reference/innova_test_raporu_tasarim_06.html bulunamadi");
    return;
  }
  const actual = sha256File(referencePath);
  if (actual !== REFERENCE_HTML_EXPECTED_SHA256) {
    addReason("REFERANS_06_HASH_UYUSMAZ", `beklenen ${REFERENCE_HTML_EXPECTED_SHA256.slice(0, 16)}..., bulunan ${actual.slice(0, 16)}...`);
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
    addReason("DIST_ESKI", "src/mcp/stdio-entry.ts, dist/mcp/stdio-entry.js'den yeni; npm run build gerekli");
  }
}

function collectDigestEntries(dirs, rootFiles) {
  const entries = [];
  const walk = (current, prefix) => {
    if (!existsSync(current)) {
      return;
    }
    for (const name of readdirSync(current)) {
      if (WALK_SKIP.has(name)) {
        continue;
      }
      const full = join(current, name);
      const stat = statSync(full);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        entries.push({ rel, size: stat.size });
      }
    }
  };
  for (const dir of dirs) {
    walk(join(repoRoot, dir), dir);
  }
  for (const file of rootFiles) {
    const full = join(repoRoot, file);
    if (existsSync(full)) {
      entries.push({ rel: file, size: statSync(full).size });
    }
  }
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return entries;
}

function deterministicDigest(entries) {
  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(entry.rel);
    digest.update("\0");
    digest.update(sha256File(join(repoRoot, entry.rel)));
    digest.update("\n");
  }
  return digest.digest("hex");
}

function computeSourceIdentity() {
  const treeEntries = collectDigestEntries(TREE_DIGEST_DIRS, TREE_DIGEST_ROOT_FILES);
  if (treeEntries.length === 0) {
    addReason("SOURCE_TREE_BOS", "src/scripts/tests/docs dizinleri bos");
  }
  const treeDigest = deterministicDigest(treeEntries);
  const buildEntries = collectDigestEntries([], BUILD_INPUT_FILES);
  const buildInputDigest = deterministicDigest(buildEntries);
  const lockfilePath = join(repoRoot, "package-lock.json");
  const lockfileSha256 = existsSync(lockfilePath) ? sha256File(lockfilePath) : null;
  if (!lockfileSha256) {
    addReason("ZORUNLU_DOSYA_EKSIK", "package-lock.json");
  }
  const distArtifacts = [];
  for (const rel of DIST_ARTIFACTS) {
    const abs = join(repoRoot, rel);
    if (existsSync(abs)) {
      distArtifacts.push({ relative_path: rel, sha256: sha256File(abs), bytes: statSync(abs).size });
    }
  }
  let commit = null;
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 3000 });
    if (result.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0) {
      commit = result.stdout.trim();
    }
  } catch {
    commit = null;
  }
  let dirty = false;
  try {
    const result = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 3000 });
    dirty = result.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0;
  } catch {
    dirty = false;
  }
  return { commit, dirty, tree_digest: treeDigest, file_count: treeEntries.length, lockfile_sha256: lockfileSha256, build_input_digest: buildInputDigest, dist_artifacts: distArtifacts };
}

function checkCatalogIntegrity() {
  const catalogPath = join(repoRoot, "ai", "acceptance", "catalog.json");
  if (!existsSync(catalogPath)) {
    return null;
  }
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch (error) {
    addReason("CATALOG_PARSE_HATASI", String(error));
    return null;
  }
  // RT obligation'lari tekil kayit:
  if (!Array.isArray(catalog.rt_obligations) || catalog.rt_obligations.length !== 28) {
    addReason("CATALOG_RT_EKSIK", `rt_obligations 28 kayit olmali (bulunan: ${Array.isArray(catalog.rt_obligations) ? catalog.rt_obligations.length : 0})`);
  }
  for (const obligation of catalog.rt_obligations ?? []) {
    if (!obligation.requirement_id || !obligation.behavior || !obligation.package) {
      addReason("CATALOG_RT_ALAN_EKSIK", obligation.requirement_id ?? "?");
    }
  }
  checkCatalogDuplicateIds(catalog.rt_obligations, "CATALOG_RT_DUPLICATE");
  checkCatalogDuplicateIds(catalog.n_obligations, "CATALOG_N_DUPLICATE");
  return catalog;
}

function checkCatalogDuplicateIds(rows, code) {
  if (!Array.isArray(rows)) {
    return;
  }
  const seen = new Set();
  for (const row of rows) {
    const id = row?.requirement_id;
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }
    if (seen.has(id)) {
      addReason(code, `${id} birden cok kez kayitli`);
    }
    seen.add(id);
  }
}

function expandGroupIdRange(groupId) {
  const match = /^([A-Za-z]+)(\d+)-([A-Za-z]+)(\d+)$/.exec(groupId);
  if (!match) {
    return null;
  }
  const [, prefix1, startText, prefix2, endText] = match;
  if (prefix1 !== prefix2) {
    return null;
  }
  const start = Number.parseInt(startText, 10);
  const end = Number.parseInt(endText, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 1000) {
    return null;
  }
  const ids = [];
  for (let i = start; i <= end; i++) {
    ids.push(prefix1 + String(i).padStart(startText.length, "0"));
  }
  return ids;
}

function mandatoryObligationUniverse(catalog) {
  const ids = new Set();
  const groups = [];
  if (catalog) {
    for (const group of catalog.groups ?? []) {
      const expanded = expandGroupIdRange(group?.ids ?? "");
      if (expanded) {
        for (const id of expanded) {
          ids.add(id);
        }
        groups.push({ ids: group.ids, count: expanded.length });
      }
    }
  }
  return { idList: [...ids].sort(), groups };
}

function catalogEvidenceLevels(catalog) {
  const map = new Map();
  if (!catalog) {
    return map;
  }
  for (const row of [...(catalog.rt_obligations ?? []), ...(catalog.n_obligations ?? [])]) {
    if (row?.requirement_id && Array.isArray(row.evidence_levels)) {
      map.set(row.requirement_id, row.evidence_levels);
    }
  }
  return map;
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
    addReason("CORPUS_PARSE_HATASI", String(error));
    return;
  }
  if (!Array.isArray(corpus.fixtures) || corpus.fixtures.length < 12) {
    addReason("CORPUS_EKSIK", `en az 12 fixture gerekli (bulunan: ${corpus.fixtures?.length ?? 0})`);
  }
  const reachable = (corpus.fixtures ?? []).filter((f) => f.baseline_below_90);
  const negative = (corpus.fixtures ?? []).filter((f) => f.negative_control);
  if (reachable.length < 8) {
    addReason("CORPUS_REACHABLE_EKSIK", `BM01-BM08 baseline %90 alti olmali (bulunan: ${reachable.length})`);
  }
  if (negative.length < 4) {
    addReason("CORPUS_NEGATIVE_EKSIK", `BM09-BM12 negatif kontrol olmali (bulunan: ${negative.length})`);
  }
}

function checkSecurityDoc() {
  const securityPath = join(repoRoot, "docs", "security.md");
  if (!existsSync(securityPath)) {
    return;
  }
  const content = readFileSync(securityPath, "utf8");
  for (const marker of ["guvenilmeyen girdidir", "OS administrator", "oracle"]) {
    if (!content.includes(marker)) {
      addReason("SECURITY_DOC_EKSIK_MARKER", `"${marker}" bulunamadi`);
    }
  }
}

function checkNoSecretsInReleaseInventory() {
  // PR01: yayinlanacak Git/paket artifact envanteri kapsaminda secret taramasi.
  const secretPatterns = [
    /sk-[A-Za-z0-9]{20,}/,
    /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/,
    /AKIA[0-9A-Z]{16}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
  ];
  const scan = (abs, rel) => {
    if (SECRET_SCAN_SKIP_FILES.has(abs) || SECRET_SCAN_ALLOW_FILES.has(abs)) {
      return;
    }
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      for (const name of readdirSync(abs)) {
        if (WALK_SKIP.has(name)) {
          continue;
        }
        scan(join(abs, name), `${rel}/${name}`);
      }
      return;
    }
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        addReason("SECRET_SIZINTISI", `${rel} icinde secret pattern (release envanteri)`);
      }
    }
  };
  for (const dir of SECRET_SCAN_DIRS) {
    const abs = join(repoRoot, dir);
    if (existsSync(abs)) {
      scan(abs, dir);
    }
  }
  for (const file of SECRET_SCAN_ROOT_FILES) {
    const abs = join(repoRoot, file);
    if (existsSync(abs)) {
      scan(abs, file);
    }
  }
}

function emptyStats(mandatory) {
  return { mandatory, verified: 0, missing: mandatory, invalid: 0, duplicate: 0, missing_ids_sample: [], invalid_ids_sample: [], duplicate_ids_sample: [] };
}

function validateEvidenceArtifact(id, artifact, problems) {
  if (!artifact || typeof artifact !== "object") {
    problems.push({ code: "EVIDENCE_ARTIFACT_EKSIK", detail: id });
    return;
  }
  const rel = artifact.relative_path;
  if (typeof rel !== "string" || rel.length === 0) {
    problems.push({ code: "EVIDENCE_ARTIFACT_EKSIK", detail: id });
    return;
  }
  const abs = resolve(join(repoRoot, rel));
  const relCheck = relative(repoRoot, abs);
  if (isAbsolute(rel) || relCheck.startsWith("..") || relCheck.length === 0) {
    problems.push({ code: "EVIDENCE_ARTIFACT_YOL_GECERSIZ", detail: `${id}: ${rel} repo disina cikiyor` });
    return;
  }
  if (!existsSync(abs)) {
    problems.push({ code: "EVIDENCE_ARTIFACT_EKSIK", detail: `${id}: ${rel} bulunamadi` });
    return;
  }
  const hash = sha256File(abs);
  if (typeof artifact.sha256 !== "string" || hash !== artifact.sha256) {
    problems.push({ code: "EVIDENCE_HASH_BOZUK", detail: `${id}: ${rel} sha256 uyusmaz (hash bozulmasi gecmez)` });
  }
  if (typeof artifact.bytes !== "number") {
    problems.push({ code: "EVIDENCE_BOYUT_EKSIK", detail: `${id}: ${rel} bytes zorunlu` });
  } else if (artifact.bytes !== statSync(abs).size) {
    problems.push({ code: "EVIDENCE_BOYUT_UYUSMAZ", detail: `${id}: ${rel} boyut uyusmaz` });
  }
}

function validateEvidenceEntry(entry, ctx) {
  const problems = [];
  const id = entry?.requirement_id;
  if (entry.predicate !== undefined && entry.predicate !== id) {
    problems.push({ code: "EVIDENCE_PREDICATE_UYUSMAZ", detail: `${id}: predicate ${JSON.stringify(entry.predicate ?? null)} requirement_id ile uyusmuyor` });
  }
  const level = entry.evidence_level;
  const allowed = ctx.catalogLevels.get(id) ?? KNOWN_EVIDENCE_LEVELS;
  if (typeof level !== "string" || !KNOWN_EVIDENCE_LEVELS.includes(level)) {
    problems.push({ code: "EVIDENCE_SEVIYE_GECERSIZ", detail: `${id}: evidence_level ${JSON.stringify(level ?? null)} tanimli seviye degil` });
  } else if (!allowed.includes(level)) {
    problems.push({ code: "EVIDENCE_SEVIYE_UYUSMAZ", detail: `${id}: ${level}, katalog seviyeleriyle uyusmuyor (${allowed.join(", ")})` });
  }
  const scope = entry.scope;
  if (typeof scope !== "string" || scope.length === 0) {
    problems.push({ code: "EVIDENCE_SCOPE_EKSIK", detail: id });
  } else if (!VERIFICATION_SCOPES.includes(scope) || scope === "UNVERIFIED") {
    problems.push({ code: "EVIDENCE_SCOPE_GECERSIZ", detail: `${id}: scope ${JSON.stringify(scope)} kanit kapsam seviyesi degil` });
  }
  if (entry.passed === true && ((typeof entry.command !== "string" || entry.command.length === 0) || !entry.artifact)) {
    problems.push({ code: "EVIDENCE_YALNIZ_PASSED", detail: `${id}: passed:true, gercek komut/artifact olmadan kanit sayilmaz` });
  }
  if (typeof entry.command !== "string" || entry.command.length === 0) {
    problems.push({ code: "EVIDENCE_KOMUT_EKSIK", detail: id });
  }
  if (typeof entry.exit_code !== "number") {
    problems.push({ code: "EVIDENCE_EXIT_EKSIK", detail: id });
  } else if (entry.exit_code !== 0) {
    problems.push({ code: "EVIDENCE_EXIT_SIFIR_DEGIL", detail: `${id}: exit_code=${entry.exit_code}` });
  }
  if (entry.job_id !== ctx.run.job_id) {
    problems.push({ code: "EVIDENCE_JOB_UYUSMAZ", detail: `${id}: evidence job_id, manifest run.job_id ile uyusmuyor` });
  }
  if (entry.run_id !== ctx.run.run_id) {
    problems.push({ code: "EVIDENCE_RUN_UYUSMAZ", detail: `${id}: evidence run_id, manifest run.run_id ile uyusmuyor` });
  }
  validateEvidenceArtifact(id, entry.artifact, problems);
  return problems;
}

function verifyEvidenceManifest(identity, catalog, universe) {
  const mandatoryIdSet = new Set(universe.idList);
  const runManifest = { present: false, path: relative(repoRoot, evidenceManifestPath) || evidenceManifestPath, id: null, task: null, schema_version: null, run: null, evaluated: true };
  const fail = (problems, stats) => ({ problems, stats, runManifest, live_pilot: null, platform_evidence: null });
  const stats = () => emptyStats(mandatoryIdSet.size);

  if (!existsSync(evidenceManifestPath)) {
    return fail([{ code: "EVIDENCE_MANIFEST_EKSIK", detail: `${runManifest.path} bulunamadi; full gate gercek kabul kaniti olmadan gecmez (fail-closed)` }], stats());
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(evidenceManifestPath, "utf8"));
  } catch (error) {
    return fail([{ code: "EVIDENCE_MANIFEST_PARSE", detail: String(error) }], stats());
  }
  runManifest.present = true;
  runManifest.schema_version = manifest.schema_version ?? null;
  runManifest.id = typeof manifest.manifest_id === "string" && manifest.manifest_id.length > 0 ? manifest.manifest_id : null;
  runManifest.task = typeof manifest.task === "string" && manifest.task.length > 0 ? manifest.task : null;

  const problems = [];
  if (manifest.schema_version !== 1) {
    problems.push({ code: "EVIDENCE_MANIFEST_SCHEMA", detail: `schema_version=${JSON.stringify(manifest.schema_version ?? null)}; beklenen 1` });
  }
  if (manifest.kind !== "acceptance_evidence") {
    problems.push({ code: "EVIDENCE_MANIFEST_KIND", detail: `kind=${JSON.stringify(manifest.kind ?? null)}; beklenen acceptance_evidence` });
  }
  if (!runManifest.id) {
    problems.push({ code: "EVIDENCE_MANIFEST_KIMLIK", detail: "manifest_id yok (run manifest kimligi zorunlu)" });
  }
  if (!runManifest.task) {
    problems.push({ code: "EVIDENCE_MANIFEST_TASK", detail: "task yok" });
  }

  const source = manifest.source ?? {};
  if (!identity.commit) {
    problems.push({ code: "SOURCE_KIMLIK_YOK", detail: "git HEAD okunamadi; manifest commit eslesmesi dogrulanamaz" });
  } else if (source.commit !== identity.commit) {
    problems.push({ code: "EVIDENCE_COMMIT_UYUSMAZ", detail: `manifest commit ${JSON.stringify(source.commit ?? null)} != HEAD ${identity.commit}` });
  }
  if (source.tree_digest !== identity.tree_digest) {
    problems.push({ code: "EVIDENCE_TREE_UYUSMAZ", detail: `manifest tree_digest ${JSON.stringify(source.tree_digest ?? null)} != hesaplanan ${identity.tree_digest.slice(0, 16)}...` });
  }
  if (source.dirty !== identity.dirty) {
    problems.push({ code: "EVIDENCE_DIRTY_UYUSMAZ", detail: `manifest dirty=${JSON.stringify(source.dirty ?? null)} != gercek ${identity.dirty}` });
  }

  const build = manifest.build ?? {};
  if (build.lockfile_sha256 !== identity.lockfile_sha256) {
    problems.push({ code: "EVIDENCE_LOCKFILE_UYUSMAZ", detail: "manifest lockfile_sha256, package-lock.json hash'i ile uyusmuyor" });
  }
  if (build.build_input_digest !== identity.build_input_digest) {
    problems.push({ code: "EVIDENCE_BUILD_UYUSMAZ", detail: "manifest build_input_digest, build input digesleriyle uyusmuyor" });
  }
  const distList = Array.isArray(build.dist_artifacts) ? build.dist_artifacts : [];
  for (const distRel of DIST_ARTIFACTS) {
    const abs = join(repoRoot, distRel);
    const entry = distList.find((d) => d?.relative_path === distRel);
    if (!entry) {
      problems.push({ code: existsSync(abs) ? "EVIDENCE_DIST_UYUSMAZ" : "EVIDENCE_DIST_EKSIK", detail: `${distRel} manifest build.dist_artifacts'ta dogru kayitli degil` });
    } else if (!existsSync(abs) || sha256File(abs) !== entry.sha256) {
      problems.push({ code: "EVIDENCE_DIST_UYUSMAZ", detail: `${distRel} hash uyusmuyor (dagitilacak build kanitla bagli degil)` });
    }
  }

  const run = manifest.run ?? {};
  if (typeof run.job_id !== "string" || run.job_id.length === 0 || typeof run.run_id !== "string" || run.run_id.length === 0) {
    problems.push({ code: "EVIDENCE_RUN_KIMLIK_EKSIK", detail: "run.job_id/run_id zorunlu" });
    return fail(problems, stats());
  }
  runManifest.run = { job_id: run.job_id, run_id: run.run_id, exit_code: typeof run.exit_code === "number" ? run.exit_code : null };
  if (typeof run.started_at !== "number" || typeof run.ended_at !== "number" || run.ended_at < run.started_at) {
    problems.push({ code: "EVIDENCE_RUN_ZAMAN", detail: "run.started_at/ended_at gecersiz" });
  }

  const obligationList = manifest.obligations;
  if (!Array.isArray(obligationList) || obligationList.length === 0) {
    problems.push({ code: "OBLIGATION_BOS", detail: "obligations bos; bos manifest gecmez" });
    return fail(problems, stats());
  }

  const catalogLevels = catalogEvidenceLevels(catalog);
  const ctx = { run, catalogLevels };
  const seen = new Map();
  const duplicateIds = new Set();
  const invalidIds = new Set();
  for (const entry of obligationList) {
    const id = typeof entry?.requirement_id === "string" && entry.requirement_id.length > 0 ? entry.requirement_id : null;
    if (!id) {
      problems.push({ code: "EVIDENCE_KIMLIK_EKSIK", detail: "obligation kaydinda requirement_id yok" });
      continue;
    }
    if (seen.has(id)) {
      duplicateIds.add(id);
      continue;
    }
    seen.set(id, entry);
    if (!mandatoryIdSet.has(id)) {
      problems.push({ code: "OBLIGATION_TANIMSIZ", detail: `${id} zorunlu obligation kumesinde yok` });
      invalidIds.add(id);
      continue;
    }
    for (const problem of validateEvidenceEntry(entry, ctx)) {
      problems.push(problem);
      invalidIds.add(id);
    }
  }
  for (const id of duplicateIds) {
    problems.push({ code: "OBLIGATION_DUPLICATE", detail: `${id} birden cok kez bildirilmis` });
  }
  const missingIds = [...mandatoryIdSet].filter((id) => !seen.has(id));
  for (const id of missingIds.slice(0, 25)) {
    problems.push({ code: "OBLIGATION_EKSIK", detail: `${id} icin evidence yok` });
  }
  if (missingIds.length > 25) {
    problems.push({ code: "OBLIGATION_EKSIK", detail: `... ve ${missingIds.length - 25} zorunlu id daha` });
  }
  const resultStats = {
    mandatory: mandatoryIdSet.size,
    verified: [...mandatoryIdSet].filter((id) => seen.has(id) && !invalidIds.has(id)).length,
    missing: missingIds.length,
    invalid: invalidIds.size,
    duplicate: duplicateIds.size,
    missing_ids_sample: missingIds.slice(0, 10),
    invalid_ids_sample: [...invalidIds].slice(0, 10),
    duplicate_ids_sample: [...duplicateIds].slice(0, 10),
  };

  let livePilot = null;
  const live = manifest.live_pilot;
  if (!live || typeof live !== "object") {
    problems.push({ code: "LIVE_PILOT_KANIT_EKSIK", detail: "live_pilot kaydi yok" });
  } else if (typeof live.status !== "string" || !LIVE_PILOT_STATUSES.includes(live.status)) {
    problems.push({ code: "LIVE_PILOT_GECERSIZ", detail: `live_pilot.status=${JSON.stringify(live.status ?? null)}` });
  } else {
    livePilot = live.status;
    if (live.status !== "PASSED") {
      problems.push({ code: `LIVE_PILOT_${live.status}`, detail: `canli pilot durumu ${live.status}; full gate PASSED gerektirir (PP01/PP46)` });
    }
  }

  let platformStatus = null;
  const platform = manifest.platform_evidence;
  if (!platform || typeof platform !== "object") {
    problems.push({ code: "PLATFORM_KANIT_EKSIK", detail: "platform_evidence kaydi yok" });
  } else if (typeof platform.status !== "string") {
    problems.push({ code: "PLATFORM_KANIT_GECERSIZ", detail: `platform_evidence.status=${JSON.stringify(platform.status ?? null)}` });
  } else {
    platformStatus = platform.status;
    if (platform.status === "NOT_RUN") {
      problems.push({ code: "PLATFORM_KANIT_YOK", detail: "zorunlu platform kaniti NOT_RUN; full gate gecmez (PP01)" });
    } else if (platform.status !== "PASSED") {
      problems.push({ code: "PLATFORM_KANIT_GECERSIZ", detail: `platform_evidence.status=${platform.status}` });
    }
  }

  return { problems, stats: resultStats, runManifest, live_pilot: livePilot, platform_evidence: platformStatus };
}

function printResultJson(result) {
  console.log("RESULT_JSON:");
  console.log(JSON.stringify(result, null, 2));
}

function main() {
  const identity = computeSourceIdentity();

  if (printIdentity) {
    printResultJson({
      schema_version: 1,
      tool: "release-verify",
      kind: "source_build_identity",
      source: { commit: identity.commit, dirty: identity.dirty, tree_digest: identity.tree_digest, file_count: identity.file_count },
      build: { lockfile_sha256: identity.lockfile_sha256, build_input_digest: identity.build_input_digest, dist_artifacts: identity.dist_artifacts },
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      generated_at: new Date().toISOString(),
    });
    process.exit(0);
  }

  console.log(`[release-verify] mod: ${mode.toUpperCase()}${mode === "full" ? " (fail-closed; gercek kabul evidence dogrulamasi)" : " (yalniz yapisal/fixture kontrolleri)"}`);

  checkMandatoryFiles();
  const catalog = checkCatalogIntegrity();
  checkCorpusIntegrity();
  checkSecurityDoc();
  checkNoSecretsInReleaseInventory();
  checkReferenceHtmlIntegrity();
  checkDistNotStale();
  const universe = mandatoryObligationUniverse(catalog);

  const structuralReasons = [...reasons];
  let evidence = null;

  if (mode === "full") {
    evidence = verifyEvidenceManifest(identity, catalog, universe);
    for (const problem of evidence.problems) {
      reasons.push(problem);
    }
  }

  const decision = mode === "full" ? (reasons.length === 0 ? "GO" : "NO_GO") : reasons.length === 0 ? "LOCAL_PASS" : "LOCAL_FAIL";
  const exitCode = reasons.length === 0 ? 0 : 1;

  const result = {
    schema_version: 1,
    tool: "release-verify",
    mode,
    scope: {
      structural_checks: ["mandatory_files", "dist_freshness", "catalog_integrity", "corpus_integrity", "security_doc", "secret_scan_release_inventory", "reference_html_integrity", "source_tree_digest"],
      obligation_universe: { count: universe.idList.length, groups: universe.groups },
      evidence_manifest_path: relative(repoRoot, evidenceManifestPath) || evidenceManifestPath,
      evidence_levels: KNOWN_EVIDENCE_LEVELS,
      evidence_scopes: VERIFICATION_SCOPES,
    },
    source: { commit: identity.commit, commit_available: identity.commit !== null, tree_digest: identity.tree_digest, dirty: identity.dirty, file_count: identity.file_count },
    build: { lockfile_sha256: identity.lockfile_sha256, build_input_digest: identity.build_input_digest, dist_artifacts: identity.dist_artifacts },
    run_manifest: mode === "full" && evidence ? evidence.runManifest : { present: false, path: relative(repoRoot, evidenceManifestPath) || evidenceManifestPath, id: null, evaluated: false },
    obligations: evidence ? evidence.stats : null,
    live_pilot: evidence ? evidence.live_pilot : null,
    platform_evidence: evidence ? evidence.platform_evidence : null,
    decision,
    exit_code: exitCode,
    reasons,
    warnings,
    full_acceptance_pending: mode === "local",
    generated_at: new Date().toISOString(),
    platform_info: { os: `${process.platform}-${process.arch}`, node: process.version },
  };

  for (const warning of warnings) {
    console.log(`  UYARI: ${warning}`);
  }

  if (reasons.length > 0) {
    console.error(`[release-verify] ${mode === "full" ? "FULL GATE: NO_GO — production onayi VERILMEDI (fail-closed)" : "YEREL DOGRULAMA BASARISIZ"} — non-zero exit:`);
    for (const reason of reasons) {
      console.error(`  - ${reason.code}: ${reason.detail}`);
    }
  }

  if (decision === "GO") {
    console.log(`[release-verify] source commit: ${identity.commit ?? "yok"} | tree digest: ${identity.tree_digest.slice(0, 16)}...`);
    console.log(`[release-verify] run manifest: ${result.run_manifest.id ?? "yok"} | obligations: ${result.obligations.verified}/${result.obligations.mandatory} | live pilot: ${result.live_pilot} | platform: ${result.platform_evidence}`);
    console.log("[release-verify] FULL GATE: GO — gercek kabul evidence'lari dogrulandi");
  } else if (decision === "LOCAL_PASS") {
    console.log(`[release-verify] source commit: ${identity.commit ?? "yok"} | tree digest: ${identity.tree_digest.slice(0, 16)}...`);
    console.log("[release-verify] YEREL DOGRULAMA BASARILI (local mod: yapisal/fixture kontrolleri; FULL kabul bekliyor — bu cikti production onayi DEGIL)");
  }

  printResultJson(result);
  process.exit(exitCode);
}

main();
