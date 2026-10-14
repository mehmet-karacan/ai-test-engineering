/**
 * Deterministic Maven model resolution for frozen workspaces.
 *
 * This resolver is deliberately static: it never invokes Maven and it never
 * evaluates environment/profile expressions that could expose a secret.  It
 * resolves the local parent/profile/pluginManagement graph far enough for a
 * build plan, and records every byte input so a later replay can fail closed
 * when the model has changed.  A Maven `help:effective-pom` result can be
 * added as a separate provenance source later; it must not silently replace
 * this static result.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../domain/errors.js";

const MAX_PARENT_DEPTH = 16;
const MAX_PROFILE_COUNT = 64;
const MAX_PLUGIN_COUNT = 256;
const MAX_DEPENDENCY_COUNT = 512;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

type XmlRecord = Record<string, unknown>;

interface RawParent {
  groupId?: string;
  artifactId?: string;
  version?: string;
  relativePath?: string;
}

interface RawProfile extends XmlRecord {
  id?: string;
  activation?: XmlRecord;
  properties?: XmlRecord;
  dependencies?: XmlRecord;
  dependencyManagement?: XmlRecord;
  build?: XmlRecord;
}

interface RawProject extends XmlRecord {
  groupId?: string;
  artifactId?: string;
  version?: string;
  packaging?: string;
  parent?: RawParent;
  properties?: XmlRecord;
  modules?: XmlRecord;
  profiles?: XmlRecord;
  build?: XmlRecord;
  dependencies?: XmlRecord;
  dependencyManagement?: XmlRecord;
}

interface LoadedPom {
  path: string;
  project: RawProject;
  bytes: Buffer;
  sha256: string;
}

export interface EffectiveMavenPlugin {
  group_id: string;
  artifact_id: string;
  version: string | null;
  executions: string[];
  configuration_keys: string[];
  source: "direct" | "inherited";
}

export interface EffectiveMavenDependency {
  group_id: string;
  artifact_id: string;
  version: string | null;
  scope: string | null;
}

export interface EffectiveMavenToolchain {
  path: string;
  sha256: string;
  type: string;
  version: string | null;
  vendor: string | null;
  jdk_home_present: boolean;
}

export interface EffectiveMavenModule {
  module_relative_path: string;
  group_id: string | null;
  artifact_id: string;
  version: string | null;
  packaging: string;
  source_root: string;
  test_root: string;
  active_profiles: string[];
  plugins: EffectiveMavenPlugin[];
  dependencies: EffectiveMavenDependency[];
  jacoco_configured: boolean;
  surefire_configured: boolean;
  junit4_present: boolean;
  junit5_present: boolean;
  mockito_present: boolean;
  toolchain: EffectiveMavenToolchain | null;
  /** SHA-256 of the model inputs and normalized effective result. */
  model_digest: string;
}

export interface EffectiveMavenModel {
  schema_version: 1;
  reactor_root: string;
  provenance: "static_pom";
  active_profiles: string[];
  settings_path: string | null;
  toolchains_path: string | null;
  input_digests: Array<{ relative_path: string; sha256: string }>;
  modules: EffectiveMavenModule[];
  model_digest: string;
}

export interface EffectiveMavenModelOptions {
  active_profiles?: string[];
  settings_path?: string;
  toolchains_path?: string;
  /** Used only to select a matching jdk toolchain from a local fixture. */
  toolchain_version?: string;
  toolchain_vendor?: string;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text"?: unknown })["#text"];
    return typeof text === "string" ? text.trim() : null;
  }
  return null;
}

function list(value: unknown): XmlRecord[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).filter((item): item is XmlRecord => Boolean(item && typeof item === "object"));
}

function valueList(parent: unknown, key: string): XmlRecord[] {
  if (!parent || typeof parent !== "object") return [];
  return list((parent as XmlRecord)[key]);
}

