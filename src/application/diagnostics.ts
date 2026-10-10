/**
 * FIN12/17.1: Ortak diagnostic servisi.
 * Kurulum, system_diagnose, project inspect ve job preflight AYNI kontrol implementation'larini kullanir.
 * Kontrol seviyeleri STATIC, CONNECTED, CAPABILITY_VERIFIED, LIVE_PIPELINE_VERIFIED ayridir (17.1).
 * Hata raporu: reason_code + etkilenen capability + retryable + tek somut sonraki aksiyon (17.1).
 */
export type DiagnosticLevel = "STATIC" | "CONNECTED" | "CAPABILITY_VERIFIED" | "LIVE_PIPELINE_VERIFIED" | "UNAVAILABLE";

export interface DiagnosticCheck {
  check_id: string;
  capability: string;
  level: DiagnosticLevel;
  reason_code: string | null;
  retryable: boolean;
  human_explanation: string;
  required_next_action: string | null;
}

export interface DiagnosticResult {
  overall_level: DiagnosticLevel;
  checks: DiagnosticCheck[];
  ready: boolean;
}

export interface DiagnosticInput {
  node_version: string;
  sqlite_version: string | null;
  config_readable: boolean;
  config_schema_ok: boolean;
  disk_free_bytes: number;
  db_path_writable: boolean;
  docker_available: boolean;
  maven_image_present: boolean;
  model_authorized: boolean;
  migrations_current: boolean;
  evidence_integrity_ok: boolean;
}

export const MIN_DISK_FREE_BYTES = 512 * 1024 * 1024;

/**
 * Tek ortak kontrol implementation'i: her yerde farkli gevsek kontrol yazilmaz.
 */
export function runDiagnostics(input: DiagnosticInput): DiagnosticResult {
  const checks: DiagnosticCheck[] = [];

  // Node/native/SQLite uyumu:
  checks.push(nodeCheck(input.node_version));
  checks.push(sqliteCheck(input.sqlite_version));
  checks.push(configCheck(input.config_readable, input.config_schema_ok));
  checks.push(diskCheck(input.disk_free_bytes));
  checks.push(dataRootCheck(input.db_path_writable));
  checks.push(dockerCheck(input.docker_available, input.maven_image_present));
  checks.push(modelCheck(input.model_authorized));
  checks.push(dbMaintenanceCheck(input.migrations_current, input.evidence_integrity_ok));

  const unavailableCount = checks.filter((c) => c.level === "UNAVAILABLE").length;
  const capabilityCount = checks.filter((c) => c.level === "CAPABILITY_VERIFIED").length;
  const liveCount = checks.filter((c) => c.level === "LIVE_PIPELINE_VERIFIED").length;
  let overall: DiagnosticLevel = "STATIC";
  if (unavailableCount > 0) {
    overall = "UNAVAILABLE";
  } else if (liveCount > 0) {
    overall = "LIVE_PIPELINE_VERIFIED";
  } else if (capabilityCount > 0) {
    overall = "CAPABILITY_VERIFIED";
  } else {
    overall = "CONNECTED";
  }
  return { overall_level: overall, checks, ready: unavailableCount === 0 };
}

function nodeCheck(version: string): DiagnosticCheck {
  const major = Number.parseInt(version.replace("v", "").split(".")[0] ?? "0", 10);
  if (major >= 24) {
    return { check_id: "node", capability: "runtime", level: "STATIC", reason_code: null, retryable: false, human_explanation: `Node.js ${version} destekleniyor`, required_next_action: null };
  }
  return { check_id: "node", capability: "runtime", level: "UNAVAILABLE", reason_code: "NODE_TOO_OLD", retryable: false, human_explanation: `Node.js 24+ gerekli (bulunan: ${version})`, required_next_action: "Node.js 24 LTS kurun" };
}

function sqliteCheck(version: string | null): DiagnosticCheck {
  if (version === null) {
    return { check_id: "sqlite", capability: "storage", level: "UNAVAILABLE", reason_code: "SQLITE_UNAVAILABLE", retryable: false, human_explanation: "SQLite runtime bilgisi kaydedilemedi", required_next_action: "better-sqlite3 kurulumunu dogrulayin" };
  }
  return { check_id: "sqlite", capability: "storage", level: "CONNECTED", reason_code: null, retryable: false, human_explanation: `SQLite ${version}`, required_next_action: null };
}

