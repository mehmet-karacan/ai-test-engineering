/**
 * POM/module discovery: statik POM envanteri, modul DAG'i, source/test root cozumleme.
 * Hassas degerler toplanmaz; Maven calistirilmadan statik okuma.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../domain/errors.js";

export interface PomModule {
  module_relative_path: string;
  group_id: string | null;
  artifact_id: string;
  version: string | null;
  packaging: string;
  parent_artifact_id: string | null;
  source_root: string;
  test_root: string;
  jacoco_configured: boolean;
  surefire_configured: boolean;
  junit4_present: boolean;
  junit5_present: boolean;
  mockito_present: boolean;
}

export interface PomDiscoveryResult {
  reactor_root: string;
  modules: PomModule[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "module" || name === "dependency" || name === "plugin" || name === "sourceDirectory" || name === "testSourceDirectory",
});

interface PomRaw {
  project?: {
    groupId?: string | { "#text": string };
    artifactId?: string | { "#text": string };
    version?: string | { "#text": string };
    packaging?: string;
    parent?: { groupId?: string; artifactId?: string; version?: string };
    modules?: { module?: string[] };
    build?: {
      sourceDirectory?: string[];
      testSourceDirectory?: string[];
      plugins?: { plugin?: Array<Record<string, unknown>> };
    };
    dependencies?: { dependency?: Array<Record<string, unknown>> };
  };
}

function text(value: string | { "#text": string } | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value["#text"] ?? null;
}

function pluginArtifactId(plugin: Record<string, unknown>): string | null {
  if (plugin && typeof plugin === "object" && "artifactId" in plugin) {
    return text(plugin["artifactId"] as string | { "#text": string } | undefined);
  }
  return null;
}

function hasDependency(pom: PomRaw, artifactId: string): boolean {
  const deps = pom.project?.dependencies?.dependency ?? [];
  return deps.some((dep) => text(dep["artifactId"] as string | { "#text": string } | undefined) === artifactId);
}

export function parsePom(pomPath: string, reactorRoot: string): PomModule {
  const absPath = resolve(pomPath);
  if (!existsSync(absPath)) {
    throw new AppError("INVALID_PARAMETERS", `POM bulunamadi: ${pomPath}`);
  }
  let raw: PomRaw;
  try {
    raw = parser.parse(readFileSync(absPath, "utf8")) as PomRaw;
  } catch (error) {
    throw new AppError("INVALID_PARAMETERS", `POM XML parse hatasi: ${pomPath}`, { cause: String(error) });
  }
  const project = raw.project;
  if (!project) {
    throw new AppError("INVALID_PARAMETERS", `Gecersiz POM (project element yok): ${pomPath}`);
  }

  const relativeToReactor = relative(reactorRoot, absPath.replace(/[\\/]pom\.xml$/, "")).replace(/\\/g, "/");
  const moduleRelativePath = relativeToReactor.length === 0 ? "" : relativeToReactor;

  const plugins = project.build?.plugins?.plugin ?? [];
  const jacocoConfigured = plugins.some((p) => pluginArtifactId(p) === "jacoco-maven-plugin");
  const surefireConfigured = plugins.some((p) => pluginArtifactId(p) === "maven-surefire-plugin");

  return {
    module_relative_path: moduleRelativePath,
    group_id: text(project.groupId) ?? (project.parent ? text(project.parent.groupId) : null),
    artifact_id: text(project.artifactId) ?? "unknown",
    version: text(project.version) ?? (project.parent ? text(project.parent.version) : null),
    packaging: text(project.packaging) ?? "jar",
    parent_artifact_id: project.parent ? text(project.parent.artifactId) : null,
    source_root: text(project.build?.sourceDirectory?.[0] as string | { "#text": string } | undefined) ?? join(moduleRelativePath, "src/main/java").replace(/\\/g, "/"),
    test_root: text(project.build?.testSourceDirectory?.[0] as string | { "#text": string } | undefined) ?? join(moduleRelativePath, "src/test/java").replace(/\\/g, "/"),
    jacoco_configured: jacocoConfigured,
    surefire_configured: surefireConfigured,
    junit4_present: hasDependency(raw, "junit"),
    junit5_present: hasDependency(raw, "junit-jupiter"),
    mockito_present: hasDependency(raw, "mockito-core"),
  };
}

export function discoverModules(projectRoot: string, maxDepth = 10): PomDiscoveryResult {
  const root = resolve(projectRoot);
  const rootPom = join(root, "pom.xml");
  if (!existsSync(rootPom)) {
    throw new AppError("INVALID_PARAMETERS", `Kok POM bulunamadi: ${projectRoot}`);
  }
  const modules: PomModule[] = [];
  const visited = new Set<string>();

  const visit = (pomPath: string, depth: number): void => {
    if (depth > maxDepth || visited.has(pomPath)) {
      return;
    }
    visited.add(pomPath);
    const module = parsePom(pomPath, root);
    modules.push(module);
    if (module.packaging === "pom") {
      let raw: PomRaw;
      try {
        raw = parser.parse(readFileSync(pomPath, "utf8")) as PomRaw;
      } catch {
        return;
      }
      const childModules = raw.project?.modules?.module ?? [];
      for (const child of childModules) {
        const childPom = join(root, module.module_relative_path, child, "pom.xml");
        if (existsSync(childPom)) {
          visit(resolve(childPom), depth + 1);
        }
      }
    }
  };

  visit(rootPom, 0);
  return { reactor_root: root.replace(/\\/g, "/"), modules };
}

export function resolveTargetModule(modules: PomModule[], moduleRelativePath: string): PomModule {
  const found = modules.find((m) => m.module_relative_path === moduleRelativePath);
  if (!found) {
    throw new AppError("INVALID_PARAMETERS", `Modul bulunamadi: ${moduleRelativePath}`);
  }
  return found;
}