function stringList(parent: unknown, key: string): string[] {
  if (!parent || typeof parent !== "object") return [];
  const value = (parent as XmlRecord)[key];
  return (Array.isArray(value) ? value : [value]).map(stringValue).filter((item): item is string => item !== null && item.length > 0);
}

function textAt(parent: unknown, key: string): string | null {
  if (!parent || typeof parent !== "object") return null;
  return stringValue((parent as XmlRecord)[key]);
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as XmlRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeProfileNames(names: string[] | undefined): string[] {
  return [...new Set((names ?? []).map((name) => name.trim()).filter(Boolean))].sort();
}

function interpolate(value: string | null, properties: ReadonlyMap<string, string>): string | null {
  if (value === null) return null;
  let current = value;
  for (let pass = 0; pass < 8; pass++) {
    const next = current.replace(/\$\{([A-Za-z0-9_.-]+)\}/gu, (whole, key: string) => properties.get(key) ?? whole);
    if (next === current) break;
    current = next;
  }
  return current;
}

function assertWithinRoot(root: string, candidate: string, label: string): string {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new AppError("POLICY_VIOLATION", `${label} kok disina cikiyor`, { reason_code: "MAVEN_MODEL_PATH_ESCAPE" });
  }
  return absolute;
}

function loadPom(path: string): LoadedPom {
  const absolute = resolve(path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new AppError("INVALID_PARAMETERS", `POM bulunamadi: ${absolute}`);
  }
  const bytes = readFileSync(absolute);
  let parsed: unknown;
  try {
    parsed = parser.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new AppError("INVALID_PARAMETERS", `POM XML parse hatasi: ${absolute}`, { cause: String(error) });
  }
  const project = parsed && typeof parsed === "object" ? (parsed as XmlRecord)["project"] : null;
  if (!project || typeof project !== "object") {
    throw new AppError("INVALID_PARAMETERS", `Gecersiz POM: ${absolute}`);
  }
  return { path: absolute, project: project as RawProject, bytes, sha256: hashBytes(bytes) };
}

function parentPath(pom: LoadedPom): string | null {
  const parent = pom.project.parent;
  if (!parent) return null;
  const relativePath = parent.relativePath === "" ? null : parent.relativePath ?? "../pom.xml";
  return relativePath === null ? null : resolve(dirname(pom.path), relativePath);
}

function loadHierarchy(pomPath: string, projectRoot: string): LoadedPom[] {
  const result: LoadedPom[] = [];
  const seen = new Set<string>();
  let current: LoadedPom | null = loadPom(pomPath);
  while (current) {
    if (seen.has(current.path)) {
      throw new AppError("INVALID_PARAMETERS", "Maven parent dongusu bulundu", { reason_code: "MAVEN_PARENT_CYCLE" });
    }
    if (result.length >= MAX_PARENT_DEPTH) {
      throw new AppError("INVALID_PARAMETERS", "Maven parent derinligi asildi", { reason_code: "MAVEN_PARENT_DEPTH" });
    }
    seen.add(current.path);
    result.unshift(current);
    const next = parentPath(current);
    if (!next) break;
    assertWithinRoot(projectRoot, next, "Maven parent POM");
    if (!existsSync(next)) break;
    current = loadPom(next);
  }
  return result;
}

function activeProfiles(project: RawProject, requested: ReadonlySet<string>): Array<{ id: string; profile: RawProfile }> {
  const profiles = valueList(project.profiles, "profile");
  if (profiles.length > MAX_PROFILE_COUNT) throw new AppError("INVALID_PARAMETERS", "Maven profile sayisi asiri", { reason_code: "MAVEN_PROFILE_LIMIT" });
  const explicit = profiles.filter((profile) => {
    const id = textAt(profile, "id");
    return id !== null && requested.has(id);
  });
  const hasExplicit = explicit.length > 0;
  const defaults = !hasExplicit ? profiles.filter((profile) => textAt(profile.activation, "activeByDefault") === "true") : [];
  const selected = [...explicit, ...defaults];
  return [...new Map(selected.map((profile) => [textAt(profile, "id") ?? "", { id: textAt(profile, "id") ?? "", profile: profile as RawProfile }])).values()]
    .filter((item) => item.id.length > 0);
}

