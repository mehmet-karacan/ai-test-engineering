/** Windows native Maven selection and typed argument validation. No subprocess is started here. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, delimiter } from "node:path";
import { AppError } from "../domain/errors.js";
import { WindowsProcessSupervisor } from "./windows-process-supervisor.js";

const UNSAFE_CMD = /[%!^|<>"\r\n\0]/u;
const SAFE_PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const ALLOWED_GOALS = new Set(["test-compile", "test", "jacoco:prepare-agent", "jacoco:report"]);

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
}

export interface NativeVersionEvidence {
  mavenVersion: string;
  javaVersion: string;
  outputDigest: string;
  effectiveIdentity: string;
}

/** Probe the selected executable. The raw -v output stays local to this call. */
export async function probeNativeMavenVersion(plan: NativeToolchainPlan, env: NodeJS.ProcessEnv): Promise<NativeVersionEvidence> {
  const run = await new WindowsProcessSupervisor().run({
    executable: plan.executable, cwd: plan.cwd, argv: ["-v"], timeoutMs: 10000,
    maxLogBytes: 64 * 1024, env,
  });
  if (run.status !== "success" || run.stdoutTruncatedBytes > 0 || run.stderrTruncatedBytes > 0) {
    throw new AppError("BLOCKED_ISOLATION", "Maven version probe failed or truncated", { reason_code: "MAVEN_VERSION_UNVERIFIED" });
  }
  const mavenVersion = /^Apache Maven\s+(\S+)/imu.exec(run.stdout)?.[1];
  const javaVersion = /^Java version:\s+([^,\s]+)/imu.exec(run.stdout)?.[1];
  if (!mavenVersion || !javaVersion) {
    throw new AppError("BLOCKED_ISOLATION", "Maven or Java version missing from probe", { reason_code: "MAVEN_VERSION_UNVERIFIED" });
  }
  const outputDigest = createHash("sha256").update(run.stdout).update(run.stderr).digest("hex");
  return {
    mavenVersion, javaVersion, outputDigest,
    effectiveIdentity: createHash("sha256").update(JSON.stringify({ base: plan.identity, outputDigest })).digest("hex"),
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
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
    const envIdentity = Object.fromEntries(["PATH", "JAVA_HOME", "MAVEN_OPTS", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS"]
      .map((key) => [key, createHash("sha256").update(key === "PATH" ? pathValue(options.env) : (options.env[key] ?? "")).digest("hex")]));
    const settings = options.settingsPath ?? join(homedir(), ".m2", "settings.xml");
    const toolchains = options.toolchainsPath ?? join(homedir(), ".m2", "toolchains.xml");
    const localConfig = Object.fromEntries(["jvm.config", "maven.config", "extensions.xml"]
      .map((name) => [name, fileDigest(join(cwd, ".mvn", name), false)]));
    const profiles = options.profiles ?? [];
    for (const profile of profiles) {
      if (!SAFE_PROPERTY_KEY.test(profile)) throw new AppError("INVALID_PARAMETERS", "Invalid Maven profile");
    }
    const identity = createHash("sha256").update(JSON.stringify({
      cwd, executable, executableDigest: fileDigest(executable, true), source, envIdentity, profiles,
      settingsPath: settings, settingsDigest: fileDigest(settings, options.settingsPath !== undefined),
      toolchainsPath: toolchains, toolchainsDigest: fileDigest(toolchains, options.toolchainsPath !== undefined),
      localConfig,
    })).digest("hex");
    return { executable, source, cwd, identity };
  }
}
