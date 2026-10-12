#!/usr/bin/env node
/**
 * P09/PR01: dist/build-stamp.json uretici.
 *
 * Dagitilacak build (dist) ile kaynak/build input digerlerini deterministik baytlarla
 * eslesir. Release gate (scripts/release-verify.mjs) dist freshness'i dosya mtime'i ile
 * olcmek yerine bu stamp'e bakar: stamp tree/build-input/lockfile digest'leri guncel
 * kaynak agaciyla ve diskteki dist hash'leriyle uyusmuyorsa gate non-zero doner.
 * Stamp'in kendisi dist/ altindadir ve kaynak tree digest'inin DISINDADIR (dairesel
 * referans); gate stamp'i dogrular ama digest'e girmez.
 * Digest sabitleri ve algoritmalar scripts/release-digest.mjs moduluyla ortaktir.
 */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BUILD_STAMP_REL,
  BUILD_STAMP_SCHEMA_VERSION,
  sha256File,
  computeTreeDigest,
  computeBuildInputDigest,
  distArtifactList,
} from "./release-digest.mjs";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), "..");

const distArtifacts = distArtifactList(repoRoot);
if (distArtifacts.length === 0) {
  console.error("[write-build-stamp] dist artifacts bulunamadi; once 'tsc' (npm run build) calistirilmali");
  process.exit(1);
}

const { entries: treeEntries, tree_digest } = computeTreeDigest(repoRoot);
let commit = null;
try {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 3000 });
  if (result.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0) {
    commit = result.stdout.trim();
  }
} catch {
  commit = null;
}

const stamp = {
  schema_version: BUILD_STAMP_SCHEMA_VERSION,
  kind: "build_stamp",
  tool: "release-verify",
  generated_at: new Date().toISOString(),
  source_commit: commit,
  tree_digest,
  file_count: treeEntries.length,
  build_input_digest: computeBuildInputDigest(repoRoot),
  lockfile_sha256: existsSync(join(repoRoot, "package-lock.json")) ? sha256File(join(repoRoot, "package-lock.json")) : null,
  dist_artifacts: distArtifacts,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
};

const stampPath = join(repoRoot, BUILD_STAMP_REL);
writeFileSync(stampPath, JSON.stringify(stamp, null, 2) + "\n", "utf8");
console.log(`[write-build-stamp] ${stampPath} yazildi (tree_digest ${stamp.tree_digest.slice(0, 16)}..., ${stamp.file_count} dosya, ${stamp.dist_artifacts.length} dist artifact)`);
