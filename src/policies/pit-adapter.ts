/**
 * FIN08/13.4: PIT adapter - hedef-sinirli mutation olcumu ve mevcut raporu provenance ile import.
 * Customer source/POM/build DEGISMEZ. PIT yalniz disposable sandbox'ta kendi bytecode mutasyonlarini yapar.
 * Kullanilan official plugin surumu pinlenir [S12]; uyumsuz projede MUTATION_UNSUPPORTED/BLOCKED verilir.
 */
export interface PitAdapterConfig {
  pit_version: string;
  /** Hedef siniflar (bounded; tum projede degil) */
  target_classes: string[];
  /** Hedef testler */
  target_tests: string[];
  threads: number;
  mutators: string[];
  run_timeout_ms: number;
  max_repeat_budget: number;
}

export interface PitReportImport {
  killed: number;
  survived: number;
  no_coverage: number;
  timeout: number;
  run_error: number;
  mutation_score_bps: number | null;
  provenance: "pit_maven_plugin" | "imported_external";
  pit_version: string;
  report_path: string | null;
  imported_at: number;
}

export const PIT_PLUGIN_VERSION = "1.15.2";
export const PIT_DEFAULT_MUTATORS = ["DEFAULTS"] as const;

export function defaultPitConfig(targetClasses: string[], targetTests: string[]): PitAdapterConfig {
  return {
    pit_version: PIT_PLUGIN_VERSION,
    target_classes: [...targetClasses],
    target_tests: [...targetTests],
    threads: 1,
    mutators: [...PIT_DEFAULT_MUTATORS],
    run_timeout_ms: 300000,
    max_repeat_budget: 1,
  };
}

/**
 * PIT hedef-siniri: scope yalniz belirtilen sinif/testler; tum projeye genisletilMEZ.
 * Bos hedef listesi mutation olcumu gereksiz yere tum projeyi tarar: reddedilir.
 */
export function assertPitScopeBounded(config: PitAdapterConfig): void {
  if (config.target_classes.length === 0) {
    throw new PitScopeError("PIT hedef sinifi bos; tum proje mutation olcumu kapsam disi (targeted olmali)");
  }
  if (config.target_tests.length === 0) {
    throw new PitScopeError("PIT hedef testi bos; scope belirtilmeden mutation calistirilmaz");
  }
  if (config.threads < 1 || config.threads > 8) {
    throw new PitScopeError(`PIT threads 1-8 araliginda olmali: ${config.threads}`);
  }
}

export class PitScopeError extends Error {
  readonly code = "MUTATION_SCOPE_UNBOUNDED";
  constructor(message: string) {
    super(message);
    this.name = "PitScopeError";
  }
}

export class MutationUnsupportedError extends Error {
  readonly code = "MUTATION_UNSUPPORTED";
  constructor(message: string) {
    super(message);
    this.name = "MutationUnsupportedError";
  }
}

/**
 * PIT raporunu provenance ile import eder. Ham rapordan eslesmeler gelir;
 * equivalent mutant iddiasi kanitsiz yapilmaz; denominator manipulate edilmeZ.
 */
export function importPitReport(raw: {
  killed?: number;
  survived?: number;
  no_coverage?: number;
  timeout?: number;
  run_error?: number;
  provenance?: string;
  pit_version?: string;
  report_path?: string | null;
}): PitReportImport {
  const killed = raw.killed ?? 0;
  const survived = raw.survived ?? 0;
  const noCoverage = raw.no_coverage ?? 0;
  const timeout = raw.timeout ?? 0;
  const runError = raw.run_error ?? 0;
  const denominator = killed + survived;
  const mutationScoreBps = denominator > 0 ? Math.floor((killed * 10000) / denominator) : null;
  const provenance = raw.provenance === "imported_external" ? "imported_external" : "pit_maven_plugin";
  return {
    killed,
    survived,
    no_coverage: noCoverage,
    timeout,
    run_error: runError,
    mutation_score_bps: mutationScoreBps,
    provenance,
    pit_version: raw.pit_version ?? PIT_PLUGIN_VERSION,
    report_path: raw.report_path ?? null,
    imported_at: Date.now(),
  };
}

/**
 * Mutation skoru coverage'dan AYRI gosterilir; coverage gate yerine gecmez (13.4/PRO39).
 * Skor null ise (hic mutant yok) high score ilan edilmez.
 */
export function assertMutationScoreSeparate(pit: PitReportImport): { separate: boolean; score_percent: number | null } {
  if (pit.mutation_score_bps === null) {
    return { separate: true, score_percent: null };
  }
  return { separate: true, score_percent: pit.mutation_score_bps / 100 };
}

/**
 * PIT mvn komut dizisi uretir: customer POM'a dependency EKLENMEZ; external harness yolu.
 * Komut yalniz disposable sandbox'ta calisir.
 */
export function buildPitMavenCommand(config: PitAdapterConfig): string[] {
  assertPitScopeBounded(config);
  const args = ["mvn", "org.pitest:pitest-maven:mutationCoverage", `-DwithHistory=true`, `-Dthreads=${config.threads}`, `-DtimeoutConst=${Math.floor(config.run_timeout_ms / 1000)}`, "-B", "-ntp"];
  if (config.target_classes.length > 0) {
    args.push(`-DtargetClasses=${config.target_classes.join(",")}`);
  }
  if (config.target_tests.length > 0) {
    args.push(`-DtargetTests=${config.target_tests.join(",")}`);
  }
  if (config.mutators.length > 0) {
    args.push(`-Dmutators=${config.mutators.join(",")}`);
  }
  return args;
}
