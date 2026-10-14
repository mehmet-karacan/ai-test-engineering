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
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DIST_ARTIFACTS,
  BUILD_STAMP_REL,
  BUILD_STAMP_SCHEMA_VERSION,
  sha256File,
  computeTreeDigest,
  computeBuildInputDigest,
  distArtifactList as distArtifactListFor,
} from "./release-digest.mjs";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

const args = process.argv.slice(2);
const recognizedFlags = new Set(["--local", "--print-identity", "--manifest", "--scope"]);
const argumentProblems = [];
const singleFlags = new Set();
let manifestPathArg;
let requestedScope = "windows-native-v1";
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!recognizedFlags.has(arg)) {
    argumentProblems.push({ code: "BILINMEYEN_ARGUMAN", detail: String(arg) });
    continue;
  }
  if (singleFlags.has(arg)) {
    argumentProblems.push({ code: "MUKERRER_ARGUMAN", detail: arg });
  }
  singleFlags.add(arg);
  if (arg === "--manifest" || arg === "--scope") {
    const value = args[++i];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      argumentProblems.push({ code: "ARGUMAN_DEGERI_EKSIK", detail: arg });
      i -= typeof value === "string" ? 1 : 0;
      continue;
    }
    if (arg === "--manifest") manifestPathArg = value;
    else requestedScope = value;
  }
}
if (requestedScope !== "windows-native-v1") {
  argumentProblems.push({ code: "BILINMEYEN_SCOPE", detail: requestedScope });
}
if (singleFlags.has("--local") && singleFlags.has("--print-identity")) {
  argumentProblems.push({ code: "CELISEN_MODLAR", detail: "--local ve --print-identity" });
}
if (singleFlags.has("--print-identity") && singleFlags.has("--manifest")) {
  argumentProblems.push({ code: "CELISEN_MODLAR", detail: "--print-identity ve --manifest" });
}
const printIdentity = singleFlags.has("--print-identity");
const localMode = singleFlags.has("--local");
const mode = localMode ? "local" : "full";
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
  "scripts/restore-recovery-worker.mjs",
  "docs/security.md",
  "AKTIF_GOREV.md",
  "ai/acceptance/catalog.json",
  "ai/acceptance/scope-windows-native-v1.json",
  "ai/acceptance/legacy-to-006.json",
  "tests/benchmark/corpus.json",
];

// PR01: kaynak/paket/lockfile/config/build input digest'i deterministik relative path +
// baytlarla uretilir; dosya mtime'i tek basina provenance degildir. Kabul ledger'i
// (ai/acceptance: catalog, kanit ozetleri) da kaynak kimligi icindedir: ledger'e dokunmak
// kayitli tree digest'i bozar. Evidence manifesti kendi tree digest'ine girmez (dairesel
// referans); manifest, HEAD agacinin birebir commit'li kopyasi + clean tree kuraliyla
// baglanti kurar (PP03). Digest sabitleri ve algoritmalar scripts/release-digest.mjs
// moduluyla ortaktir (gate ve build stamp arasinda drift olusamaz).
const WALK_SKIP = new Set(["node_modules", ".git", "target", "dist", "build", ".mvn", "coverage"]);
function distArtifactList() {
  return distArtifactListFor(repoRoot);
}

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
// PR01: tanimli seviye kumesi kabul ledger'inden (catalog evidence_levels birlesimi)
// turetilir; elle tutulmus liste ile catalog arasi sessiz uyumsuzluk olusamaz. PLATFORM
// seviyesi platform_evidence kaydi tarafindan ayrica zorunlu tutulur (PP01).
const PLATFORM_EVIDENCE_LEVEL = "PLATFORM";
const LIVE_PILOT_STATUSES = ["PASSED", "NOT_PASSED", "PAUSED_BY_USER", "NOT_RUN"];

const reasons = [];
const warnings = [];
reasons.push(...argumentProblems);