function propertiesFor(hierarchy: LoadedPom[], requested: ReadonlySet<string>): Map<string, string> {
  const properties = new Map<string, string>();
  for (const pom of hierarchy) {
    for (const [key, value] of Object.entries(pom.project.properties ?? {})) {
      const text = stringValue(value);
      if (text !== null) properties.set(key, interpolate(text, properties) ?? text);
    }
    const group = stringValue(pom.project.groupId) ?? stringValue(pom.project.parent?.groupId);
    const artifact = stringValue(pom.project.artifactId);
    const version = stringValue(pom.project.version) ?? stringValue(pom.project.parent?.version);
    if (group) properties.set("project.groupId", group);
    if (artifact) properties.set("project.artifactId", artifact);
    if (version) properties.set("project.version", version);
    for (const { profile } of activeProfiles(pom.project, requested)) {
      for (const [key, value] of Object.entries(profile.properties ?? {})) {
        const text = stringValue(value);
        if (text !== null) properties.set(key, interpolate(text, properties) ?? text);
      }
    }
  }
  return properties;
}

function pluginId(plugin: XmlRecord): string {
  return `${textAt(plugin, "groupId") ?? "org.apache.maven.plugins"}:${textAt(plugin, "artifactId") ?? ""}`;
}

function mergePluginMap(target: Map<string, XmlRecord>, plugins: XmlRecord[], inherited: boolean): void {
  for (const plugin of plugins) {
    const id = pluginId(plugin);
    if (!id.endsWith(":")) {
      if (inherited && textAt(plugin, "inherited") === "false") continue;
      target.set(id, { ...(target.get(id) ?? {}), ...plugin });
    }
  }
}

function pluginLists(build: unknown): { direct: XmlRecord[]; managed: XmlRecord[] } {
  if (!build || typeof build !== "object") return { direct: [], managed: [] };
  const direct = valueList((build as XmlRecord)["plugins"], "plugin");
  const managed = valueList((build as XmlRecord)["pluginManagement"], "plugins").flatMap((plugins) => valueList(plugins, "plugin"));
  return { direct, managed };
}

function mergeConfiguration(base: XmlRecord, override: XmlRecord): XmlRecord {
  const baseConfig = base["configuration"] && typeof base["configuration"] === "object" ? base["configuration"] as XmlRecord : {};
  const overrideConfig = override["configuration"] && typeof override["configuration"] === "object" ? override["configuration"] as XmlRecord : {};
  return { ...base, ...override, configuration: { ...baseConfig, ...overrideConfig } };
}

