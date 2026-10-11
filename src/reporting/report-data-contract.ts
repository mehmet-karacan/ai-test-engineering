/**
 * W06/F13/F14: Facts-only report data contract - model narrative YASAK.
 * Model comment/risk/review/recommendation alanlari report schema'ya giremez;
 * sanitizer bunlari reddeder/kirpar. 0/null/NOT_RUN/NOT_APPLICABLE/UNAVAILABLE/INVALID/REDACTED
 * ayni anlamda KULLANILMAZ; her alani kendi anlamini tasiyir.
 */
import { z } from "zod";

export const FACTS_SCHEMA_VERSION = 2;

/** W06/N02: model narrative yasakli alanlari (nested dahil) */
export const FORBIDDEN_NARRATIVE_FIELDS: readonly string[] = [
  "model_review",
  "risk_score",
  "riskScore",
  "rationale",
  "recommendation",
  "scenario_explanation",
  "scenarioExplanation",
  "assertion_rationale",
  "assertionRationale",
  "summary",
  "review",
  "verdict",
  "reasoning",
  "ai_comment",
  "aiComment",
  "ai_analysis",
  "aiAnalysis",
  "model_comment",
  "modelComment",
  "quality_assessment",
  "qualityAssessment",
  "business_risk",
  "businessRisk",
] as const;

export interface NarrativeSanitizationResult {
  clean: boolean;
  removed_paths: string[];
  reason: string | null;
}

/**
 * W06/N02: derin nesne taramasi - yasakli narrative alanlarini bulur (nested dahil).
 * Bulunan alanlar remove edilir; tam yol kayitli olur (sessiz kirpma yok).
 */
export function sanitizeNarrativeFields(input: unknown, prefix = ""): NarrativeSanitizationResult {
  const removed: string[] = [];
  if (input === null || input === undefined || typeof input !== "object") {
    return { clean: removed.length === 0, removed_paths: removed, reason: removed.length > 0 ? "narrative alanlari kirpildi" : null };
  }
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      const sub = sanitizeNarrativeFields(input[i], `${prefix}[${i}]`);
      removed.push(...sub.removed_paths);
    }
    return { clean: removed.length === 0, removed_paths: removed, reason: removed.length > 0 ? "narrative alanlari kirpildi" : null };
  }
  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const path = prefix.length > 0 ? `${prefix}.${key}` : key;
    if (FORBIDDEN_NARRATIVE_FIELDS.includes(key)) {
      delete obj[key];
      removed.push(path);
      continue;
    }
    const sub = sanitizeNarrativeFields(obj[key], path);
    removed.push(...sub.removed_paths);
  }
  return { clean: removed.length === 0, removed_paths: removed, reason: removed.length > 0 ? "narrative alanlari kirpildi" : null };
}

/**
 * W06/N04: ayrik bilinmeyen degerler - 0/null/NOT_RUN/NOT_APPLICABLE/UNAVAILABLE/INVALID/REDACTED
 * ayni anlamda kullanilamaz; her birinin kendi semantiği korunur.
 */
export type UnknownValueState = "NOT_RUN" | "NOT_APPLICABLE" | "UNAVAILABLE" | "INVALID" | "REDACTED" | "KNOWN";

export function metricValueState(input: { exists: boolean; valid: boolean; applicable: boolean; redacted?: boolean }): UnknownValueState {
  if (input.redacted) {
    return "REDACTED";
  }
  if (!input.exists) {
    return "UNAVAILABLE";
  }
  if (!input.valid) {
    return "INVALID";
  }
  if (!input.applicable) {
    return "NOT_APPLICABLE";
  }
  return "KNOWN";
}

/** W06/N04: sifir deger yalniz gercek olculmus 0 icin; eksik veri 0 ile ortulmez */
export function zeroMeansMeasured(value: number | null | undefined, measured: boolean): number | null {
  if (!measured) {
    return null;
  }
  return value ?? 0;
}
