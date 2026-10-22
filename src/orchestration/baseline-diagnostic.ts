import { closeSync, openSync, readSync, realpathSync, fstatSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { homedir } from "node:os";
import { redactSensitive, redactUserPath } from "../reporting/patch-artifact.js";

export interface BaselineDiagnostic { error_excerpt: string[]; hint: string }
interface Input { execution_root: string; reason_code: string | null; skip_config_detected: string[]; run: { stdout_log_path: string; stderr_log_path: string } | null }
/** Bounded local excerpts, copied into the immutable failure artifact. No arbitrary log endpoint. */
export function baselineDiagnostic(baseline: Input): BaselineDiagnostic {
  const lines: string[] = [];
  for (const path of baseline.run ? [baseline.run.stdout_log_path, baseline.run.stderr_log_path] : []) {
    let fd: number | undefined;
    try {
      const rel = relative(realpathSync(baseline.execution_root), realpathSync(path));
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
      fd = openSync(path, "r"); const size = fstatSync(fd).size;
      const bytes = Buffer.alloc(Math.min(size, 128 * 1024));
      const count = readSync(fd, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
      for (const raw of bytes.subarray(0, count).toString("utf8").split(/\r?\n/)) {
        // Strip Maven ANSI escape sequences before matching ERROR lines.
        // eslint-disable-next-line no-control-regex
        const line = raw.replace(/\x1b\[[0-9;]*m/g, "");
        if (!/^\[ERROR\]/.test(line) || /^\[ERROR\]\s*$/.test(line)) continue;
        lines.push(redactUserPath(redactSensitive(line).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@"), homedir()).slice(0, 400));
      }
    } catch { /* Missing/unreadable logs cannot hide the original failure code. */ }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  const hint = baseline.reason_code === "NO_DISCOVERED_TESTS" && baseline.skip_config_detected.length
    ? "POM testleri atliyor (skipTests/maven.test.skip). Proje profilinde calisma kopyasi icin unit-test override acilmali; gercek test sonucu olmadan kapsam hesaplanmaz."
    : lines.some(line => /COMPILATION ERROR|cannot find symbol|invalid target release/.test(line))
      ? "Derleme tamamlanamadi. Projenin istedigi JDK ile secili JDK ve annotation processor ayarlarini kontrol edin."
      : "Maven veya mevcut testler basarisiz. Asagidaki hata ozetini ve yerel Maven loglarini inceleyin; kapsam sonucu uretilmedi.";
  return { error_excerpt: [...new Set(lines)].slice(0, 12), hint };
}