function effectivePlugins(hierarchy: LoadedPom[], requested: ReadonlySet<string>): EffectiveMavenPlugin[] {
  const managed = new Map<string, XmlRecord>();
  const direct = new Map<string, XmlRecord>();
  for (const [hierarchyIndex, pom] of hierarchy.entries()) {
    const base = pluginLists(pom.project.build);
    mergePluginMap(managed, base.managed, false);
    if (hierarchyIndex > 0) {
      for (const plugin of base.direct) if (textAt(plugin, "inherited") === "false") direct.delete(pluginId(plugin));
    }
    mergePluginMap(direct, base.direct, hierarchyIndex > 0);
    for (const { profile } of activeProfiles(pom.project, requested)) {
      const profileBuild = profile.build;
      const profilePlugins = pluginLists(profileBuild);
      mergePluginMap(managed, profilePlugins.managed, false);
      if (hierarchyIndex > 0) {
        for (const plugin of profilePlugins.direct) if (textAt(plugin, "inherited") === "false") direct.delete(pluginId(plugin));
      }
      mergePluginMap(direct, profilePlugins.direct, hierarchyIndex > 0);
    }
  }
  if (direct.size > MAX_PLUGIN_COUNT) throw new AppError("INVALID_PARAMETERS", "Maven plugin sayisi asiri", { reason_code: "MAVEN_PLUGIN_LIMIT" });
  const localDirectIds = new Set<string>([
    ...pluginLists(hierarchy.at(-1)!.project.build).direct.map(pluginId),
    ...activeProfiles(hierarchy.at(-1)!.project, requested).flatMap(({ profile }) => pluginLists(profile.build).direct.map(pluginId)),
  ]);
  return [...direct.entries()].map(([id, plugin]) => {
    const effective = mergeConfiguration(managed.get(id) ?? {}, plugin);
    const configuration = effective["configuration"] && typeof effective["configuration"] === "object" ? effective["configuration"] as XmlRecord : {};
    const executions = valueList(effective["executions"], "execution").flatMap((execution) => stringList(execution["goals"], "goal")).filter(Boolean);
    const [groupId, artifactId] = id.split(":", 2);
    return {
      group_id: groupId ?? "org.apache.maven.plugins",
      artifact_id: artifactId ?? "",
      version: interpolate(stringValue(effective["version"]), propertiesFor(hierarchy, requested)),
      executions: [...new Set(executions)].sort(),
      configuration_keys: Object.keys(configuration).sort(),
      source: (hierarchy.length > 1 && !localDirectIds.has(id) ? "inherited" : "direct") as "direct" | "inherited",
    };
  }).sort((a, b) => `${a.group_id}:${a.artifact_id}`.localeCompare(`${b.group_id}:${b.artifact_id}`));
}

function effectiveDependencies(hierarchy: LoadedPom[], requested: ReadonlySet<string>, properties: ReadonlyMap<string, string>): EffectiveMavenDependency[] {
  const dependencies = new Map<string, EffectiveMavenDependency>();
  for (const pom of hierarchy) {
    const add = (container: unknown): void => {
      for (const dependency of valueList(container, "dependency")) {
        const groupId = interpolate(textAt(dependency, "groupId"), properties) ?? "";
        const artifactId = interpolate(textAt(dependency, "artifactId"), properties) ?? "";
        if (!groupId || !artifactId) continue;
        dependencies.set(`${groupId}:${artifactId}`, {
          group_id: groupId,
          artifact_id: artifactId,
          version: interpolate(textAt(dependency, "version"), properties),
          scope: interpolate(textAt(dependency, "scope"), properties),
        });
      }
    };
    add(pom.project.dependencies);
    for (const { profile } of activeProfiles(pom.project, requested)) add(profile.dependencies);
  }
  if (dependencies.size > MAX_DEPENDENCY_COUNT) throw new AppError("INVALID_PARAMETERS", "Maven dependency sayisi asiri", { reason_code: "MAVEN_DEPENDENCY_LIMIT" });
  return [...dependencies.values()].sort((a, b) => `${a.group_id}:${a.artifact_id}`.localeCompare(`${b.group_id}:${b.artifact_id}`));
}

function resolveRoot(root: string, moduleDir: string, configured: string | null, fallback: string): string {
  const value = configured ?? fallback;
  const interpolated = value.replace(/[\\/]/g, sep);
  return assertWithinRoot(root, resolve(moduleDir, interpolated), "Maven source/test root");
}

