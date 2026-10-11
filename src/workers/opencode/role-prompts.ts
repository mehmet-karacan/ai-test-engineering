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
  /**
   * 10.2 zorunlu baglam: hedef sinifin gercek govdesi (method/class govdesi birebir).
   * "Ilk bes dosya" veya yalniz imza yeterli degil; RT21 pilot bulgusu: govde olmadan model
   * kaynak kodu isteyen aciklama yaziyor (JSON uretemiyor).
   */
  class_body?: string;
  policy_rules: string[];
}

export const WORKER_ROLES: readonly WorkerRole[] = ["analyzer", "test_designer", "reviewer", "gap_analyzer"] as const;

/**
 * W01/F04: context manifest - govde/bolum kesme kararlari kayitli olur; sessiz kesme yok.
 */
export interface ContextManifestEntry {
  section: string;
  included_bytes: number;
  total_bytes: number;
  truncated: boolean;
}

export interface ContextManifest {
  entries: ContextManifestEntry[];
  total_context_chars: number;
  excluded_notes: string[];
}

export function buildContextManifest(context: WorkerPromptContext, classBodyLimit = 12000): ContextManifest {
  const entries: ContextManifestEntry[] = [];
  const excludedNotes: string[] = [];
  const bodyTotal = context.class_body?.length ?? 0;
  const bodyIncluded = Math.min(bodyTotal, classBodyLimit);
  if (bodyTotal > 0) {
    entries.push({ section: "class_body", included_bytes: bodyIncluded, total_bytes: bodyTotal, truncated: bodyTotal > classBodyLimit });
    if (bodyTotal > classBodyLimit) {
      excludedNotes.push(`class_body: ilk ${classBodyLimit} karakter dahil; kalan ${bodyTotal - classBodyLimit} karakter haric (satir araligi/hash ile replan gerekli)`);
    }
  }
  if (context.dependencies_signatures.length > 20) {
    excludedNotes.push(`dependencies_signatures: ${context.dependencies_signatures.length} imza; ilk 20 dahil`);
  }
  let total = 0;
  for (const entry of entries) {
    total += entry.included_bytes;
  }
  return { entries, total_context_chars: total, excluded_notes: excludedNotes };
}

export function buildWorkerPrompt(context: WorkerPromptContext): string {
  const roleIntro = roleIntroFor(context.role);
  // 10.2 + W01/F04: gercek govde prompt'a girer; 12000 karakterden uzunsa ACIK truncation isareti ile
  // (sessiz kesme yok; 'birebir' etiketi yalniz gercekten tam govde icin).
  const classBodyFull = context.class_body && context.class_body.length > 0;
  const classBodyTruncated = classBodyFull && context.class_body!.length > 12000;
  const classBodyLabel = !classBodyFull
    ? []
    : classBodyTruncated
      ? [`## Hedef sinifin gercek govdesi (ILK 12000 KARAKTER; TOPLAM ${context.class_body!.length}; KESILDI)`, context.class_body!.slice(0, 12000), ""]
      : ["## Hedef sinifin gercek govdesi (birebir)", context.class_body!, ""];
  // 10.3: cikti bicimi zorlamasi (RT21 pilot bulgusu: JSON zorlanmazsa model markdown java kodu
  // yaziyor; extractJsonCandidate bunu ceviremiyor):
  const sections = [
    roleIntro,
    "",
    "## Hedef sinif",
    `Paket: ${context.package_name}`,
    `Sinif: ${context.class_name}`,
    "",
    ...classBodyLabel,
    "## Bagimlilik imzalari (sadece bunlari kullan)",
    ...context.dependencies_signatures.slice(0, 20).map((sig) => `- ${sig}`),
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
    "",
    "## Cikti bicimi (zorunlu)",
    "Yalnizca gecerli JSON dondur; aciklama, markdown, kod blogu veya baska metin YAZMA.",
    'Beklenen yapis: {"schema_version":1,"changes":[{"path":"<src/test/java altinda relative yol>","action":"create|modify|delete","new_content":"<dosya tam icerigi>"}]}',
    "new_content, dosyanin tam java icerigi olmali; kod blogu (```) icinde degil dogrudan JSON string olarak.",
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
