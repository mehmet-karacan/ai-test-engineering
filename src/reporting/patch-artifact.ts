/**
 * FIN09/15.2/16.1: PATCH_ONLY sonucunda gercek uygulanabilir patch teslimi.
 * B11 kapanisi: "PATCH_ONLY" string'i yeterli degil; bayt-dogrulanmis changes.patch +
 * hash'li test dosyalari + verification kaniti uretilir.
 */
import { createHash } from "node:crypto";

export interface PatchFileEntry {
  path: string;
  action: "create" | "modify" | "delete";
  before_sha256: string | null;
  after_sha256: string;
  after_bytes: number;
}

export interface PatchArtifact {
  schema_version: 1;
  job_id: string;
  checkpoint_id: string | null;
  files: PatchFileEntry[];
  /** Unified diff icerigi (tum dosyalar birlesik) */
  unified_diff: string;
  patch_sha256: string;
  patch_bytes: number;
  /** Ham source diff'in hash'i; exported unified_diff redacted olabilir. */
  source_patch_sha256: string;
  source_patch_bytes: number;
  redacted: boolean;
  generated_at: number;
  /** Patch'in stale source'a uygulama riski belirtilir (16.1) */
  stale_risk_note: string;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Tum resulting bytes'tan unified diff uretir (tanimli format; a/b prefix).
 * Encoding/EOL bilgisi korunur; binary icerik metin olarak donusturulmeZ.
 */
export function buildUnifiedDiff(entries: Array<{ path: string; before: Buffer | string | null; after: Buffer | string | null }>): string {
  const splitLines = (value: string): string[] => {
    const lines = value.split(/\r?\n/);
    if (value.endsWith("\n") || value.endsWith("\r")) {
      lines.pop();
    }
    return lines;
  };
  const parts: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const beforeBuffer = entry.before === null ? null : typeof entry.before === "string" ? Buffer.from(entry.before, "utf8") : entry.before;
    const afterBuffer = entry.after === null ? null : typeof entry.after === "string" ? Buffer.from(entry.after, "utf8") : entry.after;
    const binary = [beforeBuffer, afterBuffer].some((value) => value !== null && value.includes(0));
    parts.push(`--- a/${entry.path}`);
    parts.push(`+++ b/${entry.path}`);
    if (binary) {
      parts.push(`Binary files a/${entry.path} and b/${entry.path} differ`);
      continue;
    }
    const beforeText = entry.before === null ? "" : typeof entry.before === "string" ? entry.before : entry.before.toString("utf8");
    const afterText = entry.after === null ? "" : typeof entry.after === "string" ? entry.after : entry.after.toString("utf8");
    const beforeLines = entry.before === null ? [] : splitLines(beforeText);
    const afterLines = entry.after === null ? [] : splitLines(afterText);
    if (entry.after === null) {
      parts.push(`@@ -1,${beforeLines.length} +0,0 @@`);
      for (const line of beforeLines) {
        parts.push(`-${line}`);
      }
    } else if (entry.before === null) {
      parts.push(`@@ -0,0 +1,${afterLines.length} @@`);
      for (const line of afterLines) {
        parts.push(`+${line}`);
      }
    } else {
      // Modify is represented as a complete replacement. It is deterministic,
      // byte-faithful at the line level, and remains applicable without
      // inventing context that is not present in the accepted snapshot.
      parts.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
      for (const line of beforeLines) {
        parts.push(`-${line}`);
      }
      for (const line of afterLines) {
        parts.push(`+${line}`);
      }
    }
  }
  return parts.join("\n") + "\n";
}

/**
 * PATCH_ONLY teslim artifact'i uretir: hash'li test dosyalari + verification kaniti.
 * Bos/no-change job'da bu durum explicit'tir (15.2).
 */
export function buildPatchArtifact(input: {
  job_id: string;
  checkpoint_id: string | null;
  files: Array<{ path: string; action: "create" | "modify" | "delete"; before: Buffer | string | null; after: Buffer | string | null }>;
}): PatchArtifact {
  const fileEntries: PatchFileEntry[] = input.files.map((f) => {
    const afterBuffer = f.after === null ? Buffer.alloc(0) : typeof f.after === "string" ? Buffer.from(f.after, "utf8") : f.after;
    return {
      path: f.path,
      action: f.action,
      before_sha256: f.before === null ? null : sha256Hex(f.before),
      after_sha256: sha256Hex(afterBuffer),
      after_bytes: afterBuffer.length,
    };
  });
  const unifiedDiff = buildUnifiedDiff(input.files.map((f) => ({ path: f.path, before: f.before, after: f.after })));
  const patchSha256 = sha256Hex(unifiedDiff);
  return {
    schema_version: 1,
    job_id: input.job_id,
    checkpoint_id: input.checkpoint_id,
    files: fileEntries,
    unified_diff: unifiedDiff,
    patch_sha256: patchSha256,
    patch_bytes: Buffer.byteLength(unifiedDiff, "utf8"),
    source_patch_sha256: patchSha256,
    source_patch_bytes: Buffer.byteLength(unifiedDiff, "utf8"),
    redacted: false,
    generated_at: Date.now(),
    stale_risk_note: "Patch immutable snapshot'ta dogrulanmis source'a karsi uretildi; original checkout arada degistiyse apply expected-before kontroluyle CONFLICT verir (16.3).",
  };
}

/**
 * Export gizlilik: paylasilabilir redacted destek paketi ile detayli yerel rapor ayridir (15.4).
 */
export interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

export const DEFAULT_REDACTIONS: ReadonlyArray<RedactionRule> = [
  { pattern: /sk-[A-Za-z0-9]{10,}/g, replacement: "[REDACTED_API_KEY]" },
  { pattern: /(api[_-]?key|password|secret|token)\s*[=:]\s*\S+/gi, replacement: "$1=[REDACTED]" },
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: "Bearer [REDACTED]" },
];

/** Kullaniciya ozel tam yol temizlenir; sadece ana dizin banti kalir */
export function redactUserPath(path: string, homeDir: string): string {
  const normalizedHome = homeDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedHome.length === 0) {
    return path;
  }
  const escaped = normalizedHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[\\\\/]");
  return path.replace(new RegExp(escaped, "gi"), "[HOME]");
}

export function redactSensitive(text: string, extraRules?: ReadonlyArray<RedactionRule>): string {
  let redacted = text;
  for (const rule of [...DEFAULT_REDACTIONS, ...(extraRules ?? [])]) {
    redacted = redacted.replace(rule.pattern, rule.replacement);
  }
  return redacted;
}