function addReason(code, detail) {
  reasons.push({ code, detail });
}

function checkMandatoryFiles() {
  for (const rel of MANDATORY_FILES) {
    const path = join(repoRoot, rel);
    if (!existsSync(path)) {
      addReason("ZORUNLU_DOSYA_EKSIK", rel);
    }
  }
}

function checkWindowsScopeIntegrity() {
  const verifier = join(repoRoot, "scripts", "validate-windows-scope.mjs");
  if (!existsSync(verifier)) {
    addReason("WINDOWS_SCOPE_VALIDATOR_EKSIK", "scripts/validate-windows-scope.mjs bulunamadi");
    return;
  }
  const result = spawnSync(process.execPath, [verifier, repoRoot], { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error || result.status !== 0) {
    addReason("WINDOWS_SCOPE_GECERSIZ", (result.stderr || result.error?.message || `exit ${result.status}`).slice(0, 2000));
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

// dist/build-stamp.json: dagitilacak build'in kaynak kimligina baytlarla bagli oldugunun
// makine-okunur kaydi. build script'i (scripts/write-build-stamp.mjs) uretir; gate, stamp'in
// varligini, tam eslesmesini ve stamp'in kendisinin kaynak digest'ine girme DUSUNMESINI
// (dist/ zaten digest disi) kontrol eder.
function checkBuildStamp(identity) {
  // PR01: dist freshness dosya mtime'i ile OLCEMEZ (mtime tek basina provenance degildir).
  const stampPath = join(repoRoot, BUILD_STAMP_REL);
  if (!existsSync(stampPath)) {
    if (DIST_ARTIFACTS.every((rel) => !existsSync(join(repoRoot, rel)))) {
      addReason("BUILD_STAMP_EKSIK", `${BUILD_STAMP_REL} yok ve dist artifacts uretilmemis; dagitilacak build kanitla bagli degil`);
    } else {
      addReason("BUILD_STAMP_EKSIK", `${BUILD_STAMP_REL} yok; dist, kaynak/build input digeslerine bagli degil (npm run build gerekli)`);
    }
    return;
  }
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(stampPath, "utf8"));
  } catch (error) {
    addReason("BUILD_STAMP_PARSE", `${BUILD_STAMP_REL} parse edilemiyor: ${String(error)}`);
    return;
  }
  if (stamp.schema_version !== BUILD_STAMP_SCHEMA_VERSION) {
    addReason("BUILD_STAMP_SCHEMA", `schema_version=${JSON.stringify(stamp.schema_version ?? null)}; beklenen ${BUILD_STAMP_SCHEMA_VERSION}`);
  }
  if (stamp.kind !== "build_stamp") {
    addReason("BUILD_STAMP_KIND", `kind=${JSON.stringify(stamp.kind ?? null)}; beklenen build_stamp`);
  }
  if (stamp.tree_digest !== identity.tree_digest) {
    addReason("DIST_STALE_TREE", `build stamp tree_digest ${JSON.stringify(stamp.tree_digest ?? null)}, kaynak agac digest'i ${identity.tree_digest.slice(0, 16)}... ile uyusmuyor (dist, bu kaynakla derlenmemis)`);
  }
  if (stamp.build_input_digest !== identity.build_input_digest) {
    addReason("DIST_STALE_BUILD_INPUT", "build stamp build_input_digest, guncel build input digesleriyle uyusmuyor (dist, bu build inputlariyla derlenmemis)");
  }
  if (stamp.lockfile_sha256 !== identity.lockfile_sha256) {
    addReason("DIST_STALE_LOCKFILE", "build stamp lockfile_sha256, package-lock.json hash'i ile uyusmuyor");
  }
  const stampDist = Array.isArray(stamp.dist_artifacts) ? stamp.dist_artifacts : [];
  const currentDist = distArtifactList();
  if (currentDist.length === 0) {
    addReason("DIST_EKSIK", "dist artifacts uretilmemis; dagitilacak build yok");
    return;
  }
  for (const artifact of currentDist) {
    const entry = stampDist.find((d) => d?.relative_path === artifact.relative_path);
    if (!entry) {
      addReason("DIST_STAMP_UYUSMAZ", `${artifact.relative_path} build stamp'te kayitli degil`);
    } else if (entry.sha256 !== artifact.sha256 || entry.bytes !== artifact.bytes) {
      addReason("DIST_STAMP_UYUSMAZ", `${artifact.relative_path} stamp hash/boyut ile guncel dist byte'lari uyusmuyor (build sonrasinda degistigi icin stale)`);
    }
  }
}

function computeSourceIdentity() {
  const { entries: treeEntries, tree_digest: treeDigest } = computeTreeDigest(repoRoot);
  if (treeEntries.length === 0) {
    addReason("SOURCE_TREE_BOS", "src/scripts/tests/docs/ai-acceptance dizinleri bos");
  }
  const buildInputDigest = computeBuildInputDigest(repoRoot);
  const lockfilePath = join(repoRoot, "package-lock.json");
  const lockfileSha256 = existsSync(lockfilePath) ? sha256File(lockfilePath) : null;
  if (!lockfileSha256) {
    addReason("ZORUNLU_DOSYA_EKSIK", "package-lock.json");
  }
  const distArtifacts = distArtifactList();
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
  if (catalog.active_task?.id !== "AITE-WINDOWS-SUBAGENT-PILOT-006"
    || catalog.active_task?.version !== "1.0"
    || catalog.active_task?.sha256 !== "59a08a4a2d626d9aa6cfb55faed82513964aabce45528890e7aa648afe371989") {
    addReason("CATALOG_AKTIF_GOREV_UYUSMAZ", "006 gorev kimligi veya sozlesme hash'i uyusmuyor");
  }
  const wnRows = Array.isArray(catalog.wn_obligations) ? catalog.wn_obligations : [];
  const wnIds = new Set(wnRows.map((row) => row?.requirement_id));
  const expectedWnIds = Array.from({ length: 80 }, (_, index) => `WN${String(index + 1).padStart(2, "0")}`);
  if (wnRows.length !== 80 || wnIds.size !== 80 || expectedWnIds.some((id) => !wnIds.has(id))) {
    addReason("CATALOG_WN_EKSIK", `WN01-WN80 tekil kayit olmali (bulunan: ${wnRows.length}, tekil: ${wnIds.size})`);
  }
  for (const row of wnRows) {
    if (typeof row?.behavior !== "string" || row.behavior.length === 0 || typeof row?.package !== "string" || row.package.length === 0) {
      addReason("CATALOG_WN_ALAN_EKSIK", row?.requirement_id ?? "?");
    }
  }
  checkCatalogDuplicateIds(wnRows, "CATALOG_WN_DUPLICATE");
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

// PR01: tanimli seviye = ledger'deki tum evidence_levels birlesimi + PLATFORM (platform
// kaniti ayri kayitta zorunlu). Ledger'in kendisi source tree digest'ine girer; yeni seviye
// eklemek digest'i bozar ve manifest'i yenilemeyi zorunlu kilar.
function catalogKnownLevels(catalog) {
  const set = new Set([PLATFORM_EVIDENCE_LEVEL]);
  if (!catalog) {
    return set;
  }
  for (const row of [...(catalog.rt_obligations ?? []), ...(catalog.n_obligations ?? [])]) {
    if (Array.isArray(row?.evidence_levels)) {
      for (const level of row.evidence_levels) {
        if (typeof level === "string" && level.length > 0) {
          set.add(level);
        }
      }
    }
  }
  return set;
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
  // WN69: required obligation kaydi ancak gercekten PASSED ise dogrulanmis
  // sayilir. NOT_RUN/BLOCKED/FAILED veya eksik passed alani evidence'i
  // tamamlanmis gibi saydiramaz; partial manifest full GO'ya donemez.
  if (entry?.passed !== true) {
    problems.push({ code: "EVIDENCE_NOT_PASSED", detail: `${id ?? "?"}: required predicate passed:true olmali` });
  }
  if (entry.predicate !== undefined && entry.predicate !== id) {
    problems.push({ code: "EVIDENCE_PREDICATE_UYUSMAZ", detail: `${id}: predicate ${JSON.stringify(entry.predicate ?? null)} requirement_id ile uyusmuyor` });
  }
  const level = entry.evidence_level;
  const allowed = ctx.catalogLevels.get(id) ?? [...ctx.knownLevels];
  if (typeof level !== "string" || !ctx.knownLevels.has(level)) {
    problems.push({ code: "EVIDENCE_SEVIYE_GECERSIZ", detail: `${id}: evidence_level ${JSON.stringify(level ?? null)} tanimli seviye degil (ledger'deki seviyeler: ${[...ctx.knownLevels].sort().join(", ")})` });
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
  // PR01: dagitilacak build, kabul run'unda kanitlanan kaynakla derlenmis build olmalidir.
  // Zincir: manifest dist hash == disk dist (yukarida) + disk dist == stamp dist +
  // stamp kaynak kimligi == identity (yapisal kontrolde) + identity == manifest source.
  // Zincirin her halkasi bozuksa full gate gecmez.
  const stampPath = join(repoRoot, BUILD_STAMP_REL);
  let stamp = null;
  if (!existsSync(stampPath)) {
    problems.push({ code: "EVIDENCE_BUILD_STAMP_EKSIK", detail: `${BUILD_STAMP_REL} yok; dagitilacak build'in kaynak kimligina bagliligi kanitlanamadi (PP03)` });
  } else {
    try {
      stamp = JSON.parse(readFileSync(stampPath, "utf8"));
    } catch (error) {
      problems.push({ code: "EVIDENCE_BUILD_STAMP_PARSE", detail: `${BUILD_STAMP_REL} parse edilemiyor: ${String(error)}` });
    }
    if (stamp && stamp.tree_digest !== identity.tree_digest) {
      problems.push({ code: "EVIDENCE_DIST_TREE_UYUSMAZ", detail: "build stamp tree_digest, kabul run kaynak agaciyla uyusmuyor (dist, kanitlanan kaynakla derlenmemis)" });
    }
    if (stamp && stamp.build_input_digest !== identity.build_input_digest) {
      problems.push({ code: "EVIDENCE_DIST_BUILD_INPUT_UYUSMAZ", detail: "build stamp build_input_digest, kabul run build inputlariyla uyusmuyor" });
    }
    if (stamp && stamp.lockfile_sha256 !== identity.lockfile_sha256) {
      problems.push({ code: "EVIDENCE_DIST_LOCKFILE_UYUSMAZ", detail: "build stamp lockfile_sha256, kabul run lockfile'i ile uyusmuyor" });
    }
    if (stamp && Array.isArray(stamp.dist_artifacts)) {
      for (const distRel of DIST_ARTIFACTS) {
        const abs = join(repoRoot, distRel);
        const entry = stamp.dist_artifacts.find((d) => d?.relative_path === distRel);
        if (existsSync(abs) && (!entry || entry.sha256 !== sha256File(abs) || entry.bytes !== statSync(abs).size)) {
          problems.push({ code: "EVIDENCE_DIST_STAMP_UYUSMAZ", detail: `${distRel} guncel dist baytlari, build stamp kaydiyla uyusmuyor (stamp eski veya dist sonradan degisti)` });
        }
      }
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
  // PR01/PP03: kabul run'i non-zero exit vermisse evidence kabul kaniti olamaz;
  // exit_code yoksa/basarisizsa full gate non-zero (fail-closed).
  if (typeof run.exit_code !== "number") {
    problems.push({ code: "EVIDENCE_RUN_EXIT_EKSIK", detail: "run.exit_code zorunlu ve sayisal olmali" });
  } else if (run.exit_code !== 0) {
    problems.push({ code: "EVIDENCE_RUN_EXIT_SIFIR_DEGIL", detail: `run.exit_code=${run.exit_code}; basarisiz kabul run'i kanit sayilamaz (fail-closed)` });
  }

  const obligationList = manifest.obligations;
  if (!Array.isArray(obligationList) || obligationList.length === 0) {
    problems.push({ code: "OBLIGATION_BOS", detail: "obligations bos; bos manifest gecmez" });
    return fail(problems, stats());
  }

  const catalogLevels = catalogEvidenceLevels(catalog);
  const knownLevels = catalogKnownLevels(catalog);
  const ctx = { run, catalogLevels, knownLevels };
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
  if (argumentProblems.length > 0) {
    printResultJson({ schema_version: 1, tool: "release-verify", decision: "NO_GO", exit_code: 1, reasons: argumentProblems });
    process.exit(1);
  }
  const identity = computeSourceIdentity();

  if (printIdentity) {
    const stampPath = join(repoRoot, BUILD_STAMP_REL);
    let stamp = null;
    if (existsSync(stampPath)) {
      try {
        stamp = JSON.parse(readFileSync(stampPath, "utf8"));
      } catch {
        stamp = null;
      }
    }
    printResultJson({
      schema_version: 1,
      tool: "release-verify",
      kind: "source_build_identity",
      scope_id: requestedScope,
      source: { commit: identity.commit, dirty: identity.dirty, tree_digest: identity.tree_digest, file_count: identity.file_count },
      build: { lockfile_sha256: identity.lockfile_sha256, build_input_digest: identity.build_input_digest, dist_artifacts: identity.dist_artifacts },
      build_stamp: stamp,
      build_stamp_path: BUILD_STAMP_REL,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      generated_at: new Date().toISOString(),
    });
    process.exit(0);
  }

  console.log(`[release-verify] mod: ${mode.toUpperCase()}${mode === "full" ? " (fail-closed; gercek kabul evidence dogrulamasi)" : " (yalniz yapisal/fixture kontrolleri)"}`);

  checkMandatoryFiles();
  checkWindowsScopeIntegrity();
  const catalog = checkCatalogIntegrity();
  checkCorpusIntegrity();
  checkSecurityDoc();
  checkNoSecretsInReleaseInventory();
  checkReferenceHtmlIntegrity();
  checkBuildStamp(identity);
  const universe = mandatoryObligationUniverse(catalog);
  const knownLevels = [...catalogKnownLevels(catalog)].sort();

  let evidence = null;

  if (mode === "full") {
    // S00: 005'in 274-ID verifier'i 006'nin WN ve PP kapsamini henüz
    // degerlendiremez. S09 yeni evidence zincirini tamamlayana dek GO kapali.
    addReason("WINDOWS_006_FULL_GATE_PENDING", "WN01-WN80 ve PP01-PP46 evidence gate'i S09'da tamamlanacak");
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
      id: requestedScope,
      manifest_path: "ai/acceptance/scope-windows-native-v1.json",
      structural_checks: ["mandatory_files", "build_stamp_dist_provenance", "catalog_integrity", "corpus_integrity", "security_doc", "secret_scan_release_inventory", "reference_html_integrity", "source_tree_digest"],
      obligation_universe: { count: universe.idList.length, groups: universe.groups },
      evidence_manifest_path: relative(repoRoot, evidenceManifestPath) || evidenceManifestPath,
      evidence_levels: knownLevels,
      evidence_levels_source: "ai/acceptance/catalog.json evidence_levels birlesimi + PLATFORM",
      evidence_scopes: VERIFICATION_SCOPES,
      build_stamp_path: BUILD_STAMP_REL,
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
