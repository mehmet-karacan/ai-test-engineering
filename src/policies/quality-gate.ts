/**
 * Kalite kapilari: hard gate (deterministik) tespitler.
 * Bos/tautolojik assertion, SUT shadowing, skip annotation, assertion'siz test tespiti.
 */
import { AppError } from "../domain/errors.js";

export interface QualityFinding {
  rule_id: string;
  severity: "critical" | "major" | "minor" | "info";
  location: string;
  evidence: string;
}

export interface QualityScanResult {
  passed: boolean;
  findings: QualityFinding[];
}

const TEST_METHOD_RE = /(?:@Test\b|@ParameterizedTest\b|@RepeatedTest\b|@TestFactory\b)/;

export function scanTestQuality(content: string, path: string): QualityScanResult {
  const findings: QualityFinding[] = [];
  const lines = content.split(/\r?\n/);

  let inMethod = false;
  let methodBraceDepth = 0;
  let methodStartLine = 0;
  let methodBody: string[] = [];
  let classBraceDepth = 0;
  let hasTestMethod = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const open = (line.match(/\{/g) ?? []).length;
    const close = (line.match(/\}/g) ?? []).length;

    if (/@Disabled\b/.test(line) || /@Ignore\b/.test(line)) {
      findings.push({ rule_id: "SKIP_ANNOTATION", severity: "critical", location: `${path}:${i + 1}`, evidence: line.trim() });
    }

    if (!inMethod && TEST_METHOD_RE.test(line)) {
      hasTestMethod = true;
      inMethod = true;
      methodBraceDepth = 0;
      methodStartLine = i + 1;
      methodBody = [];
      methodBody.push(line);
      const hasMethodDeclaration = /\(\s*[^)]*\s*\)\s*\{/.test(line) || /\(\s*\)\s*\{/.test(line);
      methodBraceDepth += open - close;
      if (methodBraceDepth <= 0 && hasMethodDeclaration) {
        const bodyText = methodBody.join("\n");
        checkMethodBody(bodyText, path, methodStartLine, findings);
        inMethod = false;
      }
      classBraceDepth += open - close;
      continue;
    }

    if (inMethod) {
      methodBody.push(line);
      methodBraceDepth += open - close;
      if (methodBraceDepth <= 0) {
        const bodyText = methodBody.join("\n");
        checkMethodBody(bodyText, path, methodStartLine, findings);
        inMethod = false;
      }
      classBraceDepth += open - close;
      continue;
    }

    classBraceDepth += open - close;
  }

  // D07/F09: tautoloji acigi - assertTrue(true)/assertEquals(x,x)/self-comparison da tautolojik.
  if (/assert\s*\(\s*true\s*\)/.test(content) || /assertTrue\s*\(\s*true\s*\)/.test(content)) {
    findings.push({ rule_id: "TAUTOLOGICAL_ASSERT", severity: "critical", location: path, evidence: "assert(true)" });
  }
  const selfComparison = /assert\w*\s*\(\s*[^,()]+,\s*([^,()]+)\s*\)/.exec(content);
  if (selfComparison && selfComparison[1] && selfComparison[0].includes(selfComparison[1]) && /assert(Equals|NotEquals|Same|NotSame)\s*\(\s*(\w+)\s*,\s*\2\s*\)/.test(content)) {
    findings.push({ rule_id: "SELF_COMPARISON", severity: "critical", location: path, evidence: selfComparison[0] });
  }

  if (hasTestMethod && findings.every((f) => f.rule_id !== "NO_ASSERTION")) {
    const onlyNotNull = /\bassertNotNull\s*\(/.test(content) && !/assert(Throws|Equals|NotEquals|True|False|Iterable|Array)\s*\(/.test(content) && !/\bverify\s*\(/.test(content) && !/\bfail\s*\(/.test(content);
    if (onlyNotNull) {
      findings.push({ rule_id: "WEAK_ONLY_NOTNULL", severity: "major", location: path, evidence: "yalniz assertNotNull" });
    }
  }

  if (!hasTestMethod) {
    findings.push({ rule_id: "EMPTY_TEST_CLASS", severity: "critical", location: path, evidence: "test metodu yok" });
  }

  return { passed: findings.every((f) => f.severity !== "critical" && f.severity !== "major"), findings };
}

function checkMethodBody(bodyText: string, path: string, line: number, findings: QualityFinding[]): void {
  const hasAssertion = /\bassert\w*\s*\(/.test(bodyText) || /\bverify\s*\(/.test(bodyText) || /\bfail\s*\(/.test(bodyText);
  // FIN08/13.1/PRO33: JUnit4 expected exception annotation'i anlamli bir test oracle'idir;
  // yalniz `assert` regex'i olmadigi icin yanlis reddedilmeZ.
  const hasExpectedException = /@Test\s*\(\s*expected\s*=/.test(bodyText);
  if (!hasAssertion && !hasExpectedException) {
    findings.push({ rule_id: "NO_ASSERTION", severity: "critical", location: `${path}:${line}`, evidence: bodyText.trim().slice(0, 200) });
  }
}

export function assertQualityGate(content: string, path: string): void {
  const result = scanTestQuality(content, path);
  if (!result.passed) {
    throw new AppError("POLICY_VIOLATION", `Kalite kapisi basarisiz: ${path}`, {
      reason_code: "QUALITY_GATE_FAILED",
      findings: result.findings,
    });
  }
}

/**
 * D07/F09: SUT shadowing tespiti - test kaynaginda production FQCN ile aynI sinif tanimi (shadow) var mi.
 * Yalniz yol degil, sinif bildirimini kontrol eder.
 */
export function isSutShadowing(testPath: string, testContent: string, productionFqn: string): boolean {
  const productionSimple = productionFqn.split(".").pop() ?? productionFqn;
  const productionPackage = productionFqn.split(".").slice(0, -1).join(".");
  // test kaynaginda aynI simple name ile sinif bildirimi:
  const classDecl = new RegExp(`class\\s+${productionSimple}\\b`).test(testContent);
  if (!classDecl) {
    return false;
  }
  // aynI pakette (shadow) veya package bildirimi yok:
  const packageMatch = /^\s*package\s+([\w.]+)\s*;/.exec(testContent);
  const testPackage = packageMatch?.[1] ?? "";
  if (testPackage === productionPackage) {
    return true;
  }
  return false;
}

export function detectProductionPathWrite(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized === "src/main/" || normalized.startsWith("src/main/") || normalized.includes("/src/main/") || normalized === "pom.xml" || normalized.endsWith("/pom.xml") || normalized === "build.gradle" || normalized.endsWith("/build.gradle");
}
