/** Windows native Maven selection and typed argument validation. No subprocess is started here. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, delimiter } from "node:path";
import { AppError } from "../domain/errors.js";

const UNSAFE_CMD = /[%!^|<>"\r\n\0]/u;
const SAFE_PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const ALLOWED_GOALS = new Set(["test-compile", "test", "jacoco:prepare-agent", "jacoco:report"]);

export interface NativeMavenArguments {
  goals: string[];
  profiles?: string[];
  properties?: Record<string, string>;
}

export interface NativeToolchainOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  executable?: string;
  preferWrapper?: boolean;
}

export interface NativeToolchainPlan {
  executable: string;
  source: "explicit" | "installed" | "wrapper";
  cwd: string;
  identity: string;
}

function validCmdValue(value: string, label: string): void {
  if (UNSAFE_CMD.test(value)) {
    throw new AppError("INVALID_PARAMETERS", `${label}: unsupported Windows command character`);
  }
}

export function buildNativeMavenArgv(input: NativeMavenArguments): string[] {
  if (input.goals.length === 0 || input.goals.some((goal) => !ALLOWED_GOALS.has(goal))) {
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
    const identity = createHash("sha256").update(JSON.stringify({ cwd, executable, source, envIdentity })).digest("hex");
    return { executable, source, cwd, identity };
  }
}
