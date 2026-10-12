/**
 * S00 scope dogrulayici (AITE-WINDOWS-SUBAGENT-PILOT-006).
 * ai/acceptance/scope-windows-native-v1.json ve ai/acceptance/legacy-to-006.json
 * dosyalarini dogrular: exact membership (320 legacy ID), duplicate, out-of-scope
 * ve replacement zorunluluklari. Hata varsa non-zero exit.
 *
 * Kullanim: node scripts/validate-windows-scope.mjs [repo-koku]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.argv[2] ?? process.cwd());
const scopePath = join(repoRoot, "ai", "acceptance", "scope-windows-native-v1.json");
const mappingPath = join(repoRoot, "ai", "acceptance", "legacy-to-006.json");

const errors = [];
function fail(message) {
  errors.push(message);
}

function readJson(path) {
  if (!existsSync(path)) {
    fail(`Dosya yok: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`JSON parse hatasi (${path}): ${error.message}`);
    return null;
  }
}

const scope = readJson(scopePath);
const mapping = readJson(mappingPath);

if (scope && mapping) {
  // --- Beklenen legacy universe: 320 tekil ID ---
  const families = [
    ["AC", 70],
    ["RG", 52],
    ["RT", 28],
    ["PRO", 60],
    ["N", 64],
    ["PP", 46],
  ];
  const expectedIds = [];
  for (const [family, count] of families) {
    for (let i = 1; i <= count; i++) {
      expectedIds.push(`${family}${String(i).padStart(2, "0")}`);
    }
  }
  const expectedSet = new Set(expectedIds);
  if (expectedIds.length !== 320) {
    fail(`Beklenen universe 320 degil: ${expectedIds.length}`);
  }

  // --- Exact membership, duplicate ve eksik kontrolu ---
  const rows = Array.isArray(mapping.mappings) ? mapping.mappings : [];
  const mappedIds = rows.map((row) => row?.legacy_id);
  const seen = new Map();
  for (const id of mappedIds) {
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicates.length > 0) {
    fail(`Mukerrer legacy_id: ${duplicates.join(", ")}`);
  }
  const unknown = mappedIds.filter((id) => !expectedSet.has(id));
  if (unknown.length > 0) {
    fail(`Universe disi legacy_id: ${unknown.join(", ")}`);
  }
  const missing = expectedIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    fail(`Eksik legacy_id (${missing.length}): ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? " ..." : ""}`);
  }
  if (mappedIds.length !== expectedIds.length) {
    fail(`Mapping satir sayisi ${mappedIds.length} != 320`);
  }

  // --- Scope dosyasi legacy_ids listesi ayni membershipi tasimali ---
  const scopeIds = Array.isArray(scope.legacy_ids) ? scope.legacy_ids : [];
  if (scopeIds.length !== expectedIds.length || scopeIds.some((id, index) => id !== expectedIds[index])) {
    fail(`scope.legacy_ids beklenen 320'lik universe ile birebir uyusmuyor`);
  }
  if (scope.legacy_total !== expectedIds.length) {
    fail(`scope.legacy_total ${scope.legacy_total} != 320`);
  }

  // --- Durum ve replacement zorunluluklari ---
  const validStatuses = new Set(["RETAINED", "REPLACED", "OUT_OF_SCOPE_BY_USER"]);
  const wnPattern = /^WN(0[1-9]|[1-7][0-9]|80)$/;
  const statusCounts = { RETAINED: 0, REPLACED: 0, OUT_OF_SCOPE_BY_USER: 0 };
  for (const row of rows) {
    const id = row?.legacy_id ?? "?";
    if (!validStatuses.has(row?.status)) {
      fail(`${id}: gecersiz status ${String(row?.status)}`);
      continue;
    }
    statusCounts[row.status]++;
    const wn = row?.wn;
    if (!Array.isArray(wn) || wn.length === 0) {
      fail(`${id}: wn listesi bos; her ID en az bir WN karsiligi tasimali`);
      continue;
    }
    for (const target of wn) {
      if (typeof target !== "string" || !wnPattern.test(target)) {
        fail(`${id}: gecersiz WN karsiligi ${String(target)}`);
      }
    }
    if (row.status === "RETAINED") {
      if (typeof row.reason === "string" && row.reason.trim().length === 0) {
        fail(`${id}: RETAINED reason alani bos string olamaz`);
      }
    } else {
      // REPLACED ve OUT_OF_SCOPE_BY_USER icin acik neden zorunlu (WN02/WN68):
      if (typeof row.reason !== "string" || row.reason.trim().length < 20) {
        fail(`${id}: ${row.status} icin acik reason zorunlu`);
      }
    }
  }

  // --- Status sayaclari iki dosyada ve gercek dağılımla tutarli mi ---
  for (const status of validStatuses) {
    if (scope.status_counts?.[status] !== statusCounts[status]) {
      fail(`scope.status_counts.${status} ${String(scope.status_counts?.[status])} != gercek ${statusCounts[status]}`);
    }
    if (mapping.status_counts?.[status] !== statusCounts[status]) {
      fail(`mapping.status_counts.${status} ${String(mapping.status_counts?.[status])} != gercek ${statusCounts[status]}`);
    }
  }
  if (mapping.total !== expectedIds.length) {
    fail(`mapping.total ${mapping.total} != 320`);
  }

  // --- Kimlik ve kapsam alanlari ---
  if (scope.scope_id !== "windows-native-v1" || mapping.scope_id !== "windows-native-v1") {
    fail(`scope_id windows-native-v1 olmali`);
  }
  if (!Array.isArray(scope.basis) || scope.basis.length === 0) {
    fail(`scope.basis karar listesi bos olamaz`);
  }
  if (scope.gate?.default_without_valid_scope !== "NO_GO") {
    fail(`Gecerli scope yokken gate varsayilani NO_GO olmali`);
  }
}

if (errors.length > 0) {
  console.error(`validate-windows-scope: ${errors.length} hata`);
  for (const message of errors) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}
console.error("validate-windows-scope: OK (320 legacy ID, membership/duplicate/replacement dogrulandi)");
process.exit(0);
