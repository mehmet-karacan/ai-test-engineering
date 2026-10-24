import { isAbsolute, resolve } from "node:path";
/**
 * P08/PP43: kurulum ve dogrulama yuzeyleri icin ayrik readiness siniflandirmasi.
 *
 * Bu modul yalniz yapilandirma kimliklerini ve probe sonucunu degerlendirir;
 * secret degerlerini okumaz veya sonuc metnine tasimaz. READY, canli model
 * yetkilendirmesi degil, yerel baglama/probe kanitinin tamamlandigi anlamina
 * gelir ve evidence_level ile acikca ayrilir.
 */

export type ReadinessStatus = "READY" | "NOT_READY";
export type ReadinessEvidenceLevel = "CONFIGURED" | "CAPABILITY_PROBED" | "NOT_RUN";

export interface ReadinessResult {
  capability: "model" | "maven";
  status: ReadinessStatus;
  evidence_level: ReadinessEvidenceLevel;
  reason_code: string | null;
  detail: string;
}

export interface WorkerReadinessInput {
  enabled: boolean;
  profiles: readonly { profile_name: string; provider_id: string; model_id: string }[];
  default_profile: string | undefined;
  configured_model: string | undefined;
  configured_providers: Readonly<Record<string, unknown>>;
}

export function evaluateWorkerReadiness(input: WorkerReadinessInput): ReadinessResult {
  const notReady = (reason_code: string, detail: string): ReadinessResult => ({
    capability: "model",
    status: "NOT_READY",
    evidence_level: "NOT_RUN",
    reason_code,
    detail,
  });
  if (!input.enabled) {
    return notReady("WORKER_DISABLED", "AITEST_WORKER_ENABLED=1 olmadan worker baslatilmaz");
  }
  if (input.profiles.length === 0) {
    return notReady("WORKER_PROFILE_MISSING", "En az bir worker_profiles girdisi gerekli");
  }
  const selectedName = input.default_profile ?? input.profiles[0]!.profile_name;
  const profile = input.profiles.find((candidate) => candidate.profile_name === selectedName);
  if (!profile) {
    return notReady("WORKER_PROFILE_NOT_FOUND", "Secili worker profili config icinde yok");
  }
  const expectedModel = `${profile.provider_id}/${profile.model_id}`;
  if (input.configured_model !== expectedModel) {
    return notReady("MODEL_BINDING_MISMATCH", "OpenCode model kimligi worker profili ile eslesmiyor");
  }
  if (!Object.hasOwn(input.configured_providers, profile.provider_id)) {
    return notReady("MODEL_PROVIDER_MISSING", "OpenCode provider kaydi worker profili icin yok");
  }
  return {
    capability: "model",
    status: "READY",
    evidence_level: "CONFIGURED",
    reason_code: null,
    detail: `worker profili ve ${expectedModel} OpenCode config ile eslesti`,
  };
}

export interface MavenReadinessInput {
  platform: NodeJS.Platform;
  executable_found: boolean;
  version_probe_passed: boolean;
  maven_version?: string;
  java_version?: string;
  failure_reason?: string;
}

export function evaluateMavenReadiness(input: MavenReadinessInput): ReadinessResult {
  if (input.platform !== "win32") {
    return {
      capability: "maven",
      status: "NOT_READY",
      evidence_level: "NOT_RUN",
      reason_code: "UNSUPPORTED_PLATFORM",
      detail: "Windows native Maven readiness yalniz Windows'ta probe edilir",
    };
  }
  if (!input.executable_found) {
    return {
      capability: "maven",
      status: "NOT_READY",
      evidence_level: "NOT_RUN",
      reason_code: input.failure_reason ?? "MAVEN_EXECUTABLE_MISSING",
      detail: "PATH veya secili kurulumda mvn.cmd bulunamadi",
    };
  }
  if (!input.version_probe_passed) {
    return {
      capability: "maven",
      status: "NOT_READY",
      evidence_level: "NOT_RUN",
      reason_code: input.failure_reason ?? "MAVEN_VERSION_UNVERIFIED",
      detail: "Maven/Java -v probe sonucu dogrulanamadi",
    };
  }
  return {
    capability: "maven",
    status: "READY",
    evidence_level: "CAPABILITY_PROBED",
    reason_code: null,
    detail: `Maven ${input.maven_version ?? "bilinmeyen"} / Java ${input.java_version ?? "bilinmeyen"} -v probe gecti`,
  };
}


/** Match the installed MCP command, including explicit registered environment overrides. */
export function evaluateRegisteredMcpEntry(input: {
  entry: unknown; entry_js: string; config_path: string; db_path: string;
  ambient: Record<string, string | undefined>;
}): { valid: boolean; command: string[]; environment: Record<string, string | undefined>; worker_enabled: boolean } {
  const entry = input.entry && typeof input.entry === "object" ? input.entry as Record<string, unknown> : {};
  const registered = entry["environment"] && typeof entry["environment"] === "object"
    ? entry["environment"] as Record<string, unknown> : {};
  const values = Object.values(registered);
  const environment = { ...input.ambient, ...Object.fromEntries(Object.entries(registered).filter((pair): pair is [string,string] => typeof pair[1] === "string")) };
  const command = Array.isArray(entry["command"]) && entry["command"].every(value => typeof value === "string" && value.length > 0)
    ? entry["command"] as string[] : [];
  const normalize = (path: string): string => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  const executable = command[0] ?? "";
  const knownNode = ["node", "node.exe"].includes(executable.toLowerCase())
    || isAbsolute(executable) && normalize(executable) === normalize(process.execPath);
  const pathMatches = (value: unknown, expected: string): boolean => typeof value === "string" && isAbsolute(value) && normalize(value) === normalize(expected);
  const valid = entry["type"] === "local" && (entry["enabled"] === undefined || entry["enabled"] === true)
    && command.length === 2 && knownNode && pathMatches(command[1], input.entry_js)
    && values.every(value => typeof value === "string")
    && pathMatches(registered["AITEST_CONFIG"], input.config_path) && pathMatches(registered["AITEST_DB_PATH"], input.db_path);
  return { valid, command, environment, worker_enabled: environment["AITEST_WORKER_ENABLED"] === "1" };
}

/** Preserve registered settings on upgrade; explicit installer switches win. */
export function buildRegisteredMcpEnvironment(previous: unknown, ambient: Record<string,string|undefined>, configPath: string, dbPath: string): Record<string,string> {
  const registered = previous && typeof previous === "object" ? previous as Record<string,unknown> : {};
  const result: Record<string,string> = Object.fromEntries(Object.entries(registered).filter((pair): pair is [string,string] => typeof pair[1] === "string"));
  result["AITEST_CONFIG"] = configPath; result["AITEST_DB_PATH"] = dbPath;
  for (const key of ["AITEST_WORKER_ENABLED", "AITEST_PROFILE"]) {
    if (ambient[key] !== undefined) result[key] = ambient[key];
  }
  return result;
}
