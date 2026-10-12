/**
 * FIN04/7.4: Hedef cozumleme - exact FQCN, package boundary, module kimligi.
 * - Class selector: exact FQCN tercih edilir; simple name'de tum eslesmeler bulunur.
 * - FQCN suffix ile `PaymentService` ve `OtherPaymentService` KARISTIRILMAZ (son-ek aramasi yasak).
 * - Package selector: exact package boundary; `%package.` son-ek aramasi kullanilmaz.
 * - Test kaynak siniflari production target listesine GIREMEZ.
 * - Nested binary ad `$` ile source FQCN farki korunur.
 */
import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";

/**
 * P05/PR06: concrete hedef kimligi - snapshot'a bagli donusmez (frozen) tip.
 * handleTestStart, job_targets, GoalContract, runtime ve resume BIRLIKTE bu tipte
 * calisir; selector yeniden cozulmez, class/package/module sinifi ayrisimi
 * source-set tabanlidir (dosya adi "Test" suffix'i YALNIZca kanit degil).
 */
export interface ConcreteTarget {
  fqn: string;
  module_path: string;
  source_set: "main" | "test" | "unknown";
  relative_path: string;
  snapshot_id: string;
}

export interface FrozenTargetList {
  /** Deterministik digest: concrete hedeflerin sirlanmis JSON hash'i. */
  digest: string;
  targets: ConcreteTarget[];
  selector_count: number;
  target_count: number;
  max_concrete_targets: number;
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Frozen concrete target listesi kurar ve fail-closed kontrol yapar.
 * - Bos liste (hedef yok) RED.
 * - Duplicate (fqn + module_path + source_set + relative_path + snapshot_id) RED.
 * - Expansion limiti (max_concrete_targets) asilirsa RED.
 * - source_set "unknown" (belirsiz source-set) RED.
 * Siralama deterministik: digest her kosumda ayni sonuca ulasir.
 */
export function buildFrozenTargetList(
  targets: ConcreteTarget[],
  snapshotId: string,
  selectorCount: number,
  maxConcreteTargets: number,
): FrozenTargetList {
  if (targets.length === 0) {
    throw new AppError("BLOCKED_TARGET_RESOLUTION", "Frozen hedef listesi bos; hedef cozumleme sembol uretemedi", {
      reason_code: "NO_TARGETS",
    });
  }
  for (const target of targets) {
    if (target.snapshot_id !== snapshotId) {
      throw new AppError("BLOCKED_TARGET_RESOLUTION", `Hedef snapshot kimligi uymuyor: ${target.fqn}`, {
        reason_code: "SNAPSHOT_MISMATCH",
      });
    }
    if (target.source_set === "unknown") {
      throw new AppError("BLOCKED_TARGET_RESOLUTION", `Belirsiz source-set hedefi kabul edilmez: ${target.fqn}`, {
        reason_code: "AMBIGUOUS_SOURCE_SET",
      });
    }
  }
  const seen = new Set<string>();
  for (const target of targets) {
    const key = `${target.fqn}|${target.module_path}|${target.source_set}|${target.relative_path}|${target.snapshot_id}`;
    if (seen.has(key)) {
      throw new AppError("BLOCKED_TARGET_RESOLUTION", `Mukerrer concrete hedef: ${target.fqn}`, {
        reason_code: "DUPLICATE_TARGET",
      });
    }
    seen.add(key);
  }
  if (targets.length > maxConcreteTargets) {
    throw new AppError(
      "BLOCKED_TARGET_RESOLUTION",
      `Expansion limiti asildi: ${targets.length} concrete hedef > ${maxConcreteTargets} (max_concrete_targets)`,
      { reason_code: "EXPANSION_LIMIT_EXCEEDED" },
    );
  }
  const ordered = [...targets].sort((a, b) =>
    `${a.fqn}|${a.module_path}`.localeCompare(`${b.fqn}|${b.module_path}`),
  );
  return {
    digest: sha256Hex(JSON.stringify(ordered.map((t) => [t.fqn, t.module_path, t.source_set, t.relative_path, t.snapshot_id]))),
    targets: ordered,
    selector_count: selectorCount,
    target_count: ordered.length,
    max_concrete_targets: maxConcreteTargets,
  };
}

/**
 * P05/PR06: concrete hedeflerden (selector baglantisiz) frozen digest yeniden uretir.
 * Dispatcher, goal'daki concrete listeyi (duplicate'lari birakarak) bu yolla siralar
 * ve servis tarafindaki concrete_targets_digest ile birebir karsilastirir. Ayni
 * concrete'in birden fazla selector'a uymasi digest'i bozamaz (set semantigi).
 */
export function rebuildFrozenTargetDigest(concretes: ConcreteTarget[]): string {
  const unique = new Map<string, ConcreteTarget>();
  for (const c of concretes) {
    const key = `${c.fqn}|${c.module_path}|${c.source_set}|${c.relative_path}|${c.snapshot_id}`;
    if (!unique.has(key)) {
      unique.set(key, c);
    }
  }
  const ordered = [...unique.values()].sort((a, b) =>
    `${a.fqn}|${a.module_path}`.localeCompare(`${b.fqn}|${b.module_path}`),
  );
  return sha256Hex(JSON.stringify(ordered.map((t) => [t.fqn, t.module_path, t.source_set, t.relative_path, t.snapshot_id])));
}

export interface ResolvableSymbol {
  symbol_id: string;
  fqn: string;
  simple_name: string;
  package_name: string;
  module_relative_path: string;
  relative_path: string;
  source_set: "main" | "test" | "unknown";
  kind: string;
}

export interface ResolvedClassTarget {
  selector: string;
  symbol_id: string;
  fqn: string;
  module_relative_path: string;
  relative_path: string;
}

export interface TargetResolutionResult {
  resolved: ResolvedClassTarget[];
  ambiguous: Array<{ selector: string; candidates: string[] }>;
  not_found: string[];
}

/**
 * Class selector exact FQCN ile cozulur. Simple name'de tum eslesmeler bulunur; suffix oyuna izin yok:
 * `PaymentService` selector'u `OtherPaymentService`'i eslestirmez.
 */
export function matchesClassSelector(symbol: ResolvableSymbol, selector: string): boolean {
  if (symbol.fqn === selector) {
    return true;
  }
  // simple name exact eslesme (suffix oyunu yok):
  if (symbol.simple_name === selector) {
    return true;
  }
  // nested binary ad: `Outer$Inner` selector'u source FQCN `p.Outer.Inner` ile eslesir:
  if (selector.includes("$")) {
    const normalizedNested = selector.replace(/\$/g, ".");
    return symbol.fqn === normalizedNested;
  }
  return false;
}

/**
 * Package selector exact package boundary ile cozulur; son-ek aramasi degil.
 * `com.example.payment` selector'u `com.example.paymentOther` paketini eslestirMEZ.
 */
export function matchesPackageSelector(symbol: ResolvableSymbol, selector: string): boolean {
  if (symbol.package_name === selector) {
    return true;
  }
  // alt paket dahil etme explicit policy: subpackages=true parametresiyle acilir (varsayilan hayir)
  return false;
}

export function matchesPackageWithSubpackages(symbol: ResolvableSymbol, selector: string): boolean {
  return symbol.package_name === selector || symbol.package_name.startsWith(selector + ".");
}

/**
 * Test kaynak siniflari production target listesine GIREMEZ (7.4).
 */
export function filterProductionSymbols(symbols: ResolvableSymbol[]): ResolvableSymbol[] {
  return symbols.filter((s) => s.source_set !== "test");
}

export interface ResolveInput {
  selector: string;
  kind: "class" | "package" | "module";
  subpackages?: boolean;
}

/**
 * Tek hedef cozumleme yolu: class/package/module ayni fonksiyonlarla.
 * Belirsizlikte typed candidates; sessiz secim yok.
 */
export function resolveTargets(symbols: ResolvableSymbol[], inputs: ResolveInput[]): TargetResolutionResult {
  const productionSymbols = filterProductionSymbols(symbols);
  const resolved: ResolvedClassTarget[] = [];
  const ambiguous: Array<{ selector: string; candidates: string[] }> = [];
  const notFound: string[] = [];

  for (const input of inputs) {
    if (input.kind === "class") {
      const matches = productionSymbols.filter((s) => matchesClassSelector(s, input.selector));
      if (matches.length === 0) {
        notFound.push(input.selector);
        continue;
      }
      // exact FQCN tek eslesme:
      const exact = matches.filter((s) => s.fqn === input.selector);
      if (exact.length === 1) {
        const m = exact[0]!;
        resolved.push({ selector: input.selector, symbol_id: m.symbol_id, fqn: m.fqn, module_relative_path: m.module_relative_path, relative_path: m.relative_path });
        continue;
      }
      // simple name: ayni simple name farkli modulde bile belirsizse typed candidates:
      if (matches.length > 1) {
        const byModule = new Map<string, number>();
        for (const m of matches) {
          byModule.set(m.module_relative_path, (byModule.get(m.module_relative_path) ?? 0) + 1);
        }
        if (byModule.size > 1 || matches.length > 1) {
          ambiguous.push({ selector: input.selector, candidates: matches.map((m) => `${m.module_relative_path}: ${m.fqn}`) });
          continue;
        }
      }
      const m = matches[0]!;
      resolved.push({ selector: input.selector, symbol_id: m.symbol_id, fqn: m.fqn, module_relative_path: m.module_relative_path, relative_path: m.relative_path });
      continue;
    }
    if (input.kind === "package") {
      const matches = productionSymbols.filter((s) =>
        input.subpackages ? matchesPackageWithSubpackages(s, input.selector) : matchesPackageSelector(s, input.selector),
      );
      if (matches.length === 0) {
        notFound.push(input.selector);
        continue;
      }
      for (const m of matches) {
        resolved.push({ selector: input.selector, symbol_id: m.symbol_id, fqn: m.fqn, module_relative_path: m.module_relative_path, relative_path: m.relative_path });
      }
      continue;
    }
    if (input.kind === "module") {
      // module selector canonical relative module ID/path ile exact eslesir:
      const matches = productionSymbols.filter((s) => s.module_relative_path === input.selector);
      if (matches.length === 0) {
        notFound.push(input.selector);
        continue;
      }
      for (const m of matches) {
        resolved.push({ selector: input.selector, symbol_id: m.symbol_id, fqn: m.fqn, module_relative_path: m.module_relative_path, relative_path: m.relative_path });
      }
      continue;
    }
    throw new AppError("INVALID_PARAMETERS", `Bilinmeyen hedef turu: ${String((input as { kind?: string }).kind)}`);
  }

  return { resolved, ambiguous, not_found: notFound };
}
