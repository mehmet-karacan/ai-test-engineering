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
      methodBraceDepth += open - close;
      if (methodBraceDepth <= 0) {
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

  if (/assert\s*\(\s*true\s*\)/.test(content)) {
    findings.push({ rule_id: "TAUTOLOGICAL_ASSERT", severity: "critical", location: path, evidence: "assert(true)" });
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
  if (!hasAssertion) {
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

export function isSutShadowing(testPath: string, productionFqn: string): boolean {
  const normalized = testPath.replace(/\\/g, "/");
  const productionAsPath = productionFqn.replace(/\./g, "/");
  return normalized.includes(productionAsPath) && normalized.includes("/src/main/");
}

export function detectProductionPathWrite(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized === "src/main/" || normalized.startsWith("src/main/") || normalized.includes("/src/main/") || normalized === "pom.xml" || normalized.endsWith("/pom.xml") || normalized === "build.gradle" || normalized.endsWith("/build.gradle");
}
