/**
 * Kurulum, config loader ve stdio entry'nin paylastigi runtime path resolver.
 * Repo veya process cwd'si runtime state icin asla varsayilan yapilmaz.
 */
import { join } from "node:path";

export type RuntimeEnvironment = Record<string, string | undefined>;

export function resolveRuntimeRoot(environment: RuntimeEnvironment = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    const localAppData = environment["LOCALAPPDATA"];
    if (localAppData && localAppData.length > 0) return join(localAppData, "ai-test-engineering");
    const userProfile = environment["USERPROFILE"];
    if (userProfile && userProfile.length > 0) return join(userProfile, "AppData", "Local", "ai-test-engineering");
  } else if (platform === "darwin") {
    const home = environment["HOME"];
    if (home && home.length > 0) return join(home, "Library", "Application Support", "ai-test-engineering");
  } else {
    const xdgDataHome = environment["XDG_DATA_HOME"];
    if (xdgDataHome && xdgDataHome.length > 0) return join(xdgDataHome, "ai-test-engineering");
    const home = environment["HOME"];
    if (home && home.length > 0) return join(home, ".local", "share", "ai-test-engineering");
  }
  throw new Error("Kullanici runtime veri dizini cozumlenemedi");
}

export function resolveConfigPath(environment: RuntimeEnvironment = process.env, platform: NodeJS.Platform = process.platform): string {
  return join(resolveRuntimeRoot(environment, platform), "config", "config.json");
}

export function resolveDbPath(storageRoot: string, environment: RuntimeEnvironment = process.env): string {
  const explicit = environment["AITEST_DB_PATH"];
  return explicit && explicit.length > 0 ? explicit : join(storageRoot, "state.db");
}

export function resolveOpenCodeConfigPath(environment: RuntimeEnvironment = process.env, platform: NodeJS.Platform = process.platform): string {
  const home = platform === "win32" ? environment["USERPROFILE"] ?? environment["HOME"] : environment["HOME"];
  if (!home || home.length === 0) {
    throw new Error("OpenCode kullanici config kok dizini cozumlenemedi");
  }
  const configRoot = platform !== "win32" && environment["XDG_CONFIG_HOME"] && environment["XDG_CONFIG_HOME"].length > 0
    ? environment["XDG_CONFIG_HOME"]
    : join(home, ".config");
  return join(configRoot, "opencode", "opencode.json");
}