function parseToolchain(path: string | undefined, root: string, options: EffectiveMavenModelOptions): EffectiveMavenToolchain | null {
  if (!path) return null;
  const absolute = assertWithinRoot(root, path, "Maven toolchain");
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new AppError("INVALID_PARAMETERS", `Toolchains dosyasi bulunamadi: ${absolute}`);
  }
  const bytes = readFileSync(absolute);
  let parsed: unknown;
  try { parsed = parser.parse(bytes.toString("utf8")); }
  catch (error) { throw new AppError("INVALID_PARAMETERS", `Toolchains XML parse hatasi: ${absolute}`, { cause: String(error) }); }
  const candidates = valueList((parsed as XmlRecord)["toolchains"], "toolchain");
  const selected = candidates.find((toolchain) => {
    const provides = toolchain["provides"];
    const type = textAt(toolchain, "type") ?? "jdk";
    const version = textAt(provides, "version");
    const vendor = textAt(provides, "vendor");
    return type === "jdk" && (!options.toolchain_version || version === options.toolchain_version) && (!options.toolchain_vendor || vendor === options.toolchain_vendor);
  });
  if (!selected) return null;
  const provides = selected["provides"];
  const configuration = selected["configuration"];
  return {
    path: relative(root, absolute).replace(/\\/g, "/"),
    sha256: hashBytes(bytes),
    type: textAt(selected, "type") ?? "jdk",
    version: textAt(provides, "version"),
    vendor: textAt(provides, "vendor"),
    jdk_home_present: textAt(configuration, "jdkHome") !== null,
  };
}

function modelModule(root: string, pom: LoadedPom, requested: ReadonlySet<string>, toolchain: EffectiveMavenToolchain | null): EffectiveMavenModule {
  const hierarchy = loadHierarchy(pom.path, root);
  const properties = propertiesFor(hierarchy, requested);
  const profiles = hierarchy.flatMap((item) => activeProfiles(item.project, requested).map(({ id }) => id));
  const last = hierarchy.at(-1)!.project;
  let sourceDirectory: string | null = null;
  let testSourceDirectory: string | null = null;
  for (const item of hierarchy) {
    sourceDirectory = textAt(item.project.build, "sourceDirectory") ?? sourceDirectory;
    testSourceDirectory = textAt(item.project.build, "testSourceDirectory") ?? testSourceDirectory;
    for (const { profile } of activeProfiles(item.project, requested)) {
      sourceDirectory = textAt(profile.build, "sourceDirectory") ?? sourceDirectory;
      testSourceDirectory = textAt(profile.build, "testSourceDirectory") ?? testSourceDirectory;
    }
  }
  const moduleDir = dirname(pom.path);
  const plugins = effectivePlugins(hierarchy, requested);
  const dependencies = effectiveDependencies(hierarchy, requested, properties);
  const groupId = interpolate(stringValue(last.groupId) ?? stringValue(last.parent?.groupId), properties);
  const artifactId = interpolate(stringValue(last.artifactId), properties) ?? "unknown";
  const version = interpolate(stringValue(last.version) ?? stringValue(last.parent?.version), properties);
  const packaging = interpolate(stringValue(last.packaging), properties) ?? "jar";
  const relativeModule = relative(root, moduleDir).replace(/\\/g, "/");
  const moduleRelativePath = relativeModule === "." ? "" : relativeModule;
  const result: EffectiveMavenModule = {
    module_relative_path: moduleRelativePath,
    group_id: groupId,
    artifact_id: artifactId,
    version,
    packaging,
    source_root: relative(root, resolveRoot(root, moduleDir, interpolate(sourceDirectory, properties), "src/main/java")).replace(/\\/g, "/"),
    test_root: relative(root, resolveRoot(root, moduleDir, interpolate(testSourceDirectory, properties), "src/test/java")).replace(/\\/g, "/"),
    active_profiles: [...new Set(profiles)].sort(),
    plugins,
    dependencies,
    jacoco_configured: plugins.some((plugin) => plugin.artifact_id === "jacoco-maven-plugin"),
    surefire_configured: plugins.some((plugin) => plugin.artifact_id === "maven-surefire-plugin"),
    junit4_present: dependencies.some((dependency) => dependency.artifact_id === "junit" && dependency.group_id === "junit"),
    junit5_present: dependencies.some((dependency) => dependency.artifact_id === "junit-jupiter"),
    mockito_present: dependencies.some((dependency) => dependency.artifact_id === "mockito-core"),
    toolchain,
    model_digest: "",
  };
  const inputDigests = hierarchy.map((item) => [relative(root, item.path).replace(/\\/g, "/"), item.sha256]);
  result.model_digest = hashBytes(Buffer.from(canonicalJson({ result: { ...result, model_digest: undefined }, inputs: inputDigests }), "utf8"));
  return result;
}

