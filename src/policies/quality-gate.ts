/**
 * Kalite kapilari: hard gate (deterministik) tespitler.
 * Bos/tautolojik assertion, SUT shadowing, skip annotation, assertion'siz test tespiti.
 * Java kaynak metni once string/char literal ve yorumlardan arindirilir; boylece yorum/string
 * icindeki assertion benzeri metin assertion sayilmaz (F02/Q03/Q04). JUnit5 tam nitelikli
 * anotasyonlar ve JUnit4 expected exception oracle'i taninir (F02/Q07). Fluent assertion
 * zincirleri terminal dogrulama olmadan kabul edilmez (F02/Q06).
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

const TEST_METHOD_RE = /@(?:[\w.]*\.)?(?:Test|ParameterizedTest|RepeatedTest|TestFactory)\b/;

/**
 * F02/Q03/Q04: Java kaynak metnini string/char literal ve yorumlardan arindirir.
 * Literal icindekiler orijinal tirnak karakteriyle korunur; yorumlar bosaltilir.
 * Boylece `// assertEquals(...)` veya `String s = "assertEquals(42, actual)"` assertion sayilmaz.
 */
function stripLiteralsAndComments(content: string): string {
  let out = "";
  let i = 0;
  const n = content.length;
  while (i < n) {
    const ch = content[i]!;
    const next = i + 1 < n ? content[i + 1]! : "";
    if (ch === "/" && next === "/") {
      while (i < n && content[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = content.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      // Yorumun icindeki yeni satirlari koru; satir numaralari kaymasin.
      for (let j = i; j < stop; j++) {
        out += content[j] === "\n" ? "\n" : " ";
      }
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += quote;
      i++;
      while (i < n) {
        const c = content[i]!;
        if (c === "\\" && i + 1 < n) {
          out += "  ";
          i += 2;
          continue;
        }
        if (c === quote) {
          out += quote;
          i++;
          break;
        }
        out += c === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function hasMockitoVerification(maskedText: string): boolean {
  return /\bverify\s*\(/.test(maskedText)
    || /\bverify(?:NoInteractions|NoMoreInteractions|ZeroInteractions)\s*\(\s*[A-Za-z_$][\w$]*(?=\s*[,.)])/.test(maskedText);
}

/**
 * F02/Q05/Q06: Terminal dogrulamasi olan fluent assertion zincirlerini tanir.
 * JUnit/AssertJ/Truth: isEqualTo/hasXxx/contains... sonrasi isTrue veya bir match/verify terminali.
 * Biriken zincirler (terminal olmadan kapanan) assertion sayilmaz.
 */
function hasMeaningfulAssertion(bodyText: string): boolean {
  const text = stripLiteralsAndComments(bodyText);

  // 1) JUnit benzeri dogrudan assertion cagrilari; assertThat HARIC (fluent zincir asagida
  // terminal dogrulamasiyla degerlendirilir; F02/Q06: terminal'siz assertThat assertion sayilmaz).
  const directAssertRe = /\bassert(?!That\b)[A-Za-z]*\s*\(/;
  if (directAssertRe.test(text)) {
    // assertTrue(true)/assertFalse(false)/assertTrue(x == x) tautolojisi yine de tespit edilmeli.
    return true;
  }

  // 2) Mockito verify ve fail() anlamli oracle sayilir (AC34/13.2); yanlis ret olmasin.
  if (hasMockitoVerification(text) || /\bfail\s*\(/.test(text)) {
    return true;
  }

  // 3) Fluent zincir: assertThat(...) ile baslar, terminal dogrulama ile biter (F02/Q06).
  const fluentStartRe = /\bassertThat\s*\(/g;
  // Terminal dogrulama: JUnit kadar genel degil; AssertJ/Truth tarzi dogrulama metodlari.
  const terminalRe = /\.(is(?:True|False|EqualTo|NotEqualTo|Null|NotNull|SameAs?|NotSameAs?)|has(?:Size|Value|Key|Entry|Field)|contains(?:Exactly|InOrder|Only|All|AnyOf|ExactlyInAnyOrder)?|doesNotContain|startsWith|endsWith|matches|extractingValueFrom|satisfies|returns|isInstanceOf)\s*\(/;
  for (const start of text.matchAll(fluentStartRe)) {
    const statementEnd = text.indexOf(";", start.index);
    const expression = text.slice(start.index, statementEnd < 0 ? undefined : statementEnd);
    if (terminalRe.test(expression)) return true;
  }
  return false;
}

export function scanTestQuality(content: string, path: string): QualityScanResult {
  const findings: QualityFinding[] = [];
  // F02: tarama ham metin uzerinde degil, literal/yorum maskeli metin uzerinde yapilir.
  // Boylece yorum/string icindeki assertion benzeri metin kural atlama saglamaz.
  const lines = stripLiteralsAndComments(content).split(/\r?\n/);

  let inMethod = false;
  let methodBraceDepth = 0;
  let methodDeclarationSeen = false;
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
      methodDeclarationSeen = false;
      methodStartLine = i + 1;
      methodBody = [];
      methodBody.push(line);
      const hasMethodDeclaration = /\(\s*[^)]*\s*\)\s*\{/.test(line) || /\(\s*\)\s*\{/.test(line);
      methodDeclarationSeen = hasMethodDeclaration;
      methodBraceDepth += open - close;
      if (methodBraceDepth <= 0 && methodDeclarationSeen) {
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
      // Bir test anotasyonu method bildiriminden once tek basina kapanmaz;
      // @DisplayName/@Tag gibi anotasyonlar gorulene kadar method govdesini
      // taramayi ertele. Aksi halde yalniz anotasyon satirlari NO_ASSERTION
      // bulgusu uretir.
      if (!methodDeclarationSeen && (methodBraceDepth > 0 || /\(\s*[^)]*\s*\)\s*(?:throws\s+[^\{]+)?\{/.test(line))) {
        methodDeclarationSeen = true;
      }
      if (methodDeclarationSeen && methodBraceDepth <= 0) {
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
  // Tautoloji taramasi da literal/yorum maskeli metin uzerinde yapilir (F02/Q03/Q04).
  const maskedContent = stripLiteralsAndComments(content);
  if (/assert\s*\(\s*true\s*\)/.test(maskedContent) || /assertTrue\s*\(\s*true\s*\)/.test(maskedContent) || /assertFalse\s*\(\s*false\s*\)/.test(maskedContent)) {
    findings.push({ rule_id: "TAUTOLOGICAL_ASSERT", severity: "critical", location: path, evidence: "assert(true)" });
  }
  const selfComparison = /assert\w*\s*\(\s*[^,()]+,\s*([^,()]+)\s*\)/.exec(maskedContent);
  if (selfComparison && selfComparison[1] && selfComparison[0].includes(selfComparison[1]) && /assert(Equals|NotEquals|Same|NotSame)\s*\(\s*(\w+)\s*,\s*\2\s*\)/.test(maskedContent)) {
    findings.push({ rule_id: "SELF_COMPARISON", severity: "critical", location: path, evidence: selfComparison[0] });
  }

  if (hasTestMethod && findings.every((f) => f.rule_id !== "NO_ASSERTION")) {
    const onlyNotNull = /\bassertNotNull\s*\(/.test(maskedContent) && !/assert(Throws|Equals|NotEquals|True|False|Iterable|Array)\s*\(/.test(maskedContent) && !hasMockitoVerification(maskedContent) && !/\bfail\s*\(/.test(maskedContent);
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
  const hasAssertion = hasMeaningfulAssertion(bodyText);
  // FIN08/13.1/PRO33: JUnit4 expected exception annotation'i anlamli bir test oracle'idir;
  // yalniz `assert` regex'i olmadigi icin yanlis reddedilmeZ.
  const hasExpectedException = /@Test\s*\(\s*expected\s*=/.test(stripLiteralsAndComments(bodyText));
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
 * Yalniz yol degil, sinif bildirimini kontrol eder. Tarama literal/yorum maskeli metin uzerinde yapilir (F03/S02).
 */
export function isSutShadowing(testPath: string, testContent: string, productionFqn: string): boolean {
  const productionSimple = productionFqn.split(".").pop() ?? productionFqn;
  const productionPackage = productionFqn.split(".").slice(0, -1).join(".");
  // F03/S02: tarama literal/yorum maskeli metin uzerinde yapilir; boylece package
  // oncesi gecerli baslik yorumu sinif/paket tespitini engellemez.
  const masked = stripLiteralsAndComments(testContent);
  // test kaynaginda aynI simple name ile sinif bildirimi:
  const classDecl = new RegExp(`class\\s+${productionSimple}\\b`).test(masked);
  if (!classDecl) {
    return false;
  }
  // aynI pakette (shadow) veya package bildirimi yok:
  // F03/S02: package bildirimi sabit baslangic regex'iyle degil, maskeli metinde aranir;
  // package oncesi gecerli baslik yorumu tespiti engellemez.
  const packageMatch = /\bpackage\s+([\w.]+)\s*;/.exec(masked);
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
