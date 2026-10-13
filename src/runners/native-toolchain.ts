/** Windows native Maven selection and typed argument validation. No subprocess is started here. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, dirname, delimiter } from "node:path";
import { AppError } from "../domain/errors.js";
import { WindowsProcessSupervisor, processPinPaths } from "./windows-process-supervisor.js";

const UNSAFE_CMD = /[%!^|<>"\r\n\0]/u;
const UNSAFE_EXPANDED_OPTIONS = /[&%!^|<>"\r\n\0]/u;
const SAFE_PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const ALLOWED_GOALS = new Set(["test-compile", "test", "jacoco:prepare-agent", "jacoco:report"]);
const MAVEN_ENV_NAMES = [
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "HOME",
  "JAVA_HOME", "MAVEN_HOME", "M2_HOME", "MAVEN_USER_HOME", "MAVEN_CONFIG",
  "MAVEN_OPTS", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS",
] as const;
const MAVEN_ENV_ALLOWED = new Set<string>(MAVEN_ENV_NAMES);

/** Separate from model worker env: inherited private keys never reach Maven. */
export function effectiveMavenEnvironment(inherited: NodeJS.ProcessEnv, overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (!MAVEN_ENV_ALLOWED.has(key.toUpperCase()) || value === undefined) continue;
    assertSafeExpandedOptions(key, value);
    const existing = Object.keys(env).find((name) => name.toUpperCase() === key.toUpperCase());
    if (existing && env[existing] !== value) {
      throw new AppError("INVALID_PARAMETERS", `Conflicting Windows environment values: ${key}`);
    }
    if (!existing) env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (!MAVEN_ENV_ALLOWED.has(key.toUpperCase())) {
      throw new AppError("INVALID_PARAMETERS", `Maven environment key not approved: ${key}`);
    }
    assertSafeExpandedOptions(key, value);
    for (const existing of Object.keys(env)) {
      if (existing.toLowerCase() === key.toLowerCase()) delete env[existing];
    }
    env[key] = value;
  }
  // Apache Maven's Windows launcher invokes USERPROFILE/mavenrc_pre and
  // mavenrc_post when this flag is empty. Disable both without changing the
  // user's global environment; MAVEN_ARGS remains outside the allowlist.
  env.MAVEN_SKIP_RC = "1";
  return env;
}

function assertSafeExpandedOptions(key: string, value: string): void {
  // Maven's .cmd launcher expands these option strings into a command line.
  // Until that script's quoting is proven, shell metacharacters fail closed.
  if ((key.toUpperCase() === "MAVEN_OPTS" || key.toUpperCase() === "MAVEN_CONFIG") && UNSAFE_EXPANDED_OPTIONS.test(value)) {
    throw new AppError("INVALID_PARAMETERS", `Unsafe Maven environment options: ${key}`);
  }
}

export interface NativeMavenArguments {
  goals: string[];
  profiles?: string[];
  properties?: Record<string, string>;
  settingsPath?: string;
  toolchainsPath?: string;
}

export interface NativeToolchainOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  executable?: string;
  preferWrapper?: boolean;
  settingsPath?: string;
  toolchainsPath?: string;
  profiles?: string[];
}

export interface NativeToolchainPlan {
  executable: string;
  source: "explicit" | "installed" | "wrapper";
  cwd: string;
  identity: string;
  /** Exact file snapshot that produced identity; null means verified absent. */
  pinnedInputs: ReadonlyArray<{ path: string; sha256: string | null }>;
  /** Both selected standard installations were fully enumerated and hashed. */
  distributionManifestComplete: boolean;
}

export interface NativeVersionEvidence {
  mavenVersion: string;
  javaVersion: string;
  outputDigest: string;
  effectiveIdentity: string;
}

export interface VerifiedNativeToolchainPlan extends NativeToolchainPlan {
  baseIdentity: string;
  mavenVersion: string;
  javaVersion: string;
  outputDigest: string;
}

