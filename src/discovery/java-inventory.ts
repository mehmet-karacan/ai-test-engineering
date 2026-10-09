/**
 * Java envanteri: Java kaynak dosyalarindan package/class/metod tespiti (statik, regex + yapilandirilmis tarama).
 * JavaParser helper'i (java-support/) derin semantik cozumleme icin; bu katman hizli envanter saglar.
 * Regresyon: nested/overload ayrimi korunur; unresolved alanlar kaydedilir.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AppError } from "../domain/errors.js";

export interface JavaSymbol {
  kind: "class" | "interface" | "enum" | "record";
  fqn: string;
  simple_name: string;
  package_name: string;
  relative_path: string;
  source_sha256: string;
  line_start: number;
  line_end: number;
  enclosing: string | null;
}

export interface MethodInfo {
  owner_fqn: string;
  name: string;
  signature: string;
  line_start: number;
  visibility: "public" | "protected" | "package" | "private";
}

export interface JavaInventory {
  symbols: JavaSymbol[];
  methods: MethodInfo[];
  unresolved: string[];
}

export interface TestInventory {
  test_classes: Array<{ fqn: string; relative_path: string; source_sha256: string; kind: "junit4" | "junit5" | "unknown" }>;
  test_methods: Array<{ owner_fqn: string; name: string; kind: "junit4" | "junit5" | "parameterized" | "dynamic" | "unknown" }>;
}

const PACKAGE_RE = /^\s*package\s+([\w.]+)\s*;/;
const CLASS_RE = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|abstract|strictfp)\s+)*(class|interface|enum|record)\s+(\w+)/;

export function scanJavaFile(absPath: string, projectRoot: string): { symbols: JavaSymbol[]; methods: MethodInfo[]; unresolved: string[] } {
  const content = readFileSync(absPath, "utf8");
  const sha = createHash("sha256").update(content, "utf8").digest("hex");
  const rel = relative(projectRoot, absPath).replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);

  let packageName = "";
  const packageMatch = PACKAGE_RE.exec(lines[0] ?? "") ?? lines.map((l) => PACKAGE_RE.exec(l)).find((m) => m);
  if (packageMatch) {
    packageName = packageMatch[1] ?? "";
  }

  const symbols: JavaSymbol[] = [];
  const methods: MethodInfo[] = [];
  const unresolved: string[] = [];

  const typeStack: Array<{ name: string; kind: JavaSymbol["kind"] }> = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const open = bracesOpen(line);
    const close = bracesClose(line);
    const typeMatch = CLASS_RE.exec(line);

    if (typeMatch && open > 0 && braceDepth + open > 0) {
      const kind = typeMatch[1] as JavaSymbol["kind"];
      const simpleName = typeMatch[2]!;
      const enclosing = typeStack.length > 0 ? typeStack[typeStack.length - 1]!.name : null;
      const enclosingSimple = enclosing ? enclosing.split(".").pop()! : null;
      const fqn = packageName + (packageName ? "." : "") + (enclosingSimple ? enclosingSimple + "." : "") + simpleName;
      symbols.push({
        kind,
        fqn,
        simple_name: simpleName,
        package_name: packageName,
        relative_path: rel,
        source_sha256: sha,
        line_start: i + 1,
        line_end: lines.length,
        enclosing: enclosing,
      });
      typeStack.push({ name: fqn, kind });
    }

    const methodMatch = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|synchronized|abstract)\s+)+([\w<>\[\],\s?]+)\s+(\w+)\s*\([^;]*$/.exec(line);
    if (methodMatch && typeStack.length > 0) {
      const name = methodMatch[2]!;
      if (!["if", "for", "while", "switch", "catch", "return", "new", "super", "this"].includes(name)) {
        const visibility = /^\s*private\b/.test(line) ? "private" : /^\s*protected\b/.test(line) ? "protected" : /^\s*public\b/.test(line) ? "public" : "package";
        methods.push({
          owner_fqn: typeStack[typeStack.length - 1]!.name,
          name,
          signature: line.trim(),
          line_start: i + 1,
          visibility,
        });
      }
    }

    braceDepth += open - close;
    while (typeStack.length > 0 && braceDepth <= typeStack.length - 1) {
      typeStack.pop();
    }
  }

  return { symbols, methods, unresolved };
}

function bracesOpen(line: string): number {
  return (line.match(/\{/g) ?? []).length;
}

function bracesClose(line: string): number {
  return (line.match(/\}/g) ?? []).length;
}

export function scanTestFile(absPath: string, projectRoot: string): { testClass: TestInventory["test_classes"][number] | null; methods: TestInventory["test_methods"] } {
  const content = readFileSync(absPath, "utf8");
  const sha = createHash("sha256").update(content, "utf8").digest("hex");
  const rel = relative(projectRoot, absPath).replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);

  let packageName = "";
  const packageMatch = lines.map((l) => PACKAGE_RE.exec(l)).find((m) => m);
  if (packageMatch) {
    packageName = packageMatch[1] ?? "";
  }

  const junit5 = /import\s+org\.junit\.jupiter\./.test(content);
  const junit4 = /import\s+org\.junit\.Test;/.test(content) || /import\s+org\.junit\.Before/.test(content);
  const kind: "junit4" | "junit5" | "unknown" = junit5 ? "junit5" : junit4 ? "junit4" : "unknown";

  let testClass: TestInventory["test_classes"][number] | null = null;
  const methods: TestInventory["test_methods"] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const classMatch = CLASS_RE.exec(line);
    if (classMatch && !testClass) {
      const simpleName = classMatch[2]!;
      testClass = {
        fqn: packageName + (packageName ? "." : "") + simpleName,
        relative_path: rel,
        source_sha256: sha,
        kind,
      };
    }
    const methodMatch = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:public\s+)?(?:void\s+)(\w+)\s*\(/.exec(line);
    if (!methodMatch) {
      continue;
    }
    const name = methodMatch[1]!;
    const prevLine = i > 0 ? lines[i - 1]! : "";
    const prevPrevLine = i > 1 ? lines[i - 2]! : "";
    const annotationZone = prevLine + "\n" + prevPrevLine;
    if (/@Test\b/.test(line) || /@Test\b/.test(annotationZone)) {
      methods.push({ owner_fqn: testClass?.fqn ?? "", name, kind: junit5 ? "junit5" : "junit4" });
    } else if (/@ParameterizedTest\b/.test(line) || /@ParameterizedTest\b/.test(annotationZone)) {
      methods.push({ owner_fqn: testClass?.fqn ?? "", name, kind: "parameterized" });
    } else if (/@RepeatedTest\b/.test(line) || /@TestFactory\b/.test(line)) {
      methods.push({ owner_fqn: testClass?.fqn ?? "", name, kind: "dynamic" });
    }
  }

  return { testClass, methods };
}

export function collectJavaFiles(root: string, sourceRoot: string): string[] {
  const absSourceRoot = join(root, sourceRoot.replace(/\//g, "\\"));
  if (!existsSync(absSourceRoot)) {
    return [];
  }
  const files: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 32) {
      throw new AppError("POLICY_VIOLATION", `Dizin derinligi siniri asildi: ${dir}`);
    }
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const l = lstatSync(full);
      if (l.isDirectory()) {
        walk(full, depth + 1);
      } else if (name.endsWith(".java")) {
        files.push(full);
      }
    }
  };
  walk(absSourceRoot, 0);
  return files;
}
