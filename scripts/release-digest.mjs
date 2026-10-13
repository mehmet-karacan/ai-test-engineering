/**
 * P09/PR01: kaynak/build kimligi digerlerinin ortak modulu.
 *
 * release-verify.mjs (gate) ve write-build-stamp.mjs (build stamp uretici) AYNI digest
 * sabitlerini ve algoritmalarini bu moduldan kullanir; iki arac arasinda sessiz drift
 * olusamaz. Digest, deterministik relative path + bayt tabanlidir; dosya mtime'i tek
 * basina provenance sayilmaz.
 *
 * Dairesel referans kurallari:
 * - ai/acceptance/evidence-manifest.json tree digest'e GIRMEZ (manifest, kendi digest'ini
 *   tanimlayamaz); gate, manifest'i HEAD agaci + clean tree kuraliyla baglar (PP03).
 * - dist/ zaten digest disi olup build stamp (dist/build-stamp.json) kaynak kimligina
 *   bagliligi kani; gate stamp'i dogrular ama digest'e girmez.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const TREE_DIGEST_DIRS = ["src", "scripts", "tests", "docs", "ai/acceptance"];
export const TREE_DIGEST_ROOT_FILES = ["package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "eslint.config.mjs"];
export const BUILD_INPUT_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vitest.config.ts",
  "eslint.config.mjs",
  "scripts/release-verify.mjs",
  "scripts/release-digest.mjs",
  "scripts/write-build-stamp.mjs",
  "scripts/install.mjs",
  "scripts/uninstall.mjs",
  "scripts/verify-install.mjs",
  "scripts/mcp-handshake-smoke.mjs",
  "scripts/restore-recovery-worker.mjs",
];
export const DIST_ARTIFACTS = ["dist/mcp/stdio-entry.js", "dist/index.js"];
export const BUILD_STAMP_REL = "dist/build-stamp.json";
export const BUILD_STAMP_SCHEMA_VERSION = 1;
const WALK_SKIP = new Set(["node_modules", ".git", "target", "dist", "build", ".mvn", "coverage"]);
const TREE_DIGEST_SKIP_FILES = new Set(["ai/acceptance/evidence-manifest.json"]);

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function collectDigestEntries(repoRoot, dirs, rootFiles) {
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
      } else if (!TREE_DIGEST_SKIP_FILES.has(rel)) {
        entries.push(rel);
      }
    }
  };
  for (const dir of dirs) {
    walk(join(repoRoot, dir), dir);
  }
  for (const file of rootFiles) {
    const full = join(repoRoot, file);
    if (existsSync(full)) {
      entries.push(file);
    }
  }
  entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return entries;
}

export function deterministicDigest(repoRoot, entries) {
  const digest = createHash("sha256");
  for (const rel of entries) {
    digest.update(rel);
    digest.update("\0");
    digest.update(sha256File(join(repoRoot, rel)));
    digest.update("\n");
  }
  return digest.digest("hex");
}

export function computeTreeDigest(repoRoot) {
  const entries = collectDigestEntries(repoRoot, TREE_DIGEST_DIRS, TREE_DIGEST_ROOT_FILES);
  return { entries, tree_digest: deterministicDigest(repoRoot, entries) };
}

export function computeBuildInputDigest(repoRoot) {
  const entries = collectDigestEntries(repoRoot, [], BUILD_INPUT_FILES);
  return deterministicDigest(repoRoot, entries);
}

export function distArtifactList(repoRoot) {
  const list = [];
  for (const rel of DIST_ARTIFACTS) {
    const abs = join(repoRoot, rel);
    if (existsSync(abs)) {
      list.push({ relative_path: rel, sha256: sha256File(abs), bytes: statSync(abs).size });
    }
  }
  return list;
}

export function computeSourceIdentity(repoRoot, gitIdentity) {
  const { entries, tree_digest } = computeTreeDigest(repoRoot);
  const buildInputDigest = computeBuildInputDigest(repoRoot);
  const lockfileAbs = join(repoRoot, "package-lock.json");
  const lockfileSha256 = existsSync(lockfileAbs) ? sha256File(lockfileAbs) : null;
  return {
    commit: gitIdentity.commit,
    dirty: gitIdentity.dirty,
    tree_digest,
    file_count: entries.length,
    lockfile_sha256: lockfileSha256,
    build_input_digest: buildInputDigest,
    dist_artifacts: distArtifactList(repoRoot),
  };
}
