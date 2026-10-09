/**
 * Test degisikligi allowlist'i ve policy guard.
 * Yazilabilir test root'lari effective project modelinden alinir; yasakli path'ler reddedilir.
 */
import { resolve, relative, sep, isAbsolute } from "node:path";
import { AppError } from "../domain/errors.js";

export interface AllowedTestRoot {
  module_relative_path: string;
  test_root: string;
}

export interface PatchAction {
  path: string;
  action: "create" | "modify" | "delete";
}

export interface PolicyDecision {
  allowed: boolean;
  reason_code: string;
  reason: string;
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; code: string; reason: string }> = [
  { pattern: /(^|[\\/])\.git([\\/]|$)/i, code: "GIT_DIR", reason: ".git dizini degistirilemez" },
  { pattern: /(^|[\\/])\.mvn([\\/]|$)/i, code: "MVN_DIR", reason: ".mvn dizini degistirilemez" },
  { pattern: /(^|[\\/])src[\\/]main([\\/]|$)/i, code: "PRODUCTION_SOURCE", reason: "Production kaynak degistirilemez" },
  { pattern: /(^|[\\/])pom\.xml$/i, code: "POM", reason: "POM degistirilemez" },
  { pattern: /(^|[\\/])build\.gradle(\.kts)?$/i, code: "BUILD_GRADLE", reason: "Gradle build dosyasi degistirilemez" },
  { pattern: /(^|[\\/])settings\.gradle(\.kts)?$/i, code: "SETTINGS_GRADLE", reason: "Gradle settings degistirilemez" },
  { pattern: /(^|[\\/])gradlew(\.bat)?$/i, code: "WRAPPER", reason: "Gradle wrapper degistirilemez" },
  { pattern: /(^|[\\/])maven\.properties$/i, code: "MAVEN_PROPERTIES", reason: "Maven properties degistirilemez" },
  { pattern: /(^|[\\/])jvm\.config$/i, code: "JVM_CONFIG", reason: "JVM config degistirilemez" },
  { pattern: /(^|[\\/])coverage[^\\/]*\.xml$/i, code: "COVERAGE_REPORT", reason: "Coverage raporu elle degistirilemez" },
  { pattern: /(^|[\\/])jaoco?co\.exec$/i, code: "EXEC_FILE", reason: "JaCoCo exec dosyasi elle degistirilemez" },
  { pattern: /(^|[\\/])META-INF([\\/]|$)/i, code: "META_INF", reason: "META-INF degistirilemez" },
];

export class PolicyGuard {
  private readonly allowedTestRoots: AllowedTestRoot[];
  private readonly projectRoot: string;

  constructor(projectRoot: string, allowedTestRoots: AllowedTestRoot[]) {
    this.projectRoot = resolve(projectRoot);
    this.allowedTestRoots = allowedTestRoots;
  }

  checkPath(relativePath: string): PolicyDecision {
    const normalized = relativePath.replace(/\\/g, "/");
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(normalized)) {
        return { allowed: false, reason_code: forbidden.code, reason: forbidden.reason };
      }
    }
    const absPath = resolve(this.projectRoot, relativePath.replace(/\//g, sep));
    const relCheck = relative(this.projectRoot, absPath);
    if (relCheck.startsWith("..") || isAbsolute(relCheck)) {
      return { allowed: false, reason_code: "PATH_ESCAPE", reason: "Proje koku disina cikiyor" };
    }
    const inAllowedRoot = this.allowedTestRoots.some((root) => {
      const rootPrefix = [root.module_relative_path, root.test_root].filter((p) => p.length > 0).join("/");
      return normalized === rootPrefix || normalized.startsWith(rootPrefix + "/");
    });
    if (!inAllowedRoot) {
      return { allowed: false, reason_code: "NOT_TEST_ROOT", reason: "Izin verilen test koku disinda" };
    }
    return { allowed: true, reason_code: "OK", reason: "Izin verilen test koku icinde" };
  }

  checkPatch(actions: PatchAction[]): void {
    for (const action of actions) {
      const decision = this.checkPath(action.path);
      if (!decision.allowed) {
        throw new AppError("POLICY_VIOLATION", `${decision.reason} (${action.path})`, {
          reason_code: decision.reason_code,
          path: action.path,
        });
      }
    }
  }

  static disabledAnnotations(content: string): Array<{ line: number; match: string }> {
    const lines = content.split(/\r?\n/);
    const findings: Array<{ line: number; match: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/@Disabled\b/.test(line) || /@Ignore\b/.test(line) || /\bAssume\.\w+\(/.test(line) || /assumeTrue\(/.test(line) || /assumeFalse\(/.test(line)) {
        findings.push({ line: i + 1, match: line.trim() });
      }
    }
    return findings;
  }

  static assertNoDisabled(content: string, path: string): void {
    const findings = this.disabledAnnotations(content);
    if (findings.length > 0) {
      throw new AppError("POLICY_VIOLATION", `Yeni @Disabled/@Ignore/assumption yasak: ${path}`, {
        reason_code: "NEW_DISABLED",
        findings,
      });
    }
  }
}