/** Probe the selected executable. The raw -v output stays local to this call. */
export async function probeNativeMavenVersion(plan: NativeToolchainPlan, env: NodeJS.ProcessEnv, signal?: AbortSignal, lifecycle?: import("./windows-process-supervisor.js").NativeProcessLifecycle): Promise<NativeVersionEvidence> {
  const basePlan = {
    executable: plan.executable, cwd: plan.cwd, argv: ["-v"], timeoutMs: 30000,
    maxLogBytes: 64 * 1024, env,
  };
  // Keep the complete approved installation snapshot for the version probe.
  // The helper can hold all inputs through its bounded manifest transport.
  const required = lifecycle ? new Set(processPinPaths(basePlan).map((path) => path.toLowerCase())) : null;
  if (required && required.size !== plan.pinnedInputs.filter((input) => required.has(input.path.toLowerCase())).length) {
    throw new AppError("BLOCKED_ISOLATION", "Maven probe snapshot incomplete", { reason_code: "TOOLCHAIN_PIN_UNVERIFIED" });
  }
  const probePlan = { ...basePlan, ...(required ? { pinnedInputs: plan.pinnedInputs } : {}) };
  const run = await new WindowsProcessSupervisor().run(probePlan, signal, lifecycle);
  if (run.errorCode === "pin_unavailable") {
    throw new AppError("BLOCKED_ISOLATION", "Maven input pinning unavailable", { reason_code: "NATIVE_INPUT_PIN_UNAVAILABLE" });
  }
  if (run.errorCode === "pin_mismatch") {
    throw new AppError("BLOCKED_ISOLATION", "Maven input changed before launch", { reason_code: "TOOLCHAIN_IDENTITY_CHANGED" });
  }
  if (run.status !== "success" || run.stdoutTruncatedBytes > 0 || run.stderrTruncatedBytes > 0) {
    throw new AppError("BLOCKED_ISOLATION", "Maven version probe failed or truncated", { reason_code: "MAVEN_VERSION_UNVERIFIED" });
  }
  const mavenVersion = /^Apache Maven\s+(\S+)/imu.exec(run.stdout)?.[1];
  const javaVersion = /^Java version:\s+([^,\s]+)/imu.exec(run.stdout)?.[1];
  const validVersion = /^\d+(?:\.\d+){1,3}(?:[-+_][A-Za-z0-9._-]+)?$/u;
  const validJavaVersion = /^\d+(?:\.\d+){0,3}(?:[-+_][A-Za-z0-9._-]+)?$/u;
  if (!mavenVersion || !javaVersion || !validVersion.test(mavenVersion) || !validJavaVersion.test(javaVersion)) {
    throw new AppError("BLOCKED_ISOLATION", "Maven or Java version missing from probe", { reason_code: "MAVEN_VERSION_UNVERIFIED" });
  }
  const outputDigest = createHash("sha256").update(run.stdout).update(run.stderr).digest("hex");
  return {
    mavenVersion, javaVersion, outputDigest,
    effectiveIdentity: createHash("sha256").update(JSON.stringify({ base: plan.identity, outputDigest })).digest("hex"),
  };
}

export async function verifyNativeToolchain(plan: NativeToolchainPlan, env: NodeJS.ProcessEnv, signal?: AbortSignal, lifecycle?: import("./windows-process-supervisor.js").NativeProcessLifecycle): Promise<VerifiedNativeToolchainPlan> {
  if (lifecycle && !plan.distributionManifestComplete) {
    throw new AppError("BLOCKED_ISOLATION", "Complete installed Maven/JDK manifest required for owned native execution", {
      reason_code: "TOOLCHAIN_DISTRIBUTION_UNVERIFIED",
    });
  }
  const version = await probeNativeMavenVersion(plan, env, signal, lifecycle);
  return {
    ...plan,
    baseIdentity: plan.identity,
    identity: version.effectiveIdentity,
    mavenVersion: version.mavenVersion,
    javaVersion: version.javaVersion,
    outputDigest: version.outputDigest,
  };
}

function validCmdValue(value: string, label: string): void {
  if (UNSAFE_CMD.test(value)) {
    throw new AppError("INVALID_PARAMETERS", `${label}: unsupported Windows command character`);
  }
}

