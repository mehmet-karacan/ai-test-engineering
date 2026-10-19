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
  /** F08/P04: PIT test-basina ek sure parametresi (milisaniye); is butcesinden ayri sozlesme. */
  timeout_const_ms: number;
  max_repeat_budget: number;
}

export interface PitReportImport {
  killed: number;
  survived: number;
  no_coverage: number;
  timeout: number;
  run_error: number;
  /** F07/P01: killed / tum raporlanan mutantlar; no_coverage paydada. */
  mutation_score_bps: number | null;
  /** F07/P01: killed / (killed + survived); yalniz kapsanan mutantlar. */
  test_strength_bps: number | null;
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
    // F08/P04: PIT timeoutConst test-basina ek sure (ms); varsayilan 8000 ms PIT resmi
    // dokumanindaki varsayilanla hizali. Is duvar saati butcesi run_timeout_ms ayri alandadir.
    timeout_const_ms: 8000,
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
 * F07/P01: mutation_score_bps tum raporlanan mutantlari, test_strength_bps ise yalniz
 * kapsanan killed/survived mutantlari paydada kullanir.
 * F07/P02: negatif sayaclar bu sinirda reddedilir; hatali rapor sessizce skor uretmez.
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
  // F07/P02: negatif sayaclar gecerli PIT raporu degildir; sinirda fail-closed reddedilir.
  for (const [name, value] of [
    ["killed", killed],
    ["survived", survived],
    ["no_coverage", noCoverage],
    ["timeout", timeout],
    ["run_error", runError],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new MutationReportError(`PIT raporu gecersiz sayac: ${name}=${value}`);
    }
  }
  const denominator = killed + survived;
  // F07/P01: test strength yalniz kapsanan mutantlar (killed+survived) paydali.
  const testStrengthBps = denominator > 0 ? Math.floor((killed * 10000) / denominator) : null;
  // F07/P01: genel mutation score tum mutantlari (killed+survived+no_coverage+timeout+run_error) paydali.
  const totalMutants = killed + survived + noCoverage + timeout + runError;
  if (!Number.isSafeInteger(totalMutants)) {
    throw new MutationReportError("PIT raporu toplam mutant sayaci tasiyor");
  }
  const mutationScoreBps = totalMutants > 0 ? Math.floor((killed * 10000) / totalMutants) : null;
  const provenance = raw.provenance === "imported_external" ? "imported_external" : "pit_maven_plugin";
  return {
    killed,
    survived,
    no_coverage: noCoverage,
    timeout,
    run_error: runError,
    mutation_score_bps: mutationScoreBps,
    test_strength_bps: testStrengthBps,
    provenance,
    pit_version: raw.pit_version ?? PIT_PLUGIN_VERSION,
    report_path: raw.report_path ?? null,
    imported_at: Date.now(),
  };
}

/**
 * Mutation skoru coverage'dan AYRI gosterilir; coverage gate yerine gecmez (13.4/PRO39).
 * Skor null ise (hic mutant yok) high score ilan edilmez.
 * F07/P01: test strength ve genel mutation score ayri adlarla dondurulur.
 */
export function assertMutationScoreSeparate(pit: PitReportImport): {
  separate: boolean;
  score_percent: number | null;
  test_strength_percent: number | null;
} {
  return {
    separate: true,
    score_percent: pit.mutation_score_bps === null ? null : pit.mutation_score_bps / 100,
    test_strength_percent: pit.test_strength_bps === null ? null : pit.test_strength_bps / 100,
  };
}

/**
 * F07: PIT raporundan gelen gecersiz sayac icin typed hata.
 */
export class MutationReportError extends Error {
  readonly code = "MUTATION_REPORT_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "MutationReportError";
  }
}

/**
 * PIT mvn komut dizisi uretir: customer POM'a dependency EKLENMEZ; external harness yolu.
 * Komut yalniz disposable sandbox'ta calisir.
 * F08/P03: pit_version Maven goal koordinatina gomulur; yapilandirilan surum calistirilan
 * plugin'i pinler (surum uydurma yok).
 * F08/P04: run_timeout_ms duvar saati is suresidir; -DtimeoutConst PIT'in TEST BASINA ek
 * sure parametresidir (milisaniye) ve is butcesinden turetilmeZ. Is butcesi ayri
 * `timeoutConst`/process timeout sozlesmesiyle yonetilir; bu iki kavram karistirmaz.
 */
export function buildPitMavenCommand(config: PitAdapterConfig): string[] {
  assertPitScopeBounded(config);
  const version = config.pit_version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new MutationUnsupportedError(`PIT plugin surumu pinli semver olmali: ${version}`);
  }
  // F08/P03: surum koordinata gomulu; eklenti surumu config ile sabitlenir.
  const args = ["mvn", `org.pitest:pitest-maven:${version}:mutationCoverage`, `-DwithHistory=true`, `-Dthreads=${config.threads}`, `-DtimeoutConst=${config.timeout_const_ms}`, "-B", "-ntp"];
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
