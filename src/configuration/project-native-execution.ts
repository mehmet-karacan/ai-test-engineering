import { isAbsolute, resolve } from "node:path";
import type { AppConfig } from "./config-schema.js";
import { AppError } from "../domain/errors.js";

export interface ProjectNativeExecution { java_home: string; run_skipped_unit_tests: boolean }
const identity = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
/** Exact Maven root only; never mutate the server's process environment. */
export function projectNativeExecution(config: AppConfig, root: string): ProjectNativeExecution | undefined {
  const matches = (config.native_execution_profiles ?? []).filter(profile => identity(profile.project_root) === identity(root));
  if (matches.length > 1) throw new AppError("INVALID_PARAMETERS", "Duplicate native execution profiles for project");
  const selected = matches[0]; if (!selected) return undefined;
  if (!isAbsolute(selected.java_home) || !isAbsolute(selected.project_root)) throw new AppError("INVALID_PARAMETERS", "Native project and JDK paths must be absolute");
  return { java_home: selected.java_home, run_skipped_unit_tests: selected.run_skipped_unit_tests };
}