export function buildNativeMavenArgv(input: NativeMavenArguments): string[] {
  const scoped = input.goals[0] === "-pl";
  let goals = input.goals;
  if (scoped) {
    const modules = input.goals[1] ?? "";
    validCmdValue(modules, "Maven module list");
    if (input.goals[2] !== "-am" || modules.split(",").some((part) =>
      part.length === 0 || part.startsWith("-") || part.startsWith("/") || part.includes("\\") ||
      part.includes(":") || part.split("/").some((segment) => segment === "." || segment === ".."))) {
      throw new AppError("INVALID_PARAMETERS", "Invalid scoped Maven module list");
    }
    goals = input.goals.slice(3);
  }
  if (goals.length === 0 || goals.some((goal) => !ALLOWED_GOALS.has(goal))) {
    throw new AppError("INVALID_PARAMETERS", "Maven goal is outside the approved pilot set");
  }
  const argv = [...input.goals];
  for (const profile of input.profiles ?? []) {
    if (!SAFE_PROPERTY_KEY.test(profile)) {
      throw new AppError("INVALID_PARAMETERS", "Invalid Maven profile");
    }
    argv.push(`-P${profile}`);
  }
  for (const [key, value] of Object.entries(input.properties ?? {})) {
    if (!SAFE_PROPERTY_KEY.test(key)) {
      throw new AppError("INVALID_PARAMETERS", "Invalid Maven property key");
    }
    validCmdValue(value, `Maven property ${key}`);
    argv.push(`-D${key}=${value}`);
  }
  for (const [flag, path] of [["-s", input.settingsPath], ["-t", input.toolchainsPath]] as const) {
    if (path === undefined) continue;
    if (!isAbsolute(path)) throw new AppError("INVALID_PARAMETERS", "Maven config path must be absolute");
    validCmdValue(path, "Maven config path");
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new AppError("INVALID_PARAMETERS", "Maven config file does not exist");
    }
    argv.push(flag, path);
  }
  argv.push("-B", "-ntp");
  return argv;
}

function pathValue(env: NodeJS.ProcessEnv): string {
  const entries = Object.entries(env).filter(([key]) => key.toLowerCase() === "path");
  const values = new Set(entries.map(([, value]) => value ?? ""));
  if (values.size > 1) {
    throw new AppError("INVALID_PARAMETERS", "Conflicting PATH/Path values");
  }
  return entries[0]?.[1] ?? "";
}

function assertCmdFile(file: string): string {
  if (!isAbsolute(file) || !file.toLowerCase().endsWith(".cmd")) {
    throw new AppError("INVALID_PARAMETERS", "Maven executable must be an absolute .cmd path");
  }
  validCmdValue(file, "Maven executable");
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new AppError("BLOCKED_ISOLATION", "Maven executable does not exist");
  }
  return file;
}

function fileDigest(path: string, explicitlyRequired: boolean): string | null {
  if (!existsSync(path)) {
    if (explicitlyRequired) throw new AppError("INVALID_PARAMETERS", "Configured Maven file does not exist");
    return null;
  }
  if (!statSync(path).isFile()) {
    throw new AppError("INVALID_PARAMETERS", "Configured Maven path is not a file");
  }
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function distributionFiles(executable: string, source: NativeToolchainPlan["source"], env: NodeJS.ProcessEnv): string[] | null {
  if (source === "wrapper" || dirname(executable).split(/[\\/]/u).at(-1)?.toLowerCase() !== "bin") return null;
  const mavenRoot = dirname(dirname(executable));
  const javaHome = Object.entries(env).find(([key]) => key.toUpperCase() === "JAVA_HOME")?.[1];
  if (!javaHome || !isAbsolute(javaHome)) return null;
  const jdkRoot = resolve(javaHome);
  const roots = [
    ...["bin", "boot", "lib", "conf"].map((part) => join(mavenRoot, part)),
    ...["bin", "lib", "conf"].map((part) => join(jdkRoot, part)),
  ];
  const release = join(jdkRoot, "release");
  if (roots.some((path) => !existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) ||
      !existsSync(release) || !lstatSync(release).isFile() || lstatSync(release).isSymbolicLink()) return null;
  const files = [release];
  let totalBytes = lstatSync(release).size;
  const visit = (directory: string, depth: number): void => {
    if (depth > 16) throw new AppError("BLOCKED_ISOLATION", "Installed toolchain tree too deep", { reason_code: "TOOLCHAIN_DISTRIBUTION_UNVERIFIED" });
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new AppError("BLOCKED_ISOLATION", "Installed toolchain contains reparse point", { reason_code: "TOOLCHAIN_DISTRIBUTION_UNVERIFIED" });
      if (stat.isDirectory()) visit(path, depth + 1);
      else if (stat.isFile()) {
        files.push(path);
        totalBytes += stat.size;
        if (files.length > 4096 || totalBytes > 2 * 1024 * 1024 * 1024) {
          throw new AppError("BLOCKED_ISOLATION", "Installed toolchain manifest budget exceeded", { reason_code: "TOOLCHAIN_DISTRIBUTION_UNVERIFIED" });
        }
      } else throw new AppError("BLOCKED_ISOLATION", "Installed toolchain contains unsupported entry", { reason_code: "TOOLCHAIN_DISTRIBUTION_UNVERIFIED" });
    }
  };
  for (const root of roots) visit(root, 0);
  return files;
}

