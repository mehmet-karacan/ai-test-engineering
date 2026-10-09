/**
 * Rol bazli worker prompts: Analyzer, Test Designer/Developer, Reviewer/Gap Analyzer.
 * Mantiksal rollerdir; tek yetkili modelle tum akis calisir.
 */
export type WorkerRole = "analyzer" | "test_designer" | "reviewer" | "gap_analyzer";

export interface WorkerPromptContext {
  role: WorkerRole;
  class_name: string;
  package_name: string;
  dependencies_signatures: string[];
  existing_tests_summary: string[];
  uncovered_areas: string[];
  previous_attempts?: Array<{ scenario: string; result: string; error?: string }>;
  policy_rules: string[];
}

export const WORKER_ROLES: readonly WorkerRole[] = ["analyzer", "test_designer", "reviewer", "gap_analyzer"] as const;

export function buildWorkerPrompt(context: WorkerPromptContext): string {
  const roleIntro = roleIntroFor(context.role);
  const sections = [
    roleIntro,
    "",
    "## Hedef sinif",
    `Paket: ${context.package_name}`,
    `Sinif: ${context.class_name}`,
    "",
    "## Bagimlilik imzalari (sadece bunlari kullan)",
    ...context.dependencies_signatures.map((sig) => `- ${sig}`),
    "",
    "## Mevcut test durumu",
    ...(context.existing_tests_summary.length > 0 ? context.existing_tests_summary.map((t) => `- ${t}`) : ["- Mevcut test yok"]),
    "",
    "## Kapsanmamis alanlar",
    ...context.uncovered_areas.map((a) => `- ${a}`),
    "",
    ...(context.previous_attempts && context.previous_attempts.length > 0
      ? ["## Onceki denemeler (tekrar etme)", ...context.previous_attempts.map((p) => `- ${p.scenario}: ${p.result}${p.error ? ` (${p.error})` : ""}`), ""]
      : []),
    "## Zorunlu kurallar",
    ...context.policy_rules.map((r) => `- ${r}`),
  ];
  return sections.join("\n");
}

function roleIntroFor(role: WorkerRole): string {
  switch (role) {
    case "analyzer":
      return "Sen bir analiz uzmanisin. KOD YAZMA. Hedef sinifin davranislarini, contract'larini ve test edilebilir alanlarini analiz et. Sonucu yapilandirilmis JSON olarak ver.";
    case "test_designer":
      return "Sen bir test gelistirme uzmanisin. Yalniz TEST dosyalari uret. Production kodunu DEGISTIRME. JUnit/Mockito kullanarak kapsanmamis davranislar icin anlamli testler yaz.";
    case "reviewer":
      return "Sen bir test inceleme uzmanisin. Uretilen testlerin kalitesini incele: bos/tautolojik assertion, mock-SUT shadowing, gevsetme var mi? Sonucu yapilandirilmis JSON olarak ver.";
    case "gap_analyzer":
      return "Sen bir kapsam analizi uzmanisin. Kalan kapsanmamis alanlari, denenen yaklasimlari ve engelleri analiz et. Sonucu yapilandirilmis JSON olarak ver.";
  }
}

export const DEFAULT_POLICY_RULES: readonly string[] = [
  "Production kaynak dosyalarini degistiremezsin.",
  "pom.xml, build.gradle ve diger build dosyalarini degistiremezsin.",
  "Yeni @Disabled veya @Ignore ekleyemezsin.",
  "Mevcut testleri silemezsin veya assertion'larini gevsetemezsin.",
  "API key, parola ve sirlari okuyamaz veya yazamazsin.",
  "Testin kendi stub'inin sonucunu dogrulama (SUT'u tamamen mock'layip kendi stub'ini test etme).",
] as const;