function configCheck(readable: boolean, schemaOk: boolean): DiagnosticCheck {
  if (!readable) {
    return { check_id: "config", capability: "configuration", level: "UNAVAILABLE", reason_code: "CONFIG_UNREADABLE", retryable: false, human_explanation: "Config dosyasi okunamadi", required_next_action: "Config yolunu ve izinleri kontrol edin" };
  }
  if (!schemaOk) {
    return { check_id: "config", capability: "configuration", level: "UNAVAILABLE", reason_code: "CONFIG_SCHEMA_FAILED", retryable: false, human_explanation: "Config schema dogrulamasi basarisiz", required_next_action: "Config alanlarini schema ile karsilastirin" };
  }
  return { check_id: "config", capability: "configuration", level: "STATIC", reason_code: null, retryable: false, human_explanation: "Config gecerli", required_next_action: null };
}

function diskCheck(freeBytes: number): DiagnosticCheck {
  if (freeBytes < MIN_DISK_FREE_BYTES) {
    return { check_id: "disk", capability: "storage", level: "UNAVAILABLE", reason_code: "DISK_FULL", retryable: true, human_explanation: `Disk boslugu yetersiz: ${Math.floor(freeBytes / 1024 / 1024)} MB`, required_next_action: "En az 512 MB bos alan acin" };
  }
  return { check_id: "disk", capability: "storage", level: "CONNECTED", reason_code: null, retryable: false, human_explanation: `Disk boslugu OK`, required_next_action: null };
}

function dataRootCheck(writable: boolean): DiagnosticCheck {
  if (!writable) {
    return { check_id: "data_root", capability: "storage", level: "UNAVAILABLE", reason_code: "DATA_ROOT_NOT_WRITABLE", retryable: false, human_explanation: "Veri dizini yazilabilir degil", required_next_action: "Dizin izinlerini kontrol edin" };
  }
  return { check_id: "data_root", capability: "storage", level: "CONNECTED", reason_code: null, retryable: false, human_explanation: "Veri dizini yazilabilir", required_next_action: null };
}

function dockerCheck(available: boolean, imagePresent: boolean): DiagnosticCheck {
  if (!available) {
    return { check_id: "runner", capability: "runner", level: "UNAVAILABLE", reason_code: "DOCKER_UNAVAILABLE", retryable: true, human_explanation: "Docker daemon erisilemedi; izole run yapilamaz", required_next_action: "Docker Desktop'i baslatin" };
  }
  if (!imagePresent) {
    return { check_id: "runner", capability: "runner", level: "UNAVAILABLE", reason_code: "MAVEN_IMAGE_MISSING", retryable: true, human_explanation: "Maven imaji bulunamadi", required_next_action: "docker pull maven:3.9-eclipse-temurin-21 calistirin" };
  }
  return { check_id: "runner", capability: "runner", level: "CONNECTED", reason_code: null, retryable: false, human_explanation: "Docker + Maven imaji hazir", required_next_action: null };
}

function modelCheck(authorized: boolean): DiagnosticCheck {
  if (!authorized) {
    return { check_id: "model", capability: "worker", level: "UNAVAILABLE", reason_code: "MODEL_NOT_AUTHORIZED", retryable: false, human_explanation: "Model yetkisi dogrulanamadi", required_next_action: "OpenCode provider kaydini kontrol edin" };
  }
  return { check_id: "model", capability: "worker", level: "CONNECTED", reason_code: null, retryable: false, human_explanation: "Model yetkili", required_next_action: null };
}

function dbMaintenanceCheck(migrationsCurrent: boolean, evidenceIntegrityOk: boolean): DiagnosticCheck {
  if (!migrationsCurrent) {
    return { check_id: "db", capability: "persistence", level: "UNAVAILABLE", reason_code: "MIGRATIONS_PENDING", retryable: false, human_explanation: "DB migration'lar guncel degil", required_next_action: "Uygulamayi bir kez baslatin; migration otomatik uygulanir" };
  }
  if (!evidenceIntegrityOk) {
    return { check_id: "db", capability: "persistence", level: "UNAVAILABLE", reason_code: "EVIDENCE_INTEGRITY_FAILED", retryable: false, human_explanation: "Evidence blob butunlugu bozuk", required_next_action: "verified backup'tan kurtarma calistirin" };
  }
  return { check_id: "db", capability: "persistence", level: "CONNECTED", reason_code: null, retryable: false, human_explanation: "DB migration'lar ve evidence butunlugu OK", required_next_action: null };
}
