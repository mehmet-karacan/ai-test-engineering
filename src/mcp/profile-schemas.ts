/**
 * MCP profil semalari: v1 (eski handshake / OpenCode-uyumlu) ve v2 (yeni protokol lifecycle).
 * Ayni typed tool registry'yi kullanir; paket isimleri ve protokol yasam donguleri karismaz.
 */
export type McpProfileVersion = "v1" | "v2";

export interface McpProfile {
  version: McpProfileVersion;
  protocol_version: string;
  description: string;
}

export const MCP_PROFILES: Readonly<Record<McpProfileVersion, McpProfile>> = {
  v1: {
    version: "v1",
    protocol_version: "2025-11-25",
    description: "OpenCode-uyumlu profil: eski handshake, 1.x SDK server/client export yapisI.",
  },
  v2: {
    version: "v2",
    protocol_version: "2026-07-28",
    description: "Yeni protokol profili: resmi v2 lifecycle, Task semalari ayri uzantida.",
  },
};

export function resolveProfile(version: string | undefined): McpProfile {
  if (version === undefined || version === null || version.length === 0) {
    return MCP_PROFILES["v1"];
  }
  const profile = MCP_PROFILES[version as McpProfileVersion];
  if (!profile) {
    throw new Error(`Bilinmeyen MCP profili: ${version}`);
  }
  return profile;
}

export interface ProfileNegotiation {
  requested: McpProfileVersion;
  served: McpProfileVersion;
  protocol_version: string;
  client_supported: string[];
}

/**
 * Profil muzakeresi: istemcinin destekledigi surumlere gore profil secimi.
 * Kontrolsuz melez protokol olusturmaz; bilinen profillerden birini dondurur.
 */
export function negotiateProfile(clientSupportedVersions: string[], requested?: McpProfileVersion): ProfileNegotiation {
  const preferred = requested ?? (clientSupportedVersions.includes("v2") ? "v2" : "v1");
  if (!clientSupportedVersions.includes(preferred)) {
    const fallback = clientSupportedVersions.includes("v1") ? "v1" : preferred;
    return {
      requested: preferred,
      served: fallback,
      protocol_version: MCP_PROFILES[fallback as McpProfileVersion].protocol_version,
      client_supported: clientSupportedVersions,
    };
  }
  return {
    requested: preferred,
    served: preferred,
    protocol_version: MCP_PROFILES[preferred].protocol_version,
    client_supported: clientSupportedVersions,
  };
}