function wrapperPath(cwd: string): string {
  const script = assertCmdFile(join(cwd, "mvnw.cmd"));
  const wrapperDir = join(cwd, ".mvn", "wrapper");
  const properties = join(wrapperDir, "maven-wrapper.properties");
  const jar = join(wrapperDir, "maven-wrapper.jar");
  if (!existsSync(properties) || !existsSync(jar)) {
    throw new AppError("BLOCKED_ISOLATION", "Wrapper requires missing or unapproved bootstrap material; select installed Maven explicitly");
  }
  const scriptText = readFileSync(script, "utf8");
  if (/powershell|pwsh|download|curl|bitsadmin|certutil/iu.test(scriptText)) {
    throw new AppError("BLOCKED_ISOLATION", "Wrapper requires a download or PowerShell; select installed Maven explicitly");
  }
  return script;
}

export class NativeToolchainResolver {
  static resolve(options: NativeToolchainOptions): NativeToolchainPlan {
    if ((options.platform ?? process.platform) !== "win32") {
      throw new AppError("BLOCKED_ISOLATION", "UNSUPPORTED_PLATFORM: Windows native runner requires Windows");
    }
    const cwd = resolve(options.cwd);
    validCmdValue(cwd, "Maven working directory");
    let executable: string;
    let source: NativeToolchainPlan["source"];
    if (options.executable !== undefined) {
      executable = assertCmdFile(options.executable);
      source = "explicit";
    } else if (options.preferWrapper) {
      executable = wrapperPath(cwd);
      source = "wrapper";
    } else {
      const path = pathValue(options.env);
      const installed = path.split(delimiter).filter(Boolean).map((dir) => join(dir, "mvn.cmd"))
        .find((file) => existsSync(file) && statSync(file).isFile());
      if (!installed) {
        throw new AppError("BLOCKED_ISOLATION", "Installed mvn.cmd not found on PATH");
      }
      executable = assertCmdFile(installed);
      source = "installed";
    }
    const envIdentity = Object.fromEntries(MAVEN_ENV_NAMES
      .map((key) => {
        const value = key === "PATH" ? pathValue(options.env) : Object.entries(options.env)
          .find(([actual]) => actual.toUpperCase() === key)?.[1] ?? "";
        return [key, createHash("sha256").update(value).digest("hex")];
      }));
    const defaultSettings = join(homedir(), ".m2", "settings.xml");
    const defaultToolchains = join(homedir(), ".m2", "toolchains.xml");
    if ((options.settingsPath !== undefined && !isAbsolute(options.settingsPath)) ||
        (options.toolchainsPath !== undefined && !isAbsolute(options.toolchainsPath))) {
      throw new AppError("INVALID_PARAMETERS", "Maven config path must be absolute");
    }
    const pins = new Map<string, { path: string; sha256: string | null }>();
    const pin = (path: string, required: boolean): void => {
      const absolute = resolve(path);
      const key = absolute.toLowerCase();
      if (pins.has(key)) {
        if (required && pins.get(key)!.sha256 === null) fileDigest(absolute, true);
        return;
      }
      pins.set(key, { path: absolute, sha256: fileDigest(absolute, required) });
    };
    pin(executable, true);
    pin(defaultSettings, false);
    pin(defaultToolchains, false);
    if (options.settingsPath !== undefined) pin(options.settingsPath, true);
    if (options.toolchainsPath !== undefined) pin(options.toolchainsPath, true);
    for (let cursor = cwd; ; cursor = dirname(cursor)) {
      for (const name of ["jvm.config", "maven.config", "extensions.xml"]) {
        pin(join(cursor, ".mvn", name), false);
      }
      if (dirname(cursor) === cursor) break;
    }
    if (source === "wrapper") {
      pin(join(cwd, ".mvn", "wrapper", "maven-wrapper.properties"), true);
      pin(join(cwd, ".mvn", "wrapper", "maven-wrapper.jar"), true);
    }
    const installedFiles = distributionFiles(executable, source, options.env);
    for (const file of installedFiles ?? []) pin(file, true);
    const pinnedInputs = [...pins.values()];
    const profiles = options.profiles ?? [];
    for (const profile of profiles) {
      if (!SAFE_PROPERTY_KEY.test(profile)) throw new AppError("INVALID_PARAMETERS", "Invalid Maven profile");
    }
    const identity = createHash("sha256").update(JSON.stringify({
      cwd, executable, source, envIdentity, profiles, pinnedInputs,
      distributionManifestComplete: installedFiles !== null,
    })).digest("hex");
    return { executable, source, cwd, identity, pinnedInputs, distributionManifestComplete: installedFiles !== null };
  }
}
