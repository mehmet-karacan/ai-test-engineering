/** Explicit execution-only neutral native pins. Never writes to the customer checkout. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { SourceSnapshot, computeSourceIdentity, sourceDigestFromManifest, buildDigestFromManifest } from "../discovery/source-snapshot.js";
import { AppError } from "../domain/errors.js";
import { createFrozenWorkspace } from "./build-plan.js";

const DEFAULTS: Record<string, string> = {
  ".mvn/jvm.config": "",
  ".mvn/maven.config": "",
  ".mvn/extensions.xml": "<extensions/>\n",
};

export function prepareCoverageWorkspace(source: string, destination: string): string {
  // Maven's nearest .mvn directory defines implicit JVM/options/extensions.
  // A newly-created owned .mvn must never hide a meaningful ancestor config.
  if (!existsSync(join(source, ".mvn"))) {
    for (let cursor = dirname(resolve(source)); ; cursor = dirname(cursor)) {
      if (existsSync(join(cursor, ".mvn"))) {
        if (Object.keys(DEFAULTS).some(path => {
          if (!existsSync(join(cursor, path))) return false;
          const text = readFileSync(join(cursor, path), "utf8").trim();
          return text.length > 0 && text !== DEFAULTS[path]!.trim();
        })) {
          throw new AppError("BLOCKED_ISOLATION", "Inherited ancestor Maven configuration requires an explicit project root", { reason_code: "INHERITED_MAVEN_CONFIGURATION" });
        }
        break;
      }
      if (dirname(cursor) === cursor) break;
    }
  }
  const root = createFrozenWorkspace(source, destination);
  mkdirSync(join(root, ".mvn"), { recursive: true });
  for (const [path, content] of Object.entries(DEFAULTS)) {
    if (!existsSync(join(root, path))) writeFileSync(join(root, path), content, { flag: "wx" });
  }
  return root;
}

export function verifyCoverageWorkspace(source: string, execution: string) {
  const original = new SourceSnapshot(source).buildManifest();
  const frozen = new SourceSnapshot(execution).buildManifest();
  const originalPaths = new Set(original.entries.map(entry => entry.relative_path));
  const defaults = Object.keys(DEFAULTS).filter(path => !originalPaths.has(path));
  for (const path of defaults) {
    if (!existsSync(join(execution, path)) || readFileSync(join(execution, path), "utf8") !== DEFAULTS[path]) throw new AppError("SOURCE_CHANGED", "Coverage execution default changed");
  }
  const filtered = { ...frozen, entries: frozen.entries.filter(entry => !defaults.includes(entry.relative_path)) };
  if (sourceDigestFromManifest(original) !== sourceDigestFromManifest(filtered) || buildDigestFromManifest(original) !== buildDigestFromManifest(filtered)) {
    throw new AppError("SOURCE_CHANGED", "Coverage execution source differs from customer source");
  }
  return { original: computeSourceIdentity(source, original), execution: computeSourceIdentity(execution, frozen), defaults };
}
