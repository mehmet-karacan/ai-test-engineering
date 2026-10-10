/**
 * Config guvenlik katmani (FIN01/6.1):
 * - Supheli/gecersiz anahtar tespiti (trailing-space key gibi); ayni anahtar normalize edilerek KABUL EDILMEZ.
 * - Secretsiz config snapshot/digest: calisan job'un politikalari sonradan sessizce degismez.
 * - Remote URL credential temizleme (7.1): token/kullanici bilgisi saklanmaz.
 */
import { createHash } from "node:crypto";

export interface SuspiciousKeyFinding {
  key: string;
  normalized_key: string;
  reason: string;
}

/**
 * 6.1: `reasoning_effort ` gibi sonunda bosluk bulunan anahtarlar gecersiz/supheli tespit edilir.
 * `reasoning_effort` ile ayni key KABUL EDILMEZ; merkezi ayar otomatik normalize edilmez.
 */
export function findSuspiciousKeys(config: Record<string, unknown>, parentPath = ""): SuspiciousKeyFinding[] {
  const findings: SuspiciousKeyFinding[] = [];
  for (const [key, value] of Object.entries(config)) {
    const path = parentPath.length > 0 ? `${parentPath}.${key}` : key;
    const trimmed = key.trim();
    if (trimmed !== key) {
      findings.push({
        key,
        normalized_key: trimmed,
        reason: key !== key.replace(/\s+$/, "")
          ? "Anahtar sonunda bosluk var; normalize edilen anahtarla ayni kabul edilmez"
          : "Anahtar basinda/sonunda bosluk var",
      });
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      findings.push(...findSuspiciousKeys(value as Record<string, unknown>, path));
    }
  }
  return findings;
}

export interface ConfigSnapshot {
  digest: string;
  schema_version: number;
  /** Secretsiz ozet: job'da sabitlenen politika degerleri */
  snapshot: Record<string, unknown>;
  taken_at: number;
}

/**
 * Etkili config'in secretsiz snapshot'i/digest'i job'da sabitlenir (6.1).
 * Secret-reference isimleri korunur; degerler asla snapshot'a girmez.
 */
export function buildSecretFreeConfigSnapshot(config: {
  schema_version: number;
  budgets: Record<string, unknown>;
  coverage_defaults: Record<string, unknown>;
  worker_profiles: Array<Record<string, unknown>>;
  allowed_project_roots: string[];
  storage: { root: string };
}): ConfigSnapshot {
  const snapshot: Record<string, unknown> = {
    schema_version: config.schema_version,
    budgets: { ...config.budgets },
    coverage_defaults: { ...config.coverage_defaults },
    worker_profiles: config.worker_profiles.map((p) => ({
      profile_name: p["profile_name"],
      provider_id: p["provider_id"],
      model_id: p["model_id"],
      secret_reference_names: p["secret_reference_names"],
    })),
    allowed_root_count: config.allowed_project_roots.length,
  };
  return {
    digest: sha256Hex(JSON.stringify(snapshot)),
    schema_version: config.schema_version,
    snapshot,
    taken_at: Date.now(),
  };
}

/**
 * 7.1: Remote URL icindeki credential ve kullaniciya ozel token temizlenir.
 * `https://user:token@github.com/org/repo.git` -> `https://github.com/org/repo.git`
 */
export function sanitizeRemoteUrl(remoteUrl: string): string {
  try {
    const url = new URL(remoteUrl);
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    // scp benzeri format: git@github.com:org/repo.git
    const scpMatch = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remoteUrl);
    if (scpMatch) {
      return `git@${scpMatch[1]}:${scpMatch[2]}.git`;
    }
    return remoteUrl;
  }
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}