function modulePomPaths(root: string): string[] {
  const rootPom = loadPom(join(root, "pom.xml"));
  const result: string[] = [];
  const seen = new Set<string>();
  const visit = (pom: LoadedPom, depth: number): void => {
    if (depth > MAX_PARENT_DEPTH || seen.has(pom.path)) return;
    seen.add(pom.path);
    result.push(pom.path);
    for (const name of stringList(pom.project.modules, "module")) {
      const childPom = assertWithinRoot(root, resolve(dirname(pom.path), name, "pom.xml"), "Maven module");
      if (existsSync(childPom)) visit(loadPom(childPom), depth + 1);
    }
  };
  visit(rootPom, 0);
  return result;
}

export function resolveEffectiveMavenModel(projectRoot: string, options: EffectiveMavenModelOptions = {}): EffectiveMavenModel {
  const root = resolve(projectRoot);
  const requested = new Set(normalizeProfileNames(options.active_profiles));
  const settingsPath = options.settings_path ? assertWithinRoot(root, options.settings_path, "Maven settings") : undefined;
  const toolchainsPath = options.toolchains_path ? assertWithinRoot(root, options.toolchains_path, "Maven toolchain") : undefined;
  const toolchain = parseToolchain(toolchainsPath, root, options);
  const modulePaths = modulePomPaths(root);
  const modules = modulePaths.map((path) => modelModule(root, loadPom(path), requested, toolchain));
  const inputMap = new Map<string, string>();
  for (const path of modulePaths.flatMap((path) => loadHierarchy(path, root))) {
    inputMap.set(relative(root, path.path).replace(/\\/g, "/"), path.sha256);
  }
  if (settingsPath) {
    if (!existsSync(settingsPath) || !statSync(settingsPath).isFile()) throw new AppError("INVALID_PARAMETERS", `Settings dosyasi bulunamadi: ${settingsPath}`);
    inputMap.set(relative(root, settingsPath).replace(/\\/g, "/"), hashBytes(readFileSync(settingsPath)));
  }
  if (toolchainsPath && toolchain) inputMap.set(relative(root, toolchainsPath).replace(/\\/g, "/"), toolchain.sha256);
  const inputDigests = [...inputMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([relativePath, sha256]) => ({ relative_path: relativePath, sha256 }));
  const model: EffectiveMavenModel = {
    schema_version: 1,
    reactor_root: root.replace(/\\/g, "/"),
    provenance: "static_pom",
    active_profiles: normalizeProfileNames(options.active_profiles),
    settings_path: settingsPath ? relative(root, settingsPath).replace(/\\/g, "/") : null,
    toolchains_path: toolchainsPath ? relative(root, toolchainsPath).replace(/\\/g, "/") : null,
    input_digests: inputDigests,
    modules,
    model_digest: "",
  };
  model.model_digest = hashBytes(Buffer.from(canonicalJson({ ...model, model_digest: undefined }), "utf8"));
  return model;
}

/** Replays are valid only when the exact effective inputs and model match. */
export function assertEffectiveMavenModelReplay(recorded: EffectiveMavenModel, current: EffectiveMavenModel): void {
  if (recorded.schema_version !== current.schema_version || recorded.model_digest !== current.model_digest || canonicalJson(recorded.input_digests) !== canonicalJson(current.input_digests)) {
    throw new AppError("SOURCE_CHANGED", "Effective Maven modeli replay sirasinda degisti", {
      reason_code: "EFFECTIVE_MAVEN_MODEL_CHANGED",
      recorded_model_digest: recorded.model_digest,
      current_model_digest: current.model_digest,
    });
  }
}
