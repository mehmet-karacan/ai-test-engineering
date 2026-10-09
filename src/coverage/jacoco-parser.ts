/**
 * JaCoCo XML parser: counter'lar, class provenance, satir eslesmesi.
 * External entity/DTD network resolution yapmaz; buyuk/derin XML sinirlari bulunur.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../domain/errors.js";

export type CounterKind = "LINE" | "BRANCH" | "INSTRUCTION" | "COMPLEXITY" | "METHOD" | "CLASS";

export interface Counter {
  type: CounterKind;
  missed: number;
  covered: number;
}

export interface JaCoCoClass {
  name: string;
  sourcefilename: string;
  line: number | null;
  counters: Counter[];
  methods: Array<{ name: string; desc: string | null; line: number | null; counters: Counter[] }>;
}

export interface JaCoCoSourceFile {
  name: string;
  counters: Counter[];
  lines: Array<{ nr: number; mi: number; ci: number; mb: number; cb: number }>;
}

export interface JaCoCoPackage {
  name: string;
  classes: JaCoCoClass[];
  sourcefiles: JaCoCoSourceFile[];
}

export interface JaCoCoReport {
  session_infos: Array<{ id: string; start: number; dump: number }>;
  packages: JaCoCoPackage[];
  counters: Counter[];
}

const MAX_XML_BYTES = 128 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  isArray: (name) => name === "package" || name === "class" || name === "method" || name === "counter" || name === "sourcefile" || name === "line" || name === "sessioninfo",
});

function toInt(value: unknown): number {
  const n = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseCounters(raw: unknown): Counter[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw.map((c: Record<string, unknown>) => ({
    type: String(c["@_type"] ?? "") as CounterKind,
    missed: toInt(c["@_missed"]),
    covered: toInt(c["@_covered"]),
  })).filter((c: Counter) => ["LINE", "BRANCH", "INSTRUCTION", "COMPLEXITY", "METHOD", "CLASS"].includes(c.type));
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function parseJacocoXml(xmlPath: string): JaCoCoReport {
  const absPath = xmlPath;
  if (!existsSync(absPath)) {
    throw new AppError("INVALID_PARAMETERS", `JaCoCo XML bulunamadi: ${xmlPath}`);
  }
  const stats = statSync(absPath);
  if (stats.size > MAX_XML_BYTES) {
    throw new AppError("POLICY_VIOLATION", `XML boyutu siniri asildi: ${stats.size} > ${MAX_XML_BYTES}`);
  }
  let raw: Record<string, unknown>;
  try {
    raw = parser.parse(readFileSync(absPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new AppError("INVALID_PARAMETERS", `JaCoCo XML parse hatasi: ${xmlPath}`, { cause: String(error) });
  }

  const report = raw["report"] as Record<string, unknown> | undefined;
  if (!report) {
    throw new AppError("INVALID_COVERAGE_EVIDENCE", `Gecersiz JaCoCo XML (report element yok): ${xmlPath}`);
  }

  const sessionInfos = arrayify(report["sessioninfo"] as Array<Record<string, unknown>> | Record<string, unknown>).map((s) => ({
    id: String(s["@_id"] ?? ""),
    start: toInt(s["@_start"]),
    dump: toInt(s["@_dump"]),
  }));

  const packages = arrayify(report["package"] as Array<Record<string, unknown>> | Record<string, unknown>).map((pkg) => {
    const classes = arrayify(pkg["class"] as Array<Record<string, unknown>> | Record<string, unknown>).map((cls) => ({
      name: String(cls["@_name"] ?? ""),
      sourcefilename: String(cls["@_sourcefilename"] ?? ""),
      line: cls["@_line"] !== undefined ? toInt(cls["@_line"]) : null,
      counters: parseCounters(cls["counter"]),
      methods: arrayify(cls["method"] as Array<Record<string, unknown>> | Record<string, unknown>).map((m) => ({
        name: String(m["@_name"] ?? ""),
        desc: m["@_desc"] !== undefined ? String(m["@_desc"]) : null,
        line: m["@_line"] !== undefined ? toInt(m["@_line"]) : null,
        counters: parseCounters(m["counter"]),
      })),
    }));
    const sourcefiles = arrayify(pkg["sourcefile"] as Array<Record<string, unknown>> | Record<string, unknown>).map((sf) => ({
      name: String(sf["@_name"] ?? ""),
      counters: parseCounters(sf["counter"]),
      lines: arrayify(sf["line"] as Array<Record<string, unknown>> | Record<string, unknown>).map((l) => ({
        nr: toInt(l["@_nr"]),
        mi: toInt(l["@_mi"]),
        ci: toInt(l["@_ci"]),
        mb: toInt(l["@_mb"]),
        cb: toInt(l["@_cb"]),
      })),
    }));
    return {
      name: String(pkg["@_name"] ?? ""),
      classes,
      sourcefiles,
    };
  });

  const counters = parseCounters(report["counter"]);

  return { session_infos: sessionInfos, packages, counters };
}

export function findCounter(counters: Counter[], kind: CounterKind): Counter | undefined {
  return counters.find((c) => c.type === kind);
}

export function counterValue(counters: Counter[], kind: CounterKind): { missed: number; covered: number } | undefined {
  const counter = findCounter(counters, kind);
  if (!counter) {
    return undefined;
  }
  return { missed: counter.missed, covered: counter.covered };
}

export interface ClassLookupResult {
  fqn: string;
  sourcefilename: string;
  package_name: string;
  line: { missed: number; covered: number } | undefined;
  branch: { missed: number; covered: number } | undefined;
  methods: Array<{ name: string; line: number | null; line_counter: { missed: number; covered: number } | undefined }>;
}

export function findClassInReport(report: JaCoCoReport, fqn: string): ClassLookupResult | undefined {
  const slashName = fqn.replace(/\./g, "/");
  for (const pkg of report.packages) {
    for (const cls of pkg.classes) {
      if (cls.name === slashName || cls.name === fqn) {
        return {
          fqn,
          sourcefilename: cls.sourcefilename,
          package_name: pkg.name,
          line: counterValue(cls.counters, "LINE"),
          branch: counterValue(cls.counters, "BRANCH"),
          methods: cls.methods.map((m) => ({
            name: m.name,
            line: m.line,
            line_counter: counterValue(m.counters, "LINE"),
          })),
        };
      }
    }
  }
  return undefined;
}
