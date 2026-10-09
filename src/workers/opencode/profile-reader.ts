/**
 * Model profili okuma: OpenCode config'inden (opencode.json) yetkili worker profili cozumleme.
 * API key degeri okunmaz; {env:...} referansi korunur; secret log/rapor yazilmaz.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { AppError } from "../../domain/errors.js";

export interface ResolvedWorkerProfile {
  provider_id: string;
  model_id: string;
  base_url: string | null;
  api_key_reference: string | null;
  timeout_ms: number | null;
  source: string;
}

interface OpenCodeProviderOptions {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
}

interface OpenCodeConfig {
  provider?: Record<string, { options?: OpenCodeProviderOptions } | undefined>;
  model?: string;
  small_model?: string;
}

function parseEnvReference(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = /^\{env:([A-Za-z0-9_]+)\}$/.exec(value.trim());
  if (match) {
    return `env:${match[1]}`;
  }
  return "env:UNKNOWN_REF";
}

export function defaultOpencodeConfigPath(): string {
  return join(homedir(), ".config", "opencode", "opencode.json");
}

export function readWorkerProfileFromOpencodeConfig(configPath?: string, requestedModel?: string): ResolvedWorkerProfile {
  const path = configPath ?? defaultOpencodeConfigPath();
  if (!existsSync(path)) {
    throw new AppError("INVALID_PARAMETERS", `OpenCode config bulunamadi: ${path}`);
  }
  let config: OpenCodeConfig;
  try {
    config = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as OpenCodeConfig;
  } catch (error) {
    throw new AppError("INVALID_PARAMETERS", `OpenCode config parse hatasi: ${path}`, { cause: String(error) });
  }

  const modelSpec = requestedModel ?? config.model;
  if (!modelSpec) {
    throw new AppError("INVALID_PARAMETERS", "Model secimi yok (config.model ve requestedModel eksik)");
  }

  const slashIndex = modelSpec.indexOf("/");
  if (slashIndex <= 0) {
    throw new AppError("INVALID_PARAMETERS", `Model formati provider/model olmali: ${modelSpec}`);
  }
  const providerId = modelSpec.slice(0, slashIndex);
  const modelId = modelSpec.slice(slashIndex + 1);

  const provider = config.provider?.[providerId];
  if (!provider) {
    throw new AppError("INVALID_PARAMETERS", `Provider bulunamadi: ${providerId}`);
  }

  return {
    provider_id: providerId,
    model_id: modelId,
    base_url: provider.options?.baseURL ?? null,
    api_key_reference: parseEnvReference(provider.options?.apiKey),
    timeout_ms: provider.options?.timeout ?? null,
    source: path,
  };
}

export function assertNoSecretValue(profile: ResolvedWorkerProfile): void {
  const serialized = JSON.stringify(profile);
  if (/apiKey|Bearer|sk-[A-Za-z0-9]{10,}/i.test(serialized.replace(/api_key_reference/g, "ref"))) {
    throw new AppError("POLICY_VIOLATION", "Profil icinde secret degeri sizintisi", { reason_code: "SECRET_LEAK" });
  }
}
