/**
 * FIN04/7.4: Hedef cozumleme - exact FQCN, package boundary, module kimligi.
 * - Class selector: exact FQCN tercih edilir; simple name'de tum eslesmeler bulunur.
 * - FQCN suffix ile `PaymentService` ve `OtherPaymentService` KARISTIRILMAZ (son-ek aramasi yasak).
 * - Package selector: exact package boundary; `%package.` son-ek aramasi kullanilmaz.
 * - Test kaynak siniflari production target listesine GIREMEZ.
 * - Nested binary ad `$` ile source FQCN farki korunur.
 */
import { AppError } from "../domain/errors.js";

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
